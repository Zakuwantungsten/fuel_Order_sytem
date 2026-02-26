import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import mfaService from '../services/mfaService';
import { MFA } from '../models/MFA';
import { User } from '../models/User';
import { asyncHandler } from '../middleware/errorHandler';
import { AuditService } from '../utils/auditService';
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
  
  if (!secret || !code) {
    res.status(400).json({
      success: false,
      message: 'Secret and verification code are required',
    });
    return;
  }
  
  // Enable TOTP
  const result = await mfaService.enableTOTP(userId, secret, code);
  
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
};
