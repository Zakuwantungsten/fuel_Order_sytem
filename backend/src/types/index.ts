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
  | 'mmsa_yard';

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
  lastLogin?: Date;
  refreshToken?: string;
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Delivery Order Types
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
  isDeleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  originalDoNo?: string;
  cancellationReason?: string;
  cancelledAt?: Date;
}

// Cancellation Point Types
export type CancellationPoint = 
  | 'DAR_GOING'
  | 'MORO_GOING'
  | 'MBEYA_GOING'
  | 'INFINITY_GOING'
  | 'TDM_GOING'
  | 'ZAMBIA_GOING'
  | 'ZAMBIA_NDOLA'
  | 'ZAMBIA_KAPIRI'
  | 'TDM_RETURN'
  | 'MBEYA_RETURN'
  | 'MORO_RETURN'
  | 'DAR_RETURN'
  | 'TANGA_RETURN';

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
  isDeleted: boolean;
  deletedAt?: Date;
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
