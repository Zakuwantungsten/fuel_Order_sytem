// Delivery Order (DO) Types
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
  containerNo: string;
  borderEntryDRC?: string;
  loadingPoint: string;
  destination: string;
  haulier: string;
  driverName?: string;
  tonnages: number;
  ratePerTon: number;
  rate?: string;
  cargoType?: string;
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
  createdAt?: string;
  updatedAt?: string;
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
}

// Fuel Record Types
export interface FuelRecord {
  id?: string | number;
  date: string;
  month?: string; // e.g., "October", "November"
  truckNo: string;
  goingDo: string;
  returnDo?: string;
  start: string;
  from: string;
  to: string;
  totalLts: number;
  extra?: number;
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
export type UserRole = 'super_admin' | 'admin' | 'manager' | 'supervisor' | 'clerk' | 'driver' | 'viewer' | 'fuel_order_maker' | 'boss' | 'yard_personnel' | 'fuel_attendant' | 'station_manager' | 'payment_manager' | 'dar_yard' | 'tanga_yard' | 'mmsa_yard';

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
  truckNo?: string; // For drivers
  currentDO?: string; // For drivers - current delivery order
  isActive: boolean;
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
  yard: 'DAR YARD' | 'TANGA YARD' | 'MMSA YARD' | 'MBEYA YARD';
  enteredBy: string;
  timestamp: string;
  notes?: string;
  // Auto-linked fields (populated by system)
  linkedFuelRecordId?: string | number;
  linkedDONumber?: string;
  autoLinked?: boolean;
  status?: 'pending' | 'linked' | 'manual'; // pending = waiting for DO, linked = auto-matched, manual = manually entered
}

// Cash Mode Cancellation Types
export type CancellationPoint = 
  | 'DAR_GOING' 
  | 'MORO_GOING' 
  | 'MBEYA_GOING' 
  | 'TDM_GOING' 
  | 'ZAMBIA_GOING'
  | 'INFINITY_GOING'  // Mbeya going station
  | 'ZAMBIA_NDOLA'    // Returning - first part (50 liters)
  | 'ZAMBIA_KAPIRI'   // Returning - second part (350 liters)
  | 'TUNDUMA_RETURN'
  | 'MBEYA_RETURN'
  | 'MORO_RETURN'
  | 'DAR_RETURN'
  | 'TANGA_RETURN';

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
  originalDoNo?: string;  // Original DO before cancellation
  lpoNo: string;          // Reference LPO number
  status?: 'pending' | 'settled' | 'disputed';
  settledAt?: string;
  settledBy?: string;
  notes?: string;         // Additional notes
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
