import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfigSnapshot extends Document {
  savedBy: string;
  savedAt: Date;
  changeDescription?: string;
  snapshot: Record<string, unknown>;
}

const SystemConfigSnapshotSchema = new Schema<ISystemConfigSnapshot>(
  {
    savedBy: { type: String, required: true },
    changeDescription: { type: String },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: 'savedAt', updatedAt: false } }
);

export default mongoose.model<ISystemConfigSnapshot>('SystemConfigSnapshot', SystemConfigSnapshotSchema);
