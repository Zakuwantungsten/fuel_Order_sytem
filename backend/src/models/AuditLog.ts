import mongoose, { Schema, Document } from 'mongoose';
import { createHash } from 'crypto';
import { IAuditLog, AuditAction, AuditSeverity, AuditOutcome } from '../types';

export interface IAuditLogDocument extends IAuditLog, Document {}

// ─────────────────────────────────────────────────────────────────────────────
// All possible action values — must mirror types/index.ts AuditAction
// ─────────────────────────────────────────────────────────────────────────────
const AUDIT_ACTIONS: AuditAction[] = [
  // CRUD
  'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'PERMANENT_DELETE', 'IMPORT',
  // Auth
  'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'PASSWORD_RESET', 'TOKEN_REFRESH', 'SESSION_EXPIRED',
  // Access control (PCI-DSS 10.2.1, 10.2.3)
  'ACCESS_DENIED', 'ROLE_CHANGE', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED',
  // Data access
  'VIEW_SENSITIVE_DATA', 'EXPORT',
  // Workflow
  'APPROVE', 'REJECT',
  // System
  'CONFIG_CHANGE', 'BULK_OPERATION', 'ENABLE_MAINTENANCE', 'DISABLE_MAINTENANCE',
  // Checkpoints
  'CREATE_CHECKPOINT', 'UPDATE_CHECKPOINT', 'DELETE_CHECKPOINT',
  'REORDER_CHECKPOINTS', 'SEED_CHECKPOINTS',
  // Audit integrity
  'VERIFY_INTEGRITY',
  // Legacy
  'user_migration_executed', 'user_flag_cleared',
];

