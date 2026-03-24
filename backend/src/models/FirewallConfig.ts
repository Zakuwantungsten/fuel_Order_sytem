/**
 * FirewallConfig Model
 * Generic key-value singleton config store for all firewall policy documents.
 * Each config type is stored as one document keyed by `key`.
 * Keys: 'cors' | 'security_headers' | 'bot_protection' | 'tls' | 'ddos'
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IFirewallConfig extends Document {
  key: string;
  value: Record<string, unknown>;
  updatedBy: string;
  updatedAt: Date;
  createdAt: Date;
}

const FirewallConfigSchema = new Schema<IFirewallConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    updatedBy: {
      type: String,
      default: 'system',
    },
  },
  {
    timestamps: true,
    collection: 'firewall_configs',
    toJSON: {
      transform(_doc: any, ret: any) {
        delete ret.__v;
        return ret;
      },
    },
  },
);

FirewallConfigSchema.index({ key: 1 }, { unique: true });

export const FirewallConfig = mongoose.model<IFirewallConfig>('FirewallConfig', FirewallConfigSchema);
