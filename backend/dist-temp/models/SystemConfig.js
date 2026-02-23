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
exports.SystemConfig = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const fuelStationSchema = new mongoose_1.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true },
    location: { type: String, required: true },
    pricePerLiter: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
}, { _id: false });
const routeConfigSchema = new mongoose_1.Schema({
    destination: { type: String, required: true },
    totalLiters: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
}, { _id: false });
const destinationFuelRuleSchema = new mongoose_1.Schema({
    destination: { type: String, required: true },
    extraLiters: { type: Number, required: true, min: 0 },
}, { _id: false });
const truckBatchSchema = new mongoose_1.Schema({
    truckSuffix: { type: String, required: true },
    extraLiters: { type: Number, required: true, min: 0, max: 10000 },
    destinationRules: [destinationFuelRuleSchema],
    truckNumber: { type: String },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
}, { _id: false });
const standardAllocationsSchema = new mongoose_1.Schema({
    tangaYardToDar: { type: Number, default: 100 },
    darYardStandard: { type: Number, default: 550 },
    darYardKisarawe: { type: Number, default: 580 },
    mbeyaGoing: { type: Number, default: 450 },
    tundumaReturn: { type: Number, default: 100 },
    mbeyaReturn: { type: Number, default: 400 },
    moroReturnToMombasa: { type: Number, default: 100 },
    tangaReturnToMombasa: { type: Number, default: 70 },
}, { _id: false });
const systemConfigSchema = new mongoose_1.Schema({
    configType: {
        type: String,
        required: true,
        enum: ['fuel_stations', 'routes', 'truck_batches', 'standard_allocations', 'general', 'system_settings', 'security_settings'],
        unique: true,
    },
    fuelStations: [fuelStationSchema],
    routes: [routeConfigSchema],
    truckBatches: {
        type: mongoose_1.Schema.Types.Mixed, // Allow dynamic keys
        default: {},
    },
    standardAllocations: standardAllocationsSchema,
    defaultFuelPrice: { type: Number, default: 1450 },
    systemSettings: {
        general: {
            systemName: { type: String, default: 'Fuel Order Management System' },
            timezone: { type: String, default: 'Africa/Nairobi' },
            dateFormat: { type: String, default: 'DD/MM/YYYY' },
            language: { type: String, default: 'en' },
        },
        session: {
            sessionTimeout: { type: Number, default: 30 },
            jwtExpiry: { type: Number, default: 24 },
            refreshTokenExpiry: { type: Number, default: 7 },
            maxLoginAttempts: { type: Number, default: 5 },
            lockoutDuration: { type: Number, default: 15 },
            allowMultipleSessions: { type: Boolean, default: true },
        },
        data: {
            archivalEnabled: { type: Boolean, default: true },
            archivalMonths: { type: Number, default: 6 },
            auditLogRetention: { type: Number, default: 12 },
            trashRetention: { type: Number, default: 90 },
            autoCleanupEnabled: { type: Boolean, default: false },
            backupFrequency: { type: String, default: 'daily' },
            backupRetention: { type: Number, default: 30 },
        },
        notifications: {
            emailNotifications: { type: Boolean, default: true },
            criticalAlerts: { type: Boolean, default: true },
            dailySummary: { type: Boolean, default: false },
            weeklyReport: { type: Boolean, default: true },
            slowQueryThreshold: { type: Number, default: 500 },
            storageWarningThreshold: { type: Number, default: 80 },
        },
        email: {
            host: { type: String, default: '' },
            port: { type: Number, default: 587 },
            secure: { type: Boolean, default: false },
            user: { type: String, default: '' },
            password: { type: String, default: '' },
            from: { type: String, default: '' },
            fromName: { type: String, default: 'Fuel Order System' },
        },
        maintenance: {
            enabled: { type: Boolean, default: false },
            message: { type: String, default: 'System is under maintenance. Please check back later.' },
            allowedRoles: { type: [String], default: ['super_admin'] },
        },
    },
    securitySettings: {
        password: {
            minLength: { type: Number, default: 12 },
            requireUppercase: { type: Boolean, default: true },
            requireLowercase: { type: Boolean, default: true },
            requireNumbers: { type: Boolean, default: true },
            requireSpecialChars: { type: Boolean, default: true },
            historyCount: { type: Number, default: 5 },
        },
        session: {
            timeoutMinutes: { type: Number, default: 30 },
            singleSession: { type: Boolean, default: false },
        },
    },
    lastUpdatedBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
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
// Index for quick lookup (configType already has unique: true which creates an index)
systemConfigSchema.index({ isDeleted: 1 });
exports.SystemConfig = mongoose_1.default.model('SystemConfig', systemConfigSchema);
