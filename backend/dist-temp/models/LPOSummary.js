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
exports.LPOSummary = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CANCELLATION_POINTS = [
    'DAR_GOING',
    'MORO_GOING',
    'MBEYA_GOING',
    'INFINITY_GOING',
    'TDM_GOING',
    'ZAMBIA_GOING',
    'CONGO_GOING',
    'ZAMBIA_RETURNING',
    'TDM_RETURN',
    'MBEYA_RETURN',
    'MORO_RETURN',
    'DAR_RETURN',
    'TANGA_RETURN',
    'CONGO_RETURNING',
    'CUSTOM_GOING',
    'CUSTOM_RETURN'
];
const lpoDetailSchema = new mongoose_1.Schema({
    doNo: {
        type: String,
        required: [true, 'DO number is required'],
        trim: true,
    },
    truckNo: {
        type: String,
        required: [true, 'Truck number is required'],
        trim: true,
    },
    liters: {
        type: Number,
        required: [true, 'Liters is required'],
        min: [0, 'Liters cannot be negative'],
    },
    rate: {
        type: Number,
        required: [true, 'Rate is required'],
        min: [0, 'Rate cannot be negative'],
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required'],
        min: [0, 'Amount cannot be negative'],
    },
    dest: {
        type: String,
        required: [true, 'Destination is required'],
        trim: true,
    },
    sortOrder: {
        type: Number,
        default: 0,
    },
    // Amendment tracking - stores original value if liters were changed
    originalLiters: {
        type: Number,
        default: null,
    },
    amendedAt: {
        type: Date,
        default: null,
    },
    // Cancellation and Driver Account fields
    isCancelled: {
        type: Boolean,
        default: false,
    },
    isDriverAccount: {
        type: Boolean,
        default: false,
    },
    cancellationPoint: {
        type: String,
        enum: CANCELLATION_POINTS,
    },
    // New: Support both directions for CASH payments (can have one or both)
    goingCheckpoint: {
        type: String,
        enum: CANCELLATION_POINTS,
    },
    returningCheckpoint: {
        type: String,
        enum: CANCELLATION_POINTS,
    },
    originalDoNo: {
        type: String,
        trim: true,
    },
    cancellationReason: {
        type: String,
        trim: true,
    },
    cancelledAt: {
        type: Date,
    },
    // Reference DO for NIL entries to link to a journey
    referenceDo: {
        type: String,
        trim: true,
    },
    // Custom station fields (for unlisted stations like small lake stations in Zambia)
    isCustomStation: {
        type: Boolean,
        default: false,
    },
    customStationName: {
        type: String,
        trim: true,
    },
    customGoingCheckpoint: {
        type: String,
        trim: true,
    },
    customReturnCheckpoint: {
        type: String,
        trim: true,
    },
}, { _id: true });
const lpoSummarySchema = new mongoose_1.Schema({
    lpoNo: {
        type: String,
        required: [true, 'LPO number is required'],
        unique: true,
        trim: true,
    },
    date: {
        type: String,
        required: [true, 'Date is required'],
    },
    year: {
        type: Number,
        required: [true, 'Year is required'],
    },
    station: {
        type: String,
        required: [true, 'Station is required'],
        trim: true,
    },
    orderOf: {
        type: String,
        required: [true, 'Order of is required'],
        trim: true,
    },
    entries: {
        type: [lpoDetailSchema],
        required: [true, 'Entries are required'],
        validate: {
            validator: function (entries) {
                return entries.length > 0;
            },
            message: 'LPO must have at least one entry',
        },
    },
    total: {
        type: Number,
        required: [true, 'Total is required'],
        min: [0, 'Total cannot be negative'],
    },
    // Forwarding tracking - if this LPO was forwarded from another
    forwardedFrom: {
        lpoId: {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'LPOSummary',
        },
        lpoNo: {
            type: String,
            trim: true,
        },
        station: {
            type: String,
            trim: true,
        },
    },
    createdBy: {
        type: String,
        trim: true,
    },
    approvedBy: {
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
});
// Indexes
// Note: lpoNo already has a unique index from schema definition
lpoSummarySchema.index({ date: 1 });
lpoSummarySchema.index({ station: 1 });
lpoSummarySchema.index({ isDeleted: 1 });
lpoSummarySchema.index({ year: 1 });
// Compound indexes
lpoSummarySchema.index({ station: 1, date: -1 });
lpoSummarySchema.index({ year: 1, lpoNo: 1 });
lpoSummarySchema.index({ year: 1, isDeleted: 1 });
// Pre-save hook to calculate total and extract year from date
lpoSummarySchema.pre('save', function (next) {
    if (this.isModified('entries')) {
        this.total = this.entries.reduce((sum, entry) => sum + entry.amount, 0);
    }
    // Extract year from date if not set
    if (!this.year && this.date) {
        const dateObj = new Date(this.date);
        this.year = dateObj.getFullYear();
    }
    next();
});
exports.LPOSummary = mongoose_1.default.model('LPOSummary', lpoSummarySchema);
