import mongoose, { Schema, Document } from 'mongoose';

export type SecurityEventType =
  | 'path_blocked'
  | 'ip_blocked'
  | 'auth_failure'
  | 'suspicious_404'
  | 'honeypot_hit'
  | 'ua_blocked'
  | 'rate_limited'
  | 'csrf_failure'
  | 'jwt_failure';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ISecurityEvent extends Document {
  timestamp: Date;
  ip: string;
  method: string;
  url: string;
  userAgent?: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  metadata?: Record<string, any>;
  blocked: boolean;
  userId?: string;
  username?: string;
}

const SecurityEventSchema = new Schema<ISecurityEvent>(
  {
    timestamp: { type: Date, default: Date.now, required: true },
    ip: { type: String, required: true },
    method: { type: String, default: 'GET' },
    url: { type: String, required: true },
    userAgent: { type: String },
    eventType: {
      type: String,
      required: true,
      enum: [
        'path_blocked',
        'ip_blocked',
        'auth_failure',
        'suspicious_404',
        'honeypot_hit',
        'ua_blocked',
        'rate_limited',
        'csrf_failure',
        'jwt_failure',
      ],
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
    },
    metadata: { type: Schema.Types.Mixed },
    blocked: { type: Boolean, default: true },
    userId: { type: String },
    username: { type: String },
  },
  { timestamps: false },
);

// Query indexes
SecurityEventSchema.index({ ip: 1, timestamp: -1 });
SecurityEventSchema.index({ eventType: 1, timestamp: -1 });
SecurityEventSchema.index({ severity: 1, timestamp: -1 });
SecurityEventSchema.index({ timestamp: -1 });

// TTL index — documents auto-expire after retentionDays (default 90d set at app level).
// We set a generous default here; the actual value is managed by the retention cron job.
SecurityEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const SecurityEvent = mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);
