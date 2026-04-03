import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import logger from '../utils/logger';

/**
 * Get audit history for a specific resource.
 * Returns timeline entries (timestamp, user, action, diff) for the given
 * resourceType + resourceId, sorted newest-first.
 */
export const getResourceHistory = (resourceType: string) => {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      const logs = await AuditLog.find({ resourceType, resourceId: id })
        .sort({ timestamp: -1 })
        .limit(limit)
        .select('timestamp username action previousValue newValue details severity')
        .lean();

      res.status(200).json({ success: true, data: logs });
    } catch (error: any) {
      logger.error(`Error fetching history for ${resourceType}:`, error);
      res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
  };
};
