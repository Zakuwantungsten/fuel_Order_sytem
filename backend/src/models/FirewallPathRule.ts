/**
 * FirewallPathRule Model
 * Stores URL path pattern rules: block, allow, or log matching requests.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IFirewallPathRule extends Document {
  pattern: string;
  action: 'block' | 'allow' | 'log';
  methods: string[];
  description: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const FirewallPathRuleSchema = new Schema<IFirewallPathRule>(
  {
    pattern: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    action: {
      type: String,
      enum: ['block', 'allow', 'log'],
      required: true,
      default: 'block',
    },
    methods: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) =>
          v.every(m => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(m)),
        message: 'Invalid HTTP method in methods array',
      },
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
    collection: 'firewall_path_rules',
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id?.toString();
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete (ret as Record<string, unknown>)['__v'];
        return ret;
      },
    },
  },
);

FirewallPathRuleSchema.index({ isActive: 1 });
FirewallPathRuleSchema.index({ action: 1, isActive: 1 });

export const FirewallPathRule = mongoose.model<IFirewallPathRule>('FirewallPathRule', FirewallPathRuleSchema);
