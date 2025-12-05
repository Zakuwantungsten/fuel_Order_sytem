import mongoose, { Schema, Document } from 'mongoose';
import { IDeliveryOrder, IDeliveryOrderEditHistory } from '../types';

export interface IDeliveryOrderDocument extends IDeliveryOrder, Document {}

// Sub-schema for edit history
const editHistorySchema = new Schema<IDeliveryOrderEditHistory>(
  {
    editedAt: {
      type: Date,
      required: true,
    },
    editedBy: {
      type: String,
      required: true,
    },
    changes: [{
      field: String,
      oldValue: Schema.Types.Mixed,
      newValue: Schema.Types.Mixed,
    }],
    reason: {
      type: String,
    },
  },
  { _id: false }
);

const deliveryOrderSchema = new Schema<IDeliveryOrderDocument>(
  {
    sn: {
      type: Number,
      required: [true, 'Serial number is required'],
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    importOrExport: {
      type: String,
      enum: ['IMPORT', 'EXPORT'],
      required: [true, 'Import/Export type is required'],
    },
    doType: {
      type: String,
      enum: ['DO', 'SDO'],
      required: [true, 'DO type is required'],
    },
    doNumber: {
      type: String,
      required: [true, 'DO number is required'],
      unique: true,
      trim: true,
    },
    invoiceNos: {
      type: String,
      trim: true,
    },
    clientName: {
      type: String,
      required: [true, 'Client name is required'],
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      trim: true,
    },
    trailerNo: {
      type: String,
      required: [true, 'Trailer number is required'],
      trim: true,
    },
    containerNo: {
      type: String,
      trim: true,
    },
    borderEntryDRC: {
      type: String,
      trim: true,
    },
    loadingPoint: {
      type: String,
      required: [true, 'Loading point is required'],
      trim: true,
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    haulier: {
      type: String,
      trim: true,
    },
    driverName: {
      type: String,
      trim: true,
    },
    tonnages: {
      type: Number,
      required: [true, 'Tonnage is required'],
      min: [0, 'Tonnage cannot be negative'],
    },
    ratePerTon: {
      type: Number,
      required: [true, 'Rate per ton is required'],
      min: [0, 'Rate cannot be negative'],
    },
    rate: {
      type: String,
      trim: true,
    },
    cargoType: {
      type: String,
      enum: ['loosecargo', 'container'],
      default: 'loosecargo',
      trim: true,
    },
    rateType: {
      type: String,
      enum: ['per_ton', 'fixed_total'],
      default: 'per_ton',
    },
    totalAmount: {
      type: Number,
      min: [0, 'Total amount cannot be negative'],
    },
    // Status fields
    status: {
      type: String,
      enum: ['active', 'cancelled'],
      default: 'active',
    },
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
    // Edit history tracking
    editHistory: [editHistorySchema],
    lastEditedAt: {
      type: Date,
    },
    lastEditedBy: {
      type: String,
      trim: true,
    },
    // Soft delete fields
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
        
        // Compute totalAmount on the fly if not stored
        if (!ret.totalAmount) {
          if (ret.rateType === 'fixed_total') {
            ret.totalAmount = ret.ratePerTon || 0;
          } else {
            ret.totalAmount = (ret.tonnages || 0) * (ret.ratePerTon || 0);
          }
        }
        
        return ret;
      },
    },
  }
);

// Pre-save middleware to compute/validate totalAmount
deliveryOrderSchema.pre('save', function(next) {
  if (this.rateType === 'per_ton') {
    this.totalAmount = (this.tonnages || 0) * (this.ratePerTon || 0);
  } else if (this.rateType === 'fixed_total') {
    this.totalAmount = this.ratePerTon || 0;
    // For fixed total, set tonnages to 0 if not provided
    if (!this.tonnages) {
      this.tonnages = 0;
    }
  } else {
    // Default to per_ton calculation
    this.totalAmount = (this.tonnages || 0) * (this.ratePerTon || 0);
  }
  next();
});

// Indexes
// Note: doNumber already has a unique index from schema definition
deliveryOrderSchema.index({ truckNo: 1 });
deliveryOrderSchema.index({ date: 1 });
deliveryOrderSchema.index({ importOrExport: 1 });
deliveryOrderSchema.index({ isDeleted: 1 });
deliveryOrderSchema.index({ clientName: 1 });
deliveryOrderSchema.index({ destination: 1 });
deliveryOrderSchema.index({ status: 1 });
deliveryOrderSchema.index({ isCancelled: 1 });

// Compound indexes for common queries
deliveryOrderSchema.index({ truckNo: 1, date: -1 });
deliveryOrderSchema.index({ date: -1, importOrExport: 1 });
deliveryOrderSchema.index({ isDeleted: 1, isCancelled: 1 });

export const DeliveryOrder = mongoose.model<IDeliveryOrderDocument>(
  'DeliveryOrder',
  deliveryOrderSchema
);
