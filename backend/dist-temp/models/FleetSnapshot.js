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
exports.FleetSnapshot = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const truckPositionInSnapshotSchema = new mongoose_1.Schema({
    truckNo: { type: String, required: true, uppercase: true, trim: true },
    trailerNo: { type: String, uppercase: true, trim: true },
    currentCheckpoint: { type: String, required: true, uppercase: true },
    checkpointOrder: { type: Number, required: true },
    status: { type: String, required: true, uppercase: true },
    direction: {
        type: String,
        enum: ['GOING', 'RETURNING', 'UNKNOWN'],
        default: 'UNKNOWN'
    },
    vehicleType: { type: String, uppercase: true },
    departureDate: { type: Date },
    daysInJourney: { type: Number },
    returnInfo: { type: String },
    deliveryOrderId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'DeliveryOrder' },
    fuelRecordId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'FuelRecord' },
}, { _id: false });
const fleetGroupSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    tonnage: { type: Number },
    route: { type: String },
    client: { type: String },
    trucks: { type: [truckPositionInSnapshotSchema], default: [] },
}, { _id: false });
const fleetSnapshotSchema = new mongoose_1.Schema({
    timestamp: {
        type: Date,
        required: true,
        index: true,
    },
    reportDate: {
        type: Date,
        required: true,
        index: true,
    },
    reportType: {
        type: String,
        required: true,
        enum: ['IMPORT', 'NO_ORDER'],
        index: true,
    },
    uploadedBy: {
        type: String,
        required: true,
    },
    fileName: {
        type: String,
        required: true,
    },
    fileSize: {
        type: Number,
        required: true,
    },
    processedAt: {
        type: Date,
        required: true,
    },
    fleetGroups: {
        type: [fleetGroupSchema],
        default: [],
    },
    totalTrucks: {
        type: Number,
        required: true,
        default: 0,
    },
    goingTrucks: {
        type: Number,
        default: 0,
    },
    returningTrucks: {
        type: Number,
        default: 0,
    },
    checkpointDistribution: {
        type: Map,
        of: Number,
        default: new Map(),
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
    deletedAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
// Indexes for performance
fleetSnapshotSchema.index({ timestamp: -1, isDeleted: 1 });
fleetSnapshotSchema.index({ reportDate: -1, reportType: 1 });
fleetSnapshotSchema.index({ uploadedBy: 1, timestamp: -1 });
exports.FleetSnapshot = mongoose_1.default.model('FleetSnapshot', fleetSnapshotSchema);
