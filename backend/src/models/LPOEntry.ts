import mongoose, { Schema, Document } from 'mongoose';
import { ILPOEntry } from '../types';

export interface ILPOEntryDocument extends ILPOEntry, Document {}

const lpoEntrySchema = new Schema<ILPOEntryDocument>(
  {
    sn: {
      type: Number,
      required: [true, 'Serial number is required'],
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    actualDate: {
      type: Date,
      required: false, // Optional for backward compatibility with existing records
    },
    lpoNo: {
      type: String,
      required: [true, 'LPO number is required'],
      trim: true,
    },
    dieselAt: {
      type: String,
      required: [true, 'Diesel station is required'],
      trim: true,
    },
    doSdo: {
      type: String,
      required: [true, 'DO/SDO number is required'],
      trim: true,
    },
    truckNo: {
      type: String,
      required: [true, 'Truck number is required'],
      trim: true,
    },
    ltrs: {
      type: Number,
      required: [true, 'Liters is required'],
      min: [0, 'Liters cannot be negative'],
    },
    pricePerLtr: {
      type: Number,
      required: [true, 'Price per liter is required'],
      min: [0, 'Price cannot be negative'],
    },
    destinations: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    // Amendment tracking - stores original value if liters were changed
    originalLtrs: {
      type: Number,
      default: null,
    },
    amendedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    // Driver Account / Cash fields
    isDriverAccount: {
      type: Boolean,
      default: false,
    },
    referenceDo: {
      type: String,
      trim: true,
      default: null,
    },
    paymentMode: {
      type: String,
      enum: ['STATION', 'CASH', 'DRIVER_ACCOUNT'],
      default: 'STATION',
    },
    currency: {
      type: String,
      enum: ['USD', 'TZS'],
      default: 'TZS',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// Note: Removed single lpoNo index to avoid duplicate with compound index
lpoEntrySchema.index({ date: 1 });
lpoEntrySchema.index({ actualDate: -1 }); // For date-based filtering and sorting
lpoEntrySchema.index({ truckNo: 1 });
lpoEntrySchema.index({ dieselAt: 1 });
lpoEntrySchema.index({ doSdo: 1 });
lpoEntrySchema.index({ isDeleted: 1 });
lpoEntrySchema.index({ isDriverAccount: 1 });
lpoEntrySchema.index({ referenceDo: 1 });
lpoEntrySchema.index({ paymentMode: 1 });

// Compound indexes for common queries (includes lpoNo)
lpoEntrySchema.index({ lpoNo: 1, date: -1 });
lpoEntrySchema.index({ dieselAt: 1, date: -1 });
lpoEntrySchema.index({ truckNo: 1, referenceDo: 1 }); // For fetching NIL entries by journey

// Pre-save hook to populate actualDate from date field
lpoEntrySchema.pre('save', function (next) {
  // If actualDate is not set, try to parse from date field
  if (!this.actualDate && this.date) {
    try {
      // Parse date field (format: "DD-MMM" or "DD-MM" or "DD-Month")
      const dateParts = this.date.split('-');
      if (dateParts.length >= 2) {
        const day = parseInt(dateParts[0], 10);
        let month = dateParts[1];
        
        // Convert month name/abbreviation to number
        const monthMap: { [key: string]: number } = {
          'jan': 0, 'january': 0,
          'feb': 1, 'february': 1,
          'mar': 2, 'march': 2,
          'apr': 3, 'april': 3,
          'may': 4,
          'jun': 5, 'june': 5,
          'jul': 6, 'july': 6,
          'aug': 7, 'august': 7,
          'sep': 8, 'september': 8,
          'oct': 9, 'october': 9,
          'nov': 10, 'november': 10,
          'dec': 11, 'december': 11
        };
        
        let monthNum: number;
        if (!isNaN(parseInt(month))) {
          monthNum = parseInt(month, 10) - 1; // Convert 1-12 to 0-11
        } else {
          monthNum = monthMap[month.toLowerCase()] ?? 0;
        }
        
        // Use current year or createdAt year as reference
        const referenceYear = this.createdAt ? new Date(this.createdAt).getFullYear() : new Date().getFullYear();
        const referenceDate = this.createdAt ? new Date(this.createdAt) : new Date();
        
        // Create the actual date with reference year
        let actualDate = new Date(referenceYear, monthNum, day);
        
        // If the resulting date is in the future compared to the reference date,
        // it means the LPO was from the previous year
        if (actualDate > referenceDate) {
          actualDate = new Date(referenceYear - 1, monthNum, day);
        }
        
        this.actualDate = actualDate;
      }
    } catch (error) {
      // If parsing fails, use createdAt or current date
      this.actualDate = this.createdAt || new Date();
    }
  }
  next();
});

export const LPOEntry = mongoose.model<ILPOEntryDocument>('LPOEntry', lpoEntrySchema);
