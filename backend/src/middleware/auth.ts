import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { JWTPayload, UserRole } from '../types';
import { User } from '../models';
import logger from '../utils/logger';
import { activeSessionTracker } from '../utils/activeSessionTracker';
import SecurityEventLogger from '../utils/securityEventLogger';

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
