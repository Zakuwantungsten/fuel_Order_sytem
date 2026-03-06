import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { activeSessionTracker } from '../utils/activeSessionTracker';
import { ApiError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import AuditService from '../utils/auditService';

/**
 * GET /api/v1/system-admin/sessions
 * Returns all currently active sessions (super_admin only)
 */
export const getActiveSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  const sessions = await activeSessionTracker.getActive();
  res.status(200).json({ success: true, data: sessions, total: sessions.length });
};

/**
 * DELETE /api/v1/system-admin/sessions/:userId
 * Terminate a specific user session (super_admin only)
 */
export const terminateSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (userId === req.user?.userId) {
      throw new ApiError(400, 'You cannot terminate your own session');
    }

    const sessions = await activeSessionTracker.getActive();
    const target = sessions.find((s) => s.userId === userId);
    if (!target) {
      throw new ApiError(404, 'Session not found or already expired');
    }

    activeSessionTracker.terminate(userId);

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'session',
      resourceId: userId,
      userId: req.user?.userId || '',
      username: req.user?.username || '',
      details: `Session terminated for user: ${target.username} (${target.role})`,
      severity: 'high',
      ipAddress: req.ip,
    });

    logger.warn(`Session terminated by ${req.user?.username} for userId: ${userId} (${target.username})`);
    res.status(200).json({ success: true, message: `Session terminated for ${target.username}` });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logger.error('terminateSession error:', err);
    throw new ApiError(500, 'Failed to terminate session');
  }
};

/**
 * DELETE /api/v1/system-admin/sessions
 * Terminate ALL active sessions except the requesting admin (super_admin only)
 */
export const terminateAllSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const terminated = activeSessionTracker.terminateAll(req.user?.userId);

    await AuditService.log({
      action: 'CONFIG_CHANGE',
      resourceType: 'session',
      userId: req.user?.userId || '',
      username: req.user?.username || '',
      details: `Mass session termination: ${terminated.length} session(s) terminated`,
      severity: 'critical',
      ipAddress: req.ip,
    });

    logger.warn(`Mass session kill by ${req.user?.username}: ${terminated.length} session(s) terminated`);
    res.status(200).json({
      success: true,
      message: `${terminated.length} session(s) terminated`,
      terminated: terminated.length,
    });
  } catch (err) {
    logger.error('terminateAllSessions error:', err);
    throw new ApiError(500, 'Failed to terminate sessions');
  }
};
