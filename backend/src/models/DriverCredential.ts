import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Driver Credential Model
 * Stores secure authentication credentials for truck drivers
 * Replaces the insecure username===password bypass
 */

export interface IDriverCredential extends Document {
  truckNo: string;
  pin: string; // Hashed PIN (4-6 digits)
  driverName?: string;
  phoneNumber?: string;
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
    const salt = await bcrypt.genSalt(10);
    this.pin = await bcrypt.hash(this.pin, salt);
    next();
  } catch (error: any) {
    next(error);
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

export const DriverCredential = mongoose.model<IDriverCredential>(
  'DriverCredential',
  driverCredentialSchema
);
