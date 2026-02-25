import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { encryptData, decryptData } from '../utils/cryptoUtils';
import logger from '../utils/logger';

/**
 * Driver Credential Model
 * Stores secure authentication credentials for truck drivers
 * Replaces the insecure username===password bypass
 * 
 * ✅ SECURITY: driverName and phoneNumber are encrypted at rest using AES-256
 */

export interface IDriverCredential extends Document {
  truckNo: string;
  pin: string; // Hashed PIN (4-6 digits)
  refreshToken?: string; // Hashed refresh token
  driverName?: string; // ✅ Encrypted at rest
  phoneNumber?: string; // ✅ Encrypted at rest
  isActive: boolean;
  lastLogin?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  comparePin(candidatePin: string): Promise<boolean>;
}

const driverCredentialSchema = new Schema<IDriverCredential>(
  {
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    pin: {
      type: String,
      required: [true, 'PIN is required'],
      select: false, // Don't return PIN by default
    },
    driverName: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: Date,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Hash PIN before saving
driverCredentialSchema.pre('save', async function (next) {
  if (!this.isModified('pin')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.pin = await bcrypt.hash(this.pin, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// ✅ SECURITY: Encrypt sensitive PII fields before saving
driverCredentialSchema.pre('save', async function (next) {
  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY;
  
  if (!encryptionKey) {
    // Encryption disabled, continue without encrypting
    return next();
  }

  try {
    if (this.isModified('driverName') && this.driverName) {
      const encrypted = encryptData(this.driverName, encryptionKey);
      this.driverName = `encrypted:${encrypted}`;
    }
    
    if (this.isModified('phoneNumber') && this.phoneNumber) {
      const encrypted = encryptData(this.phoneNumber, encryptionKey);
      this.phoneNumber = `encrypted:${encrypted}`;
    }
    
    next();
  } catch (error: any) {
    logger.error('[DriverCredential] Encryption failed:', error.message);
    next(error);
  }
});

// ✅ SECURITY: Decrypt sensitive PII fields after retrieving from database
driverCredentialSchema.post('findOne', decryptSensitiveFields);
driverCredentialSchema.post('findOneAndUpdate', decryptSensitiveFields);
driverCredentialSchema.post('find', function (docs: any) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptSensitiveFields);
  }
});

// Method to compare PIN
driverCredentialSchema.methods.comparePin = async function (
  candidatePin: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(candidatePin, this.pin);
  } catch (error) {
    return false;
  }
};

// Indexes
driverCredentialSchema.index({ isActive: 1, truckNo: 1 });

/**
 * Helper function to decrypt sensitive fields
 */
function decryptSensitiveFields(doc: any) {
  if (!doc) return;
  
  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY;
  if (!encryptionKey) return; // Encryption disabled

  try {
    // Decrypt driverName
    if (doc.driverName && typeof doc.driverName === 'string' && doc.driverName.startsWith('encrypted:')) {
      try {
        const encryptedPayload = doc.driverName.substring(10);
        doc.driverName = decryptData(encryptedPayload, encryptionKey);
      } catch (error: any) {
        logger.warn('[DriverCredential] Failed to decrypt driverName:', error.message);
      }
    }

    // Decrypt phoneNumber
    if (doc.phoneNumber && typeof doc.phoneNumber === 'string' && doc.phoneNumber.startsWith('encrypted:')) {
      try {
        const encryptedPayload = doc.phoneNumber.substring(10);
        doc.phoneNumber = decryptData(encryptedPayload, encryptionKey);
      } catch (error: any) {
        logger.warn('[DriverCredential] Failed to decrypt phoneNumber:', error.message);
      }
    }
  } catch (error: any) {
    logger.error('[DriverCredential] Decryption error:', error.message);
  }
}

export const DriverCredential = mongoose.model<IDriverCredential>(
  'DriverCredential',
  driverCredentialSchema
);
