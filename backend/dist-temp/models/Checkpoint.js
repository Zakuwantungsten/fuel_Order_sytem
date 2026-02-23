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
exports.Checkpoint = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const checkpointSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        index: true,
    },
    displayName: {
        type: String,
        required: true,
        trim: true,
    },
    order: {
        type: Number,
        required: true,
        index: true,
    },
    region: {
        type: String,
        required: true,
        enum: [
            'KENYA',
            'TANZANIA_COASTAL',
            'TANZANIA_INTERIOR',
            'TANZANIA_BORDER',
            'ZAMBIA_NORTH',
            'ZAMBIA_CENTRAL',
            'ZAMBIA_COPPERBELT',
            'ZAMBIA_BORDER',
            'DRC',
        ],
        index: true,
    },
    country: {
        type: String,
        required: true,
        enum: ['KE', 'TZ', 'ZM', 'CD'],
        index: true,
    },
    coordinates: {
        latitude: { type: Number },
        longitude: { type: Number },
    },
    routeSegment: {
        type: String,
        enum: ['COASTAL', 'INTERIOR', 'BORDER', 'TRANSIT', 'DESTINATION'],
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    isMajor: {
        type: Boolean,
        default: false,
    },
    alternativeNames: {
        type: [String],
        default: [],
    },
    fuelAvailable: {
        type: Boolean,
        default: false,
    },
    borderCrossing: {
        type: Boolean,
        default: false,
    },
    estimatedDistanceFromStart: {
        type: Number,
        default: 0,
    },
    createdBy: {
        type: String,
        required: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
}, {
    timestamps: true,
});
// Indexes for performance
checkpointSchema.index({ order: 1, isActive: 1, isDeleted: 1 });
checkpointSchema.index({ region: 1, order: 1 });
checkpointSchema.index({ name: 1, isDeleted: 1 });
// Virtual for full display name
checkpointSchema.virtual('fullDisplayName').get(function () {
    return `${this.displayName} (${this.country})`;
});
exports.Checkpoint = mongoose_1.default.model('Checkpoint', checkpointSchema);
