/**
 * NetworkZone Model
 * Named CIDR groups reusable across IP rules and Conditional Access policies.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface INetworkZone extends Document {
  name: string;
  description: string;
  cidrs: string[];
  color: string;
  isBuiltIn: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const NetworkZoneSchema = new Schema<INetworkZone>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    cidrs: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one CIDR or IP is required',
      },
    },
    color: {
      type: String,
      default: '#6366f1',
      trim: true,
      maxlength: 20,
    },
    isBuiltIn: {
      type: Boolean,
      default: false,
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
    collection: 'network_zones',
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

NetworkZoneSchema.index({ isActive: 1 });
NetworkZoneSchema.index({ name: 1 }, { unique: true });

export const NetworkZone = mongoose.model<INetworkZone>('NetworkZone', NetworkZoneSchema);