// ─────────────────────────────────────────────────────────────────────────────
// Read-only actions (equivalent to AWS CloudTrail readOnly = true)
// ─────────────────────────────────────────────────────────────────────────────
const READ_ONLY_ACTIONS = new Set<AuditAction>([
  'LOGIN', 'LOGOUT', 'EXPORT', 'VIEW_SENSITIVE_DATA', 'VERIFY_INTEGRITY',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Risk score mapping  (0-100). Additive — severity adds on top.
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_BASE_RISK: Partial<Record<AuditAction, number>> = {
  LOGIN: 5, LOGOUT: 2, FAILED_LOGIN: 40, TOKEN_REFRESH: 10, SESSION_EXPIRED: 15,
  ACCESS_DENIED: 50, ACCOUNT_LOCKED: 70, ACCOUNT_UNLOCKED: 60,
  ROLE_CHANGE: 65, CONFIG_CHANGE: 70, ENABLE_MAINTENANCE: 60, DISABLE_MAINTENANCE: 60,
  PASSWORD_RESET: 45, CREATE: 10, UPDATE: 15, DELETE: 35, RESTORE: 20,
  PERMANENT_DELETE: 55, BULK_OPERATION: 40, EXPORT: 30, VIEW_SENSITIVE_DATA: 35,
  IMPORT: 35, APPROVE: 20, REJECT: 20, VERIFY_INTEGRITY: 10,
};
const SEVERITY_RISK: Record<AuditSeverity, number> = {
  low: 0, medium: 10, high: 20, critical: 30,
};

function computeRiskScore(action: AuditAction, severity: AuditSeverity, outcome: AuditOutcome): number {
  const base = ACTION_BASE_RISK[action] ?? 5;
  const sevBonus = SEVERITY_RISK[severity] ?? 0;
  const failBonus = outcome === 'FAILURE' ? 15 : 0;
  return Math.min(100, base + sevBonus + failBonus);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash computation — identical logic to AWS CloudTrail Log File Integrity
// SHA-256 over the immutable core fields + previousHash (chain-of-custody)
// ─────────────────────────────────────────────────────────────────────────────
export function computeAuditHash(
  entry: {
    timestamp: Date;
    userId?: string;
    username: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    outcome: string;
    ipAddress?: string;
    correlationId?: string;
  },
  previousHash: string
): string {
  const canonical = [
    entry.timestamp.toISOString(),
    entry.userId ?? '',
    entry.username,
    entry.action,
    entry.resourceType,
    entry.resourceId ?? '',
    entry.outcome,
    entry.ipAddress ?? '',
    entry.correlationId ?? '',
    previousHash,
  ].join('|');
  return createHash('sha256').update(canonical).digest('hex');
}

const GENESIS_HASH = '0'.repeat(64); // sentinel for the very first log entry

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────
const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    timestamp: { type: Date, required: true, default: Date.now, index: true },
    userId:    { type: String },
    username:  { type: String, required: true, index: true },
    action:    { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    resourceType: { type: String, required: true, index: true },
    resourceId:   { type: String },
    previousValue: { type: Schema.Types.Mixed },
    newValue:      { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    details:   { type: String },
    severity:  { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low', index: true },

    // ── Big-tech fields ──────────────────────────────────────────────────────
    /** SUCCESS / FAILURE / PARTIAL — mirrors Azure resultType */
    outcome:       { type: String, enum: ['SUCCESS', 'FAILURE', 'PARTIAL'], default: 'SUCCESS', index: true },
    /** Piped from x-request-id — mirrors AWS requestID / Azure correlationId */
    correlationId: { type: String, index: true },
    /** Session-level correlation */
    sessionId:     { type: String },
    /** True for read operations — mirrors AWS CloudTrail readOnly flag */
    readOnly:      { type: Boolean, default: false },
    /** HTTP / app error code when outcome=FAILURE */
    errorCode:     { type: String },
    /** Automated risk score 0-100 */
    riskScore:     { type: Number, default: 0, min: 0, max: 100 },
    /** SHA-256 of immutable core fields — tamper detection */
    hash:          { type: String },
    /** Previous entry's hash — forms the verifiable chain-of-custody */
    previousHash:  { type: String },
    /** Free-form labels */
    tags:          { type: [String], default: [] },
  },
  {
    timestamps: true,
    collection: 'audit_logs',
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ username: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ outcome: 1, timestamp: -1 });
auditLogSchema.index({ riskScore: -1, timestamp: -1 });

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save: compute derived fields + cryptographic hash chain
// ─────────────────────────────────────────────────────────────────────────────
auditLogSchema.pre('save', async function (next) {
  // readOnly — derived from action
  if (this.isNew) {
    this.readOnly = READ_ONLY_ACTIONS.has(this.action as AuditAction);

    // Risk score
    this.riskScore = computeRiskScore(
      this.action as AuditAction,
      this.severity as AuditSeverity,
      (this.outcome as AuditOutcome) ?? 'SUCCESS'
    );

    // Hash chain — fetch the most recently saved log's hash
    const AuditLogModel = this.constructor as typeof AuditLog;
    const lastEntry = await AuditLogModel
      .findOne()
      .sort({ timestamp: -1, _id: -1 })
      .select('hash')
      .lean();

    this.previousHash = lastEntry?.hash ?? GENESIS_HASH;
    this.hash = computeAuditHash(
      {
        timestamp: this.timestamp,
        userId: this.userId,
        username: this.username,
        action: this.action,
        resourceType: this.resourceType,
        resourceId: this.resourceId,
        outcome: (this.outcome as string) ?? 'SUCCESS',
        ipAddress: this.ipAddress,
        correlationId: this.correlationId,
      },
      this.previousHash
    );
  }
  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Immutability guards — audit logs must never be modified after creation.
// Attempted updates/deletes return an error (application-level enforcement).
// For full infra-level immutability, restrict the DB user to insertOne + find.
// ─────────────────────────────────────────────────────────────────────────────
const IMMUTABILITY_ERROR = new Error(
  'Audit logs are immutable and cannot be modified or deleted.'
);

for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'] as const) {
  auditLogSchema.pre(hook, function () { throw IMMUTABILITY_ERROR; });
}
for (const hook of ['deleteOne', 'deleteMany', 'findOneAndDelete', 'remove'] as const) {
  auditLogSchema.pre(hook as any, function () { throw IMMUTABILITY_ERROR; });
}

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);
