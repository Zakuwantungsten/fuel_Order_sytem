import mongoose, { Document, Schema } from 'mongoose';

export interface IWebhook extends Document {
  name: string;
  url: string;
  events: string[];
  secret: string;
  isEnabled: boolean;
  headers?: Record<string, string>;
  createdBy: string;
  lastTriggeredAt?: Date;
  lastStatus?: 'success' | 'error';
  lastStatusCode?: number;
  failureCount: number;
  logs: {
    timestamp: Date;
    event: string;
    statusCode: number;
    success: boolean;
    error?: string;
    durationMs: number;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<IWebhook>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    events: [{ type: String }],
    secret: { type: String, required: true },
    isEnabled: { type: Boolean, default: true },
    headers: { type: Map, of: String, default: {} },
    createdBy: { type: String, required: true },
    lastTriggeredAt: { type: Date },
    lastStatus: { type: String, enum: ['success', 'error'] },
    lastStatusCode: { type: Number },
    failureCount: { type: Number, default: 0 },
    logs: [
      {
        timestamp: { type: Date, default: Date.now },
        event: String,
        statusCode: Number,
        success: Boolean,
        error: String,
        durationMs: Number,
      },
    ],
  },
  { timestamps: true }
);

export const WEBHOOK_EVENTS = [
  'delivery_order.created',
  'delivery_order.updated',
  'delivery_order.deleted',
  'fuel_record.created',
  'lpo_entry.created',
  'user.created',
  'user.deactivated',
  'maintenance.enabled',
  'maintenance.disabled',
  'fuel_price.updated',
  'archival.completed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export default mongoose.model<IWebhook>('Webhook', WebhookSchema);
