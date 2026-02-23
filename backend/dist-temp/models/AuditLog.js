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
exports.AuditLog = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const auditLogSchema = new mongoose_1.Schema({
    timestamp: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
    },
    userId: {
        type: String,
        ref: 'User',
    },
    username: {
        type: String,
        required: true,
        index: true,
    },
    action: {
        type: String,
        enum: [
            'CREATE',
            'UPDATE',
            'DELETE',
            'RESTORE',
            'PERMANENT_DELETE',
            'LOGIN',
            'LOGOUT',
            'FAILED_LOGIN',
            'PASSWORD_RESET',
            'CONFIG_CHANGE',
            'BULK_OPERATION',
            'EXPORT',
            'ENABLE_MAINTENANCE',
            'DISABLE_MAINTENANCE',
        ],
        required: true,
        index: true,
    },
    resourceType: {
        type: String,
        required: true,
        index: true,
    },
    resourceId: {
        type: String,
    },
    previousValue: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    newValue: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    ipAddress: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    details: {
        type: String,
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low',
        index: true,
    },
}, {
    timestamps: true,
    collection: 'audit_logs',
});
// Index for efficient querying
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ username: 1, timestamp: -1 });
// Static method to log an action
auditLogSchema.statics.logAction = async function (data) {
    const log = new this({
        timestamp: new Date(),
        ...data,
    });
    return log.save();
};
// Static method to get logs with filtering
auditLogSchema.statics.getLogs = async function (options) {
    const filter = {};
    if (options.action)
        filter.action = options.action;
    if (options.resourceType)
        filter.resourceType = options.resourceType;
    if (options.username)
        filter.username = options.username;
    if (options.severity)
        filter.severity = options.severity;
    if (options.startDate || options.endDate) {
        filter.timestamp = {};
        if (options.startDate)
            filter.timestamp.$gte = options.startDate;
        if (options.endDate)
            filter.timestamp.$lte = options.endDate;
    }
    const total = await this.countDocuments(filter);
    const logs = await this.find(filter)
        .sort({ timestamp: -1 })
        .limit(options.limit || 100)
        .skip(options.skip || 0);
    return { logs, total };
};
exports.AuditLog = mongoose_1.default.model('AuditLog', auditLogSchema);
