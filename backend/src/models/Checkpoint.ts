import mongoose, { Document, Schema } from 'mongoose';

export interface ICheckpoint extends Document {
  name: string;
  displayName: string;
  order: number;
  region: string;
  country: string;
  
  // Geographic data
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  routeSegment?: string;
  
  // Configuration
  isActive: boolean;
  isMajor: boolean;
  alternativeNames: string[];
  
  // Metadata
  fuelAvailable: boolean;
  borderCrossing: boolean;
  estimatedDistanceFromStart: number;
  
  // Audit
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
}

const checkpointSchema = new Schema<ICheckpoint>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      index: true,
    },
    region: {
      type: String,
      required: true,
      enum: [
        'KENYA',
        'TANZANIA_COASTAL',
        'TANZANIA_INTERIOR',
        'TANZANIA_BORDER',
        'ZAMBIA_NORTH',
        'ZAMBIA_CENTRAL',
        'ZAMBIA_COPPERBELT',
        'ZAMBIA_BORDER',
        'DRC',
      ],
      index: true,
    },
    country: {
      type: String,
      required: true,
      enum: ['KE', 'TZ', 'ZM', 'CD'],
      index: true,
    },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    routeSegment: {
      type: String,
      enum: ['COASTAL', 'INTERIOR', 'BORDER', 'TRANSIT', 'DESTINATION'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isMajor: {
      type: Boolean,
      default: false,
    },
    alternativeNames: {
      type: [String],
      default: [],
    },
    fuelAvailable: {
      type: Boolean,
      default: false,
    },
    borderCrossing: {
      type: Boolean,
      default: false,
    },
    estimatedDistanceFromStart: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: String,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
checkpointSchema.index({ order: 1, isActive: 1, isDeleted: 1 });
checkpointSchema.index({ region: 1, order: 1 });
checkpointSchema.index({ name: 1, isDeleted: 1 });

// Virtual for full display name
checkpointSchema.virtual('fullDisplayName').get(function () {
  return `${this.displayName} (${this.country})`;
});

export const Checkpoint = mongoose.model<ICheckpoint>('Checkpoint', checkpointSchema);
