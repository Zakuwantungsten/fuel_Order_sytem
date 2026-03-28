import mongoose, { Schema, Document } from 'mongoose';

export interface IPushSubscription extends Document {
  userId: string;
  role: string;
  platform: 'web' | 'expo';
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  expoPushToken: string;
  createdAt: Date;
  updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: String, required: true, index: true },
    role:   { type: String, required: true, index: true },
    platform: { type: String, enum: ['web', 'expo'], default: 'web' },
    endpoint: { type: String, sparse: true, unique: true },
    keys: {
      p256dh: { type: String },
      auth:   { type: String },
    },
    expoPushToken: { type: String, sparse: true, unique: true },
  },
  { timestamps: true }
);

export const PushSubscription = mongoose.model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);
