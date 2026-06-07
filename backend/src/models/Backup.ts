import mongoose, { Schema, Document } from 'mongoose';

export interface IBackup extends Document {
  fileName: string;
  fileSize: number; // in bytes
  status: 'in_progress' | 'completed' | 'failed' | 'deleted' | 'restoring';
  type: 'manual' | 'scheduled';
  collections: string[];
  r2Key: string; // Cloudflare R2 object key
  r2Url?: string; // Public/signed URL if needed
  createdBy: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
  // Soft-delete fields
  deletedAt?: Date;
  deletedBy?: string;
  // Tiered retention tag (set by scheduler)
  retentionTier?: 'daily' | 'weekly' | 'monthly';
  metadata?: {
    totalDocuments: number;
    businessDocuments?: number; // docs in core business collections (0 ⇒ empty-data backup)
    databaseSize: number;
    compression: string;
    encrypted?: boolean;
    encryptionAlgorithm?: string;
    verifiedAt?: Date;
    verificationPassed?: boolean;
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
      enum: ['in_progress', 'completed', 'failed', 'deleted', 'restoring'],
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
    // Soft-delete
    deletedAt: {
      type: Date,
    },
    deletedBy: {
      type: String,
    },
    // Tiered retention tag
    retentionTier: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
    },
    metadata: {
      totalDocuments: Number,
      businessDocuments: Number,
      databaseSize: Number,
      compression: String,
      encrypted: Boolean,
      encryptionAlgorithm: String,
      verifiedAt: Date,
      verificationPassed: Boolean,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
BackupSchema.index({ status: 1, createdAt: -1 });
BackupSchema.index({ type: 1, createdAt: -1 });
BackupSchema.index({ deletedAt: 1, status: 1 }); // for trash cleanup job
BackupSchema.index({ retentionTier: 1, status: 1, createdAt: -1 }); // for tiered cleanup

export default mongoose.model<IBackup>('Backup', BackupSchema);
