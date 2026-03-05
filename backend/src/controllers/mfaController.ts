import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import mfaService from '../services/mfaService';
import { MFA } from '../models/MFA';
import { User } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { AuditService } from '../utils/auditService';
import LoginActivity from '../models/LoginActivity';
import crypto from 'crypto';

/**
 * @route   GET /api/mfa/status
 * @desc    Get MFA status for current user
 * @access  Private
 */
export const getMFAStatus = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  
  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
    return;
  }
  
  const mfa = await mfaService.getMFASettings(userId);
  const isRequired = await mfaService.isMFARequired(userId);
  
  res.json({
    success: true,
    data: {
      isEnabled: mfa.isEnabled,
      isRequired,
      totpEnabled: mfa.totpEnabled,
      totpVerified: mfa.totpVerified,
      smsEnabled: mfa.smsEnabled,
      emailEnabled: mfa.emailEnabled,
      preferredMethod: mfa.preferredMethod,
      backupCodesRemaining: mfa.backupCodes?.length || 0,
      backupCodesUsed: mfa.backupCodesUsed,
      trustedDevicesCount: mfa.trustedDevices?.length || 0,
    },
  });
});

/**
 * @route   POST /api/mfa/setup/totp/generate
 * @desc    Generate TOTP secret and QR code for authenticator app
 * @access  Private
 */
export const generateTOTPSecret = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  
  const user = await User.findById(userId);
  
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }
  
  // Check if user already has a TOTP secret (e.g. MFA was disabled then re-enabled)
  const hasExisting = await mfaService.hasExistingTOTPSecret(userId);
  if (hasExisting) {
    res.json({
      success: true,
      message: 'TOTP already configured. Enter your authenticator code to re-enable.',
      data: {
        alreadyConfigured: true,
      },
    });
    return;
  }
  
  // Generate TOTP secret and QR code
  const totpData = await mfaService.generateTOTPSecret(
    userId,
    user.username,
    user.email
  );
  
  // Store secret temporarily in session or return it
  // Client will verify before saving
  res.json({
    success: true,
    message: 'TOTP secret generated successfully',
    data: {
      secret: totpData.secret,
      qrCodeUrl: totpData.qrCodeUrl,
      manualEntryKey: totpData.manualEntryKey,
    },
  });
  
});

/**
 * @route   POST /api/mfa/setup/totp/verify
 * @desc    Verify TOTP code and enable TOTP MFA
 * @access  Private
 */
export const verifyAndEnableTOTP = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { secret, code } = req.body;
  
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  
  if (!code) {
    res.status(400).json({
      success: false,
      message: 'Verification code is required',
    });
    return;
  }
  
  // If no secret provided, use existing secret from database (re-enable flow)
  let totpSecret = secret;
  if (!totpSecret) {
    const mfa = await mfaService.getMFASettings(userId);
    if (mfa.totpSecret) {
      totpSecret = mfa.totpSecret;
    } else {
      res.status(400).json({
        success: false,
        message: 'Secret is required. Please generate a new TOTP secret first.',
      });
      return;
    }
  }
  
  // Enable TOTP
  const result = await mfaService.enableTOTP(userId, totpSecret, code);
  
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: 'Invalid verification code',
    });
    return;
  }
  
  res.json({
    success: true,
    message: 'TOTP MFA enabled successfully. Please save your backup codes in a safe place.',
    data: {
      backupCodes: result.backupCodes,
    },
  });
});

/**
 * @route   POST /api/mfa/verify
 * @desc    Verify MFA code during login or sensitive operations
 * @access  Public (but requires valid session token)
 */
