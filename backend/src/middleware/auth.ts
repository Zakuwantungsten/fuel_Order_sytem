import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { JWTPayload, UserRole } from '../types';
import { User } from '../models';
import logger from '../utils/logger';
import { activeSessionTracker } from '../utils/activeSessionTracker';
import SecurityEventLogger from '../utils/securityEventLogger';
import { ConditionalAccessPolicy, IConditionalAccessPolicyDocument } from '../models/ConditionalAccessPolicy';
import { SystemConfig } from '../models/SystemConfig';

/* ────────── Caches with TTL ────────── */

let cachedPolicies: IConditionalAccessPolicyDocument[] = [];
let policyCacheExpiry = 0;
const POLICY_CACHE_TTL = 60_000; // 1 minute

async function getActivePolicies(): Promise<IConditionalAccessPolicyDocument[]> {
  if (Date.now() < policyCacheExpiry && cachedPolicies.length >= 0) return cachedPolicies;
  try {
    cachedPolicies = await ConditionalAccessPolicy.find({ isActive: true }).sort({ priority: 1 }).lean() as any;
    policyCacheExpiry = Date.now() + POLICY_CACHE_TTL;
  } catch { /* on error keep stale cache */ }
  return cachedPolicies;
}

let cachedPasswordPolicy: { expirationDays: number; expirationWarningDays: number; expirationGraceDays: number; expirationExemptRoles: string[] } | null = null;
let passwordPolicyCacheExpiry = 0;

async function getPasswordExpirationPolicy() {
  if (Date.now() < passwordPolicyCacheExpiry && cachedPasswordPolicy) return cachedPasswordPolicy;
  try {
    const cfg = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false }).select('securitySettings.password').lean();
    const p = (cfg as any)?.securitySettings?.password;
    cachedPasswordPolicy = {
      expirationDays: p?.expirationDays ?? 0,
      expirationWarningDays: p?.expirationWarningDays ?? 7,
      expirationGraceDays: p?.expirationGraceDays ?? 3,
      expirationExemptRoles: p?.expirationExemptRoles ?? [],
    };
    passwordPolicyCacheExpiry = Date.now() + POLICY_CACHE_TTL;
  } catch { /* keep stale */ }
  return cachedPasswordPolicy || { expirationDays: 0, expirationWarningDays: 7, expirationGraceDays: 3, expirationExemptRoles: [] };
}

/** Evaluate conditional access policies against a request context */
function evaluatePolicies(
  policies: IConditionalAccessPolicyDocument[],
  context: { role: string; ip: string; },
): { action: string; policyName: string } | null {
  for (const policy of policies) {
    let allMatch = true;
    for (const cond of (policy as any).conditions) {
      const val = cond.value;
      let match = false;
      switch (cond.signal) {
        case 'role': {
          const arr = Array.isArray(val) ? val : [val];
          if (cond.operator === 'in') match = arr.includes(context.role);
          else if (cond.operator === 'not_in') match = !arr.includes(context.role);
          else if (cond.operator === 'equals') match = context.role === val;
          else if (cond.operator === 'not_equals') match = context.role !== val;
          break;
        }
        case 'ip_range': {
          const arr = Array.isArray(val) ? val : [val];
          if (cond.operator === 'in') match = arr.some((r: string) => ipInRange(context.ip, r));
          else if (cond.operator === 'not_in') match = !arr.some((r: string) => ipInRange(context.ip, r));
          break;
        }
        case 'time_of_day': {
          const now = new Date();
          const mins = now.getHours() * 60 + now.getMinutes();
          const range = typeof val === 'string' ? val : '';
          const [start, end] = range.split('-').map((t: string) => {
            const [h, m] = t.trim().split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
          });
          if (cond.operator === 'between') match = mins >= start && mins <= end;
          else if (cond.operator === 'not_between') match = mins < start || mins > end;
          break;
        }
        default:
          match = true; // unknown signals pass by default
      }
      if (!match) { allMatch = false; break; }
    }
    if (allMatch) return { action: (policy as any).action, policyName: (policy as any).name };
  }
  return null;
}

/** Simple check if IP matches a value (exact or CIDR prefix-based) */
function ipInRange(ip: string, range: string): boolean {
  if (range === ip) return true;
  if (range.includes('/')) {
    const [base, bits] = range.split('/');
    const mask = parseInt(bits, 10);
    if (isNaN(mask)) return false;
    const ipParts = ip.split('.').map(Number);
    const baseParts = base.split('.').map(Number);
    if (ipParts.length !== 4 || baseParts.length !== 4) return false;
    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const baseNum = (baseParts[0] << 24) | (baseParts[1] << 16) | (baseParts[2] << 8) | baseParts[3];
    const maskNum = mask === 0 ? 0 : (~0 << (32 - mask));
    return (ipNum & maskNum) === (baseNum & maskNum);
  }
  return false;
}

