import rateLimit from 'express-rate-limit';
import { config } from '../config';

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute force attacks on login
 */
export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 per minute
  message: 'Too many login attempts. Please try again after 1 minute.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests to allow legitimate users
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * Rate limiter for password reset requests
 * Prevents account enumeration and spam
 */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 requests per hour
  message: 'Too many password reset requests. Please try again after 1 hour.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for user registration
 * Prevents spam account creation
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 registrations per hour
  message: 'Too many registration attempts. Please try again after 1 hour.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for driver authentication
 * Stricter than regular auth due to simplified auth flow
 */
export const driverAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 attempts per windowMs
  message: 'Too many driver authentication attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter (fallback)
 */
export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Data endpoints rate limiter (standard traffic).
 * This SPA makes 20-40 parallel requests on every page load, so the per-IP
 * ceiling must be high enough for a legitimate user navigating normally.
 * 500 req/min gives comfortable headroom while still blocking automated abuse.
 * Configurable via API_RATE_LIMIT_MAX env var (default 500).
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '500', 10),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

/**
 * Export/download rate limiter
 */
export const exportRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 req/min
  message: 'Too many export requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
