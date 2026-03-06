/**
 * KnownDevice — aggregated device profiles derived from LoginActivity.
 * Tracks unique browser+OS combinations per user with trust/block status.
 */
import mongoose, { Schema, Document } from 'mongoose';

export interface IKnownDeviceDocument extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  firstSeen: Date;
  lastSeen: Date;
  lastIP: string;
  sessionCount: number;
  trusted: boolean;
  blocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const KnownDeviceSchema = new Schema<IKnownDeviceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    username: { type: String, required: true },
    browser: { type: String, required: true },
    os: { type: String, required: true },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown',
    },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
    lastIP: { type: String, default: 'unknown' },
    sessionCount: { type: Number, default: 1 },
    trusted: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Unique per user+browser+os combination
KnownDeviceSchema.index({ userId: 1, browser: 1, os: 1 }, { unique: true });
KnownDeviceSchema.index({ lastSeen: -1 });

/**
 * Upsert a device record from login data.
 * Called during login to keep device inventory up-to-date.
 */
KnownDeviceSchema.statics.recordDevice = async function (
  userId: string,
  username: string,
  browser: string,
  os: string,
  deviceType: string,
  ip: string,
) {
  return this.findOneAndUpdate(
    { userId, browser, os },
    {
      $set: { lastSeen: new Date(), lastIP: ip, deviceType, username },
      $inc: { sessionCount: 1 },
      $setOnInsert: { firstSeen: new Date(), trusted: false, blocked: false },
    },
    { upsert: true, new: true },
  );
};

export const KnownDevice = mongoose.model<IKnownDeviceDocument>('KnownDevice', KnownDeviceSchema);
export default KnownDevice;
