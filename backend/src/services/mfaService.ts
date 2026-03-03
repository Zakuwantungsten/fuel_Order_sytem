import speakeasy from 'speakeasy';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { MFA, IMFA } from '../models/MFA';
import UserMFA from '../models/UserMFA';
import { User } from '../models/User';
import { SystemConfig } from '../models/SystemConfig';
import PendingOTP from '../models/PendingOTP';
import emailService from '../services/emailService';
import { sendSMS } from '../services/smsService';

interface GenerateTOTPResult {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

interface BackupCodesResult {
  codes: string[];
  hashedCodes: string[];
}

class MFAService {
  /**
   * Generate TOTP secret and QR code for authenticator app setup
   */
  async generateTOTPSecret(
    userId: string,
    username: string,
    email: string
  ): Promise<GenerateTOTPResult> {
    const appName = process.env.APP_NAME || 'Fuel Order System';
    
    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${appName} (${username})`,
      length: 32,
    });
    
    // Return the otpauth:// URI directly so the frontend can render it
    // as a QR code with react-qr-code (SVG). Google Authenticator needs
    // the otpauth:// URI, not a base64 data URL or raw secret.
    return {
      secret: secret.base32,
      qrCodeUrl: secret.otpauth_url || '',
      manualEntryKey: secret.base32,
    };
  }
  
  /**
   * Verify TOTP code
   */
  verifyTOTPCode(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps before/after for clock drift
    });
  }
  
  /**
   * Generate backup codes
   */
  async generateBackupCodes(count: number = 10): Promise<BackupCodesResult> {
    const codes: string[] = [];
    const hashedCodes: string[] = [];
    
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,4}/g)
        ?.join('-') || '';
      
      codes.push(code);
      
      // Hash the code before storage
      const hashedCode = await bcrypt.hash(code, 10);
      hashedCodes.push(hashedCode);
    }
    
    return { codes, hashedCodes };
  }
  
  /**
   * Verify backup code
   */
  async verifyBackupCode(
    hashedCodes: string[],
    code: string
  ): Promise<{ valid: boolean; codeIndex: number }> {
    const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();
    
    for (let i = 0; i < hashedCodes.length; i++) {
      const isMatch = await bcrypt.compare(normalizedCode, hashedCodes[i]);
      if (isMatch) {
        return { valid: true, codeIndex: i };
      }
    }
    
    return { valid: false, codeIndex: -1 };
  }
  
  /**
   * Generate and send OTP via email
   */
  async sendEmailOTP(userId: string, email: string): Promise<void> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOTP = await bcrypt.hash(otp, 10);

    // Upsert: replace any existing pending email OTP for this user
    await PendingOTP.findOneAndUpdate(
      { userId, type: 'email' },
      { hashedOTP, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      { upsert: true }
    );

    await emailService.sendNotification(
      email,
      'Your verification code',
      `<p style="font-size:24px;font-weight:bold;letter-spacing:6px;text-align:center;padding:16px 0">${otp}</p>
       <p style="text-align:center;color:#666">This code will expire in 5 minutes.<br/>If you did not request this, you can safely ignore this email.</p>`
    );
  }
  
  /**
   * Generate and send OTP via SMS
   */
  async sendSMSOTP(userId: string, phoneNumber: string): Promise<void> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOTP = await bcrypt.hash(otp, 10);

    await PendingOTP.findOneAndUpdate(
      { userId, type: 'sms' },
      { hashedOTP, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
      { upsert: true }
    );

    await sendSMS({
      to: phoneNumber,
      message: `Your verification code is: ${otp}. Valid for 5 minutes.`,
    });
  }
  
  /**
   * Verify a pending OTP (email or SMS) stored in MongoDB
   */
  async verifyPendingOTP(userId: string, type: 'email' | 'sms', code: string): Promise<boolean> {
    const pending = await PendingOTP.findOne({ userId, type });
    if (!pending || pending.expiresAt < new Date()) return false;

    const valid = await bcrypt.compare(code, pending.hashedOTP);
    if (valid) {
      await PendingOTP.deleteOne({ _id: pending._id });
    }
    return valid;
  }

  /**
   * Enable Email OTP for user
   */
  async enableEmailOTP(userId: string): Promise<void> {
    const mfa = await this.getMFASettings(userId);
    mfa.emailEnabled = true;
    mfa.emailVerified = true;
    if (!mfa.totpEnabled && !mfa.smsEnabled) {
      mfa.preferredMethod = 'email';
    }
    mfa.isEnabled = true;

    if (mfa.backupCodes.length === 0) {
      const { hashedCodes } = await this.generateBackupCodes();
      mfa.backupCodes = hashedCodes;
    }
    await mfa.save();
  }

  /**
   * Enable SMS OTP for user
   */
  async enableSMSOTP(userId: string, phoneNumber: string): Promise<void> {
    const mfa = await this.getMFASettings(userId);
    mfa.smsEnabled = true;
    mfa.phoneNumber = phoneNumber;
    mfa.phoneVerified = true;
    if (!mfa.totpEnabled) {
      mfa.preferredMethod = 'sms';
    }
    mfa.isEnabled = true;

    if (mfa.backupCodes.length === 0) {
      const { hashedCodes } = await this.generateBackupCodes();
      mfa.backupCodes = hashedCodes;
    }
    await mfa.save();
  }
  
  /**
   * Get or create MFA settings for user
   */
  async getMFASettings(userId: string): Promise<IMFA> {
    let mfa = await MFA.findOne({ userId });
    
    if (!mfa) {
      mfa = await MFA.create({ userId });
    }
    
    // Clean up expired trusted devices (with type assertion)
    if (typeof (mfa as any).cleanupExpiredDevices === 'function') {
      (mfa as any).cleanupExpiredDevices();
      await mfa.save();
    }
    
    return mfa;
  }
  
  /**
   * Enable TOTP for user
   */
  async enableTOTP(
    userId: string,
    secret: string,
    verificationCode: string
  ): Promise<{ success: boolean; backupCodes?: string[] }> {
    // Verify the code first
    const isValid = this.verifyTOTPCode(secret, verificationCode);
    if (!isValid) {
      return { success: false };
    }
    
    const mfa = await this.getMFASettings(userId);
    
    // Generate backup codes
    const { codes, hashedCodes } = await this.generateBackupCodes();
    
    // Update MFA settings
    mfa.totpEnabled = true;
    mfa.totpSecret = secret;
    mfa.totpVerified = true;
    mfa.isEnabled = true;
    mfa.preferredMethod = 'totp';
    mfa.backupCodes = hashedCodes;
    mfa.backupCodesUsed = 0;
    
    await mfa.save();
    
    return { success: true, backupCodes: codes };
  }
  
  /**
   * Disable MFA for user
   */
  async disableMFA(userId: string): Promise<void> {
    const mfa = await this.getMFASettings(userId);
    
    mfa.isEnabled = false;
    mfa.totpEnabled = false;
    mfa.totpVerified = false;
    mfa.smsEnabled = false;
    mfa.emailEnabled = false;
    mfa.backupCodes = [];
    mfa.backupCodesUsed = 0;
    
    await mfa.save();
  }
  
  /**
   * Verify MFA code (any method)
   */
  async verifyMFACode(
    userId: string,
    code: string,
    method?: 'totp' | 'backup' | 'sms' | 'email'
  ): Promise<{ success: boolean; methodUsed?: string }> {
    const mfa = await MFA.findOne({ userId }).select('+backupCodes');
    
    if (!mfa || !mfa.isEnabled) {
      return { success: false };
    }
    
    // Check if account is locked
    if (mfa.lockedUntil && mfa.lockedUntil > new Date()) {
      throw new Error('MFA verification temporarily locked due to too many failed attempts');
    }
    
    let verified = false;
    let methodUsed = '';
    
    // Try TOTP if enabled and no specific method requested
    if (
      (!method || method === 'totp') &&
      mfa.totpEnabled &&
      mfa.totpVerified
    ) {
      verified = this.verifyTOTPCode(mfa.totpSecret, code);
      if (verified) methodUsed = 'totp';
    }
    
    // Try email OTP
    if (!verified && (!method || method === 'email') && mfa.emailEnabled) {
      const emailValid = await this.verifyPendingOTP(userId, 'email', code);
      if (emailValid) {
        verified = true;
        methodUsed = 'email';
      }
    }

    // Try SMS OTP
    if (!verified && (!method || method === 'sms') && mfa.smsEnabled) {
      const smsValid = await this.verifyPendingOTP(userId, 'sms', code);
      if (smsValid) {
        verified = true;
        methodUsed = 'sms';
      }
    }

    // Try backup codes if TOTP failed or backup method specified
    if (!verified && (!method || method === 'backup')) {
      const backupResult = await this.verifyBackupCode(mfa.backupCodes, code);
      if (backupResult.valid) {
        verified = true;
        methodUsed = 'backup';
        
        // Mark backup code as used by removing it
        mfa.backupCodes.splice(backupResult.codeIndex, 1);
        mfa.backupCodesUsed += 1;
      }
    }
    
    if (verified) {
      // Reset failed attempts
      mfa.failedAttempts = 0;
      mfa.lockedUntil = undefined;
      mfa.lastVerifiedAt = new Date();
      await mfa.save();
      
      return { success: true, methodUsed };
    } else {
      // Increment failed attempts
      mfa.failedAttempts += 1;
      
      // Lock after 5 failed attempts for 15 minutes
      if (mfa.failedAttempts >= 5) {
        const lockDuration = 15 * 60 * 1000; // 15 minutes
        mfa.lockedUntil = new Date(Date.now() + lockDuration);
      }
      
      await mfa.save();
      return { success: false };
    }
  }
  
  /**
   * Check if user has MFA enabled
   */
  async isMFAEnabled(userId: string): Promise<boolean> {
    const mfa = await MFA.findOne({ userId });
    return mfa?.isEnabled || false;
  }
  
  /**
   * Check if user is required to use MFA based on system settings or per-user mandatory flag
   */
  async isMFARequired(userId: string): Promise<boolean> {
    const user = await User.findById(userId);
    if (!user) return false;
    
    // Check per-user mandatory flag (set by admin in MFA Management tab)
    const userMfa = await UserMFA.findOne({ userId });
    if (userMfa?.isMandatory) return true;
    
    // Read MFA enforcement config from SystemConfig (Security Tab global settings)
    const config = await SystemConfig.findOne({ configType: 'system_settings', isDeleted: false });
    const mfaSettings = config?.securitySettings?.mfa;
    
    // If MFA is globally disabled or not configured, not required
    if (!mfaSettings?.globalEnabled) return false;
    
    // Check if user's role is in the required roles list
    return mfaSettings.requiredRoles.includes(user.role);
  }
  
  /**
   * Regenerate backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const mfa = await this.getMFASettings(userId);
    
    if (!mfa.isEnabled) {
      throw new Error('MFA is not enabled');
    }
    
    const { codes, hashedCodes } = await this.generateBackupCodes();
    
    mfa.backupCodes = hashedCodes;
    mfa.backupCodesUsed = 0;
    await mfa.save();
    
    return codes;
  }
}

export default new MFAService();
