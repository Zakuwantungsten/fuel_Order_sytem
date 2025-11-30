import mongoose, { Schema, Document } from 'mongoose';

export interface ILPOWorkbook {
  year: number;
  name: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILPOWorkbookDocument extends ILPOWorkbook, Document {}

const lpoWorkbookSchema = new Schema<ILPOWorkbookDocument>(
  {
    year: {
      type: Number,
      required: [true, 'Year is required'],
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Workbook name is required'],
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
lpoWorkbookSchema.index({ isDeleted: 1 });

export const LPOWorkbook = mongoose.model<ILPOWorkbookDocument>('LPOWorkbook', lpoWorkbookSchema);
