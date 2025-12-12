// User Types
export type UserRole = 
  | 'super_admin' 
  | 'admin' 
  | 'manager' 
  | 'super_manager'
  | 'supervisor' 
  | 'clerk' 
  | 'driver' 
  | 'viewer' 
  | 'fuel_order_maker' 
  | 'boss' 
  | 'yard_personnel' 
  | 'fuel_attendant' 
  | 'station_manager' 
  | 'payment_manager'
  | 'dar_yard'
  | 'tanga_yard'
  | 'mmsa_yard'
  | 'import_officer'
  | 'export_officer';

// Audit Log Types
export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'RESTORE' 
  | 'PERMANENT_DELETE'
  | 'LOGIN' 
  | 'LOGOUT' 
  | 'FAILED_LOGIN'
  | 'PASSWORD_RESET'
  | 'CONFIG_CHANGE'
  | 'BULK_OPERATION'
  | 'EXPORT';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface IAuditLog {
  timestamp: Date;
  userId?: string;
  username: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  severity: AuditSeverity;
  createdAt: Date;
}

// Database Metrics Types
export interface IDatabaseMetrics {
  connections: {
    current: number;
    available: number;
    totalCreated: number;
  };
  performance: {
    queriesPerSecond: number;
    averageResponseTime: number;
    slowQueries: ISlowQuery[];
    failedQueries: number;
  };
  storage: {
    totalSize: number;
    dataSize: number;
    indexSize: number;
    freeSpace: number;
    growthRate: number;
  };
  collections: ICollectionStats[];
}

export interface ISlowQuery {
  query: string;
  collection: string;
  executionTime: number;
  timestamp: Date;
  user?: string;
}

export interface ICollectionStats {
  name: string;
  documentCount: number;
  size: number;
  avgDocSize: number;
  indexes: number;
}

// Notification Settings Types
export interface INotificationSettings {
  emailRecipients: string[];
  alertThresholds: {
    slowQueryMs: number;
    storageWarningMB: number;
    failedLoginAttempts: number;
    cpuWarningPercent: number;
    memoryWarningPercent: number;
  };
  frequency: 'immediate' | 'batched' | 'hourly';
  dailySummary: {
    enabled: boolean;
    sendAt: string;
  };
  weeklyReport: {
    enabled: boolean;
    sendOnDay: string;
  };
}

// Trash/Soft Delete Management Types
export interface ITrashItem {
  id: string;
  type: string;
  deletedBy: string;
  deletedAt: Date;
  data: any;
}

