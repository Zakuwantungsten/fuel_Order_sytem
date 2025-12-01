import axios from 'axios';
import { 
  DeliveryOrder, 
  LPOEntry, 
  LPOSummary, 
  LPOWorkbook, 
  LPOSheet, 
  FuelRecord, 
  DashboardStats,
  ReportStats,
  LoginCredentials,
  AuthUser,
  AuthResponse,
  User,
  YardFuelDispense
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fuel_order_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('fuel_order_auth');
      localStorage.removeItem('fuel_order_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Delivery Orders API
export const deliveryOrdersAPI = {
  getAll: async (filters?: any): Promise<DeliveryOrder[]> => {
    const response = await apiClient.get('/delivery-orders', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },
  
  getById: async (id: string | number): Promise<DeliveryOrder> => {
    const response = await apiClient.get(`/delivery-orders/${id}`);
    return response.data.data;
  },
  
  create: async (data: Partial<DeliveryOrder>): Promise<DeliveryOrder> => {
    const response = await apiClient.post('/delivery-orders', data);
    return response.data.data;
  },
  
  update: async (id: string | number, data: Partial<DeliveryOrder>): Promise<DeliveryOrder> => {
    const response = await apiClient.put(`/delivery-orders/${id}`, data);
    return response.data.data;
  },
  
  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/delivery-orders/${id}`);
  },
  
  getNextNumber: async (doType: 'DO' | 'SDO' = 'DO'): Promise<number> => {
    const response = await apiClient.get('/delivery-orders/next-do-number', { 
      params: { doType } 
    });
    return response.data.data?.nextSN || 1;
  },
};

// LPOs API (Summary LPOS entries)
export const lposAPI = {
  getAll: async (filters?: any): Promise<LPOEntry[]> => {
    const response = await apiClient.get('/lpo-entries', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },
  
  getById: async (id: string | number): Promise<LPOEntry> => {
    const response = await apiClient.get(`/lpo-entries/${id}`);
    return response.data.data;
  },
  
  create: async (data: Partial<LPOEntry>): Promise<LPOEntry> => {
    const response = await apiClient.post('/lpo-entries', data);
    return response.data.data;
  },
  
  update: async (id: string | number, data: Partial<LPOEntry>): Promise<LPOEntry> => {
    const response = await apiClient.put(`/lpo-entries/${id}`, data);
    return response.data.data;
  },
  
  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/lpo-entries/${id}`);
  },
};

// LPO Workbook API (Excel-like workbook management - one workbook per year)
export const lpoWorkbookAPI = {
  // Get all workbooks (one per year)
  getAll: async (): Promise<LPOWorkbook[]> => {
    const response = await apiClient.get('/lpo-documents/workbooks');
    return response.data.data || [];
  },

  // Get workbook by year with all its sheets
  getByYear: async (year: number): Promise<LPOWorkbook> => {
    const response = await apiClient.get(`/lpo-documents/workbooks/${year}`);
    return response.data.data;
  },

  // Get available years
  getAvailableYears: async (): Promise<number[]> => {
    const response = await apiClient.get('/lpo-documents/workbooks/years');
    return response.data.data || [];
  },

  // Export workbook as Excel file
  exportWorkbook: async (year: number): Promise<void> => {
    const response = await apiClient.get(`/lpo-documents/workbooks/${year}/export`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `LPOS_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Legacy methods for backward compatibility
  getById: async (id: string | number): Promise<LPOWorkbook> => {
    const response = await apiClient.get(`/lpo-documents/${id}`);
    return response.data.data;
  },

  create: async (data: Partial<LPOWorkbook>): Promise<LPOWorkbook> => {
    // Workbooks are auto-created, this creates an LPO document
    const response = await apiClient.post('/lpo-documents', data);
    return response.data.data;
  },

  // Sheet management within workbook
  addSheet: async (workbookId: string | number, sheet: Partial<LPOSheet>): Promise<LPOSheet> => {
    const response = await apiClient.post(`/lpo-documents/${workbookId}/sheets`, sheet);
    return response.data.data;
  },

  updateSheet: async (workbookId: string | number, sheetId: string | number, data: Partial<LPOSheet>): Promise<LPOSheet> => {
    const response = await apiClient.put(`/lpo-documents/${workbookId}/sheets/${sheetId}`, data);
    return response.data.data;
  },

  deleteSheet: async (workbookId: string | number, sheetId: string | number): Promise<void> => {
    await apiClient.delete(`/lpo-documents/${workbookId}/sheets/${sheetId}`);
  },
};

// LPO Documents API (Detailed LPO format - each document is a sheet in a workbook)
export const lpoDocumentsAPI = {
  getAll: async (filters?: any): Promise<LPOSummary[]> => {
    const response = await apiClient.get('/lpo-documents', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },
  
  getById: async (id: string | number): Promise<LPOSummary> => {
    const response = await apiClient.get(`/lpo-documents/${id}`);
    return response.data.data;
  },
  
  getByLpoNo: async (lpoNo: string): Promise<LPOSummary> => {
    const response = await apiClient.get(`/lpo-documents/lpo/${lpoNo}`);
    return response.data.data;
  },
  
  create: async (data: Partial<LPOSummary>): Promise<LPOSummary> => {
    const response = await apiClient.post('/lpo-documents', data);
    return response.data.data;
  },
  
  update: async (id: string | number, data: Partial<LPOSummary>): Promise<LPOSummary> => {
    const response = await apiClient.put(`/lpo-documents/${id}`, data);
    return response.data.data;
  },
  
  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/lpo-documents/${id}`);
  },

  getNextLpoNumber: async (): Promise<string> => {
    const response = await apiClient.get('/lpo-documents/next-number');
    return response.data.data?.nextLpoNo || '2445';
  },

  // Keep the old method as fallback
  getLastLpoNumber: async (): Promise<string> => {
    try {
      const nextNo = await lpoDocumentsAPI.getNextLpoNumber();
      const num = parseInt(nextNo, 10);
      return (num - 1).toString();
    } catch {
      const response = await apiClient.get('/lpo-documents?sort=lpoNo&order=desc&limit=1');
      const data = response.data.data?.data || response.data.data || [];
      if (data && data.length > 0) {
        return data[0].lpoNo;
      }
      return '2444';
    }
  },
};

// Fuel Record Details Interface
export interface FuelRecordDetails {
  fuelRecord: FuelRecord;
  journeyInfo: {
    goingJourney: {
      from: string;
      to: string;
      doNumber: string;
      start: string;
      deliveryOrder: DeliveryOrder | null;
    };
    returnJourney: {
      from: string;
      to: string;
      doNumber: string;
      deliveryOrder: DeliveryOrder | null;
    } | null;
    isOnReturnJourney: boolean;
    hasDestinationChanged: boolean;
  };
  fuelAllocations: {
    total: number;
    extra: number;
    balance: number;
    going: {
      tangaYard: number;
      darYard: number;
      darGoing: number;
      moroGoing: number;
      mbeyaGoing: number;
      tdmGoing: number;
      zambiaGoing: number;
      congoFuel: number;
    };
    return: {
      zambiaReturn: number;
      tundumaReturn: number;
      mbeyaReturn: number;
      moroReturn: number;
      darReturn: number;
      tangaReturn: number;
    };
    totalGoingFuel: number;
    totalReturnFuel: number;
  };
  lpoEntries: (LPOEntry & { 
    journeyType: 'going' | 'return' | 'cash' | 'related';
  })[];
  yardDispenses: YardFuelDispense[];
  summary: {
    totalLPOs: number;
    totalYardDispenses: number;
    totalFuelOrdered: number;
    totalYardFuel: number;
    goingLPOs?: number;
    returnLPOs?: number;
    cashLPOs?: number;
  };
}

// Fuel Records API
export const fuelRecordsAPI = {
  getAll: async (filters?: any): Promise<FuelRecord[]> => {
    const response = await apiClient.get('/fuel-records', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },
  
  getById: async (id: string | number): Promise<FuelRecord> => {
    const response = await apiClient.get(`/fuel-records/${id}`);
    return response.data.data;
  },

  getDetails: async (id: string | number): Promise<FuelRecordDetails> => {
    const response = await apiClient.get(`/fuel-records/${id}/details`);
    return response.data.data;
  },
  
  create: async (data: Partial<FuelRecord>): Promise<FuelRecord> => {
    const response = await apiClient.post('/fuel-records', data);
    return response.data.data;
  },
  
  update: async (id: string | number, data: Partial<FuelRecord>): Promise<FuelRecord> => {
    const response = await apiClient.put(`/fuel-records/${id}`, data);
    return response.data.data;
  },
  
  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/fuel-records/${id}`);
  },
};

// Dashboard API
export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await apiClient.get('/dashboard/stats');
    return response.data.data;
  },
  
  getReports: async (dateRange?: string, dateFrom?: string, dateTo?: string): Promise<ReportStats> => {
    const response = await apiClient.get('/dashboard/reports', {
      params: { dateRange, dateFrom, dateTo },
    });
    return response.data.data;
  },
};

// Authentication API
export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post('/auth/login', credentials);
    return response.data.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  refreshToken: async (): Promise<{ token: string }> => {
    const response = await apiClient.post('/auth/refresh');
    return response.data.data;
  },

  getCurrentUser: async (): Promise<AuthUser> => {
    const response = await apiClient.get('/auth/me');
    return response.data.data;
  },

  updateProfile: async (data: Partial<User>): Promise<User> => {
    const response = await apiClient.put('/auth/me', data);
    return response.data.data;
  },

  changePassword: async (data: { currentPassword: string; newPassword: string }): Promise<void> => {
    await apiClient.put('/auth/change-password', data);
  },
};

// Users Management API (Admin only)
export const usersAPI = {
  getAll: async (filters?: any): Promise<User[]> => {
    const response = await apiClient.get('/users', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },

  getById: async (id: string | number): Promise<User> => {
    const response = await apiClient.get(`/users/${id}`);
    return response.data.data;
  },

  create: async (data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> => {
    const response = await apiClient.post('/users', data);
    return response.data.data;
  },

  update: async (id: string | number, data: Partial<User>): Promise<User> => {
    const response = await apiClient.put(`/users/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  resetPassword: async (id: string | number): Promise<{ temporaryPassword: string }> => {
    const response = await apiClient.post(`/users/${id}/reset-password`);
    return response.data.data;
  },

  toggleStatus: async (id: string | number): Promise<User> => {
    const response = await apiClient.patch(`/users/${id}/toggle-status`);
    return response.data.data;
  },
};

// Yard Fuel API
export const yardFuelAPI = {
  getAll: async (filters?: any): Promise<YardFuelDispense[]> => {
    const response = await apiClient.get('/yard-fuel', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },

  getById: async (id: string | number): Promise<YardFuelDispense> => {
    const response = await apiClient.get(`/yard-fuel/${id}`);
    return response.data.data;
  },

  create: async (data: Partial<YardFuelDispense>): Promise<YardFuelDispense> => {
    const response = await apiClient.post('/yard-fuel', data);
    return response.data.data;
  },

  update: async (id: string | number, data: Partial<YardFuelDispense>): Promise<YardFuelDispense> => {
    const response = await apiClient.put(`/yard-fuel/${id}`, data);
    return response.data.data;
  },

  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/yard-fuel/${id}`);
  },

  getByYardAndDate: async (yard: string, date: string): Promise<YardFuelDispense[]> => {
    const response = await apiClient.get('/yard-fuel', { 
      params: { yard, dateFrom: date, dateTo: date } 
    });
    return response.data.data?.data || response.data.data || [];
  },
};

// Admin Configuration API
export interface FuelStation {
  id: string;
  name: string;
  location: string;
  pricePerLiter: number;
  isActive: boolean;
}

export interface RouteConfig {
  destination: string;
  totalLiters: number;
  isActive: boolean;
}

export interface TruckBatch {
  truckSuffix: string;
  extraLiters: number;
  truckNumber?: string;
  addedBy: string;
  addedAt: string;
}

export interface TruckBatches {
  batch_100: TruckBatch[];
  batch_80: TruckBatch[];
  batch_60: TruckBatch[];
}

export interface StandardAllocations {
  tangaYardToDar: number;
  darYardStandard: number;
  darYardKisarawe: number;
  mbeyaGoing: number;
  tundumaReturn: number;
  mbeyaReturn: number;
  moroReturnToMombasa: number;
  tangaReturnToMombasa: number;
}

export interface AdminStats {
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  records: {
    deliveryOrders: number;
    lpos: number;
    fuelRecords: number;
    yardDispenses: number;
  };
  roleDistribution: Array<{ role: string; count: number }>;
  recentUsers: User[];
}

export const adminAPI = {
  // Dashboard Stats
  getStats: async (): Promise<AdminStats> => {
    const response = await apiClient.get('/admin/stats');
    return response.data.data;
  },

  // Fuel Stations
  getFuelStations: async (): Promise<FuelStation[]> => {
    const response = await apiClient.get('/admin/fuel-stations');
    return response.data.data || [];
  },

  addFuelStation: async (station: Omit<FuelStation, 'isActive'> & { isActive?: boolean }): Promise<FuelStation> => {
    const response = await apiClient.post('/admin/fuel-stations', station);
    return response.data.data;
  },

  updateFuelStation: async (stationId: string, data: Partial<FuelStation>): Promise<FuelStation> => {
    const response = await apiClient.put(`/admin/fuel-stations/${stationId}`, data);
    return response.data.data;
  },

  bulkUpdateStationRates: async (updates: Array<{ stationId: string; pricePerLiter: number }>): Promise<FuelStation[]> => {
    const response = await apiClient.put('/admin/fuel-stations/bulk-update/rates', { updates });
    return response.data.data;
  },

  // Routes
  getRoutes: async (): Promise<RouteConfig[]> => {
    const response = await apiClient.get('/admin/routes');
    return response.data.data || [];
  },

  addRoute: async (route: Omit<RouteConfig, 'isActive'> & { isActive?: boolean }): Promise<RouteConfig> => {
    const response = await apiClient.post('/admin/routes', route);
    return response.data.data;
  },

  updateRoute: async (destination: string, data: Partial<RouteConfig>): Promise<RouteConfig> => {
    const response = await apiClient.put(`/admin/routes/${encodeURIComponent(destination)}`, data);
    return response.data.data;
  },

  deleteRoute: async (destination: string): Promise<void> => {
    await apiClient.delete(`/admin/routes/${encodeURIComponent(destination)}`);
  },

  // Truck Batches
  getTruckBatches: async (): Promise<TruckBatches> => {
    const response = await apiClient.get('/admin/truck-batches');
    return response.data.data || { batch_100: [], batch_80: [], batch_60: [] };
  },

  addTruckToBatch: async (data: { truckSuffix: string; extraLiters: number; truckNumber?: string }): Promise<TruckBatches> => {
    const response = await apiClient.post('/admin/truck-batches', data);
    return response.data.data;
  },

  removeTruckFromBatch: async (truckSuffix: string): Promise<TruckBatches> => {
    const response = await apiClient.delete(`/admin/truck-batches/${truckSuffix}`);
    return response.data.data;
  },

  // Standard Allocations
  getStandardAllocations: async (): Promise<StandardAllocations> => {
    const response = await apiClient.get('/admin/standard-allocations');
    return response.data.data;
  },

  updateStandardAllocations: async (allocations: Partial<StandardAllocations>): Promise<StandardAllocations> => {
    const response = await apiClient.put('/admin/standard-allocations', allocations);
    return response.data.data;
  },

  // Combined Config
  getAllConfig: async (): Promise<{
    fuelStations: FuelStation[];
    routes: RouteConfig[];
    truckBatches: TruckBatches;
    standardAllocations: StandardAllocations;
  }> => {
    const response = await apiClient.get('/admin/config');
    return response.data.data;
  },

  resetConfig: async (configType: 'fuel_stations' | 'routes' | 'truck_batches' | 'standard_allocations' | 'all'): Promise<void> => {
    await apiClient.post(`/admin/config/reset/${configType}`);
  },
};

export default apiClient;
