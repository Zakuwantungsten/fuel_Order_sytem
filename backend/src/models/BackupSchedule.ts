import mongoose, { Schema, Document } from 'mongoose';

export interface IRetentionPolicy {
  daily: number;    // how many daily backups to keep
  weekly: number;   // how many weekly backups to keep
  monthly: number;  // how many monthly backups to keep
}

export interface IBackupSchedule extends Document {
  name: string;
  enabled: boolean;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string; // HH:mm format (for hourly, only the mm is used)
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  retentionDays: number;
  retentionPolicy?: IRetentionPolicy;
  lastRun?: Date;
  nextRun?: Date;
  createdBy: string;
  updatedBy?: string;
}

const BackupScheduleSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    frequency: {
      type: String,
      enum: ['hourly', 'daily', 'weekly', 'monthly'],
      required: true,
    },
    time: {
      type: String,
      required: true,
      validate: {
        validator: function(v: string) {
          return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: 'Time must be in HH:mm format'
      }
    },
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
    },
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 31,
    },
    retentionDays: {
      type: Number,
      required: true,
      default: 30,
      min: 1,
    },
    // Tiered retention policy (overrides retentionDays when present)
    retentionPolicy: {
      daily:   { type: Number, min: 1 },
      weekly:  { type: Number, min: 1 },
      monthly: { type: Number, min: 1 },
    },
    lastRun: {
      type: Date,
    },
    nextRun: {
      type: Date,
    },
    createdBy: {
      type: String,
      required: true,
    },
    updatedBy: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

BackupScheduleSchema.index({ enabled: 1, nextRun: 1 });

export default mongoose.model<IBackupSchedule>('BackupSchedule', BackupScheduleSchema);
