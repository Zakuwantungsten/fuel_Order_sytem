import mongoose, { Document, Schema, Types } from 'mongoose';

export type VisaOverstayPaymentType = 'overstay' | 'visa' | 'passport_renewal';
export type VisaOverstayPaymentStatus = 'pending' | 'confirmed' | 'cancelled';

export interface IVisaOverstayPayment extends Document {
  caseId: Types.ObjectId;
  paymentDate: Date;
  truckNo: string;
  driverName: string;
  type: VisaOverstayPaymentType;
  amount: number;
  position?: string;
  status: VisaOverstayPaymentStatus;
  /**
   * For overstay lines only:
   * 0 = first overstay (paired with visa on same row)
   * 1+ = Overstay 1, Overstay 2, …
   */
  overstaySequence?: number;
  confirmedAt?: Date;
  confirmedBy?: string;
  cancelledAt?: Date;
  cancelledBy?: string;
  cancelReason?: string;
  createdBy: string;
  updatedBy?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const visaOverstayPaymentSchema = new Schema<IVisaOverstayPayment>(
  {
    caseId: {
      type: Schema.Types.ObjectId,
      ref: 'VisaOverstayCase',
      required: true,
      index: true,
    },
    paymentDate: {
      type: Date,
      required: true,
      index: true,
    },
    truckNo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    driverName: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['overstay', 'visa', 'passport_renewal'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 50,
      min: 0,
    },
    position: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    overstaySequence: {
      type: Number,
      min: 0,
    },
    confirmedAt: { type: Date },
    confirmedBy: { type: String },
    cancelledAt: { type: Date },
    cancelledBy: { type: String },
    cancelReason: { type: String, trim: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

visaOverstayPaymentSchema.index({ paymentDate: 1, type: 1, isDeleted: 1 });
visaOverstayPaymentSchema.index({ paymentDate: 1, status: 1, isDeleted: 1 });
visaOverstayPaymentSchema.index(
  { caseId: 1, paymentDate: 1, type: 1, isDeleted: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, status: { $in: ['pending', 'confirmed'] } },
  }
);

export const VisaOverstayPayment = mongoose.model<IVisaOverstayPayment>(
  'VisaOverstayPayment',
  visaOverstayPaymentSchema
);
