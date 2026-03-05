import mongoose, { Schema, Document } from 'mongoose';

// Fuel Station Configuration
export interface IFuelStation {
  id: string;
  name: string;
  location: string;
  pricePerLiter: number;
  isActive: boolean;
}

// Route Configuration
export interface IRouteConfig {
  destination: string;
  totalLiters: number;
  isActive: boolean;
}

// Destination-based extra fuel rule
export interface IDestinationFuelRule {
  destination: string; // e.g., "Mbeya", "Lusaka", "Dar"
  extraLiters: number; // Override extra fuel for this destination
}

// Truck Batch Configuration
export interface ITruckBatch {
  truckSuffix: string;
  extraLiters: number; // Default: 60, 80, or 100
  destinationRules?: IDestinationFuelRule[]; // Optional destination-based overrides
  truckNumber?: string; // Full truck number for reference
  addedBy: string;
  addedAt: Date;
}

// Per-yard time limit setting
export interface IYardTimeLimitSetting {
  enabled: boolean;
  timeLimitDays: number;
}

// Yard Fuel Dispense Time Limit Configuration
export interface IYardFuelTimeLimitConfig {
  enabled: boolean; // Global toggle
  perYard: {
    darYard: IYardTimeLimitSetting;
    tangaYard: IYardTimeLimitSetting;
    mmsaYard: IYardTimeLimitSetting;
  };
}

// Standard Allocations
export interface IStandardAllocations {
  mmsaYard: number;
  tangaYardToDar: number;
  darYardStandard: number;
  darYardKisarawe: number;
  darGoing: number;
  moroGoing: number;
  mbeyaGoing: number;
  tdmGoing: number;
  zambiaGoing: number;
  congoFuel: number;
  zambiaReturn: number;
  tundumaReturn: number;
  mbeyaReturn: number;
  moroReturnToMombasa: number;
  darReturn: number;
  tangaReturnToMombasa: number;
}

// System Settings
export interface ISystemSettings {
  // General Settings
  general?: {
    systemName: string;
    timezone: string;
    dateFormat: string;
    language: string;
  };
  // Session & Security Settings
  session?: {
    sessionTimeout: number; // minutes
    jwtExpiry: number; // hours
    refreshTokenExpiry: number; // days
    maxLoginAttempts: number;
    lockoutDuration: number; // minutes
    allowMultipleSessions: boolean;
  };
  // Data Management Settings
  data?: {
    archivalEnabled: boolean;
    archivalMonths: number;
    auditLogRetention: number; // months
    trashRetention: number; // days
    autoCleanupEnabled: boolean;
    backupFrequency: 'daily' | 'weekly' | 'monthly';
    backupRetention: number; // days
    // Per-collection archival settings
    collectionArchivalSettings?: {
      [collectionName: string]: {
        enabled: boolean;
        retentionMonths: number;
      };
    };
  };
  // Notification Settings
  notifications?: {
    emailNotifications: boolean;
    criticalAlerts: boolean;
    dailySummary: boolean;
    weeklyReport: boolean;
    slowQueryThreshold: number; // ms
    storageWarningThreshold: number; // percentage
    loginNotifications: boolean; // Send email on every login
    newDeviceAlerts: boolean; // Extra alert for new device sign-ins
    deviceTracking: boolean; // Track login devices and sessions
  };
  // Email Configuration
  email?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    fromName: string;
  };
  // Maintenance Mode
  maintenance?: {
    enabled: boolean;
    message: string;
    allowedRoles: string[];
  };
  // Rate Limit Settings
  rateLimits?: {
    apiRateLimitMax: number;
    rateLimitWindowMs: number;
  };
}

// MFA Settings
export interface IMFASettings {
  globalEnabled: boolean;
  requiredRoles: string[];
  allowedMethods: string[];  // e.g. ['totp', 'email'] — global default methods
  roleMethodOverrides: Record<string, string[]>;  // per-role overrides e.g. { admin: ['totp'] }
}

// Security Settings
export interface ISecuritySettings {
  password?: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    historyCount: number;
  };
  session?: {
    timeoutMinutes: number;
    singleSession: boolean;
  };
  mfa?: IMFASettings;
  autoblock?: {
    ipBlockingEnabled: boolean;
    blockDurationMs: number;
    suspiciousThreshold: number;
    threshold404Count: number;
    threshold404WindowMs: number;
    uaBlockingEnabled: boolean;
    ipGatingEnabled: boolean;
  };
}

