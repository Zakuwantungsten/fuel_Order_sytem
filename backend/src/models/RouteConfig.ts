import mongoose, { Schema, Document } from 'mongoose';

export interface IRouteConfig extends Document {
  routeName: string;
  origin: string; // Starting point (e.g., "Dar", "Tanga") - REQUIRED as it determines fuel allocation
  destination: string;
  destinationAliases?: string[]; // Alternative names (e.g., ["DSM", "DAR"] for Dar es Salaam)
  routeType: 'IMPORT' | 'EXPORT'; // IMPORT = outbound/going routes, EXPORT = return/inbound routes
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
    origin: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    destinationAliases: {
      type: [String],
      default: [],
    },
    routeType: {
      type: String,
      enum: ['IMPORT', 'EXPORT'],
      default: 'IMPORT',
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
RouteConfigSchema.index({ origin: 1 });
RouteConfigSchema.index({ destinationAliases: 1 });
RouteConfigSchema.index({ isActive: 1 });
RouteConfigSchema.index({ routeType: 1 });

export const RouteConfig = mongoose.model<IRouteConfig>(
  'RouteConfig',
  RouteConfigSchema
);
