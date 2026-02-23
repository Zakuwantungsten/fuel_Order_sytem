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
exports.User = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false,
    },
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
    },
    role: {
        type: String,
        enum: [
            'super_admin',
            'admin',
            'manager',
            'super_manager',
            'supervisor',
            'clerk',
            'driver',
            'viewer',
            'fuel_order_maker',
            'boss',
            'yard_personnel',
            'fuel_attendant',
            'station_manager',
            'payment_manager',
            'dar_yard',
            'tanga_yard',
            'mmsa_yard',
            'import_officer',
            'export_officer',
        ],
        default: 'viewer',
    },
    yard: {
        type: String,
        enum: ['DAR YARD', 'TANGA YARD', 'MMSA YARD'],
        trim: true,
    },
    department: {
        type: String,
        trim: true,
    },
    station: {
        type: String,
        trim: true,
    },
    truckNo: {
        type: String,
        trim: true,
    },
    currentDO: {
        type: String,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    isBanned: {
        type: Boolean,
        default: false,
    },
    bannedAt: {
        type: Date,
    },
    bannedBy: {
        type: String,
    },
    bannedReason: {
        type: String,
    },
    lastLogin: {
        type: Date,
    },
    mustChangePassword: {
        type: Boolean,
        default: false,
    },
    refreshToken: {
        type: String,
        select: false,
    },
    resetPasswordToken: {
        type: String,
        select: false,
    },
    resetPasswordExpires: {
        type: Date,
        select: false,
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
// Note: username and email already have unique indexes from schema definition
userSchema.index({ role: 1 });
userSchema.index({ isDeleted: 1 });
// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    try {
        const salt = await bcryptjs_1.default.genSalt(10);
        this.password = await bcryptjs_1.default.hash(this.password, salt);
        next();
    }
    catch (error) {
        next(error);
    }
});
// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
// Don't return password and refresh token in JSON
userSchema.set('toJSON', {
    transform: function (_doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.__v;
        return ret;
    },
});
exports.User = mongoose_1.default.model('User', userSchema);
