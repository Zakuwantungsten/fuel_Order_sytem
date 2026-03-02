import mongoose, { Schema, Document } from 'mongoose';

/**
 * Data Loss Prevention (DLP) Rule
 * Prevents unauthorized bulk export of sensitive data.
 */
export interface IDLPRule extends Document {
  name: string;
  description: string;
  isActive: boolean;
  ruleType: 'export_limit' | 'field_restriction' | 'time_restriction' | 'role_restriction';
  // Export limit: max records per export
  maxRecords?: number;
  // Time restriction: block exports outside hours
  allowedHoursStart?: number; // 0–23
  allowedHoursEnd?: number;
  // Role restriction: which roles can export
  allowedRoles?: string[];
  blockedRoles?: string[];
  // Field restriction: fields that cannot be exported
  restrictedFields?: string[];
  // Which data types this rule applies to
  appliesTo: string[]; // e.g., ['fuel_records', 'delivery_orders', 'users', 'audit_logs']
  action: 'block' | 'warn' | 'log';  // What to do when rule triggers
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  triggerCount: number;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const dlpRuleSchema = new Schema<IDLPRule>(
  {
    name: { type: String, required: true, unique: true, maxlength: 100 },
    description: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    ruleType: {
      type: String,
      enum: ['export_limit', 'field_restriction', 'time_restriction', 'role_restriction'],
      required: true,
    },
    maxRecords: { type: Number, min: 1 },
    allowedHoursStart: { type: Number, min: 0, max: 23 },
    allowedHoursEnd: { type: Number, min: 0, max: 23 },
    allowedRoles: [String],
    blockedRoles: [String],
    restrictedFields: [String],
    appliesTo: { type: [String], required: true },
    action: { type: String, enum: ['block', 'warn', 'log'], default: 'block' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    triggerCount: { type: Number, default: 0 },
    lastTriggeredAt: Date,
  },
  { timestamps: true }
);

export const DLPRule = mongoose.model<IDLPRule>('DLPRule', dlpRuleSchema);
