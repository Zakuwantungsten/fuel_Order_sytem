import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Custom CSRF Protection using Double Submit Cookie Pattern
 * More secure and modern than deprecated csurf package
 */

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';

/**
 * Generate a cryptographically secure CSRF token
 */
const generateCsrfToken = (): string => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
};

/**
 * Middleware to provide CSRF token to the client
 * Sets the token as a cookie that JavaScript can read
 */
export const provideCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Check if token already exists in cookie
    let token = req.cookies[CSRF_COOKIE_NAME];
    
    // Generate new token if none exists
    if (!token) {
      token = generateCsrfToken();
    }
    
    // Set cookie with token
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Allow JavaScript to read for sending in headers
      secure: config.nodeEnv === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    });
    
    next();
  } catch (error) {
    logger.error('CSRF token generation error:', error);
    next(error);
  }
};

/**
 * Middleware to validate CSRF token on state-changing requests
 * Uses double-submit cookie pattern
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Skip validation for safe HTTP methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    
    // Get token from cookie
    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    
    // Get token from header
    const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()] as string;
    
    // Both tokens must exist
    if (!cookieToken || !headerToken) {
      logger.warn(`CSRF validation failed: Missing token for ${req.method} ${req.path} from IP ${req.ip}`);
      res.status(403).json({
        success: false,
        message: 'CSRF token missing. Please refresh the page and try again.',
        code: 'CSRF_TOKEN_MISSING',
      });
      return;
    }
    
    // Tokens must match (timing-safe comparison)
    const isValid = crypto.timingSafeEqual(
      Buffer.from(cookieToken),
      Buffer.from(headerToken)
    );
    
    if (!isValid) {
      logger.warn(`CSRF validation failed: Token mismatch for ${req.method} ${req.path} from IP ${req.ip}`);
      res.status(403).json({
        success: false,
        message: 'Invalid CSRF token. Please refresh the page and try again.',
        code: 'CSRF_VALIDATION_FAILED',
      });
      return;
    }
    
    // Valid token - proceed
    next();
  } catch (error: any) {
    logger.error('CSRF validation error:', error);
    res.status(403).json({
      success: false,
      message: 'CSRF validation error. Please refresh the page and try again.',
      code: 'CSRF_ERROR',
    });
  }
};

/**
 * Custom CSRF error handler
 */
export const csrfErrorHandler = (err: any, req: Request, res: Response, next: NextFunction): void => {
  if (err.code?.startsWith('CSRF_')) {
    logger.warn(`CSRF error for ${req.method} ${req.path} from IP ${req.ip}`);
    res.status(403).json({
      success: false,
      message: 'CSRF token validation failed. Please refresh the page and try again.',
      code: err.code,
    });
    return;
  }
  next(err);
};

