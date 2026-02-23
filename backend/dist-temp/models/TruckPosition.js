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
exports.TruckPosition = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const truckPositionSchema = new mongoose_1.Schema({
    truckNo: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        index: true,
    },
    trailerNo: {
        type: String,
        uppercase: true,
        trim: true,
    },
    currentCheckpoint: {
        type: String,
        required: true,
        uppercase: true,
        index: true,
    },
    checkpointOrder: {
        type: Number,
        required: true,
        index: true,
    },
    status: {
        type: String,
        required: true,
        uppercase: true,
    },
    direction: {
        type: String,
        enum: ['GOING', 'RETURNING', 'UNKNOWN'],
        default: 'UNKNOWN',
        index: true,
    },
    vehicleType: {
        type: String,
        uppercase: true,
    },
    departureDate: {
        type: Date,
    },
    daysInJourney: {
        type: Number,
    },
    returnInfo: {
        type: String,
    },
    fleetGroup: {
        type: String,
        required: true,
        index: true,
    },
    fleetGroupId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FleetSnapshot',
        required: true,
    },
    deliveryOrderId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'DeliveryOrder',
    },
    fuelRecordId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FuelRecord',
    },
    reportDate: {
        type: Date,
        required: true,
        index: true,
    },
    snapshotId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'FleetSnapshot',
        required: true,
        index: true,
    },
}, {
    timestamps: true,
});
// Indexes for performance
truckPositionSchema.index({ snapshotId: 1, currentCheckpoint: 1 });
truckPositionSchema.index({ truckNo: 1, reportDate: -1 });
truckPositionSchema.index({ currentCheckpoint: 1, direction: 1 });
truckPositionSchema.index({ reportDate: -1, direction: 1 });
exports.TruckPosition = mongoose_1.default.model('TruckPosition', truckPositionSchema);
