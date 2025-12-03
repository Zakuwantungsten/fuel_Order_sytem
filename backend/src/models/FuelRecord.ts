import mongoose, { Schema, Document } from 'mongoose';
import { IFuelRecord } from '../types';

export interface IFuelRecordDocument extends IFuelRecord, Document {}

const fuelRecordSchema = new Schema<IFuelRecordDocument>(
  {
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    month: {
      type: String,
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      trim: true,
    },
    goingDo: {
      type: String,
      required: [true, 'Going DO is required'],
      trim: true,
    },
    returnDo: {
      type: String,
      trim: true,
    },
    start: {
      type: String,
      required: [true, 'Start location is required'],
      trim: true,
    },
    from: {
      type: String,
      required: [true, 'From location is required'],
      trim: true,
    },
    to: {
      type: String,
      required: [true, 'To location is required'],
      trim: true,
    },
    totalLts: {
      type: Number,
      required: [true, 'Total liters is required'],
      min: [0, 'Total liters cannot be negative'],
    },
    extra: {
      type: Number,
      default: 0,
    },
    // Yard allocations
    mmsaYard: {
      type: Number,
      default: 0,
    },
    tangaYard: {
      type: Number,
      default: 0,
    },
    darYard: {
      type: Number,
      default: 0,
    },
    // Going fuel
    darGoing: {
      type: Number,
      default: 0,
    },
    moroGoing: {
      type: Number,
      default: 0,
    },
    mbeyaGoing: {
      type: Number,
      default: 0,
    },
    tdmGoing: {
      type: Number,
      default: 0,
    },
    zambiaGoing: {
      type: Number,
      default: 0,
    },
    congoFuel: {
      type: Number,
      default: 0,
    },
    // Return fuel
    zambiaReturn: {
      type: Number,
      default: 0,
    },
    tundumaReturn: {
      type: Number,
      default: 0,
    },
    mbeyaReturn: {
      type: Number,
      default: 0,
    },
    moroReturn: {
      type: Number,
      default: 0,
    },
    darReturn: {
      type: Number,
      default: 0,
    },
    tangaReturn: {
      type: Number,
      default: 0,
    },
    balance: {
      type: Number,
      required: [true, 'Balance is required'],
    },
    // Original going journey locations (stored before EXPORT DO changes them)
    originalGoingFrom: {
      type: String,
      trim: true,
    },
    originalGoingTo: {
      type: String,
      trim: true,
    },
    // Cancellation fields
    isCancelled: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledBy: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc: any, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
fuelRecordSchema.index({ truckNo: 1 });
fuelRecordSchema.index({ date: 1 });
fuelRecordSchema.index({ goingDo: 1 });
fuelRecordSchema.index({ returnDo: 1 });
fuelRecordSchema.index({ isDeleted: 1 });
fuelRecordSchema.index({ month: 1 });

// Compound indexes for common queries
fuelRecordSchema.index({ truckNo: 1, date: -1 });
fuelRecordSchema.index({ date: -1, isDeleted: 1 });

export const FuelRecord = mongoose.model<IFuelRecordDocument>('FuelRecord', fuelRecordSchema);
