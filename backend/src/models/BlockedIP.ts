import mongoose, { Schema, Document } from 'mongoose';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BlockReason =
  | 'path_probe'
  | 'auth_failure'
  | 'rate_limit'
  | 'suspicious_404'
  | 'ua_blocked'
  | 'honeypot'
  | 'manual'
  | 'auto_escalation';

export interface IBlockedIP extends Document {
  ip: string;
  reason: BlockReason;
  blockedAt: Date;
  expiresAt: Date | null;      // null = permanent
  blockedBy: string;            // 'system' or admin username
  suspiciousCount: number;
  lastSuspiciousEvent: Date;
  details: string;
  isActive: boolean;
  unblockedAt: Date | null;
  unblockedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const BlockedIPSchema = new Schema<IBlockedIP>(
  {
    ip: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      index: true,
    },
    reason: {
      type: String,
      enum: ['path_probe', 'auth_failure', 'rate_limit', 'suspicious_404', 'ua_blocked', 'honeypot', 'manual', 'auto_escalation'],
      required: true,
    },
    blockedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    blockedBy: {
      type: String,
      default: 'system',
    },
    suspiciousCount: {
      type: Number,
      default: 1,
    },
    lastSuspiciousEvent: {
      type: Date,
      default: Date.now,
    },
    details: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    unblockedAt: {
      type: Date,
      default: null,
    },
    unblockedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient lookups
BlockedIPSchema.index({ ip: 1, isActive: 1 });
BlockedIPSchema.index({ isActive: 1, expiresAt: 1 });
BlockedIPSchema.index({ blockedAt: -1 });
BlockedIPSchema.index({ reason: 1, isActive: 1 });

export const BlockedIP = mongoose.model<IBlockedIP>('BlockedIP', BlockedIPSchema);
