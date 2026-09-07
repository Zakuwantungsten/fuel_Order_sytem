/**
 * Attack / path-probe middleware
 *
 * Layers (evaluated in order):
 *   1. DB FirewallPathRule allow → pass through
 *   2. DB FirewallPathRule block → 403 + permanent ban
 *   3. Hardcoded DEFAULT_BLOCKED_PATTERNS + SECURITY_BLOCK_PATHS → 403 + permanent ban
 *   4. DB FirewallPathRule log → log only, continue
 *
 * DB rules refresh every 60s; CRUD endpoints call reloadDbPathRules().
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getClientIP } from '../utils/getClientIP';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';
import { FirewallPathRule } from '../models/FirewallPathRule';

// ─── Default blocked path patterns ───────────────────────────────────────────

const DEFAULT_BLOCKED_PATTERNS: RegExp[] = [
  /^\/\.env/,
  /^\/\.git/,
  /^\/\.docker/,
  /^\/\.aws/,
  /^\/\.ssh/,
  /^\/\.htaccess/,
  /^\/\.htpasswd/,
  /\/wp-[\w-]*\.php/,
  /\/wp-admin/,
  /\/wp-content/,
  /\/wp-includes/,
  /\/xmlrpc\.php/,
  /\/administrator\/?/,
  /\/phpmyadmin/i,
  /\/pma\/?/i,
  /\/adminer/i,
  /\/myadmin/i,
  /^\/_profiler/,
  /^\/__cve_probe/,
  /^\/_debug/,
  /^\/debug\//,
  /^\/console\/?$/,
  /^\/elmah\.axd/,
  /^\/trace\.axd/,
  /\.map$/,
  /^\/\.vite\//,
  /^\/env\.js$/,
  /^\/\.nuxt/,
  /^\/\.next/,
  /^\/\.svelte-kit/,
  /\/cgi-bin\//,
  /\/\.well-known\/security\.txt/,
  /\/actuator/,
  /\/api\/swagger/i,
  /\/web\.config/i,
  /\/server-status/,
  /\/server-info/,
  /\/\.ds_store/i,
  /\/dump\.sql/i,
  /\/database\.sql/i,
  /\/backup\.sql/i,
  /\/db\.sql/i,
  /\.sql$/i,
  /\/mongodb/i,
  /\/shell/i,
  /\/cmd\.php/i,
  /\/c99\.php/i,
  /\/r57\.php/i,
  /\/webshell/i,
  /\/config\.yml$/i,
  /\/config\.yaml$/i,
  /\/docker-compose/i,
  /\/dockerfile/i,
  /\/package\.json$/,
  /\/composer\.json$/i,
  /\/Gemfile$/i,
  /\/tsconfig\.json$/,
];

// ─── Env extras ──────────────────────────────────────────────────────────────

function compileExtraPatterns(extraPaths: string): RegExp[] {
  if (!extraPaths || !extraPaths.trim()) return [];

  return extraPaths
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      if (p.startsWith('/') && p.lastIndexOf('/') > 0) {
        const lastSlash = p.lastIndexOf('/');
        const pattern = p.slice(1, lastSlash);
        const flags = p.slice(lastSlash + 1);
        try {
          return new RegExp(pattern, flags);
        } catch {
          logger.warn(`Invalid regex in SECURITY_BLOCK_PATHS: ${p}`);
          return null;
        }
      }
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escaped}`, 'i');
    })
    .filter((r): r is RegExp => r !== null);
}

/** Convert admin glob patterns (`/wp-admin/*`, `/*.sql`) to RegExp. */
export function globToRegExp(pattern: string): RegExp | null {
  try {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  } catch {
    logger.warn(`Invalid firewall path pattern: ${pattern}`);
    return null;
  }
}

// ─── Hardcoded pattern cache ─────────────────────────────────────────────────

let _cachedPatterns: RegExp[] | null = null;

function getHardcodedBlockedPatterns(): RegExp[] {
  if (_cachedPatterns) return _cachedPatterns;
  const extra = compileExtraPatterns(config.securityBlockPaths);
  _cachedPatterns = [...DEFAULT_BLOCKED_PATTERNS, ...extra];
  return _cachedPatterns;
}

export function reloadBlockPatterns(): void {
  _cachedPatterns = null;
}

