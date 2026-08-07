import mongoose, { Schema, Document } from 'mongoose';

export type PendingDoHistoryKind = 'going' | 'return';
export type PendingDoHistoryStatus = 'pending' | 'assigned';

export interface IPendingDoHistory {
  kind: PendingDoHistoryKind;
  pendingDo: string;
  truckNo: string;
  fuelRecordId: mongoose.Types.ObjectId;
  deliveryOrderId?: mongoose.Types.ObjectId | null;
  realDoNumber?: string | null;
  status: PendingDoHistoryStatus;
  /** When the pending DO was first assigned to the truck */
  pendingAt: Date;
  /** When the pending DO was replaced by a real DO */
  promotedAt?: Date | null;
  createdBy?: string | null;
  promotedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPendingDoHistoryDocument extends IPendingDoHistory, Document {}

const pendingDoHistorySchema = new Schema<IPendingDoHistoryDocument>(
  {
    kind: {
      type: String,
      enum: ['going', 'return'],
      required: true,
    },
    pendingDo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    truckNo: {
      type: String,
      required: true,
      trim: true,
    },
    fuelRecordId: {
      type: Schema.Types.ObjectId,
      ref: 'FuelRecord',
      required: true,
    },
    deliveryOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'DeliveryOrder',
      default: null,
    },
    realDoNumber: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'assigned'],
      required: true,
      default: 'pending',
    },
    pendingAt: {
      type: Date,
      required: true,
    },
    promotedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      trim: true,
      default: null,
    },
    promotedBy: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true }
);

pendingDoHistorySchema.index({ status: 1, promotedAt: -1 });
pendingDoHistorySchema.index({ fuelRecordId: 1, kind: 1 });
pendingDoHistorySchema.index({ pendingDo: 1 });
pendingDoHistorySchema.index({ truckNo: 1, status: 1 });
pendingDoHistorySchema.index({ deliveryOrderId: 1 });
pendingDoHistorySchema.index({ realDoNumber: 1 });

export const PendingDoHistory = mongoose.model<IPendingDoHistoryDocument>(
  'PendingDoHistory',
  pendingDoHistorySchema
);