// Extend Express Request type
export interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
    role: UserRole;
  };
}

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      
      // Log unauthorized access to audit trail
      SecurityEventLogger.logUnauthorized({
        username: 'anonymous',
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'No token provided',
      }).catch(() => {}); // Silent fail - don't block auth process
      
      res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

    // Handle virtual driver users (they don't exist in User collection)
    // Driver tokens have userId starting with 'driver_' prefix
    if (decoded.userId.startsWith('driver_')) {
      // Virtual driver user - validate role and attach to request
      if (decoded.role !== 'driver') {
        const driverIp =
          (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
          req.socket?.remoteAddress ||
          'unknown';
        
        SecurityEventLogger.logUnauthorized({
          username: decoded.username,
          ipAddress: driverIp,
          userAgent: req.get('user-agent'),
          endpoint: req.path,
          method: req.method,
          errorReason: 'Invalid driver token - wrong role',
        }).catch(() => {});
        
        res.status(401).json({
          success: false,
          message: 'Invalid driver token.',
        });
        return;
      }

      // Attach virtual driver user to request
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
      };

      const driverIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      activeSessionTracker.touch(decoded.userId, decoded.username, decoded.role, driverIp);

      next();
      return;
    }

    // Regular user - validate userId format before DB lookup
    if (!mongoose.Types.ObjectId.isValid(decoded.userId)) {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';

      SecurityEventLogger.logUnauthorized({
        userId: decoded.userId,
        username: decoded.username,
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'Invalid userId format in token',
      }).catch(() => {});

      res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
      return;
    }

    // Verify existence in database
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive || user.isDeleted) {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      
      const reason = !user ? 'User not found' : !user.isActive ? 'User inactive' : 'User deleted';
      
      SecurityEventLogger.logUnauthorized({
        userId: decoded.userId,
        username: decoded.username,
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: reason,
      }).catch(() => {});
      
      res.status(401).json({
        success: false,
        message: 'User no longer exists or is inactive.',
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    };

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    // ── Conditional access policy evaluation ──
    try {
      const policies = await getActivePolicies();
      if (policies.length > 0) {
        const result = evaluatePolicies(policies, { role: decoded.role, ip });
        if (result) {
          if (result.action === 'block') {
            res.status(403).json({
              success: false,
              message: 'Access denied by conditional access policy.',
              policy: result.policyName,
            });
            return;
          }
          if (result.action === 'require_mfa') {
            // Attach header hint — MFA enforcement middleware downstream can act on this
            (req as any)._conditionalMfaRequired = true;
          }
          // 'allow' and 'notify_admin' — let request proceed
        }
      }
    } catch (e) {
      logger.warn('Conditional access evaluation error:', e);
      // fail-open: don't block on policy eval errors
    }

    // ── Password expiration check ──
    // Skip for password-change and auth endpoints so users can actually change their password
    const skipExpiryPaths = ['/auth/', '/users/change-password', '/users/me/change-password'];
    const shouldSkipExpiry = skipExpiryPaths.some(p => req.originalUrl.includes(p));
    if (!shouldSkipExpiry) {
      try {
        const pwPolicy = await getPasswordExpirationPolicy();
        if (pwPolicy.expirationDays > 0 && !pwPolicy.expirationExemptRoles.includes(decoded.role)) {
          const changedAt = user.passwordResetAt || (user as any).createdAt;
          if (changedAt) {
            const ageMs = Date.now() - new Date(changedAt).getTime();
            const ageDays = ageMs / 86_400_000;
            const totalGrace = pwPolicy.expirationDays + pwPolicy.expirationGraceDays;
            if (ageDays > totalGrace) {
              // Hard expired — force password change
              res.status(403).json({
                success: false,
                message: 'Your password has expired. Please change your password.',
                code: 'PASSWORD_EXPIRED',
                mustChangePassword: true,
              });
              return;
            }
            if (ageDays > pwPolicy.expirationDays) {
              // In grace period — add warning header
              const remaining = Math.ceil(totalGrace - ageDays);
              res.setHeader('X-Password-Grace-Remaining', String(remaining));
              res.setHeader('X-Password-Expired', 'grace');
            } else if (ageDays > pwPolicy.expirationDays - pwPolicy.expirationWarningDays) {
              // Warning period
              const remaining = Math.ceil(pwPolicy.expirationDays - ageDays);
              res.setHeader('X-Password-Expiry-Warning', String(remaining));
            }
          }
        }
      } catch (e) {
        logger.warn('Password expiry check error:', e);
      }
    }

    // Reject sessions forcefully terminated by an admin (check before touch)
    if (activeSessionTracker.isTerminated(decoded.userId)) {
      res.status(401).json({
        success: false,
        message: 'Your session has been terminated by an administrator. Please log in again.',
      });
      return;
    }

    activeSessionTracker.touch(decoded.userId, decoded.username, decoded.role, ip);

    next();
  } catch (error: any) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      SecurityEventLogger.logJWTFailure({
        username: 'unknown',
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: error.message,
      }).catch(() => {});
      
      res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
      return;
    }
    
    if (error.name === 'TokenExpiredError') {
      SecurityEventLogger.logJWTFailure({
        username: 'unknown',
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'Token expired',
      }).catch(() => {});
      
      res.status(401).json({
        success: false,
        message: 'Token expired.',
      });
      return;
    }

    if (error.name === 'CastError') {
      res.status(401).json({
        success: false,
        message: 'Invalid token.',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Authentication failed.',
    });
  }
};

/**
 * Check if user has required role(s)
 */
export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      
      SecurityEventLogger.logUnauthorized({
        username: 'unknown',
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: 'Not authenticated',
      }).catch(() => {});
      
      res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      const ip =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';
      
      logger.warn(
        `Unauthorized access attempt by user ${req.user.username} with role ${req.user.role}`
      );
      
      // Log forbidden access to audit trail
      SecurityEventLogger.logForbidden({
        userId: req.user.userId,
        username: req.user.username,
        ipAddress: ip,
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        method: req.method,
        errorReason: `User role '${req.user.role}' does not have access (requires: ${roles.join(', ')})`,
      }).catch(() => {});
      
      res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;

    const user = await User.findById(decoded.userId);
    
    if (user && user.isActive && !user.isDeleted) {
      req.user = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};
