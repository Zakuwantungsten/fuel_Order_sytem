/**
 * Honeypot Routes
 *
 * Trap endpoints that mimic commonly-scanned paths (phpMyAdmin, WordPress
 * admin panels, shell upload endpoints, etc.).  Any client that hits these
 * routes is almost certainly a scanner or attacker — we log the event,
 * record it as suspicious against the IP, and return an innocuous 404.
 *
 * These routes are mounted in server.ts BEFORE the real notFound handler
 * so they catch automated probes that slip past the path-blocking regex.
 */

import { Router, Request, Response } from 'express';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';

const router = Router();

// ─── Trap paths ──────────────────────────────────────────────────────────────
// These are all paths that a legitimate user of *this* API should never visit.

const HONEYPOT_PATHS: string[] = [
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
  '/.well-known/security.txt',  // Some scanners probe this too

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

// ─── Helper ──────────────────────────────────────────────────────────────────

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket.remoteAddress || '0.0.0.0';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

// Per-IP hit counter for alert escalation
const _hitCounts = new Map<string, number>();

// ─── Single handler for all trap paths ───────────────────────────────────────

function honeypotHandler(req: Request, res: Response): void {
  const ip = getClientIP(req);
  const path = req.originalUrl || req.url;
  const ua = (req.headers['user-agent'] || '').slice(0, 500);

  const hits = (_hitCounts.get(ip) || 0) + 1;
  _hitCounts.set(ip, hits);

  logger.warn(`[Honeypot] Trap hit from ${ip}: ${req.method} ${path}`);

  // Fire-and-forget async work
  (async () => {
    try {
      // Persist event
      await securityLogService.logEvent({
        ip,
        method: req.method,
        url: path,
        userAgent: ua,
        eventType: 'honeypot_hit',
        severity: 'high',
        metadata: { hitCount: hits, honeypotPath: path },
        blocked: true,
      });

      // Record as suspicious → will auto-block at threshold
      await BlocklistService.recordSuspiciousEvent(
        ip,
        'honeypot',
        `Hit honeypot: ${path}`,
      );

      // Alert on first hit and then on escalation milestones
      if (hits === 1 || hits === 5 || hits % 10 === 0) {
        await securityAlertService.send({
          eventType: 'honeypot_hit',
          severity: 'high',
          ip,
          title: `Honeypot Triggered: ${ip}`,
          description: `IP ${ip} hit trap endpoint ${path} (total hits: ${hits}).`,
          details: { path, hitCount: hits },
          url: path,
          method: req.method,
        });
      }
    } catch (err) {
      logger.error('[Honeypot] Async logging failed:', err);
    }
  })();

  // Return generic 404 — don't reveal it's a honeypot
  res.status(404).json({ success: false, message: 'Not found' });
}

// ─── Register all trap paths ─────────────────────────────────────────────────

for (const path of HONEYPOT_PATHS) {
  router.all(path, honeypotHandler);
}

export default router;
