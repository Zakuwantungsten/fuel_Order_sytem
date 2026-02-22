import { Request, Response, NextFunction } from 'express';
import { SystemConfig } from '../models';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { config } from '../config';

interface MaintenanceCache {
  enabled: boolean;
  message: string;
  allowedRoles: string[];
  updatedAt: number;
}

let _cache: MaintenanceCache | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Invalidate the in-memory maintenance cache so the next request re-reads from DB.
 * Call this immediately after any maintenance mode toggle.
 */
export const invalidateMaintenanceCache = (): void => {
  _cache = null;
};

/**
 * Middleware: block non-allowed roles when maintenance mode is enabled.
 *
 * Uses a short-lived in-memory cache (30 s) to avoid a DB hit on every request.
 * The maintenance status endpoint itself is always allowed so the frontend can poll it.
 * Auth routes are mounted before this middleware in routes/index.ts and are unaffected.
 */
export const checkMaintenanceMode = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Always allow the maintenance status check endpoint (used by frontend on startup)
    if (req.path === '/admin/maintenance-mode/status') {
      return next();
    }

    // Refresh cache if stale or missing
    const now = Date.now();
    if (!_cache || now - _cache.updatedAt > CACHE_TTL_MS) {
      const systemConfig = await SystemConfig.findOne({
        configType: 'system_settings',
        isDeleted: false,
      }).lean();

      const maintenance = (systemConfig as any)?.systemSettings?.maintenance;
      _cache = {
        enabled: maintenance?.enabled ?? false,
        message: maintenance?.message ?? 'System is under maintenance. Please check back later.',
        allowedRoles: maintenance?.allowedRoles ?? ['super_admin'],
        updatedAt: now,
      };
    }

    // If maintenance mode is off, proceed normally
    if (!_cache.enabled) {
      return next();
    }

    // Try to resolve the caller's role from the Bearer JWT
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        if (_cache.allowedRoles.includes(decoded.role)) {
          return next(); // Caller is in the allowed list — let through
        }
      } catch {
        // Invalid or expired token — fall through to block
      }
    }

    // Maintenance is active and the caller is not an allowed role
    res.status(503).json({
      success: false,
      message: _cache.message,
      code: 'MAINTENANCE_MODE',
    });
  } catch (error) {
    // Never block traffic due to a check failure — log and continue
    logger.error('Maintenance mode check error:', error);
    next();
  }
};
