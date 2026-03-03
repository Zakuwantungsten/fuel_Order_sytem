import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import BlocklistService from '../services/blocklistService';
import AuditService from '../utils/auditService';
import logger from '../utils/logger';
import { config } from '../config';
import { SystemConfig } from '../models/SystemConfig';

/**
 * GET /api/v1/system-admin/security-blocklist
 * Returns all currently blocked IPs (active, not expired).
 */
export const getBlockedIPs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const blockedIPs = await BlocklistService.getBlockedIPs();
    res.status(200).json({ success: true, data: blockedIPs });
  } catch (err) {
    logger.error('getBlockedIPs error:', err);
    throw new ApiError(500, 'Failed to fetch blocked IPs');
  }
};

/**
 * GET /api/v1/system-admin/security-blocklist/suspicious
 * Returns IPs with suspicious activity (not yet blocked).
 */
export const getSuspiciousIPs = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const suspicious = BlocklistService.getSuspiciousIPs();
    res.status(200).json({ success: true, data: suspicious });
  } catch (err) {
    logger.error('getSuspiciousIPs error:', err);
    throw new ApiError(500, 'Failed to fetch suspicious IPs');
  }
};

/**
 * GET /api/v1/system-admin/security-blocklist/stats
 * Returns blocklist statistics for the dashboard.
 */
export const getBlocklistStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await BlocklistService.getStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    logger.error('getBlocklistStats error:', err);
    throw new ApiError(500, 'Failed to fetch blocklist stats');
  }
};

/**
 * GET /api/v1/system-admin/security-blocklist/history
 * Returns block history with pagination and filters.
 */
export const getBlockHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const ip = req.query.ip as string;
    const reason = req.query.reason as string;
    const activeOnly = req.query.activeOnly === 'true';

    const result = await BlocklistService.getBlockHistory({ page, limit, ip, reason, activeOnly });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error('getBlockHistory error:', err);
    throw new ApiError(500, 'Failed to fetch block history');
  }
};

/**
 * POST /api/v1/system-admin/security-blocklist/block
 * Manually block an IP address.
 */
export const blockIP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ip, durationMs, reason, details } = req.body;

    if (!ip || typeof ip !== 'string') {
      throw new ApiError(400, 'IP address is required');
    }

    const trimmedIP = ip.trim();

    // Basic IP format validation
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(trimmedIP) && !/^[0-9a-fA-F:]+$/.test(trimmedIP)) {
      throw new ApiError(400, 'Invalid IP address format');
    }

    const duration = typeof durationMs === 'number' && durationMs > 0 ? durationMs : null;
    const blockReason = reason || 'manual';
    const adminUser = req.user?.username || 'admin';

    await BlocklistService.block(trimmedIP, duration, blockReason, details || '', adminUser);

    // Audit log
    await AuditService.log({
      userId: req.user?.userId,
      username: adminUser,
      action: 'CONFIG_CHANGE',
      resourceType: 'security_blocklist',
      resourceId: trimmedIP,
      details: `Manually blocked IP: ${trimmedIP} (duration: ${duration ? `${duration}ms` : 'permanent'}, reason: ${blockReason})`,
      severity: 'high',
      outcome: 'SUCCESS',
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: `IP ${trimmedIP} has been blocked`,
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('blockIP error:', err);
    throw new ApiError(500, 'Failed to block IP');
  }
};

/**
 * DELETE /api/v1/system-admin/security-blocklist/unblock/:ip
 * Unblock a previously blocked IP address.
 */
export const unblockIP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ip } = req.params;

    if (!ip || typeof ip !== 'string') {
      throw new ApiError(400, 'IP address is required');
    }

    const trimmedIP = ip.trim();
    const adminUser = req.user?.username || 'admin';

    const success = await BlocklistService.unblock(trimmedIP, adminUser);

    if (!success) {
      // Still remove from memory even if not in DB
      res.status(200).json({
        success: true,
        message: `IP ${trimmedIP} has been unblocked (was not in database)`,
      });
      return;
    }

    // Audit log
    await AuditService.log({
      userId: req.user?.userId,
      username: adminUser,
      action: 'CONFIG_CHANGE',
      resourceType: 'security_blocklist',
      resourceId: trimmedIP,
      details: `Unblocked IP: ${trimmedIP}`,
      severity: 'medium',
      outcome: 'SUCCESS',
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: `IP ${trimmedIP} has been unblocked`,
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('unblockIP error:', err);
    throw new ApiError(500, 'Failed to unblock IP');
  }
};

/**
 * GET /api/v1/system-admin/security-blocklist/config
 * Returns current autoblock configuration (runtime values).
 */
