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
exports.ArchivalMetadata = exports.ArchivedAuditLog = exports.ArchivedDeliveryOrder = exports.ArchivedYardFuelDispense = exports.ArchivedLPOSummary = exports.ArchivedLPOEntry = exports.ArchivedFuelRecord = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const archivedFuelRecordSchema = new mongoose_1.Schema({
    originalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    date: String,
    month: String,
    truckNo: { type: String, index: true },
    goingDo: String,
    returnDo: String,
    start: String,
    from: String,
    to: String,
    archivedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    archivedReason: {
        type: String,
        default: 'Automated archival - data older than 6 months',
    },
}, {
    strict: false, // Allow all fields from original FuelRecord
    timestamps: false,
});
// Compound indexes for archived queries
archivedFuelRecordSchema.index({ date: -1 });
archivedFuelRecordSchema.index({ truckNo: 1, date: -1 });
archivedFuelRecordSchema.index({ archivedAt: -1 });
const archivedLPOEntrySchema = new mongoose_1.Schema({
    originalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    lpoNo: { type: String },
    date: String,
    truckNo: { type: String, index: true },
    dieselAt: String,
    doSdo: String,
    archivedAt: {
        type: Date,
        default: Date.now,
    },
    archivedReason: {
        type: String,
        default: 'Automated archival - data older than 6 months',
    },
}, {
    strict: false,
    timestamps: false,
});
archivedLPOEntrySchema.index({ date: -1 });
archivedLPOEntrySchema.index({ lpoNo: 1 });
archivedLPOEntrySchema.index({ archivedAt: -1 });
archivedLPOEntrySchema.index({ truckNo: 1, date: -1 });
const archivedLPOSummarySchema = new mongoose_1.Schema({
    originalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    lpoNo: { type: String },
    date: String,
    station: String,
    year: { type: Number, index: true },
    archivedAt: {
        type: Date,
        default: Date.now,
    },
    archivedReason: {
        type: String,
        default: 'Automated archival - data older than 6 months',
    },
}, {
    strict: false,
    timestamps: false,
});
archivedLPOSummarySchema.index({ date: -1 });
archivedLPOSummarySchema.index({ lpoNo: 1 });
archivedLPOSummarySchema.index({ station: 1, year: 1 });
archivedLPOSummarySchema.index({ archivedAt: -1 });
const archivedYardFuelDispenseSchema = new mongoose_1.Schema({
    originalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    date: String,
    truckNo: { type: String, index: true },
    yard: String,
    archivedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    archivedReason: {
        type: String,
        default: 'Automated archival - data older than 6 months',
    },
}, {
    strict: false,
    timestamps: false,
});
archivedYardFuelDispenseSchema.index({ date: -1 });
archivedYardFuelDispenseSchema.index({ yard: 1, date: -1 });
archivedYardFuelDispenseSchema.index({ archivedAt: -1 });
const archivedAuditLogSchema = new mongoose_1.Schema({
    originalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    timestamp: { type: Date, index: true },
    action: String,
    resourceType: String,
    username: { type: String, index: true },
    archivedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    archivedReason: {
        type: String,
        default: 'Automated archival - data older than 12 months',
    },
}, {
    strict: false,
    timestamps: false,
});
archivedAuditLogSchema.index({ timestamp: -1 });
archivedAuditLogSchema.index({ username: 1, timestamp: -1 });
archivedAuditLogSchema.index({ archivedAt: -1 });
const archivalMetadataSchema = new mongoose_1.Schema({
    collectionName: {
        type: String,
        required: true,
        index: true,
    },
    archivalDate: {
        type: Date,
        default: Date.now,
        index: true,
    },
    cutoffDate: {
        type: Date,
        required: true,
        index: true,
    },
    recordsArchived: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['in_progress', 'completed', 'failed'],
        default: 'in_progress',
        index: true,
    },
    initiatedBy: {
        type: String,
        required: true,
    },
    error: String,
    duration: Number,
    completedAt: Date,
}, {
    timestamps: true,
});
const archivedDeliveryOrderSchema = new mongoose_1.Schema({
    originalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    sn: Number,
    date: String,
    importOrExport: { type: String, index: true },
    doType: String,
    doNumber: String,
    truckNo: { type: String, index: true },
    driverName: String,
    product: String,
    quantity: Number,
    tare: Number,
    gross: Number,
    net: Number,
    archivedAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    archivedReason: {
        type: String,
        default: 'Automated archival - data older than configured retention period',
    },
}, {
    timestamps: true,
    strict: false,
});
archivedDeliveryOrderSchema.index({ date: -1, archivedAt: -1 });
archivedDeliveryOrderSchema.index({ doNumber: 1 });
archivalMetadataSchema.index({ collectionName: 1, archivalDate: -1 });
// Export models
exports.ArchivedFuelRecord = mongoose_1.default.model('ArchivedFuelRecord', archivedFuelRecordSchema);
exports.ArchivedLPOEntry = mongoose_1.default.model('ArchivedLPOEntry', archivedLPOEntrySchema);
exports.ArchivedLPOSummary = mongoose_1.default.model('ArchivedLPOSummary', archivedLPOSummarySchema);
exports.ArchivedYardFuelDispense = mongoose_1.default.model('ArchivedYardFuelDispense', archivedYardFuelDispenseSchema);
exports.ArchivedDeliveryOrder = mongoose_1.default.model('ArchivedDeliveryOrder', archivedDeliveryOrderSchema);
exports.ArchivedAuditLog = mongoose_1.default.model('ArchivedAuditLog', archivedAuditLogSchema);
exports.ArchivalMetadata = mongoose_1.default.model('ArchivalMetadata', archivalMetadataSchema);
