import mongoose, { Document, Schema } from 'mongoose';

export interface ITruckPositionInSnapshot {
  truckNo: string;
  trailerNo: string;
  currentCheckpoint: string;
  checkpointOrder: number;
  status: string;
  direction: 'GOING' | 'RETURNING' | 'UNKNOWN';
  vehicleType: string;
  departureDate?: Date;
  daysInJourney?: number;
  returnInfo?: string;
  
  // Links to existing data
  deliveryOrderId?: mongoose.Types.ObjectId;
  fuelRecordId?: mongoose.Types.ObjectId;
}

export interface IFleetGroup {
  name: string;
  tonnage?: number;
  route?: string;
  client?: string;
  trucks: ITruckPositionInSnapshot[];
}

export interface IFleetSnapshot extends Document {
  timestamp: Date;
  reportDate: Date;
  reportType: 'IMPORT' | 'NO_ORDER';
  uploadedBy: string;
  
  // File metadata
  fileName: string;
  fileSize: number;
  processedAt: Date;
  
  // Fleet data
  fleetGroups: IFleetGroup[];
  
  // Summary statistics
  totalTrucks: number;
  goingTrucks: number;
  returningTrucks: number;
  checkpointDistribution: Map<string, number>;
  
  // Audit
  isDeleted: boolean;
  deletedAt?: Date;
}

const truckPositionInSnapshotSchema = new Schema<ITruckPositionInSnapshot>({
  truckNo: { type: String, required: true, uppercase: true, trim: true },
  trailerNo: { type: String, uppercase: true, trim: true },
  currentCheckpoint: { type: String, required: true, uppercase: true },
  checkpointOrder: { type: Number, required: true },
  status: { type: String, required: true, uppercase: true },
  direction: { 
    type: String, 
    enum: ['GOING', 'RETURNING', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  vehicleType: { type: String, uppercase: true },
  departureDate: { type: Date },
  daysInJourney: { type: Number },
  returnInfo: { type: String },
  deliveryOrderId: { type: Schema.Types.ObjectId, ref: 'DeliveryOrder' },
  fuelRecordId: { type: Schema.Types.ObjectId, ref: 'FuelRecord' },
}, { _id: false });

const fleetGroupSchema = new Schema<IFleetGroup>({
  name: { type: String, required: true },
  tonnage: { type: Number },
  route: { type: String },
  client: { type: String },
  trucks: { type: [truckPositionInSnapshotSchema], default: [] },
}, { _id: false });

const fleetSnapshotSchema = new Schema<IFleetSnapshot>(
  {
    timestamp: {
      type: Date,
      required: true,
      index: true,
    },
    reportDate: {
      type: Date,
      required: true,
      index: true,
    },
    reportType: {
      type: String,
      required: true,
      enum: ['IMPORT', 'NO_ORDER'],
      index: true,
    },
    uploadedBy: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    processedAt: {
      type: Date,
      required: true,
    },
    fleetGroups: {
      type: [fleetGroupSchema],
      default: [],
    },
    totalTrucks: {
      type: Number,
      required: true,
      default: 0,
    },
    goingTrucks: {
      type: Number,
      default: 0,
    },
    returningTrucks: {
      type: Number,
      default: 0,
    },
    checkpointDistribution: {
      type: Map,
      of: Number,
      default: new Map(),
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
fleetSnapshotSchema.index({ timestamp: -1, isDeleted: 1 });
fleetSnapshotSchema.index({ reportDate: -1, reportType: 1 });
fleetSnapshotSchema.index({ uploadedBy: 1, timestamp: -1 });

export const FleetSnapshot = mongoose.model<IFleetSnapshot>('FleetSnapshot', fleetSnapshotSchema);
