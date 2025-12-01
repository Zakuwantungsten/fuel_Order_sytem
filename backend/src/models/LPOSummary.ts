import mongoose, { Schema, Document } from 'mongoose';
import { ILPOSummary, ILPODetail } from '../types';

export interface ILPOSummaryDocument extends ILPOSummary, Document {}

const lpoDetailSchema = new Schema<ILPODetail>(
  {
    doNo: {
      type: String,
      required: [true, 'DO number is required'],
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
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
      min: [0, 'Amount cannot be negative'],
    },
    dest: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    // Amendment tracking - stores original value if liters were changed
    originalLiters: {
      type: Number,
      default: null,
    },
    amendedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

const lpoSummarySchema = new Schema<ILPOSummaryDocument>(
  {
    lpoNo: {
      type: String,
      required: [true, 'LPO number is required'],
      unique: true,
      trim: true,
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
    },
    station: {
      type: String,
      required: [true, 'Station is required'],
      trim: true,
    },
    orderOf: {
      type: String,
      required: [true, 'Order of is required'],
      trim: true,
    },
    entries: {
      type: [lpoDetailSchema],
      required: [true, 'Entries are required'],
      validate: {
        validator: function (entries: ILPODetail[]) {
          return entries.length > 0;
        },
        message: 'LPO must have at least one entry',
      },
    },
    total: {
      type: Number,
      required: [true, 'Total is required'],
      min: [0, 'Total cannot be negative'],
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
// Note: lpoNo already has a unique index from schema definition
lpoSummarySchema.index({ date: 1 });
lpoSummarySchema.index({ station: 1 });
lpoSummarySchema.index({ isDeleted: 1 });
lpoSummarySchema.index({ year: 1 });

// Compound indexes
lpoSummarySchema.index({ station: 1, date: -1 });
lpoSummarySchema.index({ year: 1, lpoNo: 1 });
lpoSummarySchema.index({ year: 1, isDeleted: 1 });

// Pre-save hook to calculate total and extract year from date
lpoSummarySchema.pre('save', function (next) {
  if (this.isModified('entries')) {
    this.total = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
  }
  // Extract year from date if not set
  if (!this.year && this.date) {
    const dateObj = new Date(this.date);
    this.year = dateObj.getFullYear();
  }
  next();
});

export const LPOSummary = mongoose.model<ILPOSummaryDocument>('LPOSummary', lpoSummarySchema);
