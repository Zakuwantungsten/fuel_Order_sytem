import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemAnnouncement extends Document {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  targetRoles: string[]; // empty array = all roles
  showFrom: Date;
  showUntil: Date | null; // null = never expires
  isDismissible: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SystemAnnouncementSchema = new Schema<ISystemAnnouncement>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical', 'success'],
      default: 'info',
    },
    targetRoles: {
      type: [String],
      default: [], // empty = visible to all roles
    },
    showFrom: {
      type: Date,
      default: () => new Date(),
    },
    showUntil: {
      type: Date,
      default: null, // null = no expiry
    },
    isDismissible: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast active-announcement queries
SystemAnnouncementSchema.index({ isActive: 1, showFrom: 1, showUntil: 1 });

export const SystemAnnouncement = mongoose.model<ISystemAnnouncement>(
  'SystemAnnouncement',
  SystemAnnouncementSchema
);
