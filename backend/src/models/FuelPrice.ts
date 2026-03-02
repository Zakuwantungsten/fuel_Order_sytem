import mongoose, { Schema, Document } from 'mongoose';

export interface IFuelPriceHistory extends Document {
  stationId: string;
  stationName: string;
  oldPrice: number;
  newPrice: number;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

export interface IFuelPriceSchedule extends Document {
  stationId: string;
  stationName: string;
  currentPrice: number;
  newPrice: number;
  effectiveAt: Date;
  createdBy: string;
  createdAt: Date;
  isApplied: boolean;
  appliedAt?: Date;
  isCancelled: boolean;
  cancelledAt?: Date;
  reason?: string;
}

const FuelPriceHistorySchema = new Schema<IFuelPriceHistory>({
  stationId: { type: String, required: true, index: true },
  stationName: { type: String, required: true },
  oldPrice: { type: Number, required: true },
  newPrice: { type: Number, required: true },
  changedBy: { type: String, required: true },
  changedAt: { type: Date, default: () => new Date(), index: true },
  reason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: false });

const FuelPriceScheduleSchema = new Schema<IFuelPriceSchedule>({
  stationId: { type: String, required: true, index: true },
  stationName: { type: String, required: true },
  currentPrice: { type: Number, required: true },
  newPrice: { type: Number, required: true },
  effectiveAt: { type: Date, required: true, index: true },
  createdBy: { type: String, required: true },
  isApplied: { type: Boolean, default: false, index: true },
  appliedAt: { type: Date },
  isCancelled: { type: Boolean, default: false },
  cancelledAt: { type: Date },
  reason: { type: String, trim: true, maxlength: 500 },
}, { timestamps: true });

export const FuelPriceHistory = mongoose.model<IFuelPriceHistory>('FuelPriceHistory', FuelPriceHistorySchema);
export const FuelPriceSchedule = mongoose.model<IFuelPriceSchedule>('FuelPriceSchedule', FuelPriceScheduleSchema);
