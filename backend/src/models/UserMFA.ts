import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export interface IUserMFA extends Document {
  userId: mongoose.Types.ObjectId;
  
  // MFA Status
  isEnabled: boolean;
  isMandatory: boolean;  // Set by admin for specific roles
  
  // TOTP (Time-based One-Time Password)
  totpSecret: string | null;  // Encrypted secret for authenticator apps
  totpEnabled: boolean;
  totpVerifiedAt: Date | null;
  
  // Backup Codes
  backupCodes: string[];  // Hashed backup codes
  backupCodesGeneratedAt: Date | null;
  usedBackupCodes: number;  // Count of used codes
  
  // SMS OTP (Optional)
  smsEnabled: boolean;
  smsPhoneNumber: string | null;  // Encrypted phone number
  smsVerifiedAt: Date | null;
  
  // Email OTP (Optional)
  emailEnabled: boolean;
  emailVerifiedAt: Date | null;
  
  // Device Trust
  trustedDevices: Array<{
    deviceId: string;
    deviceName: string;
    deviceFingerprint: string;  // Hashed device signature
    trustedAt: Date;
    lastUsedAt: Date;
    expiresAt: Date;
    ipAddress: string;
    userAgent: string;
  }>;
  
  // Recovery Options
  recoveryEmail: string | null;  // Encrypted
  
  // Metadata
  lastMFAVerification: Date | null;
  failedMFAAttempts: number;
  mfaLockedUntil: Date | null;
  
  createdAt: Date;
  updatedAt: Date;
}

const UserMFASchema = new Schema<IUserMFA>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    
    isEnabled: {
      type: Boolean,
      default: false,
    },
    
    isMandatory: {
      type: Boolean,
      default: false,
    },
    
    // TOTP Settings
    totpSecret: {
      type: String,
      default: null,
    },
    
    totpEnabled: {
      type: Boolean,
      default: false,
    },
    
    totpVerifiedAt: {
      type: Date,
      default: null,
    },
    
    // Backup Codes
    backupCodes: {
      type: [String],
      default: [],
    },
    
    backupCodesGeneratedAt: {
      type: Date,
      default: null,
    },
    
    usedBackupCodes: {
      type: Number,
      default: 0,
    },
    
    // SMS Settings
    smsEnabled: {
      type: Boolean,
      default: false,
    },
    
    smsPhoneNumber: {
      type: String,
      default: null,
    },
    
    smsVerifiedAt: {
      type: Date,
      default: null,
    },
    
    // Email Settings
    emailEnabled: {
      type: Boolean,
      default: false,
    },
    
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    
    // Trusted Devices
    trustedDevices: [
      {
        deviceId: {
          type: String,
          required: true,
        },
        deviceName: {
          type: String,
          required: true,
        },
        deviceFingerprint: {
          type: String,
          required: true,
        },
        trustedAt: {
          type: Date,
          default: Date.now,
        },
        lastUsedAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
        ipAddress: {
          type: String,
          required: true,
        },
        userAgent: {
          type: String,
          required: true,
        },
      },
    ],
    
    // Recovery
    recoveryEmail: {
      type: String,
      default: null,
    },
    
    // Security
    lastMFAVerification: {
      type: Date,
      default: null,
    },
    
    failedMFAAttempts: {
      type: Number,
      default: 0,
    },
    
    mfaLockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
UserMFASchema.index({ userId: 1 });
UserMFASchema.index({ 'trustedDevices.deviceFingerprint': 1 });

// Method to encrypt sensitive fields
UserMFASchema.methods.encryptField = function (value: string): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY || '', 'hex');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
};

// Method to decrypt sensitive fields
UserMFASchema.methods.decryptField = function (encryptedValue: string): string {
  if (!encryptedValue) return '';
  
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || process.env.FIELD_ENCRYPTION_KEY || '', 'hex');
  
  const parts = encryptedValue.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

// Method to check if device is trusted
UserMFASchema.methods.isDeviceTrusted = function (deviceFingerprint: string): boolean {
  const now = new Date();
  return this.trustedDevices.some(
    (device: any) =>
      device.deviceFingerprint === deviceFingerprint &&
      device.expiresAt > now
  );
};

// Method to add trusted device
UserMFASchema.methods.addTrustedDevice = function (
  deviceId: string,
  deviceName: string,
  deviceFingerprint: string,
  ipAddress: string,
  userAgent: string,
  trustDurationDays: number = 30
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + trustDurationDays * 24 * 60 * 60 * 1000);
  
  // Remove existing device with same fingerprint
  this.trustedDevices = this.trustedDevices.filter(
    (device: any) => device.deviceFingerprint !== deviceFingerprint
  );
  
  // Add new trusted device
  this.trustedDevices.push({
    deviceId,
    deviceName,
    deviceFingerprint,
    trustedAt: now,
    lastUsedAt: now,
    expiresAt,
    ipAddress,
    userAgent,
  });
  
  // Keep only last 5 trusted devices
  if (this.trustedDevices.length > 5) {
    this.trustedDevices = this.trustedDevices
      .sort((a: any, b: any) => b.lastUsedAt.getTime() - a.lastUsedAt.getTime())
      .slice(0, 5);
  }
};

// Method to remove trusted device
UserMFASchema.methods.removeTrustedDevice = function (deviceId: string) {
  this.trustedDevices = this.trustedDevices.filter(
    (device: any) => device.deviceId !== deviceId
  );
};

// Method to update device last used
UserMFASchema.methods.updateDeviceLastUsed = function (deviceFingerprint: string) {
  const device = this.trustedDevices.find(
    (d: any) => d.deviceFingerprint === deviceFingerprint
  );
  if (device) {
    device.lastUsedAt = new Date();
  }
};

// Clean up expired devices before save
UserMFASchema.pre('save', function (next) {
  const now = new Date();
  this.trustedDevices = this.trustedDevices.filter(
    (device: any) => device.expiresAt > now
  );
  next();
});

export default mongoose.model<IUserMFA>('UserMFA', UserMFASchema);
