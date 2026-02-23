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
exports.YardFuelDispense = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const yardFuelDispenseSchema = new mongoose_1.Schema({
    date: {
        type: String,
        required: [true, 'Date is required'],
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
    yard: {
        type: String,
        enum: ['DAR YARD', 'TANGA YARD', 'MMSA YARD'],
        required: [true, 'Yard is required'],
    },
    enteredBy: {
        type: String,
        required: [true, 'Entered by is required'],
        trim: true,
    },
    timestamp: {
        type: Date,
        required: [true, 'Timestamp is required'],
        default: Date.now,
    },
    notes: {
        type: String,
        trim: true,
    },
    linkedFuelRecordId: {
        type: String,
        trim: true,
    },
    linkedDONumber: {
        type: String,
        trim: true,
    },
    autoLinked: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        enum: ['pending', 'linked', 'manual'],
        default: 'pending',
    },
    rejectionReason: {
        type: String,
        trim: true,
    },
    rejectedBy: {
        type: String,
        trim: true,
    },
    rejectedAt: {
        type: Date,
    },
    rejectionResolved: {
        type: Boolean,
        default: false,
    },
    rejectionResolvedAt: {
        type: Date,
    },
    rejectionResolvedBy: {
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
    history: [{
            action: {
                type: String,
                enum: ['created', 'updated', 'rejected', 're-entered', 'linked'],
                required: true,
            },
            performedBy: {
                type: String,
                required: true,
            },
            timestamp: {
                type: Date,
                default: Date.now,
            },
            details: {
                type: mongoose_1.Schema.Types.Mixed,
            },
        }],
}, {
    timestamps: true,
});
// Indexes
yardFuelDispenseSchema.index({ truckNo: 1 });
yardFuelDispenseSchema.index({ date: 1 });
yardFuelDispenseSchema.index({ yard: 1 });
yardFuelDispenseSchema.index({ status: 1 });
yardFuelDispenseSchema.index({ linkedFuelRecordId: 1 });
yardFuelDispenseSchema.index({ isDeleted: 1 });
// Compound indexes for common queries
yardFuelDispenseSchema.index({ yard: 1, date: -1 });
yardFuelDispenseSchema.index({ truckNo: 1, date: -1 });
yardFuelDispenseSchema.index({ status: 1, date: -1 });
exports.YardFuelDispense = mongoose_1.default.model('YardFuelDispense', yardFuelDispenseSchema);
