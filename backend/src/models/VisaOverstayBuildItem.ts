import mongoose, { Document, Schema, Types } from 'mongoose';

export type VisaOverstayBuildSource = 'due_date' | 'cycle' | 'reserve_raw' | 'late_add';
export type VisaOverstayBuildStatus =
  | 'pending'
  | 'confirmed'
  | 'waiting'
  | 'crossed'
  | 'dismissed';

export interface IVisaOverstayBuildItem extends Document {
  buildDate: Date;
  caseId: Types.ObjectId;
  truckNo: string;
  driverName: string;
  passportDueDate: Date;
  position?: string;
  source: VisaOverstayBuildSource;
  /** Case status before being held in build preview (for rebuild restore). */
  heldFromStatus?: 'intake' | 'waiting_due' | 'active';
  /** Suggested / chosen lines */
  includeOverstay: boolean;
  includeVisa: boolean;
  overstayAmount: number;
  visaAmount: number;
  status: VisaOverstayBuildStatus;
  notes?: string;
  createdBy: string;
  updatedBy?: string;
  resolvedAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const visaOverstayBuildItemSchema = new Schema<IVisaOverstayBuildItem>(
  {
    buildDate: { type: Date, required: true, index: true },
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'VisaOverstayCase',
      required: true,
      index: true,
    },
    truckNo: { type: String, required: true, trim: true, uppercase: true },
    driverName: { type: String, required: true, trim: true },
    passportDueDate: { type: Date, required: true },
    position: { type: String, trim: true },
    source: {
      type: String,
      enum: ['due_date', 'cycle', 'reserve_raw', 'late_add'],
      required: true,
    },
    heldFromStatus: {
      type: String,
      enum: ['intake', 'waiting_due', 'active'],
    },
    includeOverstay: { type: Boolean, default: true },
    includeVisa: { type: Boolean, default: false },
    overstayAmount: { type: Number, required: true, default: 50 },
    visaAmount: { type: Number, required: true, default: 50 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'waiting', 'crossed', 'dismissed'],
      default: 'pending',
      index: true,
    },
    notes: { type: String, trim: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
    resolvedAt: { type: Date },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

visaOverstayBuildItemSchema.index(
  { buildDate: 1, caseId: 1, status: 1 },
  { name: 'build_case_status' }
);

export const VisaOverstayBuildItem = mongoose.model<IVisaOverstayBuildItem>(
  'VisaOverstayBuildItem',
  visaOverstayBuildItemSchema
);
