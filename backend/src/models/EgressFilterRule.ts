/**
 * EgressFilterRule Model
 * Outbound connection filter rules — controls which external hosts/IPs
 * backend services are permitted or blocked from reaching.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IEgressFilterRule extends Document {
  type: 'allow' | 'block';
  target: string;
  targetType: 'domain' | 'ip' | 'cidr';
  port: number | null;
  protocol: 'tcp' | 'udp' | 'any';
  description: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const EgressFilterRuleSchema = new Schema<IEgressFilterRule>(
  {
    type: {
      type: String,
      enum: ['allow', 'block'],
      required: true,
      default: 'block',
    },
    target: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    targetType: {
      type: String,
      enum: ['domain', 'ip', 'cidr'],
      required: true,
      default: 'domain',
    },
    port: {
      type: Number,
      default: null,
      min: 0,
      max: 65535,
    },
    protocol: {
      type: String,
      enum: ['tcp', 'udp', 'any'],
      default: 'any',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'egress_filter_rules',
    toJSON: {
      virtuals: true,
      transform(_doc: any, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

EgressFilterRuleSchema.index({ type: 1, isActive: 1 });
EgressFilterRuleSchema.index({ target: 1 });

export const EgressFilterRule = mongoose.model<IEgressFilterRule>('EgressFilterRule', EgressFilterRuleSchema);
