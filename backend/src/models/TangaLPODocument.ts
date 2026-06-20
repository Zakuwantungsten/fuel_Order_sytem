import mongoose, { Schema, Document } from 'mongoose';
import { ITangaLPOEntry, ITangaLPODocument } from '../types';

export interface ITangaLPODocumentModel extends Omit<ITangaLPODocument, '_id'>, Document {}

const tangaLPOEntrySchema = new Schema<ITangaLPOEntry>(
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
    // Liters dispensed to the fuel record (defaults to `liters` when unset).
    dispenseLiters: {
      type: Number,
      default: null,
      min: [0, 'Dispense liters cannot be negative'],
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    originalLiters: {
      type: Number,
      default: null,
    },
    amendedAt: {
      type: Date,
      default: null,
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    linkedFuelRecordId: {
      type: String,
      trim: true,
    },
  },
  { _id: true }
);

const tangaLPODocumentSchema = new Schema<ITangaLPODocumentModel>(
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
    entries: {
      type: [tangaLPOEntrySchema],
      default: [],
    },
    total: {
      type: Number,
      default: 0,
      min: [0, 'Total cannot be negative'],
    },
    currency: {
      type: String,
      enum: ['TZS', 'USD'],
      default: 'TZS',
    },
    createdBy: {
      type: String,
      trim: true,
    },
    approvedBy: {
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
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: 'tangalpodocuments',
  }
);

// Indexes
tangaLPODocumentSchema.index({ date: 1 });
tangaLPODocumentSchema.index({ year: 1 });
tangaLPODocumentSchema.index({ isDeleted: 1 });
tangaLPODocumentSchema.index({ year: 1, isDeleted: 1 });
tangaLPODocumentSchema.index({ isDeleted: 1, date: -1 });

tangaLPODocumentSchema.pre('save', function (this: ITangaLPODocumentModel, next) {
  if (this.isModified('entries')) {
    this.total = this.entries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  }
  if (!this.year && this.date) {
    this.year = new Date(this.date).getFullYear();
  }
  next();
});

export const TangaLPODocument = mongoose.model<ITangaLPODocumentModel>(
  'TangaLPODocument',
  tangaLPODocumentSchema
);
