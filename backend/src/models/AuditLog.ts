import mongoose, { Schema, Document } from 'mongoose';
import { IAuditLog, AuditAction, AuditSeverity } from '../types';

export interface IAuditLogDocument extends IAuditLog, Document {}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    userId: {
      type: String,
      ref: 'User',
    },
    username: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        'CREATE',
        'UPDATE',
        'DELETE',
        'RESTORE',
        'PERMANENT_DELETE',
        'LOGIN',
        'LOGOUT',
        'FAILED_LOGIN',
        'PASSWORD_RESET',
        'CONFIG_CHANGE',
        'BULK_OPERATION',
        'EXPORT',
        'ENABLE_MAINTENANCE',
        'DISABLE_MAINTENANCE',
      ],
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      index: true,
    },
    resourceId: {
      type: String,
    },
    previousValue: {
      type: Schema.Types.Mixed,
    },
    newValue: {
      type: Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    details: {
      type: String,
    },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'audit_logs',
  }
);

// Index for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ username: 1, timestamp: -1 });

// Static method to log an action
auditLogSchema.statics.logAction = async function (
  data: Partial<IAuditLog>
): Promise<IAuditLogDocument> {
  const log = new this({
    timestamp: new Date(),
    ...data,
  });
  return log.save();
};

// Static method to get logs with filtering
auditLogSchema.statics.getLogs = async function (
  options: {
    action?: AuditAction;
    resourceType?: string;
    username?: string;
    severity?: AuditSeverity;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    skip?: number;
  }
): Promise<{ logs: IAuditLogDocument[]; total: number }> {
  const filter: any = {};

  if (options.action) filter.action = options.action;
  if (options.resourceType) filter.resourceType = options.resourceType;
  if (options.username) filter.username = options.username;
  if (options.severity) filter.severity = options.severity;

  if (options.startDate || options.endDate) {
    filter.timestamp = {};
    if (options.startDate) filter.timestamp.$gte = options.startDate;
    if (options.endDate) filter.timestamp.$lte = options.endDate;
  }

  const total = await this.countDocuments(filter);
  const logs = await this.find(filter)
    .sort({ timestamp: -1 })
    .limit(options.limit || 100)
    .skip(options.skip || 0);

  return { logs, total };
};

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);
