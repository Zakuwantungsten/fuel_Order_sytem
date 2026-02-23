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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverCredential = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const driverCredentialSchema = new mongoose_1.Schema({
    truckNo: {
        type: String,
        required: [true, 'Truck number is required'],
        unique: true,
        trim: true,
        uppercase: true,
        index: true,
    },
    pin: {
        type: String,
        required: [true, 'PIN is required'],
        select: false, // Don't return PIN by default
    },
    driverName: {
        type: String,
        trim: true,
    },
    phoneNumber: {
        type: String,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true,
    },
    lastLogin: {
        type: Date,
    },
    createdBy: {
        type: String,
        required: true,
    },
}, {
    timestamps: true,
});
// Hash PIN before saving
driverCredentialSchema.pre('save', async function (next) {
    if (!this.isModified('pin')) {
        return next();
    }
    try {
        const salt = await bcryptjs_1.default.genSalt(10);
        this.pin = await bcryptjs_1.default.hash(this.pin, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
// Method to compare PIN
driverCredentialSchema.methods.comparePin = async function (candidatePin) {
    try {
        return await bcryptjs_1.default.compare(candidatePin, this.pin);
    }
    catch (error) {
        return false;
    }
};
// Indexes
driverCredentialSchema.index({ isActive: 1, truckNo: 1 });
exports.DriverCredential = mongoose_1.default.model('DriverCredential', driverCredentialSchema);
