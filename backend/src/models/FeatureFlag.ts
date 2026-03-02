import mongoose, { Schema, Document } from 'mongoose';

export interface IFeatureFlag extends Document {
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  enabledForRoles: string[];
  metadata?: Record<string, any>;
  updatedBy: string;
  updatedAt: Date;
  createdAt: Date;
}

const FeatureFlagSchema = new Schema<IFeatureFlag>(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    isEnabled: { type: Boolean, default: false },
    enabledForRoles: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const FeatureFlag = mongoose.model<IFeatureFlag>('FeatureFlag', FeatureFlagSchema);
