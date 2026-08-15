import mongoose, { Document, Schema, Types } from 'mongoose';

export type VisaOverstayCaseStatus = 'intake' | 'waiting_due' | 'active' | 'crossed' | 'cancelled';
export type VisaOverstayPayoutRule = 'two_days_before' | 'due_date';

export interface IVisaOverstayCase extends Document {
  truckNo: string;
  driverName: string;
  passportDueDate: Date;
  position?: string;
  dateSubmitted: Date;
  status: VisaOverstayCaseStatus;
  /** Mines inland: pay 2 days before due. Whisky→border: pay on due date. */
  payoutRule: VisaOverstayPayoutRule;
  firstPaidAt?: Date;
  lastOverstayPaidAt?: Date;
  lastVisaPaidAt?: Date;
  crossedAt?: Date;
  crossedBy?: string;
  /** How the case was marked crossed */
  crossSource?: 'intake' | 'settlement' | 'build';
  daysSinceLastOverstay?: number;
  extraDays?: number;
  /** Settlement $ — intake border: max(0, daysToDue − 10)×$5; settlement: (daysSinceLast − grace)×$5 */
  extraAmount?: number;
  notes?: string;
  createdBy: string;
  updatedBy?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const visaOverstayCaseSchema = new Schema<IVisaOverstayCase>(
  {
    truckNo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    driverName: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    passportDueDate: {
      type: Date,
      required: true,
      index: true,
    },
    position: {
      type: String,
      trim: true,
    },
    dateSubmitted: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['intake', 'waiting_due', 'active', 'crossed', 'cancelled'],
      default: 'intake',
      index: true,
    },
    payoutRule: {
      type: String,
      enum: ['two_days_before', 'due_date'],
      default: 'two_days_before',
    },
    firstPaidAt: { type: Date },
    lastOverstayPaidAt: { type: Date },
    lastVisaPaidAt: { type: Date },
    crossedAt: { type: Date },
    crossedBy: { type: String },
    crossSource: {
      type: String,
      enum: ['intake', 'settlement', 'build'],
    },
    daysSinceLastOverstay: { type: Number },
    extraDays: { type: Number },
    extraAmount: { type: Number },
    notes: { type: String, trim: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

visaOverstayCaseSchema.index({ status: 1, passportDueDate: 1, isDeleted: 1 });
visaOverstayCaseSchema.index({ truckNo: 1, status: 1, isDeleted: 1 });
visaOverstayCaseSchema.index({ crossedAt: 1, isDeleted: 1 });

export const VisaOverstayCase = mongoose.model<IVisaOverstayCase>(
  'VisaOverstayCase',
  visaOverstayCaseSchema
);

export type VisaOverstayCaseId = Types.ObjectId;
