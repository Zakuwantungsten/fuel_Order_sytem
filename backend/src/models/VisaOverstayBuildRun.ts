import mongoose, { Document, Schema } from 'mongoose';

export interface IVisaOverstayBuildRun extends Document {
  buildDate: Date;
  /** YYYY-MM-DD Africa/Nairobi key */
  buildDateKey: string;
  createdCount: number;
  skippedCount: number;
  builtBy: string;
  builtAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const visaOverstayBuildRunSchema = new Schema<IVisaOverstayBuildRun>(
  {
    buildDate: { type: Date, required: true },
    buildDateKey: { type: String, required: true, unique: true, index: true },
    createdCount: { type: Number, default: 0 },
    skippedCount: { type: Number, default: 0 },
    builtBy: { type: String, required: true },
    builtAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export const VisaOverstayBuildRun = mongoose.model<IVisaOverstayBuildRun>(
  'VisaOverstayBuildRun',
  visaOverstayBuildRunSchema
);
