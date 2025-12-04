import mongoose, { Schema, Document } from 'mongoose';

export interface IRouteConfig extends Document {
  routeName: string;
  destination: string;
  defaultTotalLiters: number;
  description?: string;
  isActive: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RouteConfigSchema = new Schema<IRouteConfig>(
  {
    routeName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    defaultTotalLiters: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: routeName index is created automatically by unique: true
RouteConfigSchema.index({ destination: 1 });
RouteConfigSchema.index({ isActive: 1 });

export const RouteConfig = mongoose.model<IRouteConfig>(
  'RouteConfig',
  RouteConfigSchema
);
