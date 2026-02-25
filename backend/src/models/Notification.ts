import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  type: 'missing_total_liters' | 'missing_extra_fuel' | 'both' | 'unlinked_export_do' | 'yard_fuel_recorded' | 'truck_pending_linking' | 'truck_entry_rejected' | 'lpo_created' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  relatedModel: 'FuelRecord' | 'DeliveryOrder' | 'LPO' | 'User' | 'YardFuelDispense';
  relatedId: string;
  metadata?: {
    fuelRecordId?: string;
    doNumber?: string;
    truckNo?: string;
    destination?: string;
    truckSuffix?: string;
    missingFields?: string[];
    loadingPoint?: string; // For EXPORT DO - where truck loads cargo
    importOrExport?: string;
    deliveryOrderId?: string; // ID of the unlinked DO
    yardFuelDispenseId?: string; // ID of yard fuel dispense
    yard?: string; // Which yard
    liters?: number; // Amount of fuel
    enteredBy?: string; // Yard man who entered
    rejectionReason?: string; // Reason for rejection
    rejectedBy?: string; // Fuel order maker who rejected
    lpoNo?: string; // LPO number
    station?: string; // Fuel station
    pricePerLtr?: number; // Price per liter
    doSdo?: string; // DO/SDO number
  };
  recipients: string[]; // Array of user IDs or roles (e.g., ['admin', 'super_admin'])
  isRead: boolean;
  readBy: string[]; // Array of user IDs who have read the notification
  status: 'pending' | 'resolved' | 'dismissed';
  resolvedAt?: Date;
  resolvedBy?: string;
  createdBy: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    type: {
      type: String,
      enum: ['missing_total_liters', 'missing_extra_fuel', 'both', 'unlinked_export_do', 'yard_fuel_recorded', 'truck_pending_linking', 'truck_entry_rejected', 'lpo_created', 'info', 'warning', 'error'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    relatedModel: {
      type: String,
      enum: ['FuelRecord', 'DeliveryOrder', 'LPO', 'User', 'YardFuelDispense'],
      required: true,
    },
    relatedId: {
      type: String,
      required: true,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    recipients: {
      type: [String],
      required: true,
      default: ['admin'],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readBy: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
    },
    resolvedAt: {
      type: Date,
    },
    resolvedBy: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: String,
      required: true,
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
notificationSchema.index({ recipients: 1, status: 1, isDeleted: 1 });
notificationSchema.index({ relatedModel: 1, relatedId: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
