import { Response } from 'express';
import { User } from '../models';
import type { AuthRequest } from '../middleware/auth';
import { AuditService } from '../utils/auditService';
import logger from '../utils/logger';

const PROTECTED_ROLES = ['super_admin'];

/**
 * GET /api/system-admin/bulk-users
 * List all users with minimal info for bulk operations
 */
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  const { role, status, q } = req.query;
  const filter: Record<string, unknown> = {};

  if (role) filter.role = role;
  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { username: { $regex: safe, $options: 'i' } },
      { firstName: { $regex: safe, $options: 'i' } },
      { lastName: { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('_id username firstName lastName email role isActive isBanned createdAt')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: users, total: users.length });
};

/**
 * POST /api/system-admin/bulk-users/bulk-action
 * Apply an action to a list of user IDs
 * body: { userIds: string[], action: 'activate'|'deactivate'|'change_role', role?: string }
 */
export const bulkAction = async (req: AuthRequest, res: Response): Promise<void> => {
  const { userIds, action, role } = req.body;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    res.status(400).json({ success: false, message: 'userIds must be a non-empty array' });
    return;
  }
  if (userIds.length > 200) {
    res.status(400).json({ success: false, message: 'Maximum 200 users per batch' });
    return;
  }

  const allowedActions = ['activate', 'deactivate', 'change_role'];
  if (!allowedActions.includes(action)) {
    res.status(400).json({ success: false, message: `Invalid action. Must be one of: ${allowedActions.join(', ')}` });
    return;
  }

  if (action === 'change_role') {
    if (!role) {
      res.status(400).json({ success: false, message: 'role is required for change_role action' });
      return;
    }
    if (PROTECTED_ROLES.includes(role)) {
      res.status(403).json({ success: false, message: 'Cannot bulk-assign super_admin role' });
      return;
    }
  }

  // Prevent modifying super_admin accounts in bulk
  const targets = await User.find({ _id: { $in: userIds } }).select('_id role username').lean();
  const protectedUsers = targets.filter((u) => PROTECTED_ROLES.includes(u.role));
  if (protectedUsers.length > 0) {
    res.status(403).json({
      success: false,
      message: `Cannot modify super_admin accounts: ${protectedUsers.map((u) => u.username).join(', ')}`,
    });
    return;
  }

  let update: Record<string, unknown> = {};
  if (action === 'activate') update = { isActive: true };
  else if (action === 'deactivate') update = { isActive: false };
  else if (action === 'change_role') update = { role };

  const result = await User.updateMany({ _id: { $in: userIds } }, { $set: update });

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'BULK_OPERATION',
    resourceType: 'user',
    details: `Bulk ${action} applied to ${result.modifiedCount} users. IDs: ${userIds.slice(0, 10).join(', ')}${userIds.length > 10 ? '...' : ''}`,
    severity: action === 'change_role' ? 'high' : 'medium',
    ipAddress: req.ip,
  });

  logger.info(`Bulk user action "${action}" by ${req.user?.username}: ${result.modifiedCount} modified`);

  res.json({
    success: true,
    message: `${result.modifiedCount} user(s) updated`,
    data: { matched: result.matchedCount, modified: result.modifiedCount },
  });
};

