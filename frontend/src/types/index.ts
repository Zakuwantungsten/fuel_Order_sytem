// Delivery Order (DO) Types
export type DOStatus = 'active' | 'cancelled';
export type JourneyStatus = 'queued' | 'active' | 'completed' | 'cancelled';

export interface DeliveryOrderEditHistory {
  editedAt: string;
  editedBy: string;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  reason?: string;
}

export interface DeliveryOrder {
  id?: string | number;
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
  status?: DOStatus;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  // Edit history tracking
  editHistory?: DeliveryOrderEditHistory[];
  lastEditedAt?: string;
  lastEditedBy?: string;
}

// Local Purchase Order (LPO) Types - Summary LPOS structure
export interface LPOEntry {
  id?: string | number;
  sn: number;
  date: string;
  lpoNo: string;
  dieselAt: string; // Station name like "LAKE CHILABOMBWE"
  doSdo: string;
  truckNo: string;
  ltrs: number;
  pricePerLtr: number;
  destinations: string;
  // Amendment tracking
  originalLtrs?: number | null;
  amendedAt?: string | null;
}

// LPO Detail format (from LPOS 2025.csv)
export interface LPODetail {
  id?: string | number;
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  // Amendment tracking
  originalLiters?: number | null;
  amendedAt?: string | null;
}

