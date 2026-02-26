import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY || '';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

interface IMFA extends Document {
  userId: mongoose.Types.ObjectId;
  isEnabled: boolean;
  
  // TOTP (Authenticator App)
  totpEnabled: boolean;
  totpSecret: string; // Encrypted
  totpVerified: boolean;
  
  // Backup Codes
  backupCodes: string[]; // Hashed
  backupCodesUsed: number;
  
  // SMS OTP (Optional)
  smsEnabled: boolean;
  phoneNumber: string; // Encrypted
  phoneVerified: boolean;
  
  // Email OTP (Optional)
  emailEnabled: boolean;
  emailVerified: boolean;
  
  // Preferred MFA method
  preferredMethod: 'totp' | 'sms' | 'email';
  
  // Trusted Devices
  trustedDevices: Array<{
    deviceId: string;
    deviceName: string;
    ipAddress: string;
    userAgent: string;
    addedAt: Date;
    expiresAt: Date;
  }>;
  
  // Security
  lastVerifiedAt: Date;
  failedAttempts: number;
  lockedUntil?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

// Encryption helper functions
function encrypt(text: string): string {
  if (!text || !ENCRYPTION_KEY) return text;
  
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  if (!text || !ENCRYPTION_KEY) return text;
  
  const parts = text.split(':');
  if (parts.length !== 2) return text;
  
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

const MFASchema = new Schema<IMFA>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    
    // TOTP Settings
    totpEnabled: {
      type: Boolean,
      default: false,
    },
    totpSecret: {
      type: String,
      default: '',
      set: (value: string) => (value ? encrypt(value) : ''),
      get: (value: string) => (value ? decrypt(value) : ''),
    },
    totpVerified: {
      type: Boolean,
      default: false,
    },
    
    // Backup Codes (hashed with bcrypt)
    backupCodes: {
      type: [String],
      default: [],
      select: false, // Don't include by default in queries
    },
    backupCodesUsed: {
      type: Number,
      default: 0,
    },
    
    // SMS Settings
    smsEnabled: {
      type: Boolean,
      default: false,
    },
    phoneNumber: {
      type: String,
      default: '',
      set: (value: string) => (value ? encrypt(value) : ''),
      get: (value: string) => (value ? decrypt(value) : ''),
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    
    // Email OTP Settings
    emailEnabled: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    
    // Preferred Method
    preferredMethod: {
      type: String,
      enum: ['totp', 'sms', 'email'],
      default: 'totp',
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
          default: 'Unknown Device',
        },
        ipAddress: {
          type: String,
          required: true,
        },
        userAgent: {
          type: String,
          default: '',
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
      },
    ],
    
    // Security
    lastVerifiedAt: {
      type: Date,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Indexes
MFASchema.index({ userId: 1 }, { unique: true });
MFASchema.index({ 'trustedDevices.deviceId': 1 });
MFASchema.index({ 'trustedDevices.expiresAt': 1 });

// Methods
MFASchema.methods.isDeviceTrusted = function (deviceId: string): boolean {
  const device = this.trustedDevices.find(
    (d: any) => d.deviceId === deviceId && d.expiresAt > new Date()
  );
  return !!device;
};

MFASchema.methods.addTrustedDevice = function (
  deviceId: string,
  ipAddress: string,
  userAgent: string,
  deviceName?: string
): void {
  // Remove existing device with same ID
  this.trustedDevices = this.trustedDevices.filter(
    (d: any) => d.deviceId !== deviceId
  );
  
  // Add new device (30-day expiry)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  this.trustedDevices.push({
    deviceId,
    deviceName: deviceName || 'Trusted Device',
    ipAddress,
    userAgent,
    addedAt: new Date(),
    expiresAt,
  });
};

MFASchema.methods.removeTrustedDevice = function (deviceId: string): void {
  this.trustedDevices = this.trustedDevices.filter(
    (d: any) => d.deviceId !== deviceId
  );
};

MFASchema.methods.cleanupExpiredDevices = function (): void {
  const now = new Date();
  this.trustedDevices = this.trustedDevices.filter(
    (d: any) => d.expiresAt > now
  );
};

const MFA = mongoose.model<IMFA>('MFA', MFASchema);

export { MFA, IMFA };
