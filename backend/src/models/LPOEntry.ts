import mongoose, { Schema, Document } from 'mongoose';
import { ILPOEntry } from '../types';

export interface ILPOEntryDocument extends ILPOEntry, Document {}

const lpoEntrySchema = new Schema<ILPOEntryDocument>(
  {
    sn: {
      type: Number,
      required: [true, 'Serial number is required'],
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    lpoNo: {
      type: String,
      required: [true, 'LPO number is required'],
      trim: true,
    },
    dieselAt: {
      type: String,
      required: [true, 'Diesel station is required'],
      trim: true,
    },
    doSdo: {
      type: String,
      required: [true, 'DO/SDO number is required'],
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      trim: true,
    },
    ltrs: {
      type: Number,
      required: [true, 'Liters is required'],
      min: [0, 'Liters cannot be negative'],
    },
    pricePerLtr: {
      type: Number,
      required: [true, 'Price per liter is required'],
      min: [0, 'Price cannot be negative'],
    },
    destinations: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    // Amendment tracking - stores original value if liters were changed
    originalLtrs: {
      type: Number,
      default: null,
    },
    amendedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    // Driver Account / Cash fields
    isDriverAccount: {
      type: Boolean,
      default: false,
    },
    referenceDo: {
      type: String,
      trim: true,
      default: null,
    },
    paymentMode: {
      type: String,
      enum: ['STATION', 'CASH', 'DRIVER_ACCOUNT'],
      default: 'STATION',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: Removed single lpoNo index to avoid duplicate with compound index
lpoEntrySchema.index({ date: 1 });
lpoEntrySchema.index({ truckNo: 1 });
lpoEntrySchema.index({ dieselAt: 1 });
lpoEntrySchema.index({ doSdo: 1 });
lpoEntrySchema.index({ isDeleted: 1 });
lpoEntrySchema.index({ isDriverAccount: 1 });
lpoEntrySchema.index({ referenceDo: 1 });
lpoEntrySchema.index({ paymentMode: 1 });

// Compound indexes for common queries (includes lpoNo)
lpoEntrySchema.index({ lpoNo: 1, date: -1 });
lpoEntrySchema.index({ dieselAt: 1, date: -1 });
lpoEntrySchema.index({ truckNo: 1, referenceDo: 1 }); // For fetching NIL entries by journey

export const LPOEntry = mongoose.model<ILPOEntryDocument>('LPOEntry', lpoEntrySchema);
