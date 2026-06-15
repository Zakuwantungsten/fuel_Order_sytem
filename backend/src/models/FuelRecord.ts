import mongoose, { Schema, Document } from 'mongoose';
import { IFuelRecord } from '../types';

export interface IFuelRecordDocument extends IFuelRecord, Document {}

const MONTH_NUMBERS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

/**
 * Derive the canonical "YYYY-MM" key for a fuel record. Dates are stored as
 * strings in two historical formats ("2026-01-15" from the UI and "7-Jan-2026"
 * from Excel imports), which forced the month filter in getAllFuelRecords to
 * use unindexable regexes. monthKey gives those queries an indexed equality.
 */
export function computeMonthKey(date?: string | null, month?: string | null): string | null {
  if (date) {
    const iso = date.match(/^(\d{4})-(\d{2})-\d{2}/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const dmy = date.match(/^\d{1,2}-([A-Za-z]{3,})-(\d{4})$/);
    if (dmy) {
      const num = MONTH_NUMBERS[dmy[1].slice(0, 3).toLowerCase()];
      if (num) return `${dmy[2]}-${num}`;
    }
  }
  if (month) {
    // "February 2026" / "Feb 2026"
    const parts = month.trim().split(/\s+/);
    if (parts.length === 2 && /^\d{4}$/.test(parts[1])) {
      const num = MONTH_NUMBERS[parts[0].slice(0, 3).toLowerCase()];
      if (num) return `${parts[1]}-${num}`;
    }
  }
  return null;
}

const fuelRecordSchema = new Schema<IFuelRecordDocument>(
  {
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    month: {
      type: String,
      trim: true,
    },
    // Canonical "YYYY-MM" derived from date/month — kept by the save/insertMany
    // hooks below and backfilled at boot (see scripts/backfillFuelMonthKeys.ts).
    monthKey: {
      type: String,
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      trim: true,
    },
    goingDo: {
      type: String,
      required: [true, 'Going DO is required'],
      trim: true,
    },
    returnDo: {
      type: String,
      trim: true,
    },
    start: {
      type: String,
      required: [true, 'Start location is required'],
      trim: true,
    },
    from: {
      type: String,
      required: [true, 'From location is required'],
      trim: true,
    },
    to: {
      type: String,
      required: [true, 'To location is required'],
      trim: true,
    },
    totalLts: {
      type: Number,
      required: false, // Changed to allow null for pending admin configuration
      min: [0, 'Total liters cannot be negative'],
      default: null,
    },
    extra: {
      type: Number,
      required: false, // Changed to allow null for pending admin configuration
      default: null,
    },
    // Journey status and queue management
    journeyStatus: {
      type: String,
      enum: ['queued', 'active', 'completed', 'cancelled'],
      default: 'active',
      required: true,
    },
    queueOrder: {
      type: Number,
      required: false,
    },
    activatedAt: {
      type: Date,
      required: false,
    },
    completedAt: {
      type: Date,
      required: false,
    },
    estimatedStartDate: {
      type: String,
      required: false,
    },
    previousJourneyId: {
      type: String,
      required: false,
    },
    // Lock status for pending configurations
    isLocked: {
      type: Boolean,
      default: false,
    },
    pendingConfigReason: {
      type: String,
      enum: ['missing_total_liters', 'missing_extra_fuel', 'both', null],
      default: null,
    },
    // Yard allocations
    mmsaYard: {
      type: Number,
      default: 0,
    },
    tangaYard: {
      type: Number,
      default: 0,
    },
    darYard: {
      type: Number,
      default: 0,
    },
    // Going fuel
    darGoing: {
      type: Number,
      default: 0,
    },
    moroGoing: {
      type: Number,
      default: 0,
    },
    mbeyaGoing: {
      type: Number,
      default: 0,
    },
    tdmGoing: {
      type: Number,
      default: 0,
    },
    zambiaGoing: {
      type: Number,
      default: 0,
    },
    congoFuel: {
      type: Number,
      default: 0,
    },
    // Return fuel
    zambiaReturn: {
      type: Number,
      default: 0,
    },
    tundumaReturn: {
      type: Number,
      default: 0,
    },
    mbeyaReturn: {
      type: Number,
      default: 0,
    },
    moroReturn: {
      type: Number,
      default: 0,
    },
    darReturn: {
      type: Number,
      default: 0,
    },
    tangaReturn: {
      type: Number,
      default: 0,
    },
    balance: {
      type: Number,
      required: [true, 'Balance is required'],
    },
    // Original going journey locations (stored before EXPORT DO changes them)
    originalGoingFrom: {
      type: String,
      trim: true,
    },
    originalGoingTo: {
      type: String,
      trim: true,
    },
    // Cancellation fields
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
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    // Edit locks are NOT stored here — they live in the dedicated `EditLock`
    // collection (see services/lockService.ts). The `editLock` field on the
    // response type is populated at read-time via attachLocks().
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
fuelRecordSchema.index({ truckNo: 1 });
fuelRecordSchema.index({ date: 1 });
fuelRecordSchema.index({ goingDo: 1 });
fuelRecordSchema.index({ returnDo: 1 });
fuelRecordSchema.index({ isDeleted: 1 });
fuelRecordSchema.index({ month: 1 });
fuelRecordSchema.index({ journeyStatus: 1 });

// Compound indexes for common queries
fuelRecordSchema.index({ truckNo: 1, date: -1 });
fuelRecordSchema.index({ date: -1, isDeleted: 1 });
fuelRecordSchema.index({ truckNo: 1, journeyStatus: 1, queueOrder: 1 }); // For queue management
fuelRecordSchema.index({ truckNo: 1, journeyStatus: 1, isDeleted: 1 }); // For finding active/queued journeys
// Index for yard fuel auto-linking queries (optimized for finding active records)
fuelRecordSchema.index({ truckNo: 1, date: -1, isDeleted: 1, isCancelled: 1 });
// Covers the Fuel Records list's default view: month equality + soft-delete flag,
// sorted by date desc
fuelRecordSchema.index({ monthKey: 1, isDeleted: 1, date: -1 });

// Dashboard stats/chart queries filter on isDeleted + isCancelled without truckNo.
// Without these, { isCancelled: { $ne: true } } forces a collection scan since the
// existing compound indexes all start with truckNo and can't be used here.
fuelRecordSchema.index({ isDeleted: 1, isCancelled: 1, date: -1 });        // chart-data date range + recent activity sort
fuelRecordSchema.index({ isDeleted: 1, isCancelled: 1, journeyStatus: 1 }); // active-trips countDocuments
fuelRecordSchema.index({ isDeleted: 1, isCancelled: 1, month: 1 });         // stats month-label filter

// Keep monthKey in sync whenever a record is created or its date/month changes.
fuelRecordSchema.pre('save', function (this: IFuelRecordDocument, next) {
  if (this.isNew || this.isModified('date') || this.isModified('month') || !this.monthKey) {
    const key = computeMonthKey(this.date, this.month);
    if (key) this.monthKey = key;
  }
  next();
});

// findOneAndUpdate / findByIdAndUpdate bypass the save hook — recompute the
// monthKey whenever such an update touches date or month (covers the fuel
// record update endpoint, DO-driven updates, and the Excel import upsert).
fuelRecordSchema.pre('findOneAndUpdate', function (next) {
  const update: any = this.getUpdate();
  if (update && !Array.isArray(update)) {
    const target = update.$set ?? update;
    if (target.date || target.month) {
      const key = computeMonthKey(target.date, target.month);
      if (key) target.monthKey = key;
    }
  }
  next();
});

// updateOne (used by the Excel import upsert) is a separate operation from
// findOneAndUpdate and does NOT trigger the hook above. Mirror the same logic
// so that any updateOne that sets date or month also keeps monthKey in sync.
fuelRecordSchema.pre('updateOne', function (next) {
  const update: any = this.getUpdate();
  if (update && !Array.isArray(update)) {
    const target = update.$set ?? update;
    if (target.date || target.month) {
      const key = computeMonthKey(target.date, target.month);
      if (key) target.monthKey = key;
    }
  }
  next();
});

fuelRecordSchema.pre('insertMany', function (next: (err?: Error) => void, docs: any[]) {
  if (Array.isArray(docs)) {
    for (const doc of docs) {
      if (doc && !doc.monthKey) {
        const key = computeMonthKey(doc.date, doc.month);
        if (key) doc.monthKey = key;
      }
    }
  }
  next();
});

export const FuelRecord = mongoose.model<IFuelRecordDocument>('FuelRecord', fuelRecordSchema);
