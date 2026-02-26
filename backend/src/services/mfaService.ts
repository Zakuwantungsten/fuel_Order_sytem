import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { MFA, IMFA } from '../models/MFA';
import { User } from '../models/User';
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
    
    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');
    
    return {
      secret: secret.base32,
      qrCodeUrl,
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
  async sendEmailOTP(userId: string, email: string): Promise<string> {
    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Store OTP in cache with 5-minute expiry
    const cacheKey = `email_otp:${userId}`;
    const hashedOTP = await bcrypt.hash(otp, 10);
    
    // TODO: Store in Redis/cache (for now, return for testing)
    // await cacheService.set(cacheKey, hashedOTP, 300);
    
    // Send email
    await emailService.sendCriticalEmail({
      subject: 'Your verification code',
      message: `Your verification code is: <strong>${otp}</strong><br/>This code will expire in 5 minutes.`,
      priority: 'high',
      additionalRecipients: [email],
    });
    
    return hashedOTP; // Return for storage in session/cache
  }
  
  /**
   * Generate and send OTP via SMS
   */
  async sendSMSOTP(userId: string, phoneNumber: string): Promise<string> {
    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    
    // Store OTP in cache with 5-minute expiry
    const cacheKey = `sms_otp:${userId}`;
    const hashedOTP = await bcrypt.hash(otp, 10);
    
    // TODO: Store in Redis/cache (for now, return for testing)
    // await cacheService.set(cacheKey, hashedOTP, 300);
    
    // Send SMS
    await sendSMS({
      to: phoneNumber,
      message: `Your verification code is: ${otp}. Valid for 5 minutes.`,
    });
    
    return hashedOTP; // Return for storage in session/cache
  }
  
  /**
   * Verify OTP (email or SMS)
   */
  async verifyOTP(hashedOTP: string, code: string): Promise<boolean> {
    return bcrypt.compare(code, hashedOTP);
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
   * Check if user is required to use MFA based on system settings
   */
  async isMFARequired(userId: string): Promise<boolean> {
    const user = await User.findById(userId);
    if (!user) return false;
    
    // TODO: Check system config for MFA enforcement rules
    // Example: Require MFA for admin, super_admin, system_admin roles
    const mfaRequiredRoles = ['super_admin', 'admin', 'system_admin'];
    return mfaRequiredRoles.includes(user.role);
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
