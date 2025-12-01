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
