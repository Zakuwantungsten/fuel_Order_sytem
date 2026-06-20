import mongoose, { Schema, Document } from 'mongoose';

export interface IYardConfig extends Document {
  yard: 'DAR' | 'TANGA';
  rate: number;
  description?: string;
  supplierName?: string;
  supplierAddress?: string;
  supplierPlotNo?: string;
  supplierPoBox?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const YardConfigSchema = new Schema<IYardConfig>(
  {
    yard: {
      type: String,
      enum: ['DAR', 'TANGA'],
      required: true,
      unique: true,
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    description: { type: String, trim: true },
    supplierName: { type: String, trim: true },
    supplierAddress: { type: String, trim: true },
    supplierPlotNo: { type: String, trim: true },
    supplierPoBox: { type: String, trim: true },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

export const YardConfig = mongoose.model<IYardConfig>('YardConfig', YardConfigSchema);
