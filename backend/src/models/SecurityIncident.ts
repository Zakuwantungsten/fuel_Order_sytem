/**
 * SecurityIncident — Incident lifecycle tracking for the Security tab.
 * Incidents are created manually or auto-generated from critical alerts.
 * Supports full workflow: new → acknowledged → investigating → resolved/escalated.
 */
import mongoose, { Schema, Document } from 'mongoose';

export type IncidentStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive' | 'escalated';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface IIncidentNote {
  author: string;
  authorId: string;
  text: string;
  createdAt: Date;
}

export interface ISecurityIncident {
  incidentId: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  assignedTo?: string;
  linkedAlerts: string[];
  linkedEvents: string[];
  notes: IIncidentNote[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  rootCause?: string;
  impactAssessment?: string;
}

export interface ISecurityIncidentDocument extends ISecurityIncident, Document {}

const IncidentNoteSchema = new Schema<IIncidentNote>(
  {
    author: { type: String, required: true },
    authorId: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const SecurityIncidentSchema = new Schema<ISecurityIncidentDocument>(
  {
    incidentId: { type: String, required: true, unique: true },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'acknowledged', 'investigating', 'resolved', 'false_positive', 'escalated'],
      default: 'new',
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    assignedTo: { type: String },
    linkedAlerts: [{ type: String }],
    linkedEvents: [{ type: String }],
    notes: { type: [IncidentNoteSchema], default: [] },
    createdBy: { type: String, required: true },
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
    rootCause: { type: String },
    impactAssessment: { type: String },
  },
  {
    timestamps: true,
    collection: 'security_incidents',
  },
);

SecurityIncidentSchema.index({ status: 1, severity: 1, createdAt: -1 });
SecurityIncidentSchema.index({ createdAt: -1 });
SecurityIncidentSchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 365 * 24 * 60 * 60, partialFilterExpression: { resolvedAt: { $exists: true } } },
);

export const SecurityIncident = mongoose.model<ISecurityIncidentDocument>('SecurityIncident', SecurityIncidentSchema);