export const verifyMFACode = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId, code, method, trustDevice, deviceInfo } = req.body;
  
  if (!userId || !code) {
    res.status(400).json({
      success: false,
      message: 'User ID and verification code are required',
    });
    return;
  }
  
  try {
    const result = await mfaService.verifyMFACode(userId, code, method);
    
    if (!result.success) {
      res.status(401).json({
        success: false,
        message: 'Invalid verification code',
      });
      return;
    }
    
    // Trust device if requested
    if (trustDevice && deviceInfo) {
      const mfa = await MFA.findOne({ userId });
      if (mfa && typeof (mfa as any).addTrustedDevice === 'function') {
        const deviceId = crypto.randomUUID();
        (mfa as any).addTrustedDevice(
          deviceId,
          deviceInfo.ipAddress || req.ip,
          deviceInfo.userAgent || req.get('user-agent') || '',
          deviceInfo.deviceName
        );
        await mfa.save();
      }
    }
    
    res.json({
      success: true,
      message: 'MFA verification successful',
      data: {
        methodUsed: result.methodUsed,
      },
    });
  } catch (error: any) {
    res.status(429).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/mfa/backup-codes/regenerate
 * @desc    Regenerate backup codes
 * @access  Private
 */
export const regenerateBackupCodes = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  
  try {
    const backupCodes = await mfaService.regenerateBackupCodes(userId);
    
    res.json({
      success: true,
      message: 'Backup codes regenerated successfully. Please save them in a safe place.',
      data: {
        backupCodes,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/mfa/disable
 * @desc    Disable MFA for user (requires password confirmation)
 * @access  Private
 */
export const disableMFA = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { password } = req.body;
  
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  
  if (!password) {
    res.status(400).json({
      success: false,
      message: 'Password confirmation required to disable MFA',
    });
    return;
  }
  
  // Verify password
  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({
      success: false,
      message: 'User not found',
    });
    return;
  }
  
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      message: 'Invalid password',
    });
    return;
  }
  
  // Disable MFA
  await mfaService.disableMFA(userId);
  
  res.json({
    success: true,
    message: 'MFA disabled successfully',
  });
});

/**
 * @route   GET /api/mfa/trusted-devices
 * @desc    Get list of trusted devices
 * @access  Private
 */
export const getTrustedDevices = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  
  const mfa = await mfaService.getMFASettings(userId);
  
  const devices = mfa.trustedDevices.map(device => ({
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    ipAddress: device.ipAddress,
    addedAt: device.addedAt,
    expiresAt: device.expiresAt,
  }));
  
  res.json({
    success: true,
    data: {
      devices,
    },
  });
});

/**
 * @route   DELETE /api/mfa/trusted-devices/:deviceId
 * @desc    Remove a trusted device
 * @access  Private
 */
export const removeTrustedDevice = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { deviceId } = req.params;
  
  if (!userId) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  
  const mfa = await mfaService.getMFASettings(userId);
  if (typeof (mfa as any).removeTrustedDevice === 'function') {
    (mfa as any).removeTrustedDevice(deviceId);
  }
  await mfa.save();
  
  res.json({
    success: true,
    message: 'Trusted device removed successfully',
  });
});

/**
 * @route   POST /api/mfa/check-device
 * @desc    Check if current device is trusted
 * @access  Public
 */
export const checkTrustedDevice = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId, deviceId } = req.body;
  
  if (!userId || !deviceId) {
    res.status(400).json({
      success: false,
      message: 'User ID and device ID are required',
    });
    return;
  }
  
  const mfa = await MFA.findOne({ userId });
  const isTrusted = mfa && typeof (mfa as any).isDeviceTrusted === 'function' 
    ? (mfa as any).isDeviceTrusted(deviceId) 
    : false;
  
  res.json({
    success: true,
    data: {
      isTrusted,
    },
  });
});

/**
 * @route   POST /api/mfa/setup/email/enable
 * @desc    Enable Email OTP as an MFA method
 * @access  Private
 */
export const enableEmailOTP = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const user = await User.findById(userId);
  if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

  // Send a verification OTP to the user's email
  await mfaService.sendEmailOTP(userId, user.email);

  res.json({ success: true, message: 'Verification code sent to your email' });
});

/**
 * @route   POST /api/mfa/setup/email/verify
 * @desc    Verify the email OTP and enable Email MFA
 * @access  Private
 */
export const verifyAndEnableEmailOTP = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { code } = req.body;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
  if (!code) { res.status(400).json({ success: false, message: 'Verification code is required' }); return; }

  const valid = await mfaService.verifyPendingOTP(userId, 'email', code);
  if (!valid) { res.status(400).json({ success: false, message: 'Invalid or expired verification code' }); return; }

  await mfaService.enableEmailOTP(userId);

  // Generate backup codes if this is the first MFA method
  const mfa = await mfaService.getMFASettings(userId);
  const backupCodes = mfa.backupCodes.length > 0 ? undefined : undefined; // already handled in enableEmailOTP

  res.json({ success: true, message: 'Email OTP enabled successfully' });
});

/**
 * @route   POST /api/mfa/setup/sms/send
 * @desc    Send a verification OTP to a phone number for SMS MFA setup
 * @access  Private
 */
export const sendSMSSetupOTP = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { phoneNumber } = req.body;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
  if (!phoneNumber) { res.status(400).json({ success: false, message: 'Phone number is required' }); return; }

  await mfaService.sendSMSOTP(userId, phoneNumber);

  res.json({ success: true, message: 'Verification code sent via SMS' });
});

/**
 * @route   POST /api/mfa/setup/sms/verify
 * @desc    Verify SMS OTP and enable SMS MFA
 * @access  Private
 */
