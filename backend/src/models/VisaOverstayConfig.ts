import mongoose, { Document, Schema } from 'mongoose';

export interface IVisaOverstayConfig extends Document {
  key: string;
  /** Days before passport due for inland / mines payout (Whisky still pays on due date). */
  reserveDays: number;
  /** Days between overstay cycles after first payout. */
  overstayCycleDays: number;
  /** Grace days before extra-day settlement kicks in on crossed. */
  graceDays: number;
  overstayAmount: number;
  visaAmount: number;
  /** Look back N days for truck already submitted (raw / build / active / crossed). */
  duplicateTruckLookbackDays: number;
  /** 0–100: fuzzy name similarity % to flag possible passport fraud. */
  nameFuzzyThreshold: number;
  /** Minimum name length before fuzzy checks run. */
  nameFuzzyMinLength: number;
  /** When true, allow Rebuild day (restore pending → clear → rebuild). */
  allowMultiBuild: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const visaOverstayConfigSchema = new Schema<IVisaOverstayConfig>(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    reserveDays: { type: Number, required: true, default: 2, min: 0, max: 30 },
    overstayCycleDays: { type: Number, required: true, default: 10, min: 1, max: 60 },
    graceDays: { type: Number, required: true, default: 5, min: 0, max: 30 },
    overstayAmount: { type: Number, required: true, default: 50, min: 0 },
    visaAmount: { type: Number, required: true, default: 50, min: 0 },
    duplicateTruckLookbackDays: { type: Number, required: true, default: 30, min: 1, max: 365 },
    nameFuzzyThreshold: { type: Number, required: true, default: 78, min: 50, max: 100 },
    nameFuzzyMinLength: { type: Number, required: true, default: 4, min: 2, max: 20 },
    allowMultiBuild: { type: Boolean, required: true, default: false },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export const VisaOverstayConfig = mongoose.model<IVisaOverstayConfig>(
  'VisaOverstayConfig',
  visaOverstayConfigSchema
);
