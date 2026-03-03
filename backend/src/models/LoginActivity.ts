import mongoose, { Schema, Document } from 'mongoose';

export interface ILoginActivity extends Document {
  userId: mongoose.Types.ObjectId;
  sessionToken: string; // hashed — links to the refresh token hash for revocation
  ipAddress: string;
  userAgent: string;
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  isNewDevice: boolean;
  mfaMethod?: string;
  loginAt: Date;
  lastActiveAt: Date;
  loggedOutAt?: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Simple UA parser (avoids extra dependency)
function parseUA(ua: string): { browser: string; os: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' } {
  let browser = 'Unknown';
  let os = 'Unknown';
  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' = 'unknown';

  // Browser
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('Chrome/')) browser = 'Google Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  // OS
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  // Device type
  if (ua.includes('Mobi')) deviceType = 'mobile';
  else if (ua.includes('Tablet') || ua.includes('iPad')) deviceType = 'tablet';
  else if (ua.includes('Windows') || ua.includes('Mac') || ua.includes('Linux')) deviceType = 'desktop';

  return { browser, os, deviceType };
}

const LoginActivitySchema = new Schema<ILoginActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sessionToken: {
      type: String,
      required: true,
      index: true,
    },
    ipAddress: { type: String, default: 'unknown' },
    userAgent: { type: String, default: '' },
    browser: { type: String, default: 'Unknown' },
    os: { type: String, default: 'Unknown' },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown',
    },
    isNewDevice: { type: Boolean, default: false },
    mfaMethod: { type: String },
    loginAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
    loggedOutAt: { type: Date },
    isCurrent: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Index for quick active session lookups
LoginActivitySchema.index({ userId: 1, isCurrent: 1 });
// Auto-expire old records after 90 days
LoginActivitySchema.index({ loginAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

/**
 * Create a login activity record from request context.
 */
LoginActivitySchema.statics.recordLogin = async function (
  userId: string,
  refreshTokenHash: string,
  ip: string,
  userAgent: string,
  mfaMethod?: string,
) {
  const { browser, os, deviceType } = parseUA(userAgent);

  // Determine if device is new (never seen this browser+os+ip combination)
  const existingDevice = await this.findOne({
    userId,
    browser,
    os,
    ipAddress: ip,
  }).lean();

  const isNewDevice = !existingDevice;

  return this.create({
    userId,
    sessionToken: refreshTokenHash,
    ipAddress: ip,
    userAgent,
    browser,
    os,
    deviceType,
    isNewDevice,
    mfaMethod,
    loginAt: new Date(),
    lastActiveAt: new Date(),
    isCurrent: true,
  });
};

export const LoginActivity = mongoose.model<ILoginActivity>('LoginActivity', LoginActivitySchema);
export default LoginActivity;
