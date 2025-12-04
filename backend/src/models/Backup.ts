import mongoose, { Schema, Document } from 'mongoose';

export interface IBackup extends Document {
  fileName: string;
  fileSize: number; // in bytes
  status: 'in_progress' | 'completed' | 'failed';
  type: 'manual' | 'scheduled';
  collections: string[];
  r2Key: string; // Cloudflare R2 object key
  r2Url?: string; // Public/signed URL if needed
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  metadata?: {
    totalDocuments: number;
    databaseSize: number;
    compression: string;
  };
}

const BackupSchema: Schema = new Schema(
  {
    fileName: {
      type: String,
      required: true,
      unique: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed'],
      default: 'in_progress',
    },
    type: {
      type: String,
      enum: ['manual', 'scheduled'],
      required: true,
    },
    collections: [{
      type: String,
    }],
    r2Key: {
      type: String,
      required: true,
    },
    r2Url: {
      type: String,
    },
    createdBy: {
      type: String,
      required: true,
    },
    completedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
    metadata: {
      totalDocuments: Number,
      databaseSize: Number,
      compression: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
BackupSchema.index({ status: 1, createdAt: -1 });
BackupSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<IBackup>('Backup', BackupSchema);
