import mongoose, { Schema, Document } from 'mongoose';

export interface ISecurityScoreSnapshot extends Document {
  date: Date;
  overallScore: number;
  categoryScores: Record<string, { score: number; max: number; percentage: number }>;
  checksSummary: {
    total: number;
    passed: number;
    failed: number;
    partial: number;
  };
  createdAt: Date;
}

const SecurityScoreSnapshotSchema = new Schema<ISecurityScoreSnapshot>(
  {
    date: { type: Date, required: true },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    categoryScores: { type: Schema.Types.Mixed, required: true },
    checksSummary: {
      total: { type: Number, required: true },
      passed: { type: Number, required: true },
      failed: { type: Number, required: true },
      partial: { type: Number, required: true },
    },
  },
  { timestamps: true }
);

// TTL: auto-delete snapshots older than 365 days
SecurityScoreSnapshotSchema.index({ date: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export const SecurityScoreSnapshot = mongoose.model<ISecurityScoreSnapshot>(
  'SecurityScoreSnapshot',
  SecurityScoreSnapshotSchema
);
