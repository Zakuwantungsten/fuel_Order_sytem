/**
 * Suspicious 404 Rate Limiter
 *
 * Tracks 404 responses per IP using a sliding window. When an IP exceeds the
 * threshold (default 10 / 5 min), Phase 2 policy applies:
 *   1st offense window → temporary ban (default 24h)
 *   2nd+ offense window → permanent ban
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
  /** True after the current window already triggered a ban/alert */
  tripped: boolean;
}

/** How many times this IP has tripped the 404 threshold (survives window resets). */
const _offenseCounts = new Map<string, number>();
const _windows = new Map<string, WindowRecord>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let _lastCleanup = Date.now();

function cleanupStaleEntries(): void {
  const cutoff = Date.now() - config.security404WindowMs;
  for (const [ip, record] of _windows) {
    record.timestamps = record.timestamps.filter(t => t >= cutoff);
    if (record.timestamps.length === 0) {
      _windows.delete(ip);
    } else if (record.timestamps.every(t => t >= cutoff)) {
      // New window of activity after a prior trip — allow another trip evaluation
      // once count rebuilds; tripped clears when window fully ages out (deleted above).
    }
  }
  _lastCleanup = Date.now();
}

const WINDOWS_MAX = 50_000;
const OFFENSE_MAX = 50_000;

function capWindows(): void {
  if (_windows.size <= WINDOWS_MAX) return;
  cleanupStaleEntries();
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

function capOffenses(): void {
  while (_offenseCounts.size > OFFENSE_MAX) {
    const first = _offenseCounts.keys().next().value;
    if (first === undefined) break;
    _offenseCounts.delete(first);
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function suspicious404Middleware(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (res.statusCode !== 404) return;

    const probePath = req.path || req.originalUrl || req.url;
    if (probePath.startsWith('/.well-known/')) return;

    const ip = getClientIP(req);
    const now = Date.now();

    if (now - _lastCleanup > CLEANUP_INTERVAL_MS) {
      cleanupStaleEntries();
    }

    let record = _windows.get(ip);
    if (!record) {
      record = { timestamps: [], tripped: false };
      _windows.set(ip, record);
      capWindows();
    }

    record.timestamps.push(now);

    const windowStart = now - config.security404WindowMs;
    record.timestamps = record.timestamps.filter(t => t >= windowStart);
    // If the sliding window fully rebuilt after a prior trip aged out, reset trip latch
    if (record.timestamps.length === 1) {
      record.tripped = false;
    }

    const count = record.timestamps.length;

    if (count >= config.security404CountThreshold && !record.tripped) {
      record.tripped = true;

      const offenses = (_offenseCounts.get(ip) || 0) + 1;
      _offenseCounts.set(ip, offenses);
      capOffenses();

      const tempMs = config.securityScannerTempBanMs > 0
        ? config.securityScannerTempBanMs
        : 24 * 60 * 60 * 1000;
      const durationMs = offenses === 1 ? tempMs : null; // 2nd+ → permanent
      const url = req.originalUrl || req.url;
      const ua = (req.headers['user-agent'] || '').slice(0, 500);

      logger.warn(
        `[404-RateLimit] IP ${ip} hit ${count} 404s (offense #${offenses}) → ${durationMs ? `${durationMs}ms ban` : 'permanent ban'}`,
      );

      (async () => {
        try {
          const ban = await BlocklistService.blockScanner(
            ip,
            'suspicious_404',
            `${count} 404s in ${config.security404WindowMs / 1000}s (offense #${offenses}). Latest: ${url}`,
            durationMs,
          );

          await securityLogService.logEvent({
            ip,
            method: req.method,
            url,
            userAgent: ua,
            eventType: 'suspicious_404',
            severity: offenses >= 2 ? 'high' : 'medium',
            metadata: {
              count404: count,
              threshold: config.security404CountThreshold,
              windowMs: config.security404WindowMs,
              latestPath: url,
              offenseNumber: offenses,
              banDurationMs: durationMs ?? 0,
              blocked: ban.blocked,
            },
            blocked: ban.blocked,
          });

          await securityAlertService.send({
            eventType: 'suspicious_404',
            severity: offenses >= 2 ? 'high' : 'medium',
            ip,
            title: `Suspicious 404 Pattern: ${ip}`,
            description: ban.blocked
              ? `IP ${ip} triggered ${count} 404s (offense #${offenses}) and was ${durationMs ? 'temporarily' : 'permanently'} blocked.`
              : `IP ${ip} triggered ${count} 404 responses in ${config.security404WindowMs / 60000} minutes (threshold: ${config.security404CountThreshold}).`,
            details: {
              count404: count,
              threshold: config.security404CountThreshold,
              latestPath: url,
              offenseNumber: offenses,
              banDurationMs: durationMs ?? 0,
              blocked: ban.blocked,
            },
            url,
            method: req.method,
          });
        } catch (err) {
          logger.error('[404-RateLimit] Async logging failed:', err);
        }
      })();
    }
  });

  next();
}

/** Test helper */
export function _reset404StateForTests(): void {
  _windows.clear();
  _offenseCounts.clear();
}