export const verifyAndEnableSMSOTP = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { code, phoneNumber } = req.body;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }
  if (!code || !phoneNumber) { res.status(400).json({ success: false, message: 'Code and phone number are required' }); return; }

  const valid = await mfaService.verifyPendingOTP(userId, 'sms', code);
  if (!valid) { res.status(400).json({ success: false, message: 'Invalid or expired verification code' }); return; }

  await mfaService.enableSMSOTP(userId, phoneNumber);

  res.json({ success: true, message: 'SMS OTP enabled successfully' });
});

/**
 * @route   POST /api/mfa/send-otp
 * @desc    Send OTP for login verification (email or sms)
 * @access  Public (needs userId context from temp session)
 */
export const sendLoginOTP = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { userId, method } = req.body;
  if (!userId || !method) { res.status(400).json({ success: false, message: 'userId and method required' }); return; }

  const user = await User.findById(userId);
  if (!user) { res.status(404).json({ success: false, message: 'User not found' }); return; }

  const mfa = await MFA.findOne({ userId });
  if (!mfa) { res.status(400).json({ success: false, message: 'MFA not configured' }); return; }

  if (method === 'email') {
    // Email OTP is always available as a fallback for any MFA-enabled user
    await mfaService.sendEmailOTP(userId, user.email);
    res.json({ success: true, message: 'Code sent to your email' });
  } else if (method === 'sms' && mfa.smsEnabled) {
    await mfaService.sendSMSOTP(userId, mfa.phoneNumber);
    res.json({ success: true, message: 'Code sent via SMS' });
  } else {
    res.status(400).json({ success: false, message: 'Requested method is not enabled' });
  }
});

/**
 * @route   GET /api/mfa/login-activity
 * @desc    Get login activity / active sessions for current user
 * @access  Private
 */
export const getLoginActivity = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const activities = await LoginActivity.find({ userId })
    .sort({ loginAt: -1 })
    .limit(50)
    .lean();

  // The most recent active (non-logged-out) session is likely the current one
  const mapped = activities.map((a, index) => ({
    id: a._id,
    browser: a.browser,
    os: a.os,
    deviceType: a.deviceType,
    ipAddress: a.ipAddress,
    isNewDevice: a.isNewDevice,
    mfaMethod: a.mfaMethod,
    loginAt: a.loginAt,
    lastActiveAt: a.lastActiveAt,
    loggedOutAt: a.loggedOutAt,
    isCurrent: a.isCurrent && !a.loggedOutAt && index === 0,
    isActive: a.isCurrent && !a.loggedOutAt,
  }));

  res.json({ success: true, data: { activities: mapped } });
});

/**
 * @route   DELETE /api/mfa/sessions/:sessionId
 * @desc    Revoke a specific session
 * @access  Private
 */
export const revokeSession = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  const { sessionId } = req.params;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  const session = await LoginActivity.findOne({ _id: sessionId, userId });
  if (!session) { res.status(404).json({ success: false, message: 'Session not found' }); return; }

  session.isCurrent = false;
  session.loggedOutAt = new Date();
  await session.save();

  // If session's token matches a user's refreshToken, invalidate it
  const user = await User.findById(userId).select('+refreshToken');
  if (user && user.refreshToken === session.sessionToken) {
    user.refreshToken = undefined as any;
    await user.save();
  }

  res.json({ success: true, message: 'Session revoked' });
});

/**
 * @route   POST /api/mfa/sessions/revoke-all
 * @desc    Revoke all other sessions except current
 * @access  Private
 */
export const revokeAllOtherSessions = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ success: false, message: 'Unauthorized' }); return; }

  // Get current user's refresh token hash to exclude current session
  const user = await User.findById(userId).select('+refreshToken');
  const currentHash = user?.refreshToken;

  const result = await LoginActivity.updateMany(
    { userId, isCurrent: true, sessionToken: { $ne: currentHash } },
    { $set: { isCurrent: false, loggedOutAt: new Date() } }
  );

  res.json({ success: true, message: `${result.modifiedCount} session(s) revoked` });
});

export default {
  getMFAStatus,
  generateTOTPSecret,
  verifyAndEnableTOTP,
  verifyMFACode,
  regenerateBackupCodes,
  disableMFA,
  getTrustedDevices,
  removeTrustedDevice,
  checkTrustedDevice,
  enableEmailOTP,
  verifyAndEnableEmailOTP,
  sendSMSSetupOTP,
  verifyAndEnableSMSOTP,
  sendLoginOTP,
  getLoginActivity,
  revokeSession,
  revokeAllOtherSessions,
};