export interface IUser {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department?: string;
  station?: string;
  yard?: 'DAR YARD' | 'TANGA YARD' | 'MMSA YARD';
  truckNo?: string;
  currentDO?: string;
  isActive: boolean;
  isBanned?: boolean;
  bannedAt?: Date;
  bannedBy?: string;
  bannedReason?: string;
  lastLogin?: Date;
  refreshToken?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Delivery Order Types
export type DOStatus = 'active' | 'cancelled';

export interface IDeliveryOrder {
  sn: number;
  date: string;
  importOrExport: 'IMPORT' | 'EXPORT';
  doType: 'DO' | 'SDO';
  doNumber: string;
  invoiceNos?: string;
  clientName: string;
  truckNo: string;
  trailerNo: string;
  containerNo?: string;
  borderEntryDRC?: string;
  loadingPoint: string;
  destination: string;
  haulier: string;
  driverName?: string;
  tonnages: number;
  ratePerTon: number;
  rate?: string;
  cargoType?: 'loosecargo' | 'container';
  rateType?: 'per_ton' | 'fixed_total';
  totalAmount?: number;
  // Status fields
  status: DOStatus;
  isCancelled: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
  cancelledBy?: string;
  // Edit history tracking
  editHistory?: IDeliveryOrderEditHistory[];
  lastEditedAt?: Date;
  lastEditedBy?: string;
  // Soft delete fields
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Edit history interface to track changes
export interface IDeliveryOrderEditHistory {
  editedAt: Date;
  editedBy: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  reason?: string;
}

// LPO Entry Types (Summary LPOS)
export interface ILPOEntry {
  sn: number;
  date: string;
  lpoNo: string;
  dieselAt: string;
  doSdo: string;
  truckNo: string;
  ltrs: number;
  pricePerLtr: number;
  destinations: string;
  // Amendment tracking
  originalLtrs?: number | null;
  amendedAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date;
  // Driver Account / Cash fields
  isDriverAccount?: boolean;  // True for driver's account (misuse/theft) or cash entries
  referenceDo?: string;       // Reference DO for NIL entries to link to a journey
  paymentMode?: 'STATION' | 'CASH' | 'DRIVER_ACCOUNT';  // Payment method
  createdAt: Date;
  updatedAt: Date;
}

// LPO Detail (for LPO documents)
export interface ILPODetail {
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  sortOrder?: number;
  // Amendment tracking
  originalLiters?: number | null;
  amendedAt?: Date | null;
  // Cancellation and Driver Account fields
  isCancelled?: boolean;
  isDriverAccount?: boolean;
  cancellationPoint?: CancellationPoint;
  // New: Support both directions for CASH payments (can have one or both)
  goingCheckpoint?: CancellationPoint;
  returningCheckpoint?: CancellationPoint;
  originalDoNo?: string;
  cancellationReason?: string;
  cancelledAt?: Date;
  // Reference DO for NIL entries to link to a journey
  referenceDo?: string;
  // Custom station fields (for unlisted stations like small lake stations in Zambia)
  isCustomStation?: boolean;
  customStationName?: string;
  customGoingCheckpoint?: string;   // Fuel record field for going direction (Custom1)
  customReturnCheckpoint?: string;  // Fuel record field for return direction (Custom2)
}

// Cancellation Point Types
export type CancellationPoint = 
  | 'DAR_GOING'
  | 'MORO_GOING'
  | 'MBEYA_GOING'
  | 'INFINITY_GOING'
  | 'TDM_GOING'
  | 'ZAMBIA_GOING'
  | 'CONGO_GOING'
  | 'ZAMBIA_NDOLA'
  | 'ZAMBIA_KAPIRI'
  | 'TDM_RETURN'
  | 'MBEYA_RETURN'
  | 'MORO_RETURN'
  | 'DAR_RETURN'
  | 'TANGA_RETURN'
  | 'CONGO_RETURNING'
  // Custom station checkpoints (for unlisted stations)
  | 'CUSTOM_GOING'
  | 'CUSTOM_RETURN';

// Cancellation Entry
export interface ICancellationEntry {
  lpoNo: string;
  truckNo: string;
  originalDoNo: string;
  cancellationPoint: CancellationPoint;
  liters: number;
  rate: number;
  reason?: string;
  isDriverAccount: boolean;
  cancelledAt: Date;
  cancelledBy: string;
}

// Payment Mode Types for Driver Account
export type PaymentMode = 'TIGO_LIPA' | 'VODA_LIPA' | 'SELCOM' | 'CASH' | 'STATION';

// Driver Account Entry
export interface IDriverAccountEntry {
  date: string;
  month: string;
  year: number;
  lpoNo: string;
  truckNo: string;
  driverName?: string;
  liters: number;
  rate: number;
  amount: number;
  station: string;
  cancellationPoint?: CancellationPoint;  // Optional - driver account entries don't cancel any LPO
  journeyDirection: 'going' | 'returning';  // Going or returning
  originalDoNo?: string;  // Reference DO (not displayed in exports)
  paymentMode?: PaymentMode;  // Mode of payment
  paybillOrMobile?: string;  // Paybill number or mobile number for mobile payments
  status: 'pending' | 'settled' | 'disputed';
  settledAt?: Date;
  settledBy?: string;
  approvedBy?: string;  // Name of approver for the Driver's Account LPO
  notes?: string;
  createdBy: string;
  // Fields to track LPO creation
  lpoCreated?: boolean;
  lpoSummaryId?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// LPO Summary/Document (Sheet in workbook)
export interface ILPOSummary {
  lpoNo: string;
  date: string;
  year: number;
  station: string;
  orderOf: string;
  entries: ILPODetail[];
  total: number;
  // Forwarding tracking - if this LPO was forwarded from another
  forwardedFrom?: {
    lpoId: string;
    lpoNo: string;
    station: string;
  };
  createdBy?: string;  // Username of who created this LPO
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// LPO Workbook (contains sheets/LPO documents for a year)
export interface ILPOWorkbook {
  year: number;
  name: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Fuel Record Types
export interface IFuelRecord {
  date: string;
  month?: string;
  truckNo: string;
  goingDo: string;
  returnDo?: string;
  start: string;
  from: string;
  to: string;
  totalLts: number | null;
  extra?: number | null;
  // Lock status for pending configurations
  isLocked?: boolean;
  pendingConfigReason?: 'missing_total_liters' | 'missing_extra_fuel' | 'both' | null;
  mmsaYard?: number;
  tangaYard?: number;
  darYard?: number;
  darGoing?: number;
  moroGoing?: number;
  mbeyaGoing?: number;
  tdmGoing?: number;
  zambiaGoing?: number;
  congoFuel?: number;
  zambiaReturn?: number;
  tundumaReturn?: number;
  mbeyaReturn?: number;
  moroReturn?: number;
  darReturn?: number;
  tangaReturn?: number;
  balance: number;
  // Original going journey locations (stored before EXPORT DO changes them)
  originalGoingFrom?: string;
  originalGoingTo?: string;
  // Cancellation fields
  isCancelled?: boolean;
  cancelledAt?: Date;
  cancellationReason?: string;
  cancelledBy?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Yard Fuel Dispensing
export interface IYardFuelDispense {
  date: string;
  truckNo: string;
  liters: number;
  yard: 'DAR YARD' | 'TANGA YARD' | 'MMSA YARD' | 'MBEYA YARD';
  enteredBy: string;
  timestamp: Date;
  notes?: string;
  linkedFuelRecordId?: string;
  linkedDONumber?: string;
  autoLinked?: boolean;
  status: 'pending' | 'linked' | 'manual';
  rejectionReason?: string;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionResolved?: boolean;
  rejectionResolvedAt?: Date;
  rejectionResolvedBy?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  history?: Array<{
    action: 'created' | 'updated' | 'rejected' | 're-entered' | 'linked';
    performedBy: string;
    timestamp: Date;
    details?: any;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Pagination Types
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Authentication Types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface AuthResponse {
  user: Omit<IUser, 'password' | 'refreshToken'>;
  accessToken: string;
  refreshToken: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
}

// System Configuration Types
export interface IFuelStation {
  id: string;
  name: string;
  location: string;
  pricePerLiter: number;
  isActive: boolean;
}

export interface IRouteConfig {
  destination: string;
  totalLiters: number;
  isActive: boolean;
}

export interface ITruckBatch {
  truckSuffix: string;
  extraLiters: number;
  truckNumber?: string;
  addedBy: string;
  addedAt: Date;
}

export interface IStandardAllocations {
  tangaYardToDar: number;
  darYardStandard: number;
  darYardKisarawe: number;
  mbeyaGoing: number;
  tundumaReturn: number;
  mbeyaReturn: number;
  moroReturnToMombasa: number;
  tangaReturnToMombasa: number;
}

export interface ISystemConfig {
  configType: 'fuel_stations' | 'routes' | 'truck_batches' | 'standard_allocations' | 'general';
  fuelStations?: IFuelStation[];
  routes?: IRouteConfig[];
  truckBatches?: {
    batch_100: ITruckBatch[];
    batch_80: ITruckBatch[];
    batch_60: ITruckBatch[];
  };
  standardAllocations?: IStandardAllocations;
  defaultFuelPrice?: number;
  lastUpdatedBy: string;
  isDeleted: boolean;
  deletedAt?: Date;
}
