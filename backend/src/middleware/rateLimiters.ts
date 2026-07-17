import rateLimit from 'express-rate-limit';
import { config } from '../config';
import {
  shouldSkipRateLimit,
  shouldApplyAuthRateLimit,
  SERVICE_UNAVAILABLE_MESSAGE,
} from '../utils/requestSecurityContext';

/**
 * Strict rate limiter for authentication endpoints.
 * Only applies to IPs already flagged suspicious or auto-blocked — clean IPs
 * (typical first-time clerk/driver login) are not throttled.
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => !shouldApplyAuthRateLimit(req),
});

/**
 * Rate limiter for MFA setup endpoints (generate / verify)
 */
export const mfaSetupRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for password reset requests
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for user registration
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Rate limiter for driver authentication
 */
export const driverAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !shouldApplyAuthRateLimit(req),
});

/**
 * General API rate limiter (fallback)
 */
export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Data endpoints rate limiter — authenticated users are never throttled.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '500', 10),
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Token refresh — light limit, skipped for trusted/clean IPs
 */
export const refreshTokenRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});

/**
 * Export/download rate limiter
 */
export const exportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: SERVICE_UNAVAILABLE_MESSAGE },
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
});