function isHardcodedBlockedPath(requestPath: string): boolean {
  const lowerPath = requestPath.toLowerCase();
  return getHardcodedBlockedPatterns().some(pattern => pattern.test(lowerPath));
}

/** @deprecated use evaluatePathRules — kept for unit tests */
function isBlockedPath(requestPath: string): boolean {
  return isHardcodedBlockedPath(requestPath);
}

// ─── DB FirewallPathRule cache ───────────────────────────────────────────────

interface CompiledDbRule {
  pattern: string;
  regex: RegExp;
  action: 'block' | 'allow' | 'log';
  methods: string[];
}

let _dbRules: CompiledDbRule[] = [];

export async function reloadDbPathRules(): Promise<void> {
  try {
    const rules = await FirewallPathRule.find({ isActive: true }).lean();
    const compiled: CompiledDbRule[] = [];
    for (const rule of rules) {
      const regex = globToRegExp(rule.pattern);
      if (!regex) continue;
      compiled.push({
        pattern: rule.pattern,
        regex,
        action: rule.action,
        methods: Array.isArray(rule.methods) ? rule.methods.map(String) : [],
      });
    }
    _dbRules = compiled;
    logger.debug(`[PathWAF] Loaded ${_dbRules.length} active DB path rules`);
  } catch (err) {
    logger.warn('[PathWAF] Failed to load FirewallPathRule — using hardcoded only', err);
  }
}

reloadDbPathRules().catch(() => {});
setInterval(() => {
  reloadDbPathRules().catch(() => {});
}, 60_000);

function matchDbRule(
  requestPath: string,
  method: string,
  action: 'allow' | 'block' | 'log',
): CompiledDbRule | null {
  const lower = requestPath.toLowerCase();
  for (const rule of _dbRules) {
    if (rule.action !== action) continue;
    if (rule.methods.length > 0 && !rule.methods.includes(method.toUpperCase())) continue;
    if (rule.regex.test(lower) || rule.regex.test(requestPath)) return rule;
  }
  return null;
}

// ─── Enforcement helper ──────────────────────────────────────────────────────

function enforcePathBlock(
  req: Request,
  res: Response,
  matchedPattern: string,
  source: 'hardcoded' | 'db',
): void {
  const clientIP = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';

  logger.warn('Blocked malicious path probe', {
    event: 'PATH_BLOCKED',
    method: req.method,
    path: req.path,
    matchedPattern,
    source,
    ip: clientIP,
    userAgent,
    timestamp: new Date().toISOString(),
  });

  BlocklistService.blockScanner(
    clientIP,
    'path_probe',
    `Path: ${req.path} (matched ${source}: ${matchedPattern})`,
    null,
  ).catch(() => {});

  securityLogService.logEvent({
    ip: clientIP,
    method: req.method,
    url: req.path,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    eventType: 'path_blocked',
    severity: 'high',
    metadata: { matchedPath: req.path, matchedPattern, source, permanentBlock: true },
    blocked: true,
  }).catch(() => {});

  securityAlertService.alertPathProbe(clientIP, req.path, 1).catch(() => {});

  res.status(403).json({
    success: false,
    message: 'Forbidden',
  });
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function attackPatternMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.securityPathBlocking) {
    return next();
  }

  const path = req.path;
  const method = req.method;

  // 1. Explicit allow
  if (matchDbRule(path, method, 'allow')) {
    return next();
  }

  // 2. DB block → permanent ban
  const dbBlock = matchDbRule(path, method, 'block');
  if (dbBlock) {
    enforcePathBlock(req, res, dbBlock.pattern, 'db');
    return;
  }

  // 3. Hardcoded / env patterns → permanent ban
  if (isHardcodedBlockedPath(path)) {
    enforcePathBlock(req, res, path, 'hardcoded');
    return;
  }

  // 4. DB log-only
  const dbLog = matchDbRule(path, method, 'log');
  if (dbLog) {
    const clientIP = getClientIP(req);
    securityLogService.logEvent({
      ip: clientIP,
      method: req.method,
      url: req.path,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      eventType: 'path_blocked',
      severity: 'low',
      metadata: { matchedPath: req.path, matchedPattern: dbLog.pattern, source: 'db', action: 'log' },
      blocked: false,
    }).catch(() => {});
  }

  next();
}

export { isBlockedPath, getClientIP, compileExtraPatterns, DEFAULT_BLOCKED_PATTERNS };
