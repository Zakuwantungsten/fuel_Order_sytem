/**
 * SecurityAlert — Persistent, actionable alert queue for the Security tab.
 * Alerts are auto-generated from security events, UEBA anomalies,
 * autoblock triggers, and break-glass activations.
 */
import mongoose, { Schema, Document } from 'mongoose';

/* ── Types ── */

export type AlertStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AlertType =
  | 'security_event'       // WAF-level: path blocked, IP blocked, etc.
  | 'auth_failure'         // Repeated auth failures
  | 'ueba_anomaly'         // UEBA: impossible travel, off-hours, bulk export, etc.
  | 'autoblock_trigger'    // IP auto-blocked
  | 'break_glass_used'     // Break-glass account activated
  | 'score_regression'     // Security score dropped
  | 'policy_change'        // Critical security policy changed
  | 'brute_force'          // Brute force pattern detected
  | 'mfa_bypass';          // MFA bypass or failure pattern

export interface IAlertNote {
  author: string;
  authorId: string;
  text: string;
  createdAt: Date;
}

export interface ISecurityAlert {
  severity: AlertSeverity;
  type: AlertType;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  status: AlertStatus;
  createdAt: Date;
  updatedAt: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  notes: IAlertNote[];
  relatedEventId?: string;
  relatedIP?: string;
  relatedUserId?: string;
  relatedUsername?: string;
}

export interface ISecurityAlertDocument extends ISecurityAlert, Document {}

/* ── Schema ── */

const AlertNoteSchema = new Schema<IAlertNote>(
  {
    author: { type: String, required: true },
    authorId: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SecurityAlertSchema = new Schema<ISecurityAlertDocument>(
  {
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'security_event', 'auth_failure', 'ueba_anomaly',
        'autoblock_trigger', 'break_glass_used', 'score_regression',
        'policy_change', 'brute_force', 'mfa_bypass',
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['new', 'acknowledged', 'investigating', 'resolved', 'false_positive'],
      default: 'new',
      required: true,
      index: true,
    },
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
    notes: { type: [AlertNoteSchema], default: [] },
    relatedEventId: { type: String },
    relatedIP: { type: String, index: true },
    relatedUserId: { type: String },
    relatedUsername: { type: String },
  },
  {
    timestamps: true,
    collection: 'security_alerts',
  },
);

// Compound indexes for common queries
SecurityAlertSchema.index({ status: 1, severity: 1, createdAt: -1 });
SecurityAlertSchema.index({ createdAt: -1 });

// TTL: auto-delete resolved alerts after 180 days
SecurityAlertSchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60, partialFilterExpression: { resolvedAt: { $exists: true } } },
);

export const SecurityAlert = mongoose.model<ISecurityAlertDocument>('SecurityAlert', SecurityAlertSchema);
