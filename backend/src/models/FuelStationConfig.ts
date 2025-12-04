import mongoose, { Schema, Document } from 'mongoose';

export interface IFuelStationConfig extends Document {
  stationName: string;
  defaultRate: number;
  defaultLitersGoing: number;
  defaultLitersReturning: number;
  fuelRecordFieldGoing?: string;  // e.g., 'zambiaGoing', 'mbeyaGoing'
  fuelRecordFieldReturning?: string;  // e.g., 'zambiaReturn', 'mbeyaReturn'
  formulaGoing?: string; // e.g., "totalLiters + extraLiters - 900"
  formulaReturning?: string;
  isActive: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FuelStationConfigSchema = new Schema<IFuelStationConfig>(
  {
    stationName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    defaultRate: {
      type: Number,
      required: true,
      min: 0,
    },
    defaultLitersGoing: {
      type: Number,
      required: true,
      min: 0,
    },
    defaultLitersReturning: {
      type: Number,
      required: true,
      min: 0,
    },
    fuelRecordFieldGoing: {
      type: String,
      trim: true,
      enum: ['darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel'],
    },
    fuelRecordFieldReturning: {
      type: String,
      trim: true,
      enum: ['zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn', 'congoFuel'],
    },
    formulaGoing: {
      type: String,
      trim: true,
    },
    formulaReturning: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Indexes
FuelStationConfigSchema.index({ stationName: 1 });
FuelStationConfigSchema.index({ isActive: 1 });

export const FuelStationConfig = mongoose.model<IFuelStationConfig>(
  'FuelStationConfig',
  FuelStationConfigSchema
);
