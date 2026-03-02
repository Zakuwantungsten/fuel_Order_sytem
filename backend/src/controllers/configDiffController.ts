import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';

/**
 * GET /api/v1/system-admin/config-diff
 * Returns audit log entries for config-related changes (CONFIG_CHANGE, UPDATE on config resources).
 * Includes previousValue and newValue for diff visualization. (super_admin only)
 */
export const getConfigChanges = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 30);
    const username = req.query.username as string | undefined;
    const resourceType = req.query.resourceType as string | undefined;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const filter: Record<string, any> = {
      action: {
        $in: [
          'CONFIG_CHANGE', 'UPDATE', 'CREATE', 'DELETE',
          'ENABLE_MAINTENANCE', 'DISABLE_MAINTENANCE',
        ],
      },
      $or: [
        { resourceType: { $in: ['config', 'system_config', 'ip_rule', 'announcement', 'feature_flag', 'alert_threshold'] } },
        { action: { $in: ['CONFIG_CHANGE', 'ENABLE_MAINTENANCE', 'DISABLE_MAINTENANCE'] } },
      ],
    };

    if (username) filter.username = { $regex: username, $options: 'i' };
    if (resourceType) filter.resourceType = resourceType;
    if (from || to) {
      filter.timestamp = {};
      if (from) filter.timestamp.$gte = from;
      if (to) filter.timestamp.$lte = to;
    }

    const [entries, total] = await Promise.all([
      AuditLog
        .find(filter)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('timestamp username action resourceType resourceId previousValue newValue details severity outcome ipAddress'),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error('getConfigChanges error:', err);
    throw new ApiError(500, 'Failed to fetch config change history');
  }
};

/**
 * GET /api/v1/system-admin/config-diff/resource-types
 * Returns distinct resource types that have config changes (for filter dropdown).
 */
export const getResourceTypes = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const types = await AuditLog.distinct('resourceType', {
      action: { $in: ['CONFIG_CHANGE', 'UPDATE', 'CREATE', 'DELETE', 'ENABLE_MAINTENANCE', 'DISABLE_MAINTENANCE'] },
    });
    res.status(200).json({ success: true, data: types.sort() });
  } catch (err) {
    logger.error('getResourceTypes error:', err);
    throw new ApiError(500, 'Failed to fetch resource types');
  }
};
