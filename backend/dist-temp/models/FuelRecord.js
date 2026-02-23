"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FuelRecord = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const fuelRecordSchema = new mongoose_1.Schema({
    date: {
        type: String,
        required: [true, 'Date is required'],
    },
    month: {
        type: String,
        trim: true,
    },
    truckNo: {
        type: String,
        required: [true, 'Truck number is required'],
        trim: true,
    },
    goingDo: {
        type: String,
        required: [true, 'Going DO is required'],
        trim: true,
    },
    returnDo: {
        type: String,
        trim: true,
    },
    start: {
        type: String,
        required: [true, 'Start location is required'],
        trim: true,
    },
    from: {
        type: String,
        required: [true, 'From location is required'],
        trim: true,
    },
    to: {
        type: String,
        required: [true, 'To location is required'],
        trim: true,
    },
    totalLts: {
        type: Number,
        required: false, // Changed to allow null for pending admin configuration
        min: [0, 'Total liters cannot be negative'],
        default: null,
    },
    extra: {
        type: Number,
        required: false, // Changed to allow null for pending admin configuration
        default: null,
    },
    // Journey status and queue management
    journeyStatus: {
        type: String,
        enum: ['queued', 'active', 'completed', 'cancelled'],
        default: 'active',
        required: true,
    },
    queueOrder: {
        type: Number,
        required: false,
    },
    activatedAt: {
        type: Date,
        required: false,
    },
    completedAt: {
        type: Date,
        required: false,
    },
    estimatedStartDate: {
        type: String,
        required: false,
    },
    previousJourneyId: {
        type: String,
        required: false,
    },
    // Lock status for pending configurations
    isLocked: {
        type: Boolean,
        default: false,
    },
    pendingConfigReason: {
        type: String,
        enum: ['missing_total_liters', 'missing_extra_fuel', 'both', null],
        default: null,
    },
    // Yard allocations
    mmsaYard: {
        type: Number,
        default: 0,
    },
    tangaYard: {
        type: Number,
        default: 0,
    },
    darYard: {
        type: Number,
        default: 0,
    },
    // Going fuel
    darGoing: {
        type: Number,
        default: 0,
    },
    moroGoing: {
        type: Number,
        default: 0,
    },
    mbeyaGoing: {
        type: Number,
        default: 0,
    },
    tdmGoing: {
        type: Number,
        default: 0,
    },
    zambiaGoing: {
        type: Number,
        default: 0,
    },
    congoFuel: {
        type: Number,
        default: 0,
    },
    // Return fuel
    zambiaReturn: {
        type: Number,
        default: 0,
    },
    tundumaReturn: {
        type: Number,
        default: 0,
    },
    mbeyaReturn: {
        type: Number,
        default: 0,
    },
    moroReturn: {
        type: Number,
        default: 0,
    },
    darReturn: {
        type: Number,
        default: 0,
    },
    tangaReturn: {
        type: Number,
        default: 0,
    },
    balance: {
        type: Number,
        required: [true, 'Balance is required'],
    },
    // Original going journey locations (stored before EXPORT DO changes them)
    originalGoingFrom: {
        type: String,
        trim: true,
    },
    originalGoingTo: {
        type: String,
        trim: true,
    },
    // Cancellation fields
    isCancelled: {
        type: Boolean,
        default: false,
    },
    cancelledAt: {
        type: Date,
    },
    cancellationReason: {
        type: String,
        trim: true,
    },
    cancelledBy: {
        type: String,
        trim: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
    },
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (_doc, ret) {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
            return ret;
        },
    },
});
// Indexes
fuelRecordSchema.index({ truckNo: 1 });
fuelRecordSchema.index({ date: 1 });
fuelRecordSchema.index({ goingDo: 1 });
fuelRecordSchema.index({ returnDo: 1 });
fuelRecordSchema.index({ isDeleted: 1 });
fuelRecordSchema.index({ month: 1 });
fuelRecordSchema.index({ journeyStatus: 1 });
// Compound indexes for common queries
fuelRecordSchema.index({ truckNo: 1, date: -1 });
fuelRecordSchema.index({ date: -1, isDeleted: 1 });
fuelRecordSchema.index({ truckNo: 1, journeyStatus: 1, queueOrder: 1 }); // For queue management
fuelRecordSchema.index({ truckNo: 1, journeyStatus: 1, isDeleted: 1 }); // For finding active/queued journeys
// Index for yard fuel auto-linking queries (optimized for finding active records)
fuelRecordSchema.index({ truckNo: 1, date: -1, isDeleted: 1, isCancelled: 1 });
exports.FuelRecord = mongoose_1.default.model('FuelRecord', fuelRecordSchema);
