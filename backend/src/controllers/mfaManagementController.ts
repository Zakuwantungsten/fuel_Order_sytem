import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { User } from '../models';
import UserMFA from '../models/UserMFA';
import { AuditService } from '../utils/auditService';

/**
 * GET /api/system-admin/mfa-management
 */
export const listMFAStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const users = await User.find({})
    .select('_id username firstName lastName role isActive')
    .lean();

  const mfaRecords = await UserMFA.find({
    userId: { $in: users.map((u) => u._id) },
  })
    .select('userId isEnabled totpEnabled smsEnabled emailEnabled isMandatory lastMFAVerification failedMFAAttempts mfaLockedUntil')
    .lean();

  const mfaByUser: Record<string, typeof mfaRecords[0]> = {};
  for (const r of mfaRecords) {
    mfaByUser[r.userId.toString()] = r;
  }

  const result = users.map((u) => {
    const mfa = mfaByUser[u._id.toString()];
    return {
      userId: u._id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      mfaEnabled: mfa?.isEnabled ?? false,
      totpEnabled: mfa?.totpEnabled ?? false,
      smsEnabled: mfa?.smsEnabled ?? false,
      emailEnabled: mfa?.emailEnabled ?? false,
      isMandatory: mfa?.isMandatory ?? false,
      lastVerified: mfa?.lastMFAVerification ?? null,
      failedAttempts: mfa?.failedMFAAttempts ?? 0,
      lockedUntil: mfa?.mfaLockedUntil ?? null,
    };
  });

  res.json({ success: true, data: result });
};

/**
 * POST /api/system-admin/mfa-management/:userId/disable
 */
export const disableUserMFA = async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.params;
  const user = await User.findById(userId).select('_id username role').lean();
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  await UserMFA.findOneAndUpdate(
    { userId },
    { $set: { isEnabled: false, totpEnabled: false, smsEnabled: false, emailEnabled: false, totpSecret: null } },
    { upsert: false }
  );

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'user_mfa',
    resourceId: userId,
    details: `Admin disabled MFA for user: ${user.username}`,
    severity: 'high',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: `MFA disabled for ${user.username}` });
};

/**
 * POST /api/system-admin/mfa-management/:userId/require
 * Force-set isMandatory for a user
 */
export const requireUserMFA = async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { mandatory } = req.body;

  const user = await User.findById(userId).select('_id username').lean();
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  await UserMFA.findOneAndUpdate(
    { userId },
    { $set: { isMandatory: !!mandatory } },
    { upsert: true }
  );

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'user_mfa',
    resourceId: userId,
    details: `MFA mandatory=${mandatory} set for user: ${user.username}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: `MFA mandatory=${mandatory} for ${user.username}` });
};

