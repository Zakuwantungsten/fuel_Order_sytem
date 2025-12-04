import mongoose, { Schema, Document } from 'mongoose';
import { IDriverAccountEntry, CancellationPoint, PaymentMode } from '../types';

export interface IDriverAccountEntryDocument extends IDriverAccountEntry, Document {}

const CANCELLATION_POINTS: CancellationPoint[] = [
  'DAR_GOING',
  'MORO_GOING',
  'MBEYA_GOING',
  'INFINITY_GOING',
  'TDM_GOING',
  'ZAMBIA_GOING',
  'CONGO_GOING',
  'ZAMBIA_NDOLA',
  'ZAMBIA_KAPIRI',
  'TDM_RETURN',
  'MBEYA_RETURN',
  'MORO_RETURN',
  'DAR_RETURN',
  'TANGA_RETURN',
  'CONGO_RETURNING',
  'CUSTOM_GOING',
  'CUSTOM_RETURN'
];

const PAYMENT_MODES: PaymentMode[] = [
  'TIGO_LIPA',
  'VODA_LIPA',
  'SELCOM',
  'CASH',
  'STATION'
];

const driverAccountEntrySchema = new Schema<IDriverAccountEntryDocument>(
  {
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    month: {
      type: String,
      required: [true, 'Month is required'],
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
    },
    lpoNo: {
      type: String,
      required: [true, 'LPO number is required'],
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      trim: true,
    },
    driverName: {
      type: String,
      trim: true,
    },
    liters: {
      type: Number,
      required: [true, 'Liters is required'],
      min: [0, 'Liters cannot be negative'],
    },
    rate: {
      type: Number,
      required: [true, 'Rate is required'],
      min: [0, 'Rate cannot be negative'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
    },
    station: {
      type: String,
      required: [true, 'Station is required'],
      trim: true,
    },
    cancellationPoint: {
      type: String,
      enum: [...CANCELLATION_POINTS, null, ''],
      required: false, // Driver account entries don't cancel any LPO
    },
    journeyDirection: {
      type: String,
      enum: ['going', 'returning'],
      required: [true, 'Journey direction is required'],
      default: 'going',
    },
    originalDoNo: {
      type: String,
      trim: true,
    },
    paymentMode: {
      type: String,
      enum: PAYMENT_MODES,
      default: 'CASH',
    },
    paybillOrMobile: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'settled', 'disputed'],
      default: 'pending',
    },
    settledAt: {
      type: Date,
    },
    settledBy: {
      type: String,
    },
    approvedBy: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: [true, 'Created by is required'],
    },
    lpoCreated: {
      type: Boolean,
      default: false,
    },
    lpoSummaryId: {
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
  }
);

// Indexes
driverAccountEntrySchema.index({ year: 1 });
driverAccountEntrySchema.index({ month: 1 });
driverAccountEntrySchema.index({ lpoNo: 1 });
driverAccountEntrySchema.index({ truckNo: 1 });
driverAccountEntrySchema.index({ status: 1 });
driverAccountEntrySchema.index({ isDeleted: 1 });
driverAccountEntrySchema.index({ year: 1, month: 1 });
driverAccountEntrySchema.index({ truckNo: 1, year: 1 });

export const DriverAccountEntry = mongoose.model<IDriverAccountEntryDocument>(
  'DriverAccountEntry',
  driverAccountEntrySchema
);
