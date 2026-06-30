/**
 * Suspicious 404 Rate Limiter
 *
 * Tracks 404 responses per IP using a sliding window.  When an IP exceeds
 * SECURITY_404_COUNT_THRESHOLD within SECURITY_404_WINDOW_MS it is recorded
 * as suspicious (and auto-blocked at the global suspicious-event threshold).
 *
 * Implementation: the middleware hooks `res.on('finish')` so it runs
 * *after* the response has been sent and only acts on 404 status codes.
 *
 * Mount this BEFORE the notFound handler in server.ts.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getClientIP } from '../utils/getClientIP';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';

// ─── Per-IP sliding window ───────────────────────────────────────────────────

interface WindowRecord {
  timestamps: number[];
  alerted: boolean; // so we only fire the alert once per window
}

const _windows = new Map<string, WindowRecord>();

// Periodic sweep to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let _lastCleanup = Date.now();

function cleanupStaleEntries(): void {
  const cutoff = Date.now() - config.security404WindowMs;
  for (const [ip, record] of _windows) {
    record.timestamps = record.timestamps.filter(t => t >= cutoff);
    if (record.timestamps.length === 0) {
      _windows.delete(ip);
    }
  }
  _lastCleanup = Date.now();
}

// Hard ceiling on distinct tracked IPs. The 5-minute lazy sweep bounds memory by
// TIME, but a scan from thousands of unique IPs can create 404 windows faster
// than the sweep removes them. This count cap keeps the map bounded under a
// flood (memory-exhaustion-DoS hardening). The cap sits far above any realistic
// number of IPs legitimately hitting 404s, so normal use never reaches it.
const WINDOWS_MAX = 50_000;

function capWindows(): void {
  if (_windows.size <= WINDOWS_MAX) return;

  // Cheap pass first: the normal sweep drops fully-aged-out windows.
  cleanupStaleEntries();

  // If a real flood is still in progress, evict the IPs whose most recent 404 is
  // the oldest (least relevant to an active attack) until back under the cap.
  while (_windows.size > WINDOWS_MAX) {
    let oldestIp: string | null = null;
    let oldestTs = Infinity;
    for (const [ip, record] of _windows) {
      const last = record.timestamps.length
        ? record.timestamps[record.timestamps.length - 1]
        : 0;
      if (last < oldestTs) {
        oldestTs = last;
        oldestIp = ip;
      }
    }
    if (oldestIp === null) break;
    _windows.delete(oldestIp);
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function suspicious404Middleware(req: Request, res: Response, next: NextFunction): void {
  // Hook into the response finish event — we only care about 404s
  res.on('finish', () => {
    if (res.statusCode !== 404) return;

    // Standardized .well-known/ probes (passkeys, security.txt, change-password,
    // etc.) are issued automatically by browsers and password managers. A 404 for
    // an unimplemented well-known path is benign and must NOT count as a suspicious
    // strike — otherwise routine browser behavior auto-blocks legitimate IPs.
    const probePath = req.path || req.originalUrl || req.url;
    if (probePath.startsWith('/.well-known/')) return;

    const ip = getClientIP(req);
    const now = Date.now();

    // Lazy cleanup
    if (now - _lastCleanup > CLEANUP_INTERVAL_MS) {
      cleanupStaleEntries();
    }

    // Get or create window record
    let record = _windows.get(ip);
    if (!record) {
      record = { timestamps: [], alerted: false };
      _windows.set(ip, record);
      // Enforce the count cap on the only path that grows the map (a new IP).
      // No-op until the map exceeds WINDOWS_MAX.
      capWindows();
    }

    record.timestamps.push(now);

    // Prune timestamps outside the window
    const windowStart = now - config.security404WindowMs;
    record.timestamps = record.timestamps.filter(t => t >= windowStart);

    const count = record.timestamps.length;

    // Check threshold
    if (count >= config.security404CountThreshold) {
      const url = req.originalUrl || req.url;
      const ua = (req.headers['user-agent'] || '').slice(0, 500);

      logger.warn(`[404-RateLimit] IP ${ip} hit ${count} 404s in ${config.security404WindowMs / 1000}s`);

      // Fire-and-forget async work
      (async () => {
        try {
          // Log security event
          await securityLogService.logEvent({
            ip,
            method: req.method,
            url,
            userAgent: ua,
            eventType: 'suspicious_404',
            severity: count >= config.security404CountThreshold * 2 ? 'high' : 'medium',
            metadata: {
              count404: count,
              threshold: config.security404CountThreshold,
              windowMs: config.security404WindowMs,
              latestPath: url,
            },
            blocked: false, // the 404 itself already went out
          });

          // Record suspicious — this will auto-block at the global threshold
          await BlocklistService.recordSuspiciousEvent(
            ip,
            'suspicious_404',
            `${count} 404s in ${config.security404WindowMs / 1000}s. Latest: ${url}`,
          );

          // Alert once per window
          if (!record!.alerted) {
            record!.alerted = true;
            await securityAlertService.send({
              eventType: 'suspicious_404',
              severity: 'medium',
              ip,
              title: `High 404 Rate Detected: ${ip}`,
              description: `IP ${ip} triggered ${count} 404 responses in ${config.security404WindowMs / 60000} minutes (threshold: ${config.security404CountThreshold}).`,
              details: {
                count404: count,
                threshold: config.security404CountThreshold,
                latestPath: url,
              },
              url,
              method: req.method,
            });
          }
        } catch (err) {
          logger.error('[404-RateLimit] Async logging failed:', err);
        }
      })();
    }
  });

  next();
}
