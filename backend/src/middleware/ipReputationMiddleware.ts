import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import BlocklistService from '../services/blocklistService';
import logger from '../utils/logger';
import { securityLogService } from '../services/securityLogService';

// ─── Extract client IP ──────────────────────────────────────────────────────

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * IP Reputation Middleware
 *
 * Checks if the requesting IP is auto-blocked by the BlocklistService.
 * This is separate from ipFilter (which checks manual DB rules).
 * Returns 403 with Retry-After header if blocked.
 *
 * Mount AFTER attackPatternMiddleware but BEFORE routes.
 */
export async function ipReputationMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!config.securityIpBlocking) {
    return next();
  }

  const clientIP = getClientIP(req);

  // Skip check for loopback/unknown
  if (clientIP === 'unknown' || clientIP === '127.0.0.1' || clientIP === '::1') {
    return next();
  }

  try {
    const result = await BlocklistService.isBlocked(clientIP);

    if (result.blocked) {
      logger.warn('IP reputation: Blocked request from auto-blocked IP', {
        event: 'IP_REPUTATION_BLOCKED',
        ip: clientIP,
        reason: result.reason,
        path: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'] || 'unknown',
      });

      // Set Retry-After header if there's an expiry
      if (result.retryAfterMs && result.retryAfterMs > 0) {
        const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
        res.setHeader('Retry-After', retryAfterSeconds.toString());
      }

      // Persist to SecurityEvent collection
      securityLogService.logEvent({
        ip: clientIP,
        method: req.method,
        url: req.path,
        userAgent: req.headers['user-agent'] || undefined,
        eventType: 'ip_blocked',
        severity: 'high',
        metadata: { reason: result.reason },
        blocked: true,
      }).catch(() => {});

      res.status(403).json({
        success: false,
        message: 'Access denied',
      });
      return;
    }
  } catch (err) {
    // Fail open — don't block requests if the blocklist service errors
    logger.error('ipReputationMiddleware: Error checking blocklist, failing open', err);
  }

  next();
}
