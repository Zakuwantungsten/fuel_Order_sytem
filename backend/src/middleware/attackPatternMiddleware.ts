import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';

// ─── Default blocked path patterns ───────────────────────────────────────────
// Each regex is tested against the lowercased request path.
// Return 403 (not 404) to avoid confirming or denying resource existence.

const DEFAULT_BLOCKED_PATTERNS: RegExp[] = [
  // Environment / config files
  /^\/\.env/,                              // /.env, /.env.local, /.env.production, etc.
  /^\/\.git/,                              // /.git, /.gitignore, /.github, etc.
  /^\/\.docker/,                           // /.dockerignore, /.docker/
  /^\/\.aws/,                              // /.aws/credentials, etc.
  /^\/\.ssh/,                              // /.ssh/
  /^\/\.htaccess/,                         // Apache config
  /^\/\.htpasswd/,                         // Apache password file

  // WordPress / PHP framework probes
  /\/wp-[\w-]*\.php/,                      // /wp-login.php, /wp-admin.php, /wp-config.php, etc.
  /\/wp-admin/,                            // /wp-admin/
  /\/wp-content/,                          // /wp-content/
  /\/wp-includes/,                         // /wp-includes/
  /\/xmlrpc\.php/,                         // XML-RPC endpoint
  /\/administrator\/?/,                    // Joomla admin
  /\/phpmyadmin/i,                         // phpMyAdmin probes
  /\/pma\/?/i,                             // phpMyAdmin shorthand
  /\/adminer/i,                            // Adminer DB tool
  /\/myadmin/i,                            // myAdmin variations

  // Framework profilers / debug endpoints
  /^\/_profiler/,                          // Symfony profiler
  /^\/__cve_probe/,                        // CVE scanning
  /^\/_debug/,                             // Debug endpoints
  /^\/debug\//,                            // Debug paths
  /^\/console\/?$/,                        // Console endpoints
  /^\/elmah\.axd/,                         // .NET error log
  /^\/trace\.axd/,                         // .NET trace

  // Source maps & build artifacts (fingerprinting)
  /\.map$/,                                // *.map (source maps)
  /^\/\.vite\//,                           // Vite dev server internals
  /^\/env\.js$/,                           // Exposed env config
  /^\/\.nuxt/,                             // Nuxt internals
  /^\/\.next/,                             // Next.js internals
  /^\/\.svelte-kit/,                       // SvelteKit internals

  // Common exploit / scanner paths
  /\/cgi-bin\//,                           // CGI scripts
  /\/\.well-known\/security\.txt/,         // Except this is legitimate — removed below
  /\/actuator/,                            // Spring Boot actuator
  /\/api\/swagger/i,                       // Swagger docs (prod)
  /\/web\.config/i,                        // IIS config
  /\/server-status/,                       // Apache status
  /\/server-info/,                         // Apache info
  /\/\.ds_store/i,                         // macOS metadata

  // Database exposure probes
  /\/dump\.sql/i,                          // SQL dumps
  /\/database\.sql/i,
  /\/backup\.sql/i,
  /\/db\.sql/i,
  /\.sql$/i,
  /\/mongodb/i,                            // MongoDB probes (not our /api/ routes)

  // Shell / backdoor probes
  /\/shell/i,                              // Shell probes
  /\/cmd\.php/i,
  /\/c99\.php/i,
  /\/r57\.php/i,
  /\/webshell/i,

  // Config files
  /\/config\.yml$/i,
  /\/config\.yaml$/i,
  /\/docker-compose/i,
  /\/dockerfile/i,
  /\/package\.json$/,                      // Package manifest at root
  /\/composer\.json$/i,
  /\/Gemfile$/i,
  /\/tsconfig\.json$/,
];

// ─── Compile extra patterns from env ─────────────────────────────────────────

function compileExtraPatterns(extraPaths: string): RegExp[] {
  if (!extraPaths || !extraPaths.trim()) return [];

  return extraPaths
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      // If the pattern starts and ends with /, treat as raw regex
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
      // Otherwise, escape special regex chars and match as literal prefix
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`^${escaped}`, 'i');
    })
    .filter((r): r is RegExp => r !== null);
}

// ─── Build full pattern list (cached at startup + env reload) ────────────────

let _cachedPatterns: RegExp[] | null = null;

function getBlockedPatterns(): RegExp[] {
  if (_cachedPatterns) return _cachedPatterns;
  const extra = compileExtraPatterns(config.securityBlockPaths);
  _cachedPatterns = [...DEFAULT_BLOCKED_PATTERNS, ...extra];
  return _cachedPatterns;
}

/** Allow hot-reloading extra patterns (e.g. from admin API) */
export function reloadBlockPatterns(): void {
  _cachedPatterns = null;
}

// ─── Path matching ───────────────────────────────────────────────────────────

function isBlockedPath(requestPath: string): boolean {
  const lowerPath = requestPath.toLowerCase();
  const patterns = getBlockedPatterns();
  for (const pattern of patterns) {
    if (pattern.test(lowerPath)) return true;
  }
  return false;
}

// ─── Extract client IP ──────────────────────────────────────────────────────

function getClientIP(req: Request): string {
  // trust proxy is set in server.ts
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function attackPatternMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip if path blocking is disabled
  if (!config.securityPathBlocking) {
    return next();
  }

  if (isBlockedPath(req.path)) {
    const clientIP = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log the blocked request
    logger.warn('Blocked malicious path probe', {
      event: 'PATH_BLOCKED',
      method: req.method,
      path: req.path,
      ip: clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
    });

    // Record as suspicious event for fail2ban-style auto-blocking
    BlocklistService.recordSuspiciousEvent(clientIP, 'path_probe', `Path: ${req.path}`).catch(() => {});

    // Persist to SecurityEvent collection
    securityLogService.logEvent({
      ip: clientIP,
      method: req.method,
      url: req.path,
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      eventType: 'path_blocked',
      severity: 'medium',
      metadata: { matchedPath: req.path },
      blocked: true,
    }).catch(() => {});

    // Alert admins on path probes (rate-limited by cooldown)
    securityAlertService.alertPathProbe(clientIP, req.path, 1).catch(() => {});

    // Return 403 Forbidden (not 404) to avoid confirming/denying resource existence
    res.status(403).json({
      success: false,
      message: 'Forbidden',
    });
    return;
  }

  next();
}

// ─── Exports for testing ────────────────────────────────────────────────────

export { isBlockedPath, getClientIP, compileExtraPatterns, DEFAULT_BLOCKED_PATTERNS };
