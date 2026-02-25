import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';
import SecurityEventLogger from '../utils/securityEventLogger';

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
    
    // Generate new token if none exists or if explicitly requesting new token
    if (!token || req.path === '/csrf-token') {
      token = generateCsrfToken();
      logger.info(`[CSRF] Generated new token for ${req.path} from IP ${req.ip}`);
    }
    
    // Set cookie with token
    // Use 'lax' in development for localhost cross-port requests
    // Use 'strict' in production for same-origin only
    // Cookie options - different for dev vs production
    // In dev: Don't set sameSite to allow cross-port localhost cookies
    // In prod: Use strict + secure for maximum security
    const cookieOptions: any = {
      httpOnly: false, // Allow JavaScript to read for sending in headers
      maxAge: 3600000, // 1 hour
      path: '/', // Ensure cookie is available for all paths
    };
    
    // In production, use strict and secure settings
    if (config.nodeEnv === 'production') {
      cookieOptions.secure = true;
      cookieOptions.sameSite = 'strict';
    }
    // In development, omit sameSite and secure to allow cross-port localhost
    
    res.cookie(CSRF_COOKIE_NAME, token, cookieOptions);
    logger.info(`[CSRF] Set cookie with options:`, { 
      cookieName: CSRF_COOKIE_NAME,
      options: cookieOptions,
      path: req.path,
      nodeEnv: config.nodeEnv
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
      logger.warn(`CSRF validation failed: Missing token for ${req.method} ${req.path} from IP ${req.ip}`, {
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken,
        cookies: Object.keys(req.cookies),
        headers: Object.keys(req.headers).filter(h => h.toLowerCase().includes('xsrf') || h.toLowerCase().includes('csrf'))
      });
      
      // Log CSRF failure to audit trail
      SecurityEventLogger.logCSRFFailure({
        username: (req as any).user?.username || 'unknown',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'Missing CSRF token',
      }).catch(() => {});
      
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
      
      // Log CSRF failure to audit trail
      SecurityEventLogger.logCSRFFailure({
        username: (req as any).user?.username || 'unknown',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'Token mismatch',
      }).catch(() => {});
      
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
  if (typeof err.code === 'string' && err.code.startsWith('CSRF_')) {
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

