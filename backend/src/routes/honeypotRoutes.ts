/**
 * Honeypot Routes
 *
 * Trap endpoints that mimic commonly-scanned paths (phpMyAdmin, WordPress
 * admin panels, shell upload endpoints, etc.).  Any client that hits these
 * routes is almost certainly a scanner or attacker — we log the event,
 * permanently block the IP (when autoBlockOnHit is enabled), and return an
 * innocuous 404.
 *
 * These routes are mounted in server.ts BEFORE the real notFound handler
 * so they catch automated probes that slip past the path-blocking regex.
 *
 * Runtime config is loaded from FirewallConfig key `honeypot_config`
 * (refreshed every 60s), matching bot_protection wiring in uaBlockingMiddleware.
 */

import { Router, Request, Response } from 'express';
import { getClientIP } from '../utils/getClientIP';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';
import { FirewallConfig } from '../models/FirewallConfig';

const router = Router();

// ─── Built-in trap paths ─────────────────────────────────────────────────────
// Legitimate users of this API should never visit these.

const BUILTIN_HONEYPOT_PATHS: string[] = [
  // PHP / WordPress
  '/admin.php',
  '/login.php',
  '/wp-login.php',
  '/wp-admin',
  '/wp-admin/',
  '/wp-content',
  '/wp-includes',
  '/xmlrpc.php',
  '/wp-config.php',
  '/wp-cron.php',

  // phpMyAdmin
  '/phpmyadmin',
  '/phpmyadmin/',
  '/pma',
  '/myadmin',
  '/mysql',
  '/dbadmin',
  '/sqladmin',
  '/mysqlmanager',

  // Common CMS/framework panels
  '/administrator',
  '/admin',
  '/admin/',
  '/backend',
  '/filemanager',
  '/ckeditor',
  '/elfinder',

  // Shell / backdoor upload targets
  '/shell.php',
  '/cmd.php',
  '/c99.php',
  '/r57.php',
  '/webshell',
  '/upload.php',
  '/uploads',
  '/uploads/',

  // Dev / debug endpoints
  '/debug',
  '/console',
  '/telescope',
  '/actuator',
  '/actuator/health',
  '/actuator/env',
  '/server-status',
  '/server-info',
  '/_profiler',
  '/.well-known/security.txt',

  // Config / credential files
  '/config.json',
  '/config.yaml',
  '/config.yml',
  '/database.yml',
  '/credentials',
  '/.aws/credentials',
  '/.docker',

  // Other scanner favorites
  '/cgi-bin',
  '/cgi-bin/',
  '/test',
  '/test/',
  '/temp',
  '/tmp',
  '/backup',
  '/backup/',
  '/dump.sql',
  '/db.sql',
];

// ─── Runtime config (DB + defaults) ──────────────────────────────────────────

interface HoneypotRuntimeConfig {
  enabled: boolean;
  autoBlockOnHit: boolean;
  /** 0 or null = permanent ban */
  autoBlockDurationMs: number | null;
  /** Delay (ms) before responding — wastes scanner time. 0 = off. Cap 60s. */
  tarpitMs: number;
  /** Extra admin-configured trap paths (merged with builtins) */
  extraPaths: string[];
}

let _honeypotConfig: HoneypotRuntimeConfig = {
  enabled: true,
  autoBlockOnHit: true,
  autoBlockDurationMs: null, // permanent by default
  tarpitMs: 8_000,
  extraPaths: [],
};

const refreshHoneypotConfig = async (): Promise<void> => {
  try {
    const doc = await FirewallConfig.findOne({ key: 'honeypot_config' }).lean();
    if (!doc?.value || typeof doc.value !== 'object') return;

    const v = doc.value as Record<string, unknown>;
    const paths = Array.isArray(v.paths) ? v.paths : [];
    const extraPaths = paths
      .filter((p: unknown) => p && typeof p === 'object' && (p as { isActive?: boolean }).isActive !== false)
      .map((p: { path?: unknown }) => (typeof p.path === 'string' ? p.path.trim() : ''))
      .filter((p: string) => p.length > 0);

    const durationRaw = v.autoBlockDurationMs;
    let autoBlockDurationMs: number | null = null;
    if (typeof durationRaw === 'number' && durationRaw > 0) {
      autoBlockDurationMs = durationRaw;
    }

    let tarpitMs = 8_000;
    if (typeof v.tarpitMs === 'number') {
      tarpitMs = Math.min(Math.max(0, v.tarpitMs), 60_000);
    }

    _honeypotConfig = {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
      autoBlockOnHit: typeof v.autoBlockOnHit === 'boolean' ? v.autoBlockOnHit : true,
      autoBlockDurationMs,
      tarpitMs,
      extraPaths,
    };
  } catch {
    // Non-fatal — keep cached config
  }
};

