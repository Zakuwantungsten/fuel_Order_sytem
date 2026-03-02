import mongoose, { Schema, Document } from 'mongoose';

/**
 * JIT (Just-In-Time) Privilege Elevation Request
 * Implements Microsoft PIM-style temporary access with 4-eyes approval.
 */
export interface IPrivilegeRequest extends Document {
  requestedBy: mongoose.Types.ObjectId;
  requestedByUsername: string;
  targetRole: string;
  currentRole: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'active' | 'revoked';
  durationMinutes: number;          // How long the elevated access lasts
  approvedBy?: mongoose.Types.ObjectId;
  approvedByUsername?: string;
  approvedAt?: Date;
  deniedBy?: mongoose.Types.ObjectId;
  deniedByUsername?: string;
  deniedAt?: Date;
  denialReason?: string;
  activatedAt?: Date;
  expiresAt?: Date;
  revokedBy?: mongoose.Types.ObjectId;
  revokedAt?: Date;
  revokeReason?: string;
  originalRole?: string;            // Stored when activated, to revert
  createdAt: Date;
  updatedAt: Date;
}

const privilegeRequestSchema = new Schema<IPrivilegeRequest>(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestedByUsername: { type: String, required: true },
    targetRole: { type: String, required: true },
    currentRole: { type: String, required: true },
    reason: { type: String, required: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'expired', 'active', 'revoked'],
      default: 'pending',
      index: true,
    },
    durationMinutes: { type: Number, required: true, min: 15, max: 480 }, // 15min – 8hrs
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedByUsername: String,
    approvedAt: Date,
    deniedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deniedByUsername: String,
    deniedAt: Date,
    denialReason: { type: String, maxlength: 500 },
    activatedAt: Date,
    expiresAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    revokedAt: Date,
    revokeReason: { type: String, maxlength: 500 },
    originalRole: String,
  },
  { timestamps: true }
);

// Auto-expire active elevations past their expiry
privilegeRequestSchema.index({ status: 1, expiresAt: 1 });

export const PrivilegeRequest = mongoose.model<IPrivilegeRequest>('PrivilegeRequest', privilegeRequestSchema);
