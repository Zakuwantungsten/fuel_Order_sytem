import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';
import SecurityEventLogger from '../utils/securityEventLogger';

/**
 * CSRF Protection using HMAC-Signed Stateless Tokens
 *
 * Strategy:
 *  - Tokens are HMAC-signed (timestamp.nonce.hmac) so the server can verify
 *    them by signature without relying on a matching cookie.
 *  - The signed token is returned in the response BODY of GET /csrf-token so
 *    cross-origin frontends (e.g. Firebase → Railway) can read and store it in
 *    sessionStorage.
 *  - The XSRF-TOKEN cookie is still set (SameSite=None; Secure in prod) as a
 *    belt-and-suspenders measure for same-origin contexts.
 *
 * Validation order on state-changing requests:
 *  1. HMAC verification of the X-XSRF-TOKEN header (works cross-origin without cookie).
 *  2. Fallback: double-submit cookie comparison (backward-compat with any old
 *     random tokens still in client sessionStorage until they expire/refresh).
 */

const CSRF_TOKEN_LENGTH = 32; // bytes for the nonce
const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';
const CSRF_TOKEN_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

// Derive a dedicated CSRF signing key from the JWT secret to maintain key separation.
const getCsrfSigningKey = (): Buffer => {
  return crypto.createHash('sha256').update(config.jwtSecret + ':csrf-v1').digest();
};

/**
 * Generate an HMAC-signed CSRF token: base64url(timestamp.nonce.hmac)
 * The HMAC covers "timestamp.nonce" using SHA-256.
 */
const generateCsrfToken = (): string => {
  const nonce = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  const timestamp = Date.now().toString();
  const payload = `${timestamp}.${nonce}`;
  const hmac = crypto.createHmac('sha256', getCsrfSigningKey())
    .update(payload)
    .digest('hex');
  return Buffer.from(`${payload}.${hmac}`).toString('base64url');
};

/**
 * Verify an HMAC-signed CSRF token returned by generateCsrfToken().
 * Returns true if the signature is valid and the token is not expired.
 */
const verifyCsrfToken = (token: string): boolean => {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    // Format: timestamp.nonce.hmac  (two dots separating three parts)
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return false;
    const payload = decoded.substring(0, lastDot);
    const providedHmac = decoded.substring(lastDot + 1);

    // Validate timestamp before computing HMAC (fail fast)
    const firstDot = payload.indexOf('.');
    if (firstDot === -1) return false;
    const timestamp = parseInt(payload.substring(0, firstDot), 10);
    if (!Number.isFinite(timestamp)) return false;
    const ageMs = Date.now() - timestamp;
    if (ageMs < 0 || ageMs > CSRF_TOKEN_MAX_AGE_MS) return false;

    // Constant-time HMAC comparison
    const expectedHmac = crypto.createHmac('sha256', getCsrfSigningKey())
      .update(payload)
      .digest('hex');
    if (providedHmac.length !== expectedHmac.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(providedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex'),
    );
  } catch {
    return false;
  }
};

/**
 * Middleware to provide CSRF token to the client.
 * Sets the signed token as a cookie AND exposes it in res.locals.csrfToken so
 * the /csrf-token route can return it in the response body (needed for
 * cross-origin clients that cannot read cookies from a foreign domain).
 */
export const provideCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    let token = req.cookies[CSRF_COOKIE_NAME];

    // Always issue a fresh signed token when the client explicitly requests one,
    // or when no valid existing cookie is present.
    if (!token || !verifyCsrfToken(token) || req.path === '/csrf-token') {
      token = generateCsrfToken();
      logger.info(`[CSRF] Generated new signed token for ${req.path} from IP ${req.ip}`);
    }

    const cookieOptions: any = {
      httpOnly: false, // JS must be able to read it for the header
      maxAge: CSRF_TOKEN_MAX_AGE_MS,
      path: '/',
    };

    if (config.nodeEnv === 'production') {
      cookieOptions.secure = true;
      cookieOptions.sameSite = 'none'; // allow cross-origin cookie sending
    }
    // Development: omit sameSite/secure to allow cross-port localhost cookies

    res.cookie(CSRF_COOKIE_NAME, token, cookieOptions);
    res.locals.csrfToken = token;

    next();
  } catch (error) {
    logger.error('CSRF token generation error:', error);
    next(error);
  }
};

/**
 * Middleware to validate CSRF token on state-changing requests.
 *
 * Validation order:
 *  1. HMAC signature check on the X-XSRF-TOKEN header value – works for both
 *     same-origin and cross-origin deployments without depending on the cookie.
 *  2. Fallback double-submit cookie comparison – handles the transition period
 *     where an older random token may still be stored in the client's
 *     sessionStorage before a new signed token is fetched.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Skip validation for safe HTTP methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()] as string | undefined;
    const cookieToken = req.cookies[CSRF_COOKIE_NAME] as string | undefined;

    // No header token at all – reject immediately
    if (!headerToken) {
      logger.warn(`CSRF validation failed: Missing X-XSRF-TOKEN header for ${req.method} ${req.path} from IP ${req.ip}`, {
        hasCookie: !!cookieToken,
        cookies: Object.keys(req.cookies),
      });

      SecurityEventLogger.logCSRFFailure({
        username: (req as any).user?.username || 'unknown',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'Missing X-XSRF-TOKEN header',
      }).catch(() => {});

      res.status(403).json({
        success: false,
        message: 'CSRF token missing. Please refresh the page and try again.',
        code: 'CSRF_TOKEN_MISSING',
      });
      return;
    }

    // PRIMARY: verify the HMAC signature of the token from the header.
    // This works regardless of whether the cookie is present, making it robust
    // for cross-origin deployments where third-party cookies may be blocked.
    if (verifyCsrfToken(headerToken)) {
      return next();
    }

    // FALLBACK: double-submit cookie comparison.
    // Handles the window where a client still holds an older random-format token
    // in sessionStorage (before it fetches a new signed one after a 403 retry).
    if (cookieToken && cookieToken.length === headerToken.length) {
      const cookieBuf = Buffer.from(cookieToken);
      const headerBuf = Buffer.from(headerToken);
      if (cookieBuf.length === headerBuf.length &&
          crypto.timingSafeEqual(cookieBuf, headerBuf)) {
        return next();
      }
    }

    // Both strategies failed
    logger.warn(`CSRF validation failed: Invalid token for ${req.method} ${req.path} from IP ${req.ip}`, {
      hasCookie: !!cookieToken,
      hmacValid: false,
    });

    SecurityEventLogger.logCSRFFailure({
      username: (req as any).user?.username || 'unknown',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      endpoint: req.path,
      method: req.method,
      errorReason: 'HMAC verification failed and double-submit mismatch',
    }).catch(() => {});

    res.status(403).json({
      success: false,
      message: 'Invalid CSRF token. Please refresh the page and try again.',
      code: 'CSRF_VALIDATION_FAILED',
    });
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

