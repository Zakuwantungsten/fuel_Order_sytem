import axios from 'axios';
import { 
  DeliveryOrder, 
  LPOEntry, 
  LPOSummary, 
  LPOWorkbook, 
  LPOSheet, 
  DOWorkbook,
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
  withCredentials: true, // Enable cookies for CSRF
});

// Function to get CSRF token from cookie
const getCsrfToken = (): string | null => {
  const name = 'XSRF-TOKEN=';
  const decodedCookie = decodeURIComponent(document.cookie);
  const cookieArray = decodedCookie.split(';');
  for (let i = 0; i < cookieArray.length; i++) {
    let cookie = cookieArray[i].trim();
    if (cookie.indexOf(name) === 0) {
      return cookie.substring(name.length, cookie.length);
    }
  }
  return null;
};

// Function to fetch CSRF token from server
const fetchCsrfToken = async (): Promise<void> => {
  try {
    await apiClient.get('/csrf-token');
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
  }
};

// Initialize CSRF token on app load
fetchCsrfToken();

// Request interceptor to add auth token and CSRF token
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token
    const token = localStorage.getItem('fuel_order_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        config.headers['X-XSRF-TOKEN'] = csrfToken;
      }
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors and CSRF errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Handle CSRF token errors
    if (error.response?.status === 403 && error.response?.data?.code === 'CSRF_VALIDATION_FAILED') {
      // Refresh CSRF token and retry
      if (!originalRequest._retry) {
        originalRequest._retry = true;
        await fetchCsrfToken();
        return apiClient(originalRequest);
      }
    }
    
    // Handle auth errors
    if (error.response?.status === 401) {
      // Don't redirect if this is a login attempt - let the login component handle it
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      
      if (!isLoginRequest) {
        // Clear auth data
        localStorage.removeItem('fuel_order_auth');
        localStorage.removeItem('fuel_order_token');
        
        // Check if it's a token expiration
        const errorMessage = error.response?.data?.message || '';
        const isTokenExpired = errorMessage.toLowerCase().includes('expired') || 
                              error.response?.data?.error?.name === 'TokenExpiredError';
        
        // Redirect to login with appropriate message
        if (isTokenExpired) {
          window.location.href = '/login?reason=expired';
        } else {
          window.location.href = '/login?reason=unauthorized';
        }
      }
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
  
  update: async (id: string | number, data: Partial<DeliveryOrder>): Promise<{ order: DeliveryOrder; cascadeResults?: any }> => {
    const response = await apiClient.put(`/delivery-orders/${id}`, data);
    return {
      order: response.data.data,
      cascadeResults: response.data.cascadeResults,
    };
  },
  
  cancel: async (id: string | number): Promise<{ order: DeliveryOrder; cascadeResults?: any }> => {
    const response = await apiClient.put(`/delivery-orders/${id}/cancel`);
    return {
      order: response.data.data,
      cascadeResults: response.data.cascadeResults,
    };
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

  // Re-link an EXPORT DO to a fuel record after truck number correction
  relinkToFuelRecord: async (id: string | number): Promise<{
    success: boolean;
    message: string;
    data: {
      deliveryOrder: DeliveryOrder;
      fuelRecord: FuelRecord | null;
      wasAlreadyLinked?: boolean;
      previousGoingJourney?: { from: string; to: string };
      suggestion?: string;
    };
  }> => {
    const response = await apiClient.post(`/delivery-orders/${id}/relink-to-fuel-record`);
    return response.data;
  },

  // Create notification for unlinked EXPORT DO
  notifyUnlinkedExport: async (data: {
    deliveryOrderId: string;
    doNumber: string;
    truckNo: string;
    destination?: string;
    loadingPoint?: string;
  }): Promise<void> => {
    await apiClient.post('/delivery-orders/notify-unlinked-export', data);
  },
};

// DO Workbook API (Excel-like workbook management - one workbook per year with monthly sheets)
export const doWorkbookAPI = {
  // Get all workbooks (one per year)
  getAll: async (): Promise<DOWorkbook[]> => {
    const response = await apiClient.get('/delivery-orders/workbooks');
    return response.data.data || [];
  },

  // Get workbook by year with all its sheets (months)
  getByYear: async (year: number): Promise<DOWorkbook> => {
    const response = await apiClient.get(`/delivery-orders/workbooks/${year}`);
    return response.data.data;
  },

  // Get available years
  getAvailableYears: async (): Promise<number[]> => {
    const response = await apiClient.get('/delivery-orders/workbooks/years');
    return response.data.data || [];
  },

  // Export workbook as Excel file with logo and formatting
  exportWorkbook: async (year: number): Promise<void> => {
    const response = await apiClient.get(`/delivery-orders/workbooks/${year}/export`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DELIVERY_ORDERS_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Export yearly monthly summaries as Excel file
  exportYearlyMonthlySummaries: async (year: number): Promise<void> => {
    const response = await apiClient.get(`/delivery-orders/workbooks/${year}/monthly-summaries/export`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DO_Monthly_Summaries_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Export specific month as Excel
  exportMonth: async (year: number, month: number): Promise<void> => {
    const response = await apiClient.get(`/delivery-orders/workbooks/${year}/month/${month}/export`, {
      responseType: 'blob',
    });
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1] || 'Unknown';
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DELIVERY_ORDERS_${monthName}_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// SDO Workbook API (Excel-like workbook management for Special Delivery Orders)
export const sdoWorkbookAPI = {
  // Get all SDO workbooks (one per year)
  getAll: async (): Promise<DOWorkbook[]> => {
    const response = await apiClient.get('/delivery-orders/sdo/workbooks');
    return response.data.data || [];
  },

  // Get SDO workbook by year with all its sheets
  getByYear: async (year: number): Promise<DOWorkbook> => {
    const response = await apiClient.get(`/delivery-orders/sdo/workbooks/${year}`);
    return response.data.data;
  },

  // Get available years for SDO
  getAvailableYears: async (): Promise<number[]> => {
    const response = await apiClient.get('/delivery-orders/sdo/workbooks/years');
    return response.data.data || [];
  },

  // Export SDO workbook as Excel file
  exportWorkbook: async (year: number): Promise<void> => {
    const response = await apiClient.get(`/delivery-orders/sdo/workbooks/${year}/export`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SDO_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Export SDO yearly monthly summaries as Excel file
  exportYearlyMonthlySummaries: async (year: number): Promise<void> => {
    const response = await apiClient.get(`/delivery-orders/sdo/workbooks/${year}/monthly-summaries/export`, {
      responseType: 'blob',
    });
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SDO_Monthly_Summaries_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  // Export specific SDO month as Excel
  exportMonth: async (year: number, month: number): Promise<void> => {
    const response = await apiClient.get(`/delivery-orders/sdo/workbooks/${year}/month/${month}/export`, {
      responseType: 'blob',
    });
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month - 1] || 'Unknown';
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `SDO_${monthName}_${year}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// Amended DOs API (for tracking and downloading amended delivery orders)
export interface AmendedDOSummary {
  id: string;
  doNumber: string;
  truckNo: string;
  importOrExport: 'IMPORT' | 'EXPORT';
  date: string;
  status: 'active' | 'cancelled';
  isCancelled: boolean;
  totalAmendments: number;
  lastAmendedAt: string;
  lastAmendedBy: string;
  lastAmendmentReason?: string;
  fieldsChanged: string[];
}

export const amendedDOsAPI = {
  // Get all amended DOs
  getAll: async (filters?: { startDate?: string; endDate?: string; doNumbers?: string }): Promise<DeliveryOrder[]> => {
    const response = await apiClient.get('/delivery-orders/amended', { params: filters });
    return response.data.data || [];
  },

  // Get summary of recent amendments
  getSummary: async (days?: number): Promise<{ data: AmendedDOSummary[]; count: number; periodDays: number }> => {
    const response = await apiClient.get('/delivery-orders/amended/summary', { params: { days } });
    return {
      data: response.data.data || [],
      count: response.data.count || 0,
      periodDays: response.data.periodDays || 30,
    };
  },

  // Download amended DOs as PDF
  downloadPDF: async (doIds: string[]): Promise<{ filename: string }> => {
    const response = await apiClient.post('/delivery-orders/amended/download-pdf', { doIds }, {
      responseType: 'blob',
    });
    
    // Extract filename from Content-Disposition header or generate one
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'Amended_DOs.pdf';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1].replace(/['"]/g, '');
      }
    }
    
    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return { filename };
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
  // Optional months param: array of month numbers (1-12) to filter by
  getByYear: async (year: number, months?: number[]): Promise<LPOWorkbook> => {
    const params: any = {};
    if (months && months.length > 0) {
      params.months = months.join(',');
    }
    const response = await apiClient.get(`/lpo-documents/workbooks/${year}`, { params });
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

  // Check if a truck already has an active allocation at a specific station
  // Returns duplicate info - used to prevent accidentally creating duplicate fuel orders
  // If liters is provided and differs from existing allocation, it's allowed (top-up scenario)
  checkDuplicateAllocation: async (truckNo: string, station: string, excludeLpoId?: string, liters?: number): Promise<{
    hasDuplicate: boolean;
    existingLpos: Array<{
      id: string;
      lpoNo: string;
      date: string;
      station: string;
      entries: Array<{ truckNo: string; liters: number; doNo: string }>;
    }>;
    existingLiters?: number[];
    isDifferentAmount: boolean;
    allowOverride: boolean;
  }> => {
    const params: any = { truckNo, station };
    if (excludeLpoId) params.excludeLpoId = excludeLpoId;
    if (liters !== undefined) params.liters = liters;
    const response = await apiClient.get('/lpo-documents/check-duplicate', { params });
    return response.data.data || { hasDuplicate: false, existingLpos: [], allowOverride: true, isDifferentAmount: false };
  },

  // Find LPOs at a checkpoint for a specific truck (for auto-cancellation)
  findAtCheckpoint: async (truckNo: string, station?: string): Promise<LPOSummary[]> => {
    const params: any = { truckNo };
    if (station) params.station = station;
    const response = await apiClient.get('/lpo-documents/find-at-checkpoint', { params });
    return response.data.data || [];
  },

  // Cancel a truck entry in an LPO
  cancelTruck: async (lpoId: string | number, truckNo: string, cancellationPoint: string, reason?: string): Promise<LPOSummary> => {
    const response = await apiClient.post('/lpo-documents/cancel-truck', {
      lpoId,
      truckNo,
      cancellationPoint,
      reason
    });
    return response.data.data;
  },

  // Forward an LPO to another station (e.g., Ndola → Kapiri, Lake Tunduma → Infinity)
  forward: async (data: {
    sourceLpoId: string | number;
    targetStation: string;
    defaultLiters: number;
    rate: number;
    date?: string;
    orderOf?: string;
    includeOnlyActive?: boolean;
  }): Promise<{
    sourceLpo: { id: string; lpoNo: string; station: string };
    forwardedLpo: LPOSummary;
    entriesForwarded: number;
  }> => {
    const response = await apiClient.post('/lpo-documents/forward', data);
    return response.data.data;
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
    journeyType: 'going' | 'return' | 'cash' | 'driver_account' | 'related';
    isDriverAccount?: boolean;
    originalDoNo?: string;  // Reference DO for driver account entries
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
    driverAccountLPOs?: number;
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

  // Get fuel record by DO number and determine direction
  getByDoNumber: async (doNumber: string): Promise<{ fuelRecord: FuelRecord; direction: 'going' | 'returning' } | null> => {
    try {
      const response = await apiClient.get(`/fuel-records/do/${doNumber}`);
      if (response.data.data) {
        const fuelRecord = response.data.data;
        // Use the detected direction from the backend
        const direction = fuelRecord.detectedDirection || (fuelRecord.goingDo === doNumber ? 'going' : 'returning');
        return { fuelRecord, direction };
      }
      return null;
    } catch (error: any) {
      // If not found, return null
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
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
    await apiClient.post('/auth/change-password', data);
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await apiClient.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (data: { email: string; token: string; newPassword: string }): Promise<{ message: string }> => {
    const response = await apiClient.post('/auth/reset-password', data);
    return response.data;
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

  ban: async (id: string | number, reason: string): Promise<User> => {
    const response = await apiClient.post(`/users/${id}/ban`, { reason });
    return response.data.data;
  },

  unban: async (id: string | number): Promise<User> => {
    const response = await apiClient.post(`/users/${id}/unban`);
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

  reject: async (id: string | number, rejectionReason: string): Promise<any> => {
    const response = await apiClient.post(`/yard-fuel/${id}/reject`, { rejectionReason });
    return response.data;
  },

  getRejectionHistory: async (yard?: string, dateFrom?: string, dateTo?: string, showResolved?: boolean): Promise<YardFuelDispense[]> => {
    const response = await apiClient.get('/yard-fuel/history/rejections', {
      params: { yard, dateFrom, dateTo, showResolved },
    });
    return response.data.data || [];
  },

  getPending: async (): Promise<YardFuelDispense[]> => {
    const response = await apiClient.get('/yard-fuel/pending');
    return response.data.data || [];
  },

  linkPending: async (fuelRecordId: string, truckNo: string, doNumber: string, date: string): Promise<any> => {
    const response = await apiClient.post('/yard-fuel/link-pending', {
      fuelRecordId,
      truckNo,
      doNumber,
      date,
    });
    return response.data;
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

// Driver Account API
import type { DriverAccountEntry, DriverAccountWorkbook, CancellationReport } from '../types';

const CANCELLATION_HISTORY_KEY = 'fuel_order_cancellation_history';

export const driverAccountAPI = {
  // Get next LPO number
  getNextLPONumber: async (): Promise<string> => {
    const response = await apiClient.get('/driver-accounts/next-lpo-number');
    return response.data.data?.nextLpoNo || '2445';
  },

  // Get all entries with optional filters
  getAll: async (filters?: { year?: number; month?: string; truckNo?: string; status?: string }): Promise<DriverAccountEntry[]> => {
    const response = await apiClient.get('/driver-accounts', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },

  // Get available years
  getAvailableYears: async (): Promise<number[]> => {
    const response = await apiClient.get('/driver-accounts/years');
    return response.data.data || [new Date().getFullYear()];
  },

  // Get entries by year (grouped by month)
  getByYear: async (year: number): Promise<DriverAccountWorkbook | null> => {
    try {
      const response = await apiClient.get(`/driver-accounts/year/${year}`);
      const data = response.data.data;
      if (!data) return null;
      
      // Convert backend response to DriverAccountWorkbook format
      const allEntries: DriverAccountEntry[] = [];
      Object.values(data.entriesByMonth as Record<string, any[]>).forEach(monthEntries => {
        allEntries.push(...monthEntries);
      });
      
      return {
        id: `da-${year}`,
        year: data.year,
        name: `DRIVER ACCOUNTS ${year}`,
        entries: allEntries,
        totalLiters: data.totalLiters,
        totalAmount: data.totalAmount,
        createdAt: new Date().toISOString()
      };
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  // Get entry by ID
  getById: async (id: string): Promise<DriverAccountEntry> => {
    const response = await apiClient.get(`/driver-accounts/${id}`);
    return response.data.data;
  },

  // Create entry
  create: async (entry: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<DriverAccountEntry> => {
    const response = await apiClient.post('/driver-accounts', entry);
    return response.data.data;
  },

  // Create batch entries
  createBatch: async (entries: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<DriverAccountEntry[]> => {
    const response = await apiClient.post('/driver-accounts/batch', { entries });
    return response.data.data;
  },

  // Update entry
  update: async (id: string, updates: Partial<DriverAccountEntry>): Promise<DriverAccountEntry> => {
    const response = await apiClient.put(`/driver-accounts/${id}`, updates);
    return response.data.data;
  },

  // Update entry status
  updateStatus: async (id: string, status: 'pending' | 'settled' | 'disputed', notes?: string): Promise<DriverAccountEntry> => {
    const response = await apiClient.patch(`/driver-accounts/${id}/status`, { status, notes });
    return response.data.data;
  },

  // Delete entry
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/driver-accounts/${id}`);
  },

  // Get summary statistics
  getSummary: async (year?: number, month?: string): Promise<any> => {
    const response = await apiClient.get('/driver-accounts/summary', { 
      params: { year, month } 
    });
    return response.data.data;
  },

  // Export workbook to Excel
  exportWorkbook: async (year: number): Promise<void> => {
    const response = await apiClient.get(`/driver-accounts/year/${year}/export`, {
      responseType: 'blob'
    });
    
    const blob = new Blob([response.data], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `DRIVER_ACCOUNT_${year}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  // Get cancellation history (still uses local storage for now)
  getCancellationHistory: async (): Promise<(CancellationReport & { savedAt: string })[]> => {
    const stored = localStorage.getItem(CANCELLATION_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  // Save cancellation to history
  saveCancellationToHistory: async (report: CancellationReport): Promise<void> => {
    const history = await driverAccountAPI.getCancellationHistory();
    history.unshift({
      ...report,
      savedAt: new Date().toISOString()
    });
    // Keep only last 100 reports
    const trimmedHistory = history.slice(0, 100);
    localStorage.setItem(CANCELLATION_HISTORY_KEY, JSON.stringify(trimmedHistory));
  },

  // Clear cancellation history
  clearCancellationHistory: async (): Promise<void> => {
    localStorage.removeItem(CANCELLATION_HISTORY_KEY);
  }
};

export interface RouteConfig {
  destination: string;
  routeType?: 'IMPORT' | 'EXPORT';
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

  // Destination Rules for Truck Batches
  addDestinationRule: async (data: { 
    truckSuffix: string; 
    destination: string; 
    extraLiters: number 
  }): Promise<any> => {
    const response = await apiClient.post('/admin/truck-batches/destination-rules', data);
    return response.data.data;
  },

  updateDestinationRule: async (data: { 
    truckSuffix: string; 
    oldDestination: string; 
    newDestination?: string; 
    extraLiters: number 
  }): Promise<TruckBatches> => {
    const response = await apiClient.put('/admin/truck-batches/destination-rules', data);
    return response.data.data;
  },

  deleteDestinationRule: async (truckSuffix: string, destination: string): Promise<TruckBatches> => {
    const response = await apiClient.delete(`/admin/truck-batches/${truckSuffix}/destination-rules/${destination}`);
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

// System Admin API (accessed through admin endpoints, Super Admin only)
export const systemAdminAPI = {
  // Database Monitoring
  getDatabaseMetrics: async () => {
    const response = await apiClient.get('/admin/database/metrics');
    return response.data.data;
  },

  getDatabaseHealth: async () => {
    const response = await apiClient.get('/admin/database/health');
    return response.data.data;
  },

  enableProfiling: async (level: number = 1, slowMs: number = 500) => {
    const response = await apiClient.post('/admin/database/profiling', { level, slowMs });
    return response.data;
  },

  // Audit Logs
  getAuditLogs: async (params?: {
    action?: string;
    resourceType?: string;
    username?: string;
    severity?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/audit-logs', { params });
    return response.data;
  },

  getActivitySummary: async (days: number = 7) => {
    const response = await apiClient.get('/admin/audit-logs/summary', { params: { days } });
    return response.data.data;
  },

  getCriticalEvents: async (limit: number = 10) => {
    const response = await apiClient.get('/admin/audit-logs/critical', { params: { limit } });
    return response.data.data;
  },

  // System Stats
  getSystemStats: async () => {
    const response = await apiClient.get('/admin/system-stats');
    return response.data.data;
  },

  // Session Management
  getActiveSessions: async () => {
    const response = await apiClient.get('/admin/sessions/active');
    return response.data.data;
  },

  forceLogout: async (userId: string) => {
    const response = await apiClient.post(`/admin/sessions/${userId}/force-logout`);
    return response.data;
  },

  // Activity Feed
  getActivityFeed: async (limit: number = 20) => {
    const response = await apiClient.get('/admin/activity-feed', { params: { limit } });
    return response.data.data;
  },

  getRecentActivity: async (limit: number = 10) => {
    const response = await apiClient.get('/admin/recent-activity', { params: { limit } });
    return response.data.data;
  },

  // Email Notifications
  testEmailConfig: async () => {
    const response = await apiClient.get('/admin/email/test-config');
    return response.data;
  },

  sendTestEmail: async (recipient?: string) => {
    const response = await apiClient.post('/admin/email/send-test', { recipient });
    return response.data;
  },

  sendDailySummary: async () => {
    const response = await apiClient.post('/admin/email/daily-summary');
    return response.data;
  },

  sendWeeklySummary: async () => {
    const response = await apiClient.post('/admin/email/weekly-summary');
    return response.data;
  },

  // System Settings
  getSystemSettings: async () => {
    const response = await apiClient.get('/admin/system-settings');
    return response.data.data;
  },

  updateSystemSettings: async (section: string, settings: any) => {
    const response = await apiClient.put('/admin/system-settings', { section, settings });
    return response.data;
  },

  toggleMaintenanceMode: async () => {
    const response = await apiClient.post('/admin/maintenance-mode/toggle');
    return response.data;
  },

  getMaintenanceStatus: async () => {
    const response = await apiClient.get('/admin/maintenance-mode/status');
    return response.data.data;
  },

  // Security Settings
  updateSecuritySettings: async (type: 'password' | 'session', settings: any) => {
    const response = await apiClient.put('/admin/security-settings', { type, settings });
    return response.data;
  },
};

// Backup & Recovery API
export const backupAPI = {
  // Get all backups
  getBackups: async (params?: {
    status?: 'in_progress' | 'completed' | 'failed';
    type?: 'manual' | 'scheduled';
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/backup', { params });
    return response.data.data;
  },

  // Get backup by ID
  getBackupById: async (id: string) => {
    const response = await apiClient.get(`/backup/${id}`);
    return response.data.data;
  },

  // Create manual backup
  createBackup: async () => {
    const response = await apiClient.post('/backup');
    return response.data.data;
  },

  // Download backup
  downloadBackup: async (id: string) => {
    const response = await apiClient.get(`/backup/${id}/download`);
    return response.data.data;
  },

  // Restore backup
  restoreBackup: async (id: string) => {
    const response = await apiClient.post(`/backup/${id}/restore`);
    return response.data;
  },

  // Delete backup
  deleteBackup: async (id: string) => {
    const response = await apiClient.delete(`/backup/${id}`);
    return response.data;
  },

  // Get backup statistics
  getStats: async () => {
    const response = await apiClient.get('/backup/stats');
    return response.data.data;
  },

  // Cleanup old backups
  cleanupBackups: async (retentionDays: number) => {
    const response = await apiClient.post('/backup/cleanup', { retentionDays });
    return response.data;
  },

  // Backup schedules
  getSchedules: async () => {
    const response = await apiClient.get('/backup-schedules');
    return response.data.data;
  },

  createSchedule: async (data: {
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    retentionDays: number;
  }) => {
    const response = await apiClient.post('/system-admin/backup-schedules', data);
    return response.data.data;
  },

  updateSchedule: async (id: string, data: any) => {
    const response = await apiClient.put(`/system-admin/backup-schedules/${id}`, data);
    return response.data.data;
  },

  deleteSchedule: async (id: string) => {
    const response = await apiClient.delete(`/system-admin/backup-schedules/${id}`);
    return response.data;
  },
};

// Analytics & Reports API
export const analyticsAPI = {
  // Get dashboard analytics
  getDashboard: async (params?: {
    startDate?: string;
    endDate?: string;
    period?: number;
  }) => {
    const response = await apiClient.get('/system-admin/analytics/dashboard', { params });
    return response.data.data;
  },

  // Get revenue report
  getRevenueReport: async (params?: {
    startDate?: string;
    endDate?: string;
    groupBy?: 'hour' | 'day' | 'month' | 'year';
  }) => {
    const response = await apiClient.get('/system-admin/analytics/revenue', { params });
    return response.data.data;
  },

  // Get fuel report
  getFuelReport: async (params?: {
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.get('/system-admin/analytics/fuel', { params });
    return response.data.data;
  },

  // Get user activity report
  getUserActivityReport: async (params?: {
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.get('/system-admin/analytics/user-activity', { params });
    return response.data.data;
  },

  // Get system performance
  getSystemPerformance: async () => {
    const response = await apiClient.get('/system-admin/analytics/system-performance');
    return response.data.data;
  },

  // Export report
  exportReport: async (data: {
    reportType: 'revenue' | 'fuel' | 'user-activity' | 'comprehensive';
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.post('/system-admin/analytics/export', data, {
      responseType: 'blob'
    });
    return response.data;
  },
};

// Configuration API
export const configAPI = {
  // Fuel Stations (public read-only endpoint for all authenticated users)
  getStations: async () => {
    const response = await apiClient.get('/config/stations');
    return response.data.data;
  },
  
  createStation: async (data: {
    stationName: string;
    defaultRate: number;
    defaultLitersGoing: number;
    defaultLitersReturning: number;
    fuelRecordFieldGoing?: string;
    fuelRecordFieldReturning?: string;
    formulaGoing?: string;
    formulaReturning?: string;
  }) => {
    const response = await apiClient.post('/system-config/stations', data);
    return response.data;
  },
  
  updateStation: async (id: string, data: any) => {
    const response = await apiClient.put(`/system-config/stations/${id}`, data);
    return response.data;
  },
  
  deleteStation: async (id: string) => {
    const response = await apiClient.delete(`/system-config/stations/${id}`);
    return response.data;
  },
  
  // Routes (public read-only endpoint for all authenticated users)
  getRoutes: async (routeType?: 'IMPORT' | 'EXPORT') => {
    const params = routeType ? { routeType } : {};
    const response = await apiClient.get('/config/routes', { params });
    return response.data.data;
  },
  
  createRoute: async (data: {
    routeName: string;
    origin?: string;
    destination: string;
    destinationAliases?: string[];
    routeType?: 'IMPORT' | 'EXPORT';
    defaultTotalLiters: number;
    formula?: string;
    description?: string;
  }) => {
    const response = await apiClient.post('/system-config/routes', data);
    return response.data;
  },
  
  updateRoute: async (id: string, data: any) => {
    const response = await apiClient.put(`/system-config/routes/${id}`, data);
    return response.data;
  },
  
  deleteRoute: async (id: string) => {
    const response = await apiClient.delete(`/system-config/routes/${id}`);
    return response.data;
  },
  
  // Formula helpers (public read-only endpoint)
  getFormulaVariables: async () => {
    const response = await apiClient.get('/config/formula-variables');
    return response.data;
  },
};

// Trash Management API
export const trashAPI = {
  // Get trash statistics
  getStats: async () => {
    const response = await apiClient.get('/trash/stats');
    return response.data.data;
  },

  // Get deleted items by type
  getDeletedItems: async (
    type: string,
    params?: {
      dateFrom?: string;
      dateTo?: string;
      deletedBy?: string;
      page?: number;
      limit?: number;
    }
  ) => {
    const response = await apiClient.get(`/trash/${type}`, { params });
    return response.data;
  },

  // Restore single item
  restoreItem: async (type: string, id: string) => {
    const response = await apiClient.post(`/trash/${type}/${id}/restore`);
    return response.data;
  },

  // Bulk restore
  bulkRestore: async (type: string, ids: string[]) => {
    const response = await apiClient.post('/trash/bulk-restore', { type, ids });
    return response.data;
  },

  // Permanent delete
  permanentDelete: async (type: string, id: string) => {
    const response = await apiClient.delete(`/trash/${type}/${id}/permanent`);
    return response.data;
  },

  // Bulk permanent delete
  bulkPermanentDelete: async (type: string, ids: string[]) => {
    const response = await apiClient.post('/trash/bulk-permanent-delete', { type, ids });
    return response.data;
  },

  // Empty trash for a type
  emptyTrash: async (type: string) => {
    const response = await apiClient.delete(`/trash/${type}/empty`);
    return response.data;
  },

  // Retention settings
  getRetentionSettings: async () => {
    const response = await apiClient.get('/trash/settings/retention');
    return response.data.data;
  },

  updateRetentionSettings: async (settings: { retentionDays: number; autoCleanupEnabled: boolean }) => {
    const response = await apiClient.post('/trash/settings/retention', settings);
    return response.data;
  },
};

export default apiClient;
