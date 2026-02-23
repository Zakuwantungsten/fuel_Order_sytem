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
exports.DriverAccountEntry = void 0;
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
const PAYMENT_MODES = [
    'TIGO_LIPA',
    'VODA_LIPA',
    'SELCOM',
    'CASH',
    'STATION'
];
const driverAccountEntrySchema = new mongoose_1.Schema({
    date: {
        type: String,
        required: [true, 'Date is required'],
    },
    month: {
        type: String,
        required: [true, 'Month is required'],
    },
    year: {
        type: Number,
        required: [true, 'Year is required'],
    },
    lpoNo: {
        type: String,
        required: [true, 'LPO number is required'],
        trim: true,
    },
    truckNo: {
        type: String,
        required: [true, 'Truck number is required'],
        trim: true,
    },
    driverName: {
        type: String,
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
    },
    station: {
        type: String,
        required: [true, 'Station is required'],
        trim: true,
    },
    cancellationPoint: {
        type: String,
        enum: [...CANCELLATION_POINTS, null, ''],
        required: false, // Driver account entries don't cancel any LPO
    },
    journeyDirection: {
        type: String,
        enum: ['going', 'returning'],
        required: [true, 'Journey direction is required'],
        default: 'going',
    },
    originalDoNo: {
        type: String,
        trim: true,
    },
    paymentMode: {
        type: String,
        enum: PAYMENT_MODES,
        default: 'CASH',
    },
    paybillOrMobile: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        enum: ['pending', 'settled', 'disputed'],
        default: 'pending',
    },
    settledAt: {
        type: Date,
    },
    settledBy: {
        type: String,
    },
    approvedBy: {
        type: String,
        trim: true,
    },
    notes: {
        type: String,
        trim: true,
    },
    createdBy: {
        type: String,
        required: [true, 'Created by is required'],
    },
    lpoCreated: {
        type: Boolean,
        default: false,
    },
    lpoSummaryId: {
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
driverAccountEntrySchema.index({ year: 1 });
driverAccountEntrySchema.index({ month: 1 });
driverAccountEntrySchema.index({ lpoNo: 1 });
driverAccountEntrySchema.index({ truckNo: 1 });
driverAccountEntrySchema.index({ status: 1 });
driverAccountEntrySchema.index({ isDeleted: 1 });
driverAccountEntrySchema.index({ year: 1, month: 1 });
driverAccountEntrySchema.index({ truckNo: 1, year: 1 });
exports.DriverAccountEntry = mongoose_1.default.model('DriverAccountEntry', driverAccountEntrySchema);
