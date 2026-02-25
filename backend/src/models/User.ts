import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types';

export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUserDocument>(
  {
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
      minlength: [1, 'Password cannot be empty'],
      select: false,
    },
    passwordHistory: {
      type: [String],
      select: false,
      default: [],
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
    passwordResetAt: {
      type: Date,
      default: null,
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
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

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
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Don't return password and refresh token in JSON
userSchema.set('toJSON', {
  transform: function (_doc, ret) {
    delete (ret as any).password;
    delete (ret as any).refreshToken;
    delete (ret as any).__v;
    return ret;
  },
});

export const User = mongoose.model<IUserDocument>('User', userSchema);
