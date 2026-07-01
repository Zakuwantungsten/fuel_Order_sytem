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

export interface RecordDeviceResult {
  device: IKnownDeviceDocument | null;
  isNewDevice: boolean;
  trusted: boolean;
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

// A device that has signed in successfully this many times is auto-trusted,
// so we stop alerting on it the way professional services do.
export const AUTO_TRUST_THRESHOLD = 3;

/**
 * Upsert a device record from login data.
 * Called during login to keep device inventory up-to-date.
 *
 * Returns the device plus two booleans the caller uses to decide whether to
 * send a "new device sign-in" email:
 *   - isNewDevice: this browser+os combination was seen for the very first time
 *   - trusted:     the device is trusted (admin-marked or auto-trusted)
 *
 * Note: the match key is intentionally userId+browser+os and does NOT include
 * the IP. A user's device is the same device whether they are on office Wi-Fi,
 * home, or mobile data, so a changing/dynamic IP must not make it look "new".
 */
KnownDeviceSchema.statics.recordDevice = async function (
  userId: string,
  username: string,
  browser: string,
  os: string,
  deviceType: string,
  ip: string,
): Promise<RecordDeviceResult> {
  const res = await this.findOneAndUpdate(
    { userId, browser, os },
    {
      $set: { lastSeen: new Date(), lastIP: ip, deviceType, username },
      $inc: { sessionCount: 1 },
      $setOnInsert: { firstSeen: new Date(), trusted: false, blocked: false },
    },
    // Mongoose 8: rawResult is deprecated; includeResultMetadata exposes
    // lastErrorObject.updatedExisting so we can tell insert vs update.
    { upsert: true, new: true, includeResultMetadata: true },
  );

  const device = res.value as IKnownDeviceDocument | null;
  const isNewDevice = !res.lastErrorObject?.updatedExisting;

  // Auto-trust an established device once it has enough successful sign-ins.
  if (device && !isNewDevice && !device.trusted && device.sessionCount >= AUTO_TRUST_THRESHOLD) {
    device.trusted = true;
    await device.save();
  }

  return { device, isNewDevice, trusted: !!device?.trusted };
};

export const KnownDevice = mongoose.model<IKnownDeviceDocument>('KnownDevice', KnownDeviceSchema);
export default KnownDevice;