refreshHoneypotConfig().catch(() => {});
setInterval(refreshHoneypotConfig, 60_000);

/** Paths registered on the router (builtins only — DB extras matched in handler). */
const REGISTERED_PATHS = new Set(BUILTIN_HONEYPOT_PATHS);

// Per-IP hit counter for alert escalation
const _hitCounts = new Map<string, number>();

function isHoneypotPath(requestPath: string): boolean {
  if (REGISTERED_PATHS.has(requestPath)) return true;
  // Normalize trailing slash variants
  const alt = requestPath.endsWith('/') ? requestPath.slice(0, -1) : `${requestPath}/`;
  if (REGISTERED_PATHS.has(alt)) return true;
  return _honeypotConfig.extraPaths.some(
    (p) => p === requestPath || p === alt || requestPath.startsWith(p.endsWith('/') ? p : `${p}/`),
  );
}

// ─── Single handler for all trap paths ───────────────────────────────────────

function honeypotHandler(req: Request, res: Response): void {
  if (!_honeypotConfig.enabled) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  const ip = getClientIP(req);
  const path = req.originalUrl || req.url;
  const ua = (req.headers['user-agent'] || '').slice(0, 500);

  const hits = (_hitCounts.get(ip) || 0) + 1;
  _hitCounts.set(ip, hits);

  logger.warn(`[Honeypot] Trap hit from ${ip}: ${req.method} ${path}`);

  // Fire-and-forget async work (ban + log + alert) — runs while tarpit delays response
  (async () => {
    try {
      let didBlock = false;
      if (_honeypotConfig.autoBlockOnHit) {
        const result = await BlocklistService.blockScanner(
          ip,
          'honeypot',
          `Hit honeypot: ${path}`,
          _honeypotConfig.autoBlockDurationMs,
        );
        didBlock = result.blocked;
      }

      await securityLogService.logEvent({
        ip,
        method: req.method,
        url: path,
        userAgent: ua,
        eventType: 'honeypot_hit',
        severity: 'high',
        metadata: {
          hitCount: hits,
          honeypotPath: path,
          autoBlockOnHit: _honeypotConfig.autoBlockOnHit,
          blocked: didBlock,
          blockDurationMs: _honeypotConfig.autoBlockDurationMs ?? 0,
          tarpitMs: _honeypotConfig.tarpitMs,
        },
        blocked: didBlock,
      });

      if (hits === 1 || hits === 5 || hits % 10 === 0) {
        await securityAlertService.send({
          eventType: 'honeypot_hit',
          severity: 'high',
          ip,
          title: `Honeypot Triggered: ${ip}`,
          description: didBlock
            ? `IP ${ip} hit trap endpoint ${path} and was blocked (total hits: ${hits}; duration: ${_honeypotConfig.autoBlockDurationMs ? `${_honeypotConfig.autoBlockDurationMs}ms` : 'permanent'}).`
            : `IP ${ip} hit trap endpoint ${path} (total hits: ${hits}).`,
          details: {
            path,
            hitCount: hits,
            blocked: didBlock,
            blockDurationMs: _honeypotConfig.autoBlockDurationMs ?? 0,
            tarpitMs: _honeypotConfig.tarpitMs,
          },
          url: path,
          method: req.method,
        });
      }
    } catch (err) {
      logger.error('[Honeypot] Async logging failed:', err);
    }
  })();

  // Phase 3 tarpit: slow response to waste scanner time (still looks like a 404)
  const respond = () => {
    if (res.headersSent) return;
    res.status(404).json({ success: false, message: 'Not found' });
  };
  const tarpit = _honeypotConfig.tarpitMs;
  if (tarpit > 0) {
    setTimeout(respond, tarpit);
  } else {
    respond();
  }
}

// Catch-all for admin-configured extra paths not in the builtin list
router.use((req: Request, res: Response, next) => {
  if (!_honeypotConfig.enabled || _honeypotConfig.extraPaths.length === 0) {
    return next();
  }
  const pathOnly = (req.path || '').split('?')[0];
  if (isHoneypotPath(pathOnly) && !REGISTERED_PATHS.has(pathOnly)) {
    return honeypotHandler(req, res);
  }
  next();
});

// ─── Register builtin trap paths ─────────────────────────────────────────────

for (const path of BUILTIN_HONEYPOT_PATHS) {
  router.all(path, honeypotHandler);
}

export default router;

/** Test / ops helpers */
export { refreshHoneypotConfig, BUILTIN_HONEYPOT_PATHS };
