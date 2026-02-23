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
exports.Notification = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const notificationSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: ['missing_total_liters', 'missing_extra_fuel', 'both', 'unlinked_export_do', 'yard_fuel_recorded', 'truck_pending_linking', 'truck_entry_rejected', 'lpo_created', 'info', 'warning', 'error'],
        required: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    message: {
        type: String,
        required: true,
        trim: true,
    },
    relatedModel: {
        type: String,
        enum: ['FuelRecord', 'DeliveryOrder', 'LPO', 'User', 'YardFuelDispense'],
        required: true,
    },
    relatedId: {
        type: String,
        required: true,
        trim: true,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    recipients: {
        type: [String],
        required: true,
        default: ['admin'],
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readBy: {
        type: [String],
        default: [],
    },
    status: {
        type: String,
        enum: ['pending', 'resolved', 'dismissed'],
        default: 'pending',
    },
    resolvedAt: {
        type: Date,
    },
    resolvedBy: {
        type: String,
        trim: true,
    },
    createdBy: {
        type: String,
        required: true,
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
notificationSchema.index({ recipients: 1, status: 1, isDeleted: 1 });
notificationSchema.index({ relatedModel: 1, relatedId: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });
exports.Notification = mongoose_1.default.model('Notification', notificationSchema);
