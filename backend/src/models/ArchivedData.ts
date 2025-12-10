import mongoose, { Schema, Document } from 'mongoose';

/**
 * Archived collections for data older than 6 months
 * These mirror the original schemas but are separate collections for performance
 */

// ============ ARCHIVED FUEL RECORDS ============
export interface IArchivedFuelRecord {
  originalId: mongoose.Types.ObjectId; // Reference to original ID
  date: string;
  month?: string;
  truckNo: string;
  goingDo: string;
  returnDo?: string;
  start: string;
  from: string;
  to: string;
  totalLts?: number;
  extra?: number;
  // All other fuel record fields...
  [key: string]: any;
  archivedAt: Date;
  archivedReason: string;
}

const archivedFuelRecordSchema = new Schema<IArchivedFuelRecord>(
  {
    originalId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    date: String,
    month: String,
    truckNo: { type: String, index: true },
    goingDo: String,
    returnDo: String,
    start: String,
    from: String,
    to: String,
    archivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    archivedReason: {
      type: String,
      default: 'Automated archival - data older than 6 months',
    },
  },
  {
    strict: false, // Allow all fields from original FuelRecord
    timestamps: false,
  }
);

// Compound indexes for archived queries
archivedFuelRecordSchema.index({ date: -1 });
archivedFuelRecordSchema.index({ truckNo: 1, date: -1 });
archivedFuelRecordSchema.index({ archivedAt: -1 });

// ============ ARCHIVED LPO ENTRIES ============
export interface IArchivedLPOEntry {
  originalId: mongoose.Types.ObjectId;
  lpoNo: string;
  date: string;
  truckNo: string;
  dieselAt: string;
  doSdo: string;
  [key: string]: any;
  archivedAt: Date;
  archivedReason: string;
}

const archivedLPOEntrySchema = new Schema<IArchivedLPOEntry>(
  {
    originalId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    lpoNo: { type: String },
    date: String,
    truckNo: { type: String, index: true },
    dieselAt: String,
    doSdo: String,
    archivedAt: {
      type: Date,
      default: Date.now,
    },
    archivedReason: {
      type: String,
      default: 'Automated archival - data older than 6 months',
    },
  },
  {
    strict: false,
    timestamps: false,
  }
);

archivedLPOEntrySchema.index({ date: -1 });
archivedLPOEntrySchema.index({ lpoNo: 1 });
archivedLPOEntrySchema.index({ archivedAt: -1 });
archivedLPOEntrySchema.index({ truckNo: 1, date: -1 });

// ============ ARCHIVED LPO SUMMARIES ============
export interface IArchivedLPOSummary {
  originalId: mongoose.Types.ObjectId;
  lpoNo: string;
  date: string;
  station: string;
  year: number;
  [key: string]: any;
  archivedAt: Date;
  archivedReason: string;
}

const archivedLPOSummarySchema = new Schema<IArchivedLPOSummary>(
  {
    originalId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    lpoNo: { type: String },
    date: String,
    station: String,
    year: { type: Number, index: true },
    archivedAt: {
      type: Date,
      default: Date.now,
    },
    archivedReason: {
      type: String,
      default: 'Automated archival - data older than 6 months',
    },
  },
  {
    strict: false,
    timestamps: false,
  }
);

archivedLPOSummarySchema.index({ date: -1 });
archivedLPOSummarySchema.index({ lpoNo: 1 });
archivedLPOSummarySchema.index({ station: 1, year: 1 });
archivedLPOSummarySchema.index({ archivedAt: -1 });

// ============ ARCHIVED YARD FUEL DISPENSES ============
export interface IArchivedYardFuelDispense {
  originalId: mongoose.Types.ObjectId;
  date: string;
  truckNo: string;
  yard: string;
  [key: string]: any;
  archivedAt: Date;
  archivedReason: string;
}

const archivedYardFuelDispenseSchema = new Schema<IArchivedYardFuelDispense>(
  {
    originalId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    date: String,
    truckNo: { type: String, index: true },
    yard: String,
    archivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    archivedReason: {
      type: String,
      default: 'Automated archival - data older than 6 months',
    },
  },
  {
    strict: false,
    timestamps: false,
  }
);

archivedYardFuelDispenseSchema.index({ date: -1 });
archivedYardFuelDispenseSchema.index({ yard: 1, date: -1 });
archivedYardFuelDispenseSchema.index({ archivedAt: -1 });

// ============ ARCHIVED AUDIT LOGS ============
export interface IArchivedAuditLog {
  originalId: mongoose.Types.ObjectId;
  timestamp: Date;
  action: string;
  resourceType: string;
  username: string;
  [key: string]: any;
  archivedAt: Date;
  archivedReason: string;
}

const archivedAuditLogSchema = new Schema<IArchivedAuditLog>(
  {
    originalId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    timestamp: { type: Date, index: true },
    action: String,
    resourceType: String,
    username: { type: String, index: true },
    archivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    archivedReason: {
      type: String,
      default: 'Automated archival - data older than 12 months',
    },
  },
  {
    strict: false,
    timestamps: false,
  }
);

archivedAuditLogSchema.index({ timestamp: -1 });
archivedAuditLogSchema.index({ username: 1, timestamp: -1 });
archivedAuditLogSchema.index({ archivedAt: -1 });

// ============ ARCHIVAL METADATA ============
export interface IArchivalMetadata extends Document {
  collectionName: string;
  archivalDate: Date;
  cutoffDate: Date; // Data before this date was archived
  recordsArchived: number;
  status: 'in_progress' | 'completed' | 'failed';
  initiatedBy: string;
  error?: string;
  duration?: number; // milliseconds
  completedAt?: Date;
}

const archivalMetadataSchema = new Schema<IArchivalMetadata>(
  {
    collectionName: {
      type: String,
      required: true,
      index: true,
    },
    archivalDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    cutoffDate: {
      type: Date,
      required: true,
      index: true,
    },
    recordsArchived: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed'],
      default: 'in_progress',
      index: true,
    },
    initiatedBy: {
      type: String,
      required: true,
    },
    error: String,
    duration: Number,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

archivalMetadataSchema.index({ collectionName: 1, archivalDate: -1 });

// Export models
export const ArchivedFuelRecord = mongoose.model('ArchivedFuelRecord', archivedFuelRecordSchema);
export const ArchivedLPOEntry = mongoose.model('ArchivedLPOEntry', archivedLPOEntrySchema);
export const ArchivedLPOSummary = mongoose.model('ArchivedLPOSummary', archivedLPOSummarySchema);
export const ArchivedYardFuelDispense = mongoose.model('ArchivedYardFuelDispense', archivedYardFuelDispenseSchema);
export const ArchivedAuditLog = mongoose.model('ArchivedAuditLog', archivedAuditLogSchema);
export const ArchivalMetadata = mongoose.model<IArchivalMetadata>('ArchivalMetadata', archivalMetadataSchema);
