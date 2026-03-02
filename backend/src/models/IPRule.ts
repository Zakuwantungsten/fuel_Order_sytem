import mongoose, { Schema, Document } from 'mongoose';

export interface IIPRule extends Document {
  ip: string; // exact IP or CIDR notation, e.g. "192.168.1.1" or "10.0.0.0/8"
  type: 'allow' | 'block';
  description: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const IPRuleSchema = new Schema<IIPRule>(
  {
    ip: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    type: {
      type: String,
      enum: ['allow', 'block'],
      required: true,
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
  }
);

IPRuleSchema.index({ type: 1, isActive: 1 });
IPRuleSchema.index({ ip: 1 });

export const IPRule = mongoose.model<IIPRule>('IPRule', IPRuleSchema);
