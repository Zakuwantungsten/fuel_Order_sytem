import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { User, SystemConfig } from '../models';
import UserMFA from '../models/UserMFA';
import { MFA } from '../models/MFA';
import { AuditService } from '../utils/auditService';

/**
 * GET /api/system-admin/mfa-management
 */
export const listMFAStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const users = await User.find({})
    .select('_id username firstName lastName role isActive')
    .lean();

  // Read global MFA policy to show which roles have MFA required
  const config = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false }).lean();
  const mfaPolicy = config?.securitySettings?.mfa;
  const globalEnabled = mfaPolicy?.globalEnabled ?? false;
  const requiredRoles: string[] = mfaPolicy?.requiredRoles ?? [];
  const allowedMethods: string[] = mfaPolicy?.allowedMethods ?? ['totp', 'email'];
  const roleMethodOverrides: Record<string, string[]> = (mfaPolicy as any)?.roleMethodOverrides ?? {};

  // Read from both MFA models — auth flow uses the MFA model, management uses UserMFA
  const userIds = users.map((u) => u._id);
  const [userMfaRecords, mfaRecords] = await Promise.all([
    UserMFA.find({ userId: { $in: userIds } })
      .select('userId isEnabled totpEnabled smsEnabled emailEnabled isMandatory isExempt allowedMethods lastMFAVerification failedMFAAttempts mfaLockedUntil')
      .lean(),
    MFA.find({ userId: { $in: userIds } })
      .select('userId isEnabled totpEnabled smsEnabled emailEnabled isMandatory isExempt allowedMethods lastVerifiedAt failedAttempts lockedUntil')
      .lean(),
  ]);

  const userMfaByUser: Record<string, typeof userMfaRecords[0]> = {};
  for (const r of userMfaRecords) {
    userMfaByUser[r.userId.toString()] = r;
  }
  const mfaByUser: Record<string, typeof mfaRecords[0]> = {};
  for (const r of mfaRecords) {
    mfaByUser[r.userId.toString()] = r;
  }

  const result = users.map((u) => {
    const uid = u._id.toString();
    const umfa = userMfaByUser[uid];
    const mfa = mfaByUser[uid];
    // Merge: MFA model is authoritative; UserMFA is legacy fallback for admin flags
    return {
      userId: u._id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      isActive: u.isActive,
      mfaEnabled: mfa?.isEnabled || umfa?.isEnabled || false,
      totpEnabled: mfa?.totpEnabled || umfa?.totpEnabled || false,
      smsEnabled: mfa?.smsEnabled || umfa?.smsEnabled || false,
      emailEnabled: mfa?.emailEnabled || umfa?.emailEnabled || false,
      isMandatory: (mfa as any)?.isMandatory || umfa?.isMandatory || false,
      isExempt: (mfa as any)?.isExempt || umfa?.isExempt || false,
      allowedMethods: (mfa as any)?.allowedMethods ?? umfa?.allowedMethods ?? null,
      roleRequiresMFA: globalEnabled && requiredRoles.includes(u.role),
      lastVerified: mfa?.lastVerifiedAt ?? umfa?.lastMFAVerification ?? null,
      failedAttempts: mfa?.failedAttempts ?? umfa?.failedMFAAttempts ?? 0,
      lockedUntil: mfa?.lockedUntil ?? umfa?.mfaLockedUntil ?? null,
    };
  });

  res.json({ success: true, data: result, policy: { globalEnabled, requiredRoles, allowedMethods, roleMethodOverrides } });
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

  // Disable in both MFA models so it takes effect in auth flow AND management view
  // Note: totpSecret is preserved so re-enabling doesn't force QR code re-scan
  await Promise.all([
    UserMFA.findOneAndUpdate(
      { userId },
      { $set: { isEnabled: false, totpEnabled: false, smsEnabled: false, emailEnabled: false, isExempt: true } },
      { upsert: true }
    ),
    MFA.findOneAndUpdate(
      { userId },
      { $set: { isEnabled: false, totpEnabled: false, smsEnabled: false, emailEnabled: false, totpVerified: false, backupCodes: [], backupCodesUsed: 0, isExempt: true } },
      { upsert: false }
    ),
  ]);

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
    { $set: { isMandatory: !!mandatory, ...(mandatory ? { isExempt: false } : {}) } },
    { upsert: true }
  );

  // Dual-write to the consolidated MFA model
  await MFA.findOneAndUpdate(
    { userId },
    { $set: { isMandatory: !!mandatory, ...(mandatory ? { isExempt: false } : {}) } },
    { upsert: false }
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

/**
 * POST /api/system-admin/mfa-management/:userId/allowed-methods
 * Set which MFA methods are allowed for a specific user (overrides global policy)
 */
export const setUserAllowedMethods = async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId } = req.params;
  const { allowedMethods } = req.body;

  if (!Array.isArray(allowedMethods) || allowedMethods.length === 0) {
    res.status(400).json({ success: false, message: 'At least one allowed method is required' });
    return;
  }

  const validMethods = ['totp', 'email', 'sms'];
  const filtered = allowedMethods.filter((m: string) => validMethods.includes(m));
  if (filtered.length === 0) {
    res.status(400).json({ success: false, message: 'No valid methods provided. Valid methods: totp, email, sms' });
    return;
  }

  const user = await User.findById(userId).select('_id username').lean();
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  await UserMFA.findOneAndUpdate(
    { userId },
    { $set: { allowedMethods: filtered } },
    { upsert: true }
  );

  // Dual-write to the consolidated MFA model
  await MFA.findOneAndUpdate(
    { userId },
    { $set: { allowedMethods: filtered } },
    { upsert: false }
  );

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'user_mfa',
    resourceId: userId,
    details: `Allowed MFA methods set to [${filtered.join(', ')}] for user: ${user.username}`,
    severity: 'medium',
    ipAddress: req.ip,
  });

  res.json({ success: true, message: `Allowed methods updated for ${user.username}`, data: { allowedMethods: filtered } });
};

