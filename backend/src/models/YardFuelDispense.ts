import mongoose, { Schema, Document } from 'mongoose';
import { IYardFuelDispense } from '../types';

export interface IYardFuelDispenseDocument extends IYardFuelDispense, Document {}

const yardFuelDispenseSchema = new Schema<IYardFuelDispenseDocument>(
  {
    date: {
      type: String,
      required: [true, 'Date is required'],
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
    yard: {
      type: String,
      enum: ['DAR YARD', 'TANGA YARD', 'MMSA YARD'],
      required: [true, 'Yard is required'],
    },
    enteredBy: {
      type: String,
      required: [true, 'Entered by is required'],
      trim: true,
    },
    timestamp: {
      type: Date,
      required: [true, 'Timestamp is required'],
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
    linkedFuelRecordId: {
      type: String,
      trim: true,
    },
    linkedDONumber: {
      type: String,
      trim: true,
    },
    autoLinked: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'linked', 'manual'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    rejectedBy: {
      type: String,
      trim: true,
    },
    rejectedAt: {
      type: Date,
    },
    rejectionResolved: {
      type: Boolean,
      default: false,
    },
    rejectionResolvedAt: {
      type: Date,
    },
    rejectionResolvedBy: {
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
    history: [{
      action: {
        type: String,
        enum: ['created', 'updated', 'rejected', 're-entered', 'linked'],
        required: true,
      },
      performedBy: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      details: {
        type: Schema.Types.Mixed,
      },
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes
yardFuelDispenseSchema.index({ truckNo: 1 });
yardFuelDispenseSchema.index({ date: 1 });
yardFuelDispenseSchema.index({ yard: 1 });
yardFuelDispenseSchema.index({ status: 1 });
yardFuelDispenseSchema.index({ linkedFuelRecordId: 1 });
yardFuelDispenseSchema.index({ isDeleted: 1 });

// Compound indexes for common queries
yardFuelDispenseSchema.index({ yard: 1, date: -1 });
yardFuelDispenseSchema.index({ truckNo: 1, date: -1 });
yardFuelDispenseSchema.index({ status: 1, date: -1 });

export const YardFuelDispense = mongoose.model<IYardFuelDispenseDocument>(
  'YardFuelDispense',
  yardFuelDispenseSchema
);
