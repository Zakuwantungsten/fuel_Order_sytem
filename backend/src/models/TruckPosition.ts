import mongoose, { Document, Schema } from 'mongoose';

export interface ITruckPosition extends Document {
  // Identification
  truckNo: string;
  trailerNo: string;
  
  // Position
  currentCheckpoint: string;
  checkpointOrder: number;
  
  // Status
  status: string;
  direction: 'GOING' | 'RETURNING' | 'UNKNOWN';
  vehicleType: string;
  
  // Journey info
  departureDate?: Date;
  daysInJourney?: number;
  returnInfo?: string;
  
  // Fleet association
  fleetGroup: string;
  fleetGroupId: mongoose.Types.ObjectId;
  
  // Linked data
  deliveryOrderId?: mongoose.Types.ObjectId;
  fuelRecordId?: mongoose.Types.ObjectId;
  
  // Timestamp
  reportDate: Date;
  snapshotId: mongoose.Types.ObjectId;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
}

const truckPositionSchema = new Schema<ITruckPosition>(
  {
    truckNo: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    trailerNo: {
      type: String,
      uppercase: true,
      trim: true,
    },
    currentCheckpoint: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    checkpointOrder: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      uppercase: true,
    },
    direction: {
      type: String,
      enum: ['GOING', 'RETURNING', 'UNKNOWN'],
      default: 'UNKNOWN',
      index: true,
    },
    vehicleType: {
      type: String,
      uppercase: true,
    },
    departureDate: {
      type: Date,
    },
    daysInJourney: {
      type: Number,
    },
    returnInfo: {
      type: String,
    },
    fleetGroup: {
      type: String,
      required: true,
      index: true,
    },
    fleetGroupId: {
      type: Schema.Types.ObjectId,
      ref: 'FleetSnapshot',
      required: true,
    },
    deliveryOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'DeliveryOrder',
    },
    fuelRecordId: {
      type: Schema.Types.ObjectId,
      ref: 'FuelRecord',
    },
    reportDate: {
      type: Date,
      required: true,
      index: true,
    },
    snapshotId: {
      type: Schema.Types.ObjectId,
      ref: 'FleetSnapshot',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
truckPositionSchema.index({ snapshotId: 1, currentCheckpoint: 1 });
truckPositionSchema.index({ truckNo: 1, reportDate: -1 });
truckPositionSchema.index({ currentCheckpoint: 1, direction: 1 });
truckPositionSchema.index({ reportDate: -1, direction: 1 });

export const TruckPosition = mongoose.model<ITruckPosition>('TruckPosition', truckPositionSchema);
