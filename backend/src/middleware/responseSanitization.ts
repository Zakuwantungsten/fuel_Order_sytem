/**
 * Response Sanitization Middleware
 * Prevents sensitive data from being exposed in API responses and error messages
 * Sanitizes all response bodies and error details
 */

import { Request, Response, NextFunction } from 'express';
import { sanitizeObject } from '../utils/loggerSanitizer';
import logger from '../utils/logger';

/**
 * Middleware to sanitize response bodies and error messages
 * Wraps Response.json() to filter sensitive data before sending
 */
export const responseSanitizationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to sanitize response
  res.json = function (body: any): Response {
    try {
      // Sanitize the response body
      const sanitized = sanitizeObject(body);

      // Log response for debugging (if not successful, will be caught by error handler)
      if (!body.success && body.message) {
        logger.debug(`[Response] ${req.method} ${req.path}`, {
          message: body.message,
          statusCode: res.statusCode,
        });
      }

      // Send sanitized response
      return originalJson.call(this, sanitized);
    } catch (error: any) {
      logger.error('[Response Sanitization] Error sanitizing response:', error.message);
      // If sanitization fails, send original response (better to leak data than crash)
      return originalJson.call(this, body);
    }
  };

  next();
};

/**
 * Middleware to sanitize error responses specifically
 * Removes stack traces and sensitive details from error messages in production
 */
export const errorResponseSanitizationMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Create sanitized error response
  const errorResponse: any = {
    success: false,
    message: err.message || 'Internal server error',
  };

  // Only include stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }

  // Sanitize error details if present
  if (err.details) {
    errorResponse.details = sanitizeObject(err.details);
  }

  // Additional context in development only
  if (process.env.NODE_ENV === 'development') {
    errorResponse.path = req.path;
    errorResponse.method = req.method;
    errorResponse.timestamp = new Date().toISOString();
  }

  // Send sanitized error response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json(errorResponse);
};

/**
 * Middleware to prevent leaking request bodies in logs when containing sensitive data
 * Logs request metadata without sensitive parameters
 */
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // List of sensitive routes/params that should not log request body
  const sensitiveRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/change-password',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/driver/login',
    '/api/system-config/email',
  ];

  // Get relative path for matching
  const relativePath = req.path;
  const isSensitiveRoute = sensitiveRoutes.some((route) =>
    relativePath.includes(route)
  );

  if (isSensitiveRoute && req.method === 'POST') {
    // Log route and method without body details
    logger.debug(`[Request] ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      // Do NOT log req.body for sensitive routes
    });
  }

  next();
};

/**
 * Helper to sanitize email addresses (mask domain part)
 * Used for error messages that might include email in user context
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return email;

  const [localPart, domain] = email.split('@');
  if (!domain) return email;

  const maskedLocal =
    localPart.length > 2
      ? localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1]
      : '***';

  return `${maskedLocal}@${domain}`;
}

/**
 * Helper to sanitize phone numbers (mask middle digits)
 */
export function sanitizePhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') return phone;

  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 8) return '***';

  return cleaned.slice(0, 3) + '*'.repeat(cleaned.length - 6) + cleaned.slice(-3);
}