// LPO Auto-fetch types
export interface DOSelectionResult {
  doNumber: string;
  doType: 'going' | 'returning';
  deliveryOrder: DeliveryOrder;
  fuelRecord?: FuelRecord;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface StationFuelDefaults {
  station: string;
  goingFuel?: number;
  returningFuel?: number;
  rate: number;
  checkpoint: string;
}

export interface LPOAutoFillData {
  doNumber: string;
  doType: 'going' | 'returning';
  liters: number;
  rate: number;
  destination: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  allowCustom: boolean;
}

// LPO Summary with header and details (complete LPO document / Sheet)
export interface LPOSummary {
  id?: string | number;
  lpoNo: string;
  date: string;
  year?: number; // Auto-extracted from date
  station: string; // e.g., "CASH"
  orderOf: string; // e.g., "TAHMEED"
  entries: LPODetail[];
  total: number;
  createdBy?: string; // Username of who created this LPO
  approvedBy?: string; // Name of approver (optional - for any LPO that needs approval signature)
  createdAt?: string;
  updatedAt?: string;
  // Forwarding tracking (if this LPO was forwarded from another)
  forwardedFrom?: {
    lpoId?: string | number; // Optional - may not have ObjectId when forwarding from frontend
    lpoNo: string;
    station: string;
  };
  // Custom station fields (for unlisted stations)
  isCustomStation?: boolean;
  customStationName?: string;
  customGoingCheckpoint?: string;
  customReturnCheckpoint?: string;
}

// LPO Forwarding Types
export interface ForwardingRoute {
  id: string;
  name: string;
  description: string;
  fromStation: string;
  toStation: string;
  defaultLiters: number;
  rate: number;
  currency: 'USD' | 'TZS';
}

export interface ForwardLPORequest {
  sourceLpoId: string | number;
  targetStation: string;
  defaultLiters: number;
  rate: number;
  date?: string;
  orderOf?: string;
  includeOnlyActive?: boolean;
  // Custom station fields (when targetStation is 'CUSTOM')
  customStationName?: string;
  customGoingCheckpoint?: string;
  customReturnCheckpoint?: string;
}

export interface ForwardLPOResponse {
  sourceLpo: {
    id: string;
    lpoNo: string;
    station: string;
  };
  forwardedLpo: LPOSummary;
  entriesForwarded: number;
}

// LPO Workbook Types (Excel-like structure - one per year)
export interface LPOWorkbook {
  id?: string | number;
  year: number; // Year this workbook represents (e.g., 2025)
  name: string; // Workbook name like "LPOS 2025"
  sheetCount?: number; // Number of sheets in this workbook
  sheets?: LPOSummary[]; // Sheets (LPO documents) in this workbook
  createdAt?: string;
  updatedAt?: string;
}

// DO Workbook Types (Excel-like structure - one per year, each DO is a sheet)
export interface DOWorkbook {
  id?: string | number;
  year: number; // Year this workbook represents (e.g., 2025)
  name: string; // Workbook name like "DELIVERY ORDERS 2025"
  type?: 'DO' | 'SDO'; // Type of workbook (for filtering when viewing all)
  sheetCount?: number; // Number of sheets (DOs) in this workbook
  sheets?: DeliveryOrder[]; // Each DO is a sheet in the workbook
  createdAt?: string;
  updatedAt?: string;
}

// DOSheet is just an alias for DeliveryOrder for clarity in workbook context
export type DOSheet = DeliveryOrder;

// LPO Sheet is same as LPOSummary (alias for clarity)
export interface LPOSheet extends LPOSummary {
  workbookId?: string | number;
  isActive?: boolean; // For UI state management
}

// Enhanced LPO Detail with additional fields for Excel compatibility
export interface LPODetail {
  id?: string | number;
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  dest: string;
  sortOrder?: number; // For maintaining order in the sheet
  // Cancellation and payment mode fields
  isCancelled?: boolean;
  cancellationPoint?: CancellationPoint;
  isDriverAccount?: boolean;
  paymentMode?: 'STATION' | 'CASH' | 'DRIVER_ACCOUNT';
  // Custom station fields (for unlisted stations like small lake stations in Zambia)
  isCustomStation?: boolean;
  customStationName?: string;
  // Custom checkpoint mapping: which fuel record column to update based on direction
  customGoingCheckpoint?: string;   // Fuel record field for going direction (Custom1)
  customReturnCheckpoint?: string;  // Fuel record field for return direction (Custom2)
}

// Fuel Record Types
export interface FuelRecord {
  id?: string | number;
  _id?: string | number;  // MongoDB document ID (backend returns this)
  date: string;
  month?: string; // e.g., "October", "November"
  truckNo: string;
  goingDo: string;
  returnDo?: string;
  start: string;
  from: string;
  to: string;
  totalLts: number | null;
  extra?: number | null;
  // Journey status and queue management
  journeyStatus?: JourneyStatus;
  queueOrder?: number;
  activatedAt?: string;
  completedAt?: string;
  estimatedStartDate?: string;
  previousJourneyId?: string;
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
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: string;
}

// Master DO template (for generating new DOs)
export interface MasterDOTemplate {
  deliveryNoteGRN: string;
  company: string;
  doNumber: string;
  reload: string;
  date: string;
  polTCC: string;
  arriveTangaDar: string;
  destination: string;
  lorryNo: string;
  haulier: string;
  trailerNo: string;
  containerNo: string;
  blNo: string;
  packages: string;
  contents: string;
  weight: number;
  measurement: string;
  rate: number;
  releasingClerk?: string;
  delivererName?: string;
  delivererDate?: string;
  delivererNationalId?: string;
}

// User Types with Role-Based Authentication (Enhanced with new roles)
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'super_manager' | 'supervisor' | 'clerk' | 'driver' | 'viewer' | 'fuel_order_maker' | 'boss' | 'yard_personnel' | 'fuel_attendant' | 'station_manager' | 'payment_manager' | 'dar_yard' | 'tanga_yard' | 'mmsa_yard' | 'import_officer' | 'export_officer';

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

export interface AuditLog {
  id: string;
  timestamp: string;
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
}

// Database Metrics Types
export interface DatabaseMetrics {
  connections: {
    current: number;
    available: number;
    totalCreated: number;
  };
  performance: {
    queriesPerSecond: number;
    averageResponseTime: number;
    slowQueries: SlowQuery[];
    failedQueries: number;
  };
  storage: {
    totalSize: number;
    dataSize: number;
    indexSize: number;
    freeSpace: number;
    growthRate: number;
  };
  collections: CollectionStats[];
  status: 'connected' | 'disconnected' | 'error';
}

export interface SlowQuery {
  query: string;
  collection: string;
  executionTime: number;
  timestamp: string;
  user?: string;
}

export interface CollectionStats {
  name: string;
  documentCount: number;
  size: number;
  avgDocSize: number;
  indexes: number;
}

// Trash Item Types
export interface TrashItem {
  id: string;
  type: string;
  data: any;
  deletedBy: string;
  deletedAt: string;
}

export interface TrashStats {
  type: string;
  count: number;
  oldestItem?: { deletedAt: string };
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
  description: string;
}

export interface User {
  id: string | number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department?: string;
  station?: string; // For station personnel
  yard?: string; // For yard personnel
  truckNo?: string; // For drivers
  currentDO?: string; // For drivers - current delivery order
  isActive: boolean;
  isBanned?: boolean;
  bannedAt?: string;
  bannedBy?: string;
  bannedReason?: string;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser extends User {
  token: string;
  permissions: Permission[];
  theme?: 'light' | 'dark';
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  theme: 'light' | 'dark';
}

// Dashboard Stats
export interface DashboardStats {
  totalDOs: number;
  totalLPOs: number;
  totalFuelRecords: number;
  activeTrips: number;
  totalTonnage: number;
  totalLiters: number;
  totalRevenue: number;
  yardFuelSummary?: {
    mmsa: number;
    tanga: number;
    dar: number;
  };
  pendingYardFuel?: number;
  recentActivities?: {
    deliveryOrders: DeliveryOrder[];
    lpoEntries: LPOEntry[];
  };
}

// Report Stats for detailed analytics
export interface ReportStats {
  fuelConsumption: {
    total: number;
    byYard: Array<{ name: string; value: number }>;
    byStation: Array<{ name: string; value: number }>;
  };
  financials: {
    totalRevenue: number;
    totalCost: number;
    totalFuelCost: number;
    profit: number;
    profitMargin: number;
  };
  operations: {
    totalTrips: number;
    totalTrucks: number;
    averageFuelPerTrip: number;
    onTimeDelivery: number;
  };
  trends: Array<{
    month: string;
    year?: number;
    fuel: number;
    revenue: number;
  }>;
}

// Filter Types
export interface DOFilters {
  dateFrom?: string;
  dateTo?: string;
  clientName?: string;
  truckNo?: string;
  importOrExport?: 'IMPORT' | 'EXPORT' | 'ALL';
  destination?: string;
}

export interface LPOFilters {
  dateFrom?: string;
  dateTo?: string;
  lpoNo?: string;
  truckNo?: string;
  station?: string;
}

export interface FuelRecordFilters {
  dateFrom?: string;
  dateTo?: string;
  truckNo?: string;
  from?: string;
  to?: string;
}

// Yard Fuel Dispensing Types
export interface YardFuelDispense {
  id?: string | number;
  date: string;
  truckNo: string;
  liters: number;
  yard: 'DAR YARD' | 'TANGA YARD' | 'MMSA YARD';
  enteredBy: string;
  timestamp: string;
  notes?: string;
  // Auto-linked fields (populated by system)
  linkedFuelRecordId?: string | number;
  linkedDONumber?: string;
  autoLinked?: boolean;
  status?: 'pending' | 'linked' | 'manual'; // pending = waiting for DO, linked = auto-matched, manual = manually entered
  // Rejection fields
  rejectionReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  // History tracking
  history?: Array<{
    action: 'created' | 'updated' | 'rejected' | 're-entered' | 'linked';
    performedBy: string;
    timestamp: string;
    details?: any;
  }>;
}

// Cash Mode Cancellation Types - Checkpoints along the route
export type CancellationPoint = 
  // Going direction checkpoints
  | 'DAR_GOING' 
  | 'MORO_GOING' 
  | 'MBEYA_GOING'
  | 'INFINITY_GOING'  // Infinity/Mbeya Going
  | 'TDM_GOING'       // TDM/Tunduma (going)
  | 'ZAMBIA_GOING'    // Lake Chilabombwe
  | 'CONGO_GOING'     // Congo (going direction)
  // Returning direction checkpoints
  | 'ZAMBIA_RETURNING' // Zambia Return (Lake Ndola 50L + Lake Kapiri 350L)
  | 'TDM_RETURN'      // TDM/Tunduma (returning)
  | 'MBEYA_RETURN'
  | 'MORO_RETURN'
  | 'DAR_RETURN'
  | 'TANGA_RETURN'
  | 'CONGO_RETURNING' // Congo (returning direction)
  // Custom station checkpoints (for unlisted stations)
  | 'CUSTOM_GOING'    // Custom station for going direction
  | 'CUSTOM_RETURN';  // Custom station for return direction

export interface CancellationInfo {
  isCancelled: boolean;
  cancellationPoint?: CancellationPoint;
  cancellationStation?: string;  // The station where order was cancelled
  cancelledAt?: string;          // Timestamp
  cancelledBy?: string;          // Username
  reason?: string;               // e.g., "Station out of fuel - bought cash from other station"
  originalLpoNo?: string;        // The LPO that was supposed to be used
  cashLpoNo?: string;            // The new cash LPO created
}

// Stations grouped by journey direction
export interface StationsByDirection {
  going: string[];
  returning: string[];
  zambiaReturning: {
    ndola: string;    // First filling point - 50 liters
    kapiri: string;   // Second filling point - 350 liters
  };
}

// Extended LPO Detail with cancellation support
export interface LPODetailExtended extends LPODetail {
  isCancelled?: boolean;
  cancellationInfo?: CancellationInfo;
  isDriverAccount?: boolean;     // For driver's account (misuse/theft) entries
  paymentMode?: 'STATION' | 'CASH' | 'DRIVER_ACCOUNT';
}

// Payment Mode Types for Driver Account
export type PaymentMode = 'TIGO_LIPA' | 'VODA_LIPA' | 'SELCOM' | 'CASH' | 'STATION';

// Driver's Account Entry - for fuel given due to misuse/theft
export interface DriverAccountEntry {
  id?: string | number;
  date: string;
  month?: string;
  year?: number;
  truckNo: string;
  driverName?: string;
  doNo?: string;          // Reference DO for the journey (not shown in exports)
  liters: number;
  rate: number;
  amount: number;
  station: string;        // Station where fuel was given
  cancellationPoint?: CancellationPoint; // Where fuel was cancelled
  journeyDirection?: 'going' | 'returning';  // Going or returning
  originalDoNo?: string;  // Original DO before cancellation (reference)
  paymentMode?: PaymentMode;  // Mode of payment
  paybillOrMobile?: string;  // Paybill number or mobile number for mobile payments
  lpoNo: string;          // Reference LPO number
  status?: 'pending' | 'settled' | 'disputed';
  settledAt?: string;
  settledBy?: string;
  approvedBy?: string;    // Name of approver for Driver's Account LPO
  notes?: string;         // Additional notes
  lpoCreated?: boolean;   // Whether LPO was created
  lpoSummaryId?: string;  // Reference to LPO Summary
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Driver's Account Workbook
export interface DriverAccountWorkbook {
  id?: string | number;
  year: number;
  name: string;           // e.g., "DRIVER ACCOUNTS 2025"
  entries: DriverAccountEntry[];
  totalLiters: number;
  totalAmount: number;
  sheetCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Cancellation Report - for displaying cancelled orders
export interface CancellationReport {
  lpoNo: string;
  date: string;
  station: string;
  isFullyCancelled: boolean;  // All trucks in LPO cancelled
  cancelledTrucks: Array<{
    truckNo: string;
    doNo: string;
    cancellationPoint: CancellationPoint;
    liters: number;
  }>;
  activeTrucks: Array<{
    truckNo: string;
    doNo: string;
    liters: number;
  }>;
  reportText: string;         // Copyable cancellation statement
}

// LPO Summary Extended with cancellation tracking
export interface LPOSummaryExtended extends LPOSummary {
  hasCancelledEntries?: boolean;
  cancellationReport?: CancellationReport;
  hasDriverAccountEntries?: boolean;
}

// Backup & Recovery Types
export interface Backup {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'in_progress' | 'completed' | 'failed';
  type: 'manual' | 'scheduled';
  collections: string[];
  r2Key: string;
  r2Url?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  metadata?: {
    totalDocuments: number;
    databaseSize: number;
    compression: string;
  };
}

export interface BackupSchedule {
  id: string;
  name: string;
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  retentionDays: number;
  lastRun?: string;
  nextRun?: string;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupStats {
  totalBackups: number;
  completedBackups: number;
  failedBackups: number;
  totalSize: number;
  oldestBackup?: string;
  newestBackup?: string;
}

// Analytics & Reports Types
export interface AnalyticsSummary {
  totalRevenue: number;
  revenueTrend: number;
  fuelDispensed: number;
  fuelTrend: number;
  activeTrucks: number;
  truckTrend: number;
  totalOrders: number;
}

export interface RevenueByMonth {
  _id: {
    year: number;
    month: number;
  };
  revenue: number;
  orders: number;
}

export interface FuelByStation {
  _id: string;
  totalLiters: number;
  totalAmount: number;
}

export interface TopTruck {
  _id: string;
  trips: number;
  totalTonnage: number;
  revenue: number;
}

export interface ActivityItem {
  user: string;
  action: string;
  resource: string;
  timestamp: string;
}

export interface DashboardAnalytics {
  summary: AnalyticsSummary;
  charts: {
    revenueByMonth: RevenueByMonth[];
    fuelByStation: FuelByStation[];
    topTrucks: TopTruck[];
  };
  recentActivity: ActivityItem[];
  period: {
    start: string;
    end: string;
  };
}

export interface RevenueReport {
  revenueData: Array<{
    _id: any;
    totalRevenue: number;
    orderCount: number;
    avgTonnage: number;
  }>;
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
  };
  period: {
    start: string;
    end: string;
  };
}

export interface FuelReport {
  byStation: Array<{
    _id: string;
    totalLiters: number;
    totalAmount: number;
    recordCount: number;
  }>;
  byTruck: Array<{
    _id: string;
    totalLiters: number;
    totalAmount: number;
    tripCount: number;
  }>;
  byFuelType: Array<{
    _id: string;
    totalLiters: number;
    totalAmount: number;
  }>;
  timeline: Array<{
    _id: any;
    totalLiters: number;
    totalAmount: number;
  }>;
  summary: {
    totalLiters: number;
    totalAmount: number;
    averagePricePerLiter: number;
  };
  period: {
    start: string;
    end: string;
  };
}

export interface UserActivityReport {
  activityByUser: Array<{
    _id: string;
    actionCount: number;
    actions: string[];
  }>;
  activityByAction: Array<{
    _id: string;
    count: number;
  }>;
  timeline: Array<{
    _id: any;
    count: number;
  }>;
  topUsers: Array<{
    _id: string;
    actionCount: number;
    lastActivity: string;
  }>;
  period: {
    start: string;
    end: string;
  };
}

export interface SystemPerformance {
  database: any;
  collections: Array<{
    name: string;
    count: number;
  }>;
  users: {
    total: number;
    active: number;
    byRole: Array<{
      _id: string;
      count: number;
    }>;
  };
  activity: {
    last24h: number;
    last7d: number;
  };
}

// Configuration Types
export type FuelRecordField = 
  | 'darGoing' | 'moroGoing' | 'mbeyaGoing' | 'tdmGoing' | 'zambiaGoing' | 'congoFuel'
  | 'zambiaReturn' | 'tundumaReturn' | 'mbeyaReturn' | 'moroReturn' | 'darReturn' | 'tangaReturn';

export interface FuelStationConfig {
  _id: string;
  stationName: string;
  defaultRate: number;
  defaultLitersGoing: number;
  defaultLitersReturning: number;
  fuelRecordFieldGoing?: FuelRecordField;  // e.g., 'zambiaGoing', 'mbeyaGoing'
  fuelRecordFieldReturning?: FuelRecordField;  // e.g., 'zambiaReturn', 'mbeyaReturn'
  formulaGoing?: string;
  formulaReturning?: string;
  isActive: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RouteConfig {
  _id: string;
  routeName: string;
  origin?: string;
  destination: string;
  destinationAliases?: string[];
  routeType: 'IMPORT' | 'EXPORT';
  defaultTotalLiters: number;
  description?: string;
  isActive: boolean;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormulaVariable {
  name: string;
  description: string;
  type: string;
}

export interface FormulaExample {
  formula: string;
  description: string;
}

export interface FuelRecordFieldOption {
  value: FuelRecordField;
  label: string;
}

// Notification Types
export interface Notification {
  id?: string;
  type: 'missing_total_liters' | 'missing_extra_fuel' | 'both' | 'yard_fuel_recorded' | 'truck_pending_linking' | 'truck_entry_rejected' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  relatedModel: 'FuelRecord' | 'DeliveryOrder' | 'LPO' | 'User' | 'YardFuelDispense';
  relatedId: string;
  metadata?: {
    fuelRecordId?: string;
    doNumber?: string;
    truckNo?: string;
    destination?: string;
    truckSuffix?: string;
    missingFields?: string[];
    yardFuelDispenseId?: string;
    yard?: string;
    liters?: number;
    enteredBy?: string;
    rejectionReason?: string;
    rejectedBy?: string;
  };
  recipients: string[];
  isRead: boolean;
  readBy: string[];
  status: 'pending' | 'resolved' | 'dismissed';
  resolvedAt?: string;
  resolvedBy?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}
