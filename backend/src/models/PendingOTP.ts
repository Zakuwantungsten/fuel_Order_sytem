import mongoose, { Schema, Document } from 'mongoose';

export interface IPendingOTP extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'email' | 'sms' | 'phone_verify';
  hashedOTP: string;
  expiresAt: Date;
  createdAt: Date;
}

const PendingOTPSchema = new Schema<IPendingOTP>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['email', 'sms', 'phone_verify'],
      required: true,
    },
    hashedOTP: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index — MongoDB auto-deletes when expiresAt is reached
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound index: one pending OTP per user+type
PendingOTPSchema.index({ userId: 1, type: 1 });

export const PendingOTP = mongoose.model<IPendingOTP>('PendingOTP', PendingOTPSchema);
export default PendingOTP;
