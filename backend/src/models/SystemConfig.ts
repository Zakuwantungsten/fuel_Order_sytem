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

// Fuel-record automation toggles.
// Each flag controls one automatic side-effect that mutates fuel records when an
// LPO or DO is created/edited/cancelled. When a flag is OFF the originating
// LPO/DO operation still completes, but the fuel-record mutation is skipped and an
// audit breadcrumb is written so staff can reconcile fuel records manually.
// All default to `true` so existing behaviour is preserved on deploy.
export interface IFuelAutomationConfig {
  lpoCreateDeduct: boolean;   // LPO creation deducts fuel from the matched record
  lpoCancelRevert: boolean;   // LPO entry cancellation/removal reverts the deduction
  lpoEditAdjust: boolean;     // LPO entry liters edit re-adjusts the fuel record
  lpoPickupAuto: boolean;     // Pick-up-at auto-detects the deduct/add checkpoints; when OFF the user picks them per truck
  doImportCreate: boolean;    // Import DO creates a new going-journey fuel record
  doExportUpdate: boolean;    // Export DO updates the matched going record's return leg
  doAmendCascade: boolean;    // DO amendment (truck/destination/loadingPoint) recalcs the fuel record
  doCancelCascade: boolean;   // DO cancellation cancels/reverts the linked fuel record
}

// Journey Configuration
// Defines which fuel "going" columns, when filled on a QUEUED journey, signal that
// the truck has physically started that journey — which auto-completes the truck's
// current active journey and promotes this queued one to active.
export interface IJourneyConfig {
  startColumns: string[];
  // Stations a super_manager is allowed to view LPOs for. Empty/unset => default
  // (all stations except the hard-excluded set, resolved on the client).
  superManagerStations?: string[];
  // How many days back manager-tier roles (manager, station_manager, super_manager)
  // are allowed to see LPOs in the web/mobile manager views. 0/unset => unlimited.
  // Enforced server-side so a manager can't widen the window by editing the client.
  managerLpoLookbackDays?: number;
  // Controls whether PDF is auto-downloaded after DO (single or bulk) creation.
  autoDownloadDOPdf?: boolean;
  // Controls whether PDF is auto-downloaded after LPO "Create and Forward".
  autoDownloadLPOPdf?: boolean;
  // Per-operation fuel-record automation switches (see IFuelAutomationConfig).
  fuelAutomation?: IFuelAutomationConfig;
  // How many days back to search for existing LPOs when creating a CASH LPO (default 40).
  cashLpoLookbackDays?: number;
  // Dashboard unified-search configuration.
  searchConfig?: {
    doMonths?: number;       // months back to search DOs (default 4)
    doMaxResults?: number;   // max DO results (default 6)
    lpoMonths?: number;      // months back to search LPOs (default 1)
    lpoMaxResults?: number;  // max LPO results (default 50)
    fuelMaxResults?: number; // max fuel record results (default 3)
  };
}

// Canonical default for the fuel-automation flags (all enabled).
export const DEFAULT_FUEL_AUTOMATION: IFuelAutomationConfig = {
  lpoCreateDeduct: true,
  lpoCancelRevert: true,
  lpoEditAdjust: true,
  lpoPickupAuto: true,
  doImportCreate: true,
  doExportUpdate: true,
  doAmendCascade: true,
  doCancelCascade: true,
};

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
    // Company branding (used in generated PDFs, Excel exports, and DO previews)
    companyName: string;
    companyWebsite: string;
    companyEmail: string;
    companyPhone: string;
    logoUrl: string; // base64 data URL (e.g. "data:image/png;base64,...") or empty string
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
    backupFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
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
    sendCredentialsEmail: boolean; // Send welcome email with username/password to new users
    credentialsExpiryHours: number; // Hours before a temporary password expires (0 = never)
    bypassEmailVerification: boolean; // Skip OTP requirement for email MFA setup (use when email service is not yet verified)
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
    expirationDays: number;        // 0 = never
    expirationWarningDays: number; // days before expiry to warn
    expirationGraceDays: number;   // grace period after expiry
    expirationExemptRoles: string[];
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
  configType: 'fuel_stations' | 'routes' | 'truck_batches' | 'standard_allocations' | 'yard_fuel_time_limit' | 'general' | 'system_settings' | 'security_settings' | 'journey_config';
  fuelStations?: IFuelStation[];
  routes?: IRouteConfig[];
  truckBatches?: {
    [extraLiters: string]: ITruckBatch[];  // Dynamic keys for any liter amount
  };
  batchDestinationRules?: {
    [extraLiters: string]: IDestinationFuelRule[];  // Batch-level destination overrides
  };
  standardAllocations?: IStandardAllocations;
  journeyConfig?: IJourneyConfig;
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
      enum: ['fuel_stations', 'routes', 'truck_batches', 'standard_allocations', 'yard_fuel_time_limit', 'general', 'system_settings', 'security_settings', 'journey_config'],
      unique: true,
    },
    fuelStations: [fuelStationSchema],
    routes: [routeConfigSchema],
    truckBatches: {
      type: Schema.Types.Mixed,  // Allow dynamic keys
      default: {},
    },
    batchDestinationRules: {
      type: Schema.Types.Mixed,  // Allow dynamic keys: { "120": [{destination, extraLiters}] }
      default: {},
    },
    standardAllocations: standardAllocationsSchema,
    journeyConfig: {
      startColumns: {
        type: [String],
        default: ['darYard', 'darGoing', 'moroGoing'],
      },
      superManagerStations: {
        type: [String],
        default: [],
      },
      // 0 = unlimited. Capped at 10 years so a typo can't disable the floor entirely.
      managerLpoLookbackDays: { type: Number, default: 0, min: 0, max: 3650 },
      autoDownloadDOPdf: {
        type: Boolean,
        default: true,
      },
      autoDownloadLPOPdf: {
        type: Boolean,
        default: true,
      },
      fuelAutomation: {
        lpoCreateDeduct: { type: Boolean, default: true },
        lpoCancelRevert: { type: Boolean, default: true },
        lpoEditAdjust: { type: Boolean, default: true },
        lpoPickupAuto: { type: Boolean, default: true },
        doImportCreate: { type: Boolean, default: true },
        doExportUpdate: { type: Boolean, default: true },
        doAmendCascade: { type: Boolean, default: true },
        doCancelCascade: { type: Boolean, default: true },
      },
      cashLpoLookbackDays: { type: Number, default: 40, min: 1, max: 365 },
      searchConfig: {
        doMonths:      { type: Number, default: 4,  min: 1, max: 24 },
        doMaxResults:  { type: Number, default: 6,  min: 1, max: 100 },
        lpoMonths:     { type: Number, default: 1,  min: 1, max: 24 },
        lpoMaxResults: { type: Number, default: 50, min: 1, max: 500 },
        fuelMaxResults:{ type: Number, default: 3,  min: 1, max: 100 },
      },
    },
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
        companyName: { type: String, default: 'TAHMEED' },
        companyWebsite: { type: String, default: 'www.tahmeedcoach.co.ke' },
        companyEmail: { type: String, default: 'info@tahmeedcoach.co.ke' },
        companyPhone: { type: String, default: '+254 700 000 000' },
        logoUrl: { type: String, default: '' },
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
        sendCredentialsEmail: { type: Boolean, default: true },
        credentialsExpiryHours: { type: Number, default: 24 },
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
        expirationDays: { type: Number, default: 0 },
        expirationWarningDays: { type: Number, default: 7 },
        expirationGraceDays: { type: Number, default: 3 },
        expirationExemptRoles: { type: [String], default: [] },
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
