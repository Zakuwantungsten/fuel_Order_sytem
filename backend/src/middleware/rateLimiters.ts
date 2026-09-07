import rateLimit, { Options, RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config';
import {
  shouldSkipRateLimit,
  shouldApplyAuthRateLimit,
  SERVICE_UNAVAILABLE_MESSAGE,
} from '../utils/requestSecurityContext';
import { getClientIP } from '../utils/getClientIP';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import logger from '../utils/logger';

/** Per-IP count of rate-limit window trips (Phase 2 escalation). */
const _rateLimitTrips = new Map<string, number>();
const TRIPS_MAX = 50_000;

function capTrips(): void {
  while (_rateLimitTrips.size > TRIPS_MAX) {
    const first = _rateLimitTrips.keys().next().value;
    if (first === undefined) break;
    _rateLimitTrips.delete(first);
  }
}

/**
 * Phase 2: when a rate limiter fires —
 *   1st trip → temporary ban (24h) + 429
 *   2nd+ trip → permanent ban + 429
 */
function rateLimitBanHandler(
  req: Request,
  res: Response,
  _next: unknown,
  optionsUsed: Options,
): void {
  const ip = getClientIP(req);
  const trips = (_rateLimitTrips.get(ip) || 0) + 1;
  _rateLimitTrips.set(ip, trips);
  capTrips();

  const tempMs = config.securityScannerTempBanMs > 0
    ? config.securityScannerTempBanMs
    : 24 * 60 * 60 * 1000;
  const durationMs = trips === 1 ? tempMs : null;

  logger.warn(
    `[RateLimit] IP ${ip} exceeded limit (trip #${trips}) → ${durationMs ? `${durationMs}ms ban` : 'permanent ban'}`,
  );

  (async () => {
    try {
      const ban = await BlocklistService.blockScanner(
        ip,
        'rate_limit',
        `Rate limit exceeded (trip #${trips}) on ${req.method} ${req.originalUrl || req.url}`,
        durationMs,
      );
      await securityLogService.logEvent({
        ip,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
        eventType: 'rate_limited',
        severity: trips >= 2 ? 'high' : 'medium',
        metadata: {
          tripNumber: trips,
          banDurationMs: durationMs ?? 0,
          blocked: ban.blocked,
        },
        blocked: ban.blocked,
      });
    } catch (err) {
      logger.error('[RateLimit] Ban/log failed:', err);
    }
  })();

  res.status(optionsUsed.statusCode).json(optionsUsed.message);
}

const sharedLimiterOpts = {
  standardHeaders: true as const,
  legacyHeaders: false as const,
  handler: rateLimitBanHandler,
};

/**
 * Strict rate limiter for authentication endpoints.
 * Only applies to IPs already flagged suspicious or auto-blocked — clean IPs
 * (typical first-time clerk/driver login) are not throttled.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skipSuccessfulRequests: true,
  skip: (req) => !shouldApplyAuthRateLimit(req),
  ...sharedLimiterOpts,
});

export const mfaSetupRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export const driverAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: (req) => !shouldApplyAuthRateLimit(req),
  ...sharedLimiterOpts,
});

export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '500', 10),
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export const refreshTokenRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export const exportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  skip: shouldSkipRateLimit,
  ...sharedLimiterOpts,
});

export type { RateLimitRequestHandler };
