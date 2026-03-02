import mongoose, { Schema, Document } from 'mongoose';

/**
 * Break-Glass Emergency Access Account
 * Emergency admin accounts that bypass SSO/MFA, stored offline.
 * Usage triggers a level-1 alert to all super admins.
 */
export interface IBreakGlassAccount extends Document {
  username: string;
  passwordHash: string;           // bcrypt hashed
  isActive: boolean;
  description: string;
  createdBy: mongoose.Types.ObjectId;
  createdByUsername: string;
  lastUsedAt?: Date;
  lastUsedIP?: string;
  usageCount: number;
  // Each usage is logged
  usageLog: Array<{
    timestamp: Date;
    ipAddress: string;
    userAgent: string;
    reason: string;
    duration: number;              // minutes active
    deactivatedAt?: Date;
  }>;
  // Rotation tracking
  lastRotatedAt?: Date;
  rotationIntervalDays: number;   // How often password should be rotated
  nextRotationDue?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const breakGlassSchema = new Schema<IBreakGlassAccount>(
  {
    username: { type: String, required: true, unique: true, maxlength: 50 },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: false }, // Disabled by default
    description: { type: String, required: true, maxlength: 200 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByUsername: { type: String, required: true },
    lastUsedAt: Date,
    lastUsedIP: String,
    usageCount: { type: Number, default: 0 },
    usageLog: [{
      timestamp: { type: Date, required: true },
      ipAddress: { type: String, required: true },
      userAgent: String,
      reason: { type: String, required: true },
      duration: Number,
      deactivatedAt: Date,
    }],
    lastRotatedAt: Date,
    rotationIntervalDays: { type: Number, default: 90 },
    nextRotationDue: Date,
  },
  { timestamps: true }
);

export const BreakGlassAccount = mongoose.model<IBreakGlassAccount>('BreakGlassAccount', breakGlassSchema);