export const getAutoblockConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      data: {
        ipBlockingEnabled: config.securityIpBlocking,
        blockDurationMs: config.securityBlockDurationMs,
        suspiciousThreshold: config.securitySuspiciousThreshold,
        threshold404Count: config.security404CountThreshold,
        threshold404WindowMs: config.security404WindowMs,
        uaBlockingEnabled: config.securityUaBlocking,
        ipGatingEnabled: (config as any).securityIpGating ?? false,
      },
    });
  } catch (err) {
    logger.error('getAutoblockConfig error:', err);
    throw new ApiError(500, 'Failed to fetch autoblock configuration');
  }
};

/**
 * PUT /api/v1/system-admin/security-blocklist/config
 * Updates autoblock configuration at runtime and persists to DB.
 */
export const updateAutoblockConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      ipBlockingEnabled,
      blockDurationMs,
      suspiciousThreshold,
      threshold404Count,
      threshold404WindowMs,
      uaBlockingEnabled,
      ipGatingEnabled,
    } = req.body;

    // Validate numeric values
    if (blockDurationMs !== undefined && (typeof blockDurationMs !== 'number' || (blockDurationMs !== 0 && blockDurationMs < 60000))) {
      throw new ApiError(400, 'Block duration must be 0 (permanent) or at least 60,000ms (1 minute)');
    }
    if (suspiciousThreshold !== undefined && (typeof suspiciousThreshold !== 'number' || suspiciousThreshold < 1 || suspiciousThreshold > 100)) {
      throw new ApiError(400, 'Suspicious threshold must be between 1 and 100');
    }
    if (threshold404Count !== undefined && (typeof threshold404Count !== 'number' || threshold404Count < 5 || threshold404Count > 500)) {
      throw new ApiError(400, '404 count threshold must be between 5 and 500');
    }
    if (threshold404WindowMs !== undefined && (typeof threshold404WindowMs !== 'number' || threshold404WindowMs < 60000)) {
      throw new ApiError(400, '404 window must be at least 60,000ms (1 minute)');
    }

    // Apply to runtime config
    if (ipBlockingEnabled !== undefined) (config as any).securityIpBlocking = !!ipBlockingEnabled;
    if (blockDurationMs !== undefined) (config as any).securityBlockDurationMs = blockDurationMs;
    if (suspiciousThreshold !== undefined) (config as any).securitySuspiciousThreshold = suspiciousThreshold;
    if (threshold404Count !== undefined) (config as any).security404CountThreshold = threshold404Count;
    if (threshold404WindowMs !== undefined) (config as any).security404WindowMs = threshold404WindowMs;
    if (uaBlockingEnabled !== undefined) (config as any).securityUaBlocking = !!uaBlockingEnabled;
    if (ipGatingEnabled !== undefined) (config as any).securityIpGating = !!ipGatingEnabled;

    // Persist to DB
    let sysConfig = await SystemConfig.findOne({ configType: 'security_settings', isDeleted: false });
    if (!sysConfig) {
      sysConfig = await SystemConfig.create({
        configType: 'security_settings',
        securitySettings: {},
        lastUpdatedBy: req.user?.username || 'system',
      });
    }

    if (!sysConfig.securitySettings) sysConfig.securitySettings = {} as any;
    sysConfig.securitySettings!.autoblock = {
      ipBlockingEnabled: config.securityIpBlocking,
      blockDurationMs: config.securityBlockDurationMs,
      suspiciousThreshold: config.securitySuspiciousThreshold,
      threshold404Count: config.security404CountThreshold,
      threshold404WindowMs: config.security404WindowMs,
      uaBlockingEnabled: config.securityUaBlocking,
      ipGatingEnabled: (config as any).securityIpGating ?? false,
    };
    sysConfig.lastUpdatedBy = req.user?.username || 'system';
    sysConfig.markModified('securitySettings');
    await sysConfig.save();

    // Audit log
    await AuditService.log({
      userId: req.user?.userId,
      username: req.user?.username || 'system',
      action: 'CONFIG_CHANGE',
      resourceType: 'autoblock_config',
      resourceId: 'security_blocklist',
      details: `Updated autoblock configuration: ${JSON.stringify(req.body)}`,
      severity: 'high',
      outcome: 'SUCCESS',
      ipAddress: req.ip || '',
    });

    logger.info(`Autoblock config updated by ${req.user?.username}`, req.body);

    res.status(200).json({
      success: true,
      message: 'Autoblock configuration updated',
      data: {
        ipBlockingEnabled: config.securityIpBlocking,
        blockDurationMs: config.securityBlockDurationMs,
        suspiciousThreshold: config.securitySuspiciousThreshold,
        threshold404Count: config.security404CountThreshold,
        threshold404WindowMs: config.security404WindowMs,
        uaBlockingEnabled: config.securityUaBlocking,
        ipGatingEnabled: (config as any).securityIpGating ?? false,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('updateAutoblockConfig error:', err);
    throw new ApiError(500, 'Failed to update autoblock configuration');
  }
};
