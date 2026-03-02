import mongoose, { Schema, Document } from 'mongoose';

/**
 * SIEM (Security Information and Event Management) Export Configuration
 * Streams audit events to external SIEM systems (Splunk, Datadog, Elastic, etc.)
 */
export interface ISIEMConfig extends Document {
  name: string;
  isActive: boolean;
  destination: 'webhook' | 'syslog' | 'splunk_hec' | 'datadog' | 'elastic';
  // Webhook destination
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  // Syslog
  syslogHost?: string;
  syslogPort?: number;
  syslogProtocol?: 'udp' | 'tcp' | 'tls';
  // Splunk HEC
  splunkUrl?: string;
  splunkToken?: string;
  // Filtering: which events to stream
  eventFilters: {
    severities: string[];              // ['critical', 'high', 'medium', 'low']
    actions: string[];                 // Empty = all actions
    minRiskScore: number;              // 0 = all, 50 = high-risk only
  };
  // Delivery settings
  batchSize: number;                   // How many events per batch
  flushIntervalSeconds: number;        // Max seconds between flushes
  retryAttempts: number;
  // Stats
  totalEventsSent: number;
  lastSentAt?: Date;
  lastError?: string;
  lastErrorAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const siemConfigSchema = new Schema<ISIEMConfig>(
  {
    name: { type: String, required: true, unique: true, maxlength: 100 },
    isActive: { type: Boolean, default: false, index: true },
    destination: {
      type: String,
      enum: ['webhook', 'syslog', 'splunk_hec', 'datadog', 'elastic'],
      required: true,
    },
    webhookUrl: String,
    webhookHeaders: { type: Map, of: String },
    syslogHost: String,
    syslogPort: Number,
    syslogProtocol: { type: String, enum: ['udp', 'tcp', 'tls'] },
    splunkUrl: String,
    splunkToken: String,
    eventFilters: {
      severities: { type: [String], default: ['critical', 'high'] },
      actions: { type: [String], default: [] },
      minRiskScore: { type: Number, default: 0 },
    },
    batchSize: { type: Number, default: 100, min: 1, max: 1000 },
    flushIntervalSeconds: { type: Number, default: 30, min: 5, max: 300 },
    retryAttempts: { type: Number, default: 3, min: 0, max: 10 },
    totalEventsSent: { type: Number, default: 0 },
    lastSentAt: Date,
    lastError: String,
    lastErrorAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const SIEMConfig = mongoose.model<ISIEMConfig>('SIEMConfig', siemConfigSchema);