// System Configuration Document
export interface ISystemConfig {
  configType: 'fuel_stations' | 'routes' | 'truck_batches' | 'standard_allocations' | 'yard_fuel_time_limit' | 'general' | 'system_settings' | 'security_settings';
  fuelStations?: IFuelStation[];
  routes?: IRouteConfig[];
  truckBatches?: {
    [extraLiters: string]: ITruckBatch[];  // Dynamic keys for any liter amount
  };
  standardAllocations?: IStandardAllocations;
  yardFuelTimeLimit?: IYardFuelTimeLimitConfig;
  defaultFuelPrice?: number;
  systemSettings?: ISystemSettings;
  securitySettings?: ISecuritySettings;
  lastUpdatedBy: string;
  isDeleted: boolean;
  deletedAt?: Date;
}

export interface ISystemConfigDocument extends ISystemConfig, Document {}

const fuelStationSchema = new Schema<IFuelStation>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    location: { type: String, required: true },
    pricePerLiter: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const routeConfigSchema = new Schema<IRouteConfig>(
  {
    destination: { type: String, required: true },
    totalLiters: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const destinationFuelRuleSchema = new Schema<IDestinationFuelRule>(
  {
    destination: { type: String, required: true },
    extraLiters: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const truckBatchSchema = new Schema<ITruckBatch>(
  {
    truckSuffix: { type: String, required: true },
    extraLiters: { type: Number, required: true, min: 0, max: 10000 },
    destinationRules: [destinationFuelRuleSchema],
    truckNumber: { type: String },
    addedBy: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const standardAllocationsSchema = new Schema<IStandardAllocations>(
  {
    mmsaYard: { type: Number, default: 0 },
    tangaYardToDar: { type: Number, default: 100 },
    darYardStandard: { type: Number, default: 550 },
    darYardKisarawe: { type: Number, default: 580 },
    darGoing: { type: Number, default: 0 },
    moroGoing: { type: Number, default: 0 },
    mbeyaGoing: { type: Number, default: 450 },
    tdmGoing: { type: Number, default: 0 },
    zambiaGoing: { type: Number, default: 0 },
    congoFuel: { type: Number, default: 0 },
    zambiaReturn: { type: Number, default: 400 },
    tundumaReturn: { type: Number, default: 100 },
    mbeyaReturn: { type: Number, default: 400 },
    moroReturnToMombasa: { type: Number, default: 100 },
    darReturn: { type: Number, default: 0 },
    tangaReturnToMombasa: { type: Number, default: 70 },
  },
  { _id: false }
);

const systemConfigSchema = new Schema<ISystemConfigDocument>(
  {
    configType: {
      type: String,
      required: true,
      enum: ['fuel_stations', 'routes', 'truck_batches', 'standard_allocations', 'yard_fuel_time_limit', 'general', 'system_settings', 'security_settings'],
      unique: true,
    },
    fuelStations: [fuelStationSchema],
    routes: [routeConfigSchema],
    truckBatches: {
      type: Schema.Types.Mixed,  // Allow dynamic keys
      default: {},
    },
    standardAllocations: standardAllocationsSchema,
    yardFuelTimeLimit: {
      enabled: { type: Boolean, default: false },
      perYard: {
        darYard: {
          enabled: { type: Boolean, default: true },
          timeLimitDays: { type: Number, default: 2, min: 0.5, max: 30 },
        },
        tangaYard: {
          enabled: { type: Boolean, default: true },
          timeLimitDays: { type: Number, default: 2, min: 0.5, max: 30 },
        },
        mmsaYard: {
          enabled: { type: Boolean, default: true },
          timeLimitDays: { type: Number, default: 2, min: 0.5, max: 30 },
        },
      },
    },
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
        loginNotifications: { type: Boolean, default: true },
        newDeviceAlerts: { type: Boolean, default: true },
        deviceTracking: { type: Boolean, default: true },
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
      mfa: {
        globalEnabled: { type: Boolean, default: false },
        requiredRoles: { type: [String], default: [] },
        allowedMethods: { type: [String], default: ['totp', 'email'] },
        roleMethodOverrides: { type: Schema.Types.Mixed, default: {} },
      },
      autoblock: {
        ipBlockingEnabled: { type: Boolean, default: true },
        blockDurationMs: { type: Number, default: 600000 },
        suspiciousThreshold: { type: Number, default: 5 },
        threshold404Count: { type: Number, default: 30 },
        threshold404WindowMs: { type: Number, default: 300000 },
        uaBlockingEnabled: { type: Boolean, default: true },
        ipGatingEnabled: { type: Boolean, default: false },
      },
    },
    lastUpdatedBy: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc: any, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Index for quick lookup (configType already has unique: true which creates an index)
systemConfigSchema.index({ isDeleted: 1 });

export const SystemConfig = mongoose.model<ISystemConfigDocument>('SystemConfig', systemConfigSchema);
