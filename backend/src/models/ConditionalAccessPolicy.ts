/**
 * Conditional Access Policy Model
 *
 * Compound rules: role + IP + time + device_trust + country → action.
 * Evaluated during authentication and sensitive operations.
 */
import mongoose, { Schema, Document } from 'mongoose';

/* ───────── Types ───────── */

export type ConditionSignal = 'role' | 'ip_range' | 'time_of_day' | 'device_trusted' | 'country';
export type ConditionOperator = 'in' | 'not_in' | 'equals' | 'not_equals' | 'between' | 'not_between';
export type PolicyAction = 'allow' | 'block' | 'require_mfa' | 'notify_admin';

export interface ICondition {
  signal: ConditionSignal;
  operator: ConditionOperator;
  value: string | string[]; // e.g. ['admin','super_admin'] or '192.168.1.0/24' or '06:00-22:00'
}

export interface IConditionalAccessPolicy {
  name: string;
  description?: string;
  conditions: ICondition[];
  action: PolicyAction;
  isActive: boolean;
  priority: number; // Lower number = higher priority (evaluated first)
  createdBy: string;
  updatedBy?: string;
}

export interface IConditionalAccessPolicyDocument extends IConditionalAccessPolicy, Document {}

/* ───────── Schema ───────── */

const conditionSchema = new Schema<ICondition>(
  {
    signal: {
      type: String,
      required: true,
      enum: ['role', 'ip_range', 'time_of_day', 'device_trusted', 'country'],
    },
    operator: {
      type: String,
      required: true,
      enum: ['in', 'not_in', 'equals', 'not_equals', 'between', 'not_between'],
    },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false },
);

const conditionalAccessPolicySchema = new Schema<IConditionalAccessPolicyDocument>(
  {
    name: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    conditions: { type: [conditionSchema], required: true, validate: [(v: any[]) => v.length > 0, 'At least one condition is required'] },
    action: { type: String, required: true, enum: ['allow', 'block', 'require_mfa', 'notify_admin'] },
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 100, min: 0, max: 1000 },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
  },
  {
    timestamps: true,
    collection: 'conditional_access_policies',
    toJSON: {
      virtuals: true,
      transform(_doc: any, ret: any) {
        ret.id = ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

conditionalAccessPolicySchema.index({ isActive: 1, priority: 1 });

export const ConditionalAccessPolicy = mongoose.model<IConditionalAccessPolicyDocument>(
  'ConditionalAccessPolicy',
  conditionalAccessPolicySchema,
);
