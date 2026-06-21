import axios from 'axios';
import { measureSettingsAction } from './settingsTelemetry';
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
  User,
  YardFuelDispense
} from '../types';

// Use relative URL to leverage Vite proxy (/api/v1 -> http://localhost:5000/api/v1)
// This makes requests same-origin, allowing cookies to work properly
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable cookies for CSRF
});

// CSRF token storage key in sessionStorage
const CSRF_STORAGE_KEY = 'xsrf_token';

// Function to get CSRF token
// Cross-origin deployments (Firebase frontend + Railway backend) cannot read
// cookies set by a different domain, so we store the token from the response
// body in sessionStorage and read it from there.
export const getCsrfToken = (): string | null => {
  // Token is fetched from GET /csrf-token response body and stored here.
  // Cross-origin (Firebase ↔ Railway) means document.cookie cannot read a
  // cookie set by the backend domain; sessionStorage is the only viable path.
  const stored = sessionStorage.getItem(CSRF_STORAGE_KEY);
  // Discard '[REDACTED]' placeholder that was stored when the backend was
  // incorrectly sanitizing the /csrf-token response body (now fixed). Keeping
  // it would cause every POST to fail once with 403 before the retry succeeds.
  if (stored === '[REDACTED]') {
    sessionStorage.removeItem(CSRF_STORAGE_KEY);
    return null;
  }
  return stored;
};

// Single-flight CSRF fetch: if a fetch is already in-flight, return the same
// promise instead of firing a second concurrent request. This prevents the
// app-load fetch (line below) and the request-interceptor fetch from racing
// when the user submits a form before the initial fetch completes.
let csrfFetchPromise: Promise<void> | null = null;

const fetchCsrfToken = async (): Promise<void> => {
  if (csrfFetchPromise) return csrfFetchPromise;
  csrfFetchPromise = (async () => {
    try {
      const response = await apiClient.get('/csrf-token');
      const token = response.data?.csrfToken;
      if (token) {
        sessionStorage.setItem(CSRF_STORAGE_KEY, token);
      }
    } catch (error) {
      console.error('[CSRF] Failed to fetch CSRF token:', error);
      throw error;
    } finally {
      csrfFetchPromise = null;
    }
  })();
  return csrfFetchPromise;
};

// Initialize CSRF token on app load
fetchCsrfToken().catch(err => {
  console.error('[CSRF] Initial token fetch failed:', err);
});

// ── Single-flight refresh ──────────────────────────────────────────────────
// The backend uses ROTATING refresh tokens with reuse detection: every call to
// POST /auth/refresh issues a brand-new token, stores its hash, and resets the
// cookie. If two refreshes run concurrently (e.g. several requests 401 at once on
// app load, plus AuthContext's session-restore), they each rotate the token — the
// browser keeps one cookie while the server's stored hash is from another, so the
// NEXT refresh is flagged as "token reuse" and the entire session is revoked
// (user gets logged out on reopen). Funnelling every refresh through one shared
// in-flight promise guarantees a single rotation: concurrent callers await the
// same result and the cookie stays in sync with the server.
let refreshPromise: Promise<string | null> | null = null;

export const performTokenRefresh = (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await apiClient.post('/auth/refresh');
      const newAccessToken: string | null =
        res.data?.data?.accessToken || res.data?.data?.token || null;
      if (newAccessToken) {
        sessionStorage.setItem('fuel_order_token', newAccessToken);
      }
      return newAccessToken;
    } finally {
      // Clear AFTER settle so any callers that joined during the in-flight window
      // share this result; the next refresh after this one starts fresh.
      refreshPromise = null;
    }
  })();
  return refreshPromise;
};

// Request interceptor to add auth token and CSRF token
apiClient.interceptors.request.use(
  async (config) => {
    // Add auth token
    const token = sessionStorage.getItem('fuel_order_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase() || '')) {
      let csrfToken = getCsrfToken();
      
      // If no CSRF token exists, fetch it first (but not for csrf-token endpoint itself)
      if (!csrfToken && !config.url?.includes('/csrf-token')) {
        try {
          await fetchCsrfToken();
          csrfToken = getCsrfToken();
        } catch (error) {
          console.error('[CSRF] Failed to fetch CSRF token in interceptor:', error);
        }
      }
      
      if (csrfToken) {
        config.headers['X-XSRF-TOKEN'] = csrfToken;
      } else {
        console.warn('[CSRF] No token available for request!', { url: config.url, method: config.method });
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
    if (error.response?.status === 403 && 
        (error.response?.data?.code === 'CSRF_VALIDATION_FAILED' || 
         error.response?.data?.code === 'CSRF_TOKEN_MISSING')) {
      // Refresh CSRF token and retry
      if (!originalRequest._retry) {
        originalRequest._retry = true;
        await fetchCsrfToken();
        // Wait a bit for cookie to be set
        await new Promise(resolve => setTimeout(resolve, 100));
        return apiClient(originalRequest);
      }
    }
    
    // Handle auth errors
    if (error.response?.status === 401) {
      // Don't redirect if this is a login attempt or first-login-password - let the component handle it.
      // Passkey login (a public ceremony) must also be exempt so a wrong/cancelled
      // passkey surfaces inline instead of bouncing to /login?reason=unauthorized.
      const isLoginRequest =
        error.config?.url?.includes('/auth/login') ||
        error.config?.url?.includes('/auth/passkey/login');
      const isFirstLoginPassword = error.config?.url?.includes('/auth/first-login-password');
      const isRefreshRequest = error.config?.url?.includes('/auth/refresh');
      
      if (!isLoginRequest && !isFirstLoginPassword && !isRefreshRequest) {
        // Before giving up, attempt a silent token refresh if Remember Me is active.
        // The HttpOnly cookie is sent automatically; if it's still valid the
        // backend returns a new access token and rotates the cookie.
        const hasRememberMe = localStorage.getItem('fuel_order_remember_me') === '1';
        if (hasRememberMe && !originalRequest._authRetry) {
          originalRequest._authRetry = true;
          try {
            // Shared single-flight: a 401-storm on load triggers ONE refresh, not one
            // per request — preventing the rotating-token reuse false-positive.
            const newAccessToken = await performTokenRefresh();
            if (newAccessToken) {
              // Retry the original request with the new token
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              return apiClient(originalRequest);
            }
          } catch {
            // Refresh failed — cookie is expired/revoked, fall through to redirect
            localStorage.removeItem('fuel_order_remember_me');
          }
        }

        // Clear auth data
        sessionStorage.removeItem('fuel_order_auth');
        sessionStorage.removeItem('fuel_order_token');
        
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
  getAll: async (filters?: any): Promise<{ data: DeliveryOrder[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await apiClient.get('/delivery-orders', { params: filters });
    // Check if response has pagination metadata (server-side pagination)
    if (response.data.data?.pagination) {
      return {
        data: response.data.data.data || [],
        pagination: response.data.data.pagination
      };
    }
    // Fallback for non-paginated responses (all data)
    return {
      data: response.data.data?.data || response.data.data || [],
      pagination: undefined
    };
  },

  getAvailablePeriods: async (params?: { importOrExport?: string; doType?: string; status?: string }): Promise<Array<{ year: number; month: number }>> => {
    const response = await apiClient.get('/delivery-orders/available-periods', { params });
    return response.data || [];
  },
  
  getById: async (id: string | number): Promise<DeliveryOrder> => {
    const response = await apiClient.get(`/delivery-orders/${id}`);
    return response.data.data;
  },
  
  create: async (data: Partial<DeliveryOrder>): Promise<DeliveryOrder> => {
    const response = await apiClient.post('/delivery-orders', data);
    return response.data.data;
  },

  // Bulk-create DOs + fuel records in a single backend request.
  createBulk: async (orders: Partial<DeliveryOrder>[]): Promise<{
    createdOrders: DeliveryOrder[];
    summary: {
      totalAttempted: number;
      successCount: number;
      failedCount: number;
      queuedCount: number;
      unlinkedExportCount?: number;
      failedReasons?: { truck: string; reason: string }[];
      unlinkedExports?: { truck: string; reason: string }[];
    };
  }> => {
    const response = await apiClient.post('/delivery-orders/bulk', { orders });
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
  
  // NOTE: delivery orders are cancelled (see `cancel`), never deleted — no delete method.

  getNextNumber: async (doType: 'DO' | 'SDO' = 'DO'): Promise<string> => {
    const response = await apiClient.get('/delivery-orders/next-do-number', { 
      params: { doType } 
    });
    // Return the formatted DO number (e.g., "0001/26")
    return response.data.data?.nextDONumber || '0001/26';
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
      fuelUpdates?: { originalTotalLts: number; exportRouteLiters: number; newTotalLts: number };
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

  // Create notification for bulk DO creation failures/skips
  createBulkFailureNotification: async (data: {
    totalAttempted: number;
    successCount: number;
    skippedCount: number;
    failedCount: number;
    skippedReasons?: { truck: string; reason: string }[];
    failedReasons?: { truck: string; reason: string }[];
  }): Promise<void> => {
    await apiClient.post('/delivery-orders/notify-bulk-failures', data);
  },

  // Download bulk DOs as PDF (backend-generated with pdfkit)
  downloadBulkPDF: async (doNumbers: string[]): Promise<Blob> => {
    const response = await apiClient.post('/delivery-orders/bulk/download-pdf', 
      { doNumbers },
      { 
        responseType: 'blob',
        headers: {
          'Accept': 'application/pdf'
        }
      }
    );
    return response.data;
  },

  // Edit lock management
  acquireLock: async (id: string | number): Promise<{ lockedUntil: string }> => {
    const response = await apiClient.post(`/delivery-orders/${id}/lock`);
    return response.data;
  },

  releaseLock: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/delivery-orders/${id}/lock`);
  },

  getHistory: async (id: string | number): Promise<any[]> => {
    const response = await apiClient.get(`/delivery-orders/${id}/history`);
    return response.data.data || [];
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

// LPOs API — reads from /lpo-documents/entries (flat aggregation over LPOSummary)
export const lposAPI = {
  getAll: async (filters?: any): Promise<{ data: LPOEntry[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await apiClient.get('/lpo-documents/entries', { params: filters });
    if (response.data.data?.pagination) {
      return {
        data: response.data.data.data || [],
        pagination: response.data.data.pagination,
      };
    }
    return {
      data: response.data.data?.data || response.data.data || [],
      pagination: undefined,
    };
  },

  getAvailableFilters: async (params?: { dateFrom?: string; dateTo?: string }): Promise<{ periods: Array<{ year: number; month: number }>; stations: string[] }> => {
    const response = await apiClient.get('/lpo-documents/entries/filters', { params });
    return response.data || { periods: [], stations: [] };
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

  // NOTE: no deleteSheet — an LPO sheet/document cannot be deleted, only cancelled.
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
    const response = await apiClient.get(`/lpo-documents/lpo/${encodeURIComponent(lpoNo)}`);
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
  
  // NOTE: LPO documents are cancelled, never deleted (business rule) — no delete method.

  getNextLpoNumber: async (): Promise<string> => {
    const response = await apiClient.get('/lpo-documents/next-number');
    return response.data.data?.nextLpoNo || `0001/${new Date().getFullYear().toString().slice(-2)}`;
  },

  downloadPDF: async (id: string | number): Promise<void> => {
    const response = await apiClient.get(`/lpo-documents/${id}/pdf`, { responseType: 'blob' });
    const contentDisposition = response.headers['content-disposition'] as string | undefined;
    let filename = 'LPO.pdf';
    if (contentDisposition) {
      const m = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (m?.[1]) filename = m[1].replace(/['"]/g, '');
    }
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
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
      return '1';
    }
  },

  // Check if a truck already has an active allocation at a specific station
  // Returns duplicate info - used to prevent accidentally creating duplicate fuel orders
  // If liters is provided and differs from existing allocation, it's allowed (top-up scenario)
  checkDuplicateAllocation: async (truckNo: string, station: string, excludeLpoId?: string, liters?: number, doNo?: string): Promise<{
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
    if (doNo) params.doNo = doNo; // Add DO number to filter by journey
    const response = await apiClient.get('/lpo-documents/check-duplicate', { params });
    return response.data.data || { hasDuplicate: false, existingLpos: [], allowOverride: true, isDifferentAmount: false };
  },

  // Find LPOs at a checkpoint for a specific truck (for auto-cancellation)
  // Now includes doNo parameter to filter by current journey only
  findAtCheckpoint: async (truckNo: string, doNo?: string, station?: string, cancellationPoint?: string): Promise<LPOSummary[]> => {
    const params: any = { truckNo };
    if (doNo) params.doNo = doNo;
    if (station) params.station = station;
    if (cancellationPoint) params.cancellationPoint = cancellationPoint;
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

  // Amend (partially reduce) a truck entry in an existing LPO
  amendTruck: async (lpoId: string | number, truckNo: string, newLiters: number, cancellationPoint?: string, reason?: string): Promise<LPOSummary> => {
    const response = await apiClient.post('/lpo-documents/amend-truck', {
      lpoId,
      truckNo,
      newLiters,
      cancellationPoint,
      reason
    });
    return response.data.data;
  },

  // Cancel ALL active entries in an LPO at once
  cancelAll: async (id: string, reason?: string): Promise<{ lpoNo: string; results: any[] }> => {
    const response = await apiClient.post(`/lpo-documents/${id}/cancel-all`, { reason });
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

  // Edit lock management
  acquireLock: async (id: string | number): Promise<{ lockedUntil: string }> => {
    const response = await apiClient.post(`/lpo-documents/${id}/lock`);
    return response.data;
  },

  releaseLock: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/lpo-documents/${id}/lock`);
  },

};

/**
 * Named "resource" locks — mutual exclusion over an operation (not a document).
 * Used for "one-at-a-time" create flows (e.g. DO creation, the LPO detail form).
 * Keys are validated against a server-side allowlist (`do_create`, `lpo_create`).
 */
export const resourceLockAPI = {
  acquire: async (key: string): Promise<{ lockedUntil: string }> => {
    const response = await apiClient.post(`/resource-locks/${key}/lock`);
    return response.data?.data;
  },

  release: async (key: string): Promise<void> => {
    await apiClient.delete(`/resource-locks/${key}/lock`);
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
      tangaGoing: number;
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
    originalDoNo?: string;
    checkpoint?: string;
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
  getAll: async (filters?: any): Promise<{ data: FuelRecord[]; pagination?: { page: number; limit: number; total: number; totalPages: number } }> => {
    const response = await apiClient.get('/fuel-records', { params: filters });
    // Check if response has pagination metadata (server-side pagination)
    if (response.data.data?.pagination) {
      return {
        data: response.data.data.data || [],
        pagination: response.data.data.pagination
      };
    }
    // Fallback for non-paginated responses (all data)
    return {
      data: response.data.data?.data || response.data.data || [],
      pagination: undefined
    };
  },

  getAvailablePeriods: async (): Promise<{ periods: Array<{ year: number; month: number }> }> => {
    const response = await apiClient.get('/fuel-records/available-periods');
    return response.data.data || { periods: [] };
  },

  getAvailableRoutes: async (params: { month?: string; routeType?: string }): Promise<{ routes: Array<{ from: string; to: string }> }> => {
    const response = await apiClient.get('/fuel-records/available-routes', { params });
    return response.data.data || { routes: [] };
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
      // URL-encode the DO number to handle slashes (e.g., "0003/26" -> "0003%2F26")
      const encodedDoNumber = encodeURIComponent(doNumber);
      const response = await apiClient.get(`/fuel-records/do/${encodedDoNumber}`);
      if (response.data.data) {
        const fuelRecord = response.data.data;
        // Use the detected direction from the backend
        const direction = fuelRecord.detectedDirection || (fuelRecord.goingDo === doNumber ? 'going' : 'returning');
        return { fuelRecord, direction };
      }
      return null;
    } catch (error: any) {
      // If not found, return null (expected for NIL DOs and driver account entries)
      if (error.response?.status === 404) {
        return null;
      }
      // Only log non-404 errors
      console.error('Error fetching fuel record:', error);
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

  cancel: async (id: string | number): Promise<FuelRecord> => {
    const response = await apiClient.post(`/fuel-records/${id}/cancel`);
    return response.data.data;
  },

  uncancel: async (id: string | number): Promise<FuelRecord> => {
    const response = await apiClient.post(`/fuel-records/${id}/uncancel`);
    return response.data.data;
  },

  // Edit lock management
  acquireLock: async (id: string | number): Promise<{ lockedUntil: string }> => {
    const response = await apiClient.post(`/fuel-records/${id}/lock`);
    return response.data;
  },

  releaseLock: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/fuel-records/${id}/lock`);
  },

  getHistory: async (id: string | number): Promise<any[]> => {
    const response = await apiClient.get(`/fuel-records/${id}/history`);
    return response.data.data || [];
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

  getChartData: async (months: number = 4): Promise<any> => {
    const response = await apiClient.get('/dashboard/chart-data', {
      params: { months },
    });
    return response.data.data;
  },

  getMonthlyStats: async (months: number = 6): Promise<any> => {
    const response = await apiClient.get('/dashboard/monthly-stats', {
      params: { months },
    });
    return response.data.data;
  },

  getJourneyQueue: async (): Promise<any> => {
    const response = await apiClient.get('/dashboard/journey-queue');
    return response.data.data;
  },

  getOfficerStats: async (): Promise<any> => {
    const response = await apiClient.get('/dashboard/officer-stats');
    return response.data.data;
  },
};

// Authentication API
export const authAPI = {
  login: async (credentials: LoginCredentials): Promise<any> => {
    const deviceId = sessionStorage.getItem('deviceId');
    const loginPayload = { ...credentials, ...(deviceId && { deviceId }) };
    const response = await apiClient.post('/auth/login', loginPayload);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  refreshToken: async (): Promise<{ accessToken: string | null }> => {
    // Shares the single-flight promise with the 401 interceptor so the session
    // restore on page load can't race a concurrent refresh into a reuse revoke.
    const accessToken = await performTokenRefresh();
    return { accessToken };
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

  updatePreferences: async (preferences: { theme?: 'light' | 'dark' }): Promise<void> => {
    await apiClient.patch('/auth/preferences', preferences);
  },

  firstLoginPassword: async (data: { newPassword: string; rememberMe?: boolean }): Promise<any> => {
    const response = await apiClient.post('/auth/first-login-password', data);
    return response.data.data; // Extract the inner data object with tokens
  },

  getPasswordPolicy: async (): Promise<{
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
  }> => {
    const response = await apiClient.get('/auth/password-policy');
    return response.data.data;
  },

  /** Activate account via one-time magic link token */
  activateAccount: async (token: string, rememberMe?: boolean): Promise<any> => {
    const response = await apiClient.post('/auth/activate-account', { token, rememberMe });
    return response.data.data;
  },
};

// Passkey / WebAuthn API. The browser ceremony (navigator.credentials) is driven
// by services/passkeyService.ts; this object is the thin transport layer.
export const passkeyAPI = {
  // ── Login (public) ──
  loginOptions: async (username?: string): Promise<{ options: any; challengeToken: string }> => {
    const response = await apiClient.post('/auth/passkey/login/options', { username });
    return response.data.data;
  },
  loginVerify: async (payload: { challengeToken: string; response: any; rememberMe?: boolean }): Promise<any> => {
    const response = await apiClient.post('/auth/passkey/login/verify', payload);
    return response.data;
  },

  // ── Enrollment & management (authenticated) ──
  registerOptions: async (): Promise<any> => {
    const response = await apiClient.post('/auth/passkey/register/options');
    return response.data.data;
  },
  registerVerify: async (payload: any): Promise<void> => {
    await apiClient.post('/auth/passkey/register/verify', payload);
  },
  list: async (): Promise<Array<{
    _id: string; label: string; deviceType: string; backedUp: boolean;
    transports: string[]; lastUsedAt: string | null; createdAt: string;
  }>> => {
    const response = await apiClient.get('/auth/passkey');
    return response.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/auth/passkey/${id}`);
  },
  rename: async (id: string, label: string): Promise<void> => {
    await apiClient.patch(`/auth/passkey/${id}`, { label });
  },
};

// Users Management API (Admin only)
export const usersAPI = {
  /**
   * Paginated, server-side search. Returns full PaginatedResponse wrapper.
   */
  getPaginated: async (params: {
    page?: number;
    limit?: number;
    sort?: string;
    order?: 'asc' | 'desc';
    role?: string;
    isActive?: string;
    q?: string;
  }): Promise<{ data: User[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } }> => {
    const response = await apiClient.get('/users', { params });
    return response.data.data;
  },

  getAll: async (filters?: any): Promise<User[]> => {
    const response = await apiClient.get('/users', { params: filters });
    return response.data.data?.data || response.data.data || [];
  },

  getById: async (id: string | number): Promise<User> => {
    const response = await apiClient.get(`/users/${id}`);
    return response.data.data;
  },

  getDetail: async (id: string | number): Promise<{ user: User; mfaStatus: any; loginHistory: any[] }> => {
    const response = await apiClient.get(`/users/${id}/detail`);
    return response.data.data;
  },

  create: async (data: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { provisioningMethod?: string; customPassword?: string }): Promise<{ user: User; emailSent: boolean; temporaryPassword?: string; provisioningMethod?: string; message: string }> => {
    const response = await apiClient.post('/users', data);
    return {
      user: response.data.data,
      emailSent: response.data.emailSent,
      temporaryPassword: response.data.temporaryPassword,
      provisioningMethod: response.data.provisioningMethod,
      message: response.data.message,
    };
  },

  update: async (id: string | number, data: Partial<User>): Promise<User> => {
    const response = await apiClient.put(`/users/${id}`, data);
    return response.data.data;
  },

  updateNotes: async (id: string | number, notes: string): Promise<void> => {
    await apiClient.patch(`/users/${id}/notes`, { notes });
  },

  delete: async (id: string | number): Promise<void> => {
    await apiClient.delete(`/users/${id}`);
  },

  resetPassword: async (
    id: string | number,
    options?: { provisioningMethod?: 'temp_password' | 'email_link' | 'manual'; customPassword?: string }
  ): Promise<{ temporaryPassword?: string; emailSent: boolean; provisioningMethod?: string }> => {
    const response = await apiClient.post(`/users/${id}/reset-password`, options ?? {});
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

  bulkDelete: async (userIds: string[]): Promise<{ deleted: number }> => {
    const response = await apiClient.post('/users/bulk/delete', { userIds });
    return response.data.data;
  },

  bulkResetPasswords: async (userIds: string[]): Promise<{ success: number; failed: number }> => {
    const response = await apiClient.post('/users/bulk/reset-passwords', { userIds });
    return response.data.data;
  },

  exportCSV: async (params?: { role?: string; isActive?: string; q?: string }): Promise<Blob> => {
    const response = await apiClient.get('/users/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  importCSV: async (csvText: string): Promise<{ created: number; skipped: number; errors: Array<{ row: number; reason: string }> }> => {
    const response = await apiClient.post('/users/import', csvText, {
      headers: { 'Content-Type': 'text/plain' },
    });
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
    return response.data.data?.nextLpoNo || `0001/${new Date().getFullYear().toString().slice(-2)}`;
  },

  // Get all entries with optional filters.
  // NOTE: the backend paginates and defaults to limit=10. Callers that render a full table
  // must pass an explicit `limit`, otherwise the list is silently truncated to 10 rows.
  // 5000 is the backend's hard cap (see getPaginationParams); a warning is logged if hit.
  getAll: async (filters?: { year?: number; month?: string; truckNo?: string; status?: string; page?: number; limit?: number }): Promise<DriverAccountEntry[]> => {
    const params = { limit: 5000, ...filters };
    const response = await apiClient.get('/driver-accounts', { params });
    const entries = response.data.data?.data || response.data.data || [];
    const total = response.data.data?.pagination?.total;
    if (typeof total === 'number' && total > entries.length) {
      console.warn(`driverAccountAPI.getAll: ${total} entries exist but only ${entries.length} returned — add pagination UI to view the rest.`);
    }
    return entries.map((e: any) => ({ ...e, id: e.id || e._id }));
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
        allEntries.push(...monthEntries.map((e: any) => ({ ...e, id: e.id || e._id })));
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
  destinationRules?: {
    destination: string;
    extraLiters: number;
  }[];
  addedBy: string;
  addedAt: string;
}

export interface TruckBatches {
  [extraLiters: string]: TruckBatch[];  // Dynamic keys for any liter amount
}

export interface BatchDestinationRule {
  destination: string;
  extraLiters: number;
}

export interface TruckBatchConfig {
  truckBatches: TruckBatches;
  batchDestinationRules: { [extraLiters: string]: BatchDestinationRule[] };
}

export interface StandardAllocations {
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

export interface YardTimeLimitSetting {
  enabled: boolean;
  timeLimitDays: number;
}

export interface YardConfig {
  _id: string;
  yard: 'DAR' | 'TANGA';
  rate: number;
  description?: string;
  supplierName?: string;
  supplierAddress?: string;
  supplierPlotNo?: string;
  supplierPoBox?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface YardFuelTimeLimitConfig {
  enabled: boolean;
  perYard: {
    darYard: YardTimeLimitSetting;
    tangaYard: YardTimeLimitSetting;
    mmsaYard: YardTimeLimitSetting;
  };
}

// Per-operation fuel-record automation toggles for DO operations.
export interface FuelAutomationConfig {
  lpoCreateDeduct: boolean;
  lpoCancelRevert: boolean;
  lpoEditAdjust: boolean;
  doImportCreate: boolean;
  doExportUpdate: boolean;
  doAmendCascade: boolean;
  doCancelCascade: boolean;
}

export interface JourneyConfig {
  // Fuel columns whose filling on a queued journey marks it as started
  startColumns: string[];
  // All columns selectable as start columns (returned by the API for the UI)
  selectableColumns?: string[];
  // Stations a super_manager may view (empty => default all-allowed)
  superManagerStations?: string[];
  // Whether to auto-download PDF immediately after DO creation (single or bulk)
  autoDownloadDOPdf?: boolean;
  // Whether to auto-download PDF after LPO "Create and Forward"
  autoDownloadLPOPdf?: boolean;
  // Per-operation fuel-record automation switches
  fuelAutomation?: FuelAutomationConfig;
  // How many days back to search for existing LPOs when creating a CASH LPO (default 40)
  cashLpoLookbackDays?: number;
  // Dashboard unified-search configuration
  searchConfig?: {
    doMonths?: number;       // months back for DO search (default 4)
    doMaxResults?: number;   // max DO results (default 6)
    lpoMonths?: number;      // months back for LPO search (default 1)
    lpoMaxResults?: number;  // max LPO results (default 50)
    fuelMaxResults?: number; // max fuel record results (default 3)
  };
}

export const adminAPI = {

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

  // Truck Batches (read-only from public config endpoint)
  getTruckBatches: async (): Promise<TruckBatchConfig> => {
    const response = await apiClient.get('/config/truck-batches');
    const raw = response.data.data || {};
    // Normalise: old API returned just the truckBatches map; new API returns { truckBatches, batchDestinationRules }
    if (raw.truckBatches !== undefined) return raw as TruckBatchConfig;
    return { truckBatches: raw, batchDestinationRules: {} };
  },

  // Create new batch with custom liters
  createBatch: async (data: { extraLiters: number }): Promise<TruckBatchConfig> => {
    const response = await apiClient.post('/admin/truck-batches/batches', data);
    return response.data.data;
  },

  // Update batch allocation
  updateBatch: async (data: { oldExtraLiters: number; newExtraLiters: number }): Promise<TruckBatchConfig> => {
    const response = await apiClient.put('/admin/truck-batches/batches', data);
    return response.data.data;
  },

  // Delete batch (only if empty)
  deleteBatch: async (extraLiters: number): Promise<TruckBatchConfig> => {
    const response = await apiClient.delete(`/admin/truck-batches/batches/${extraLiters}`);
    return response.data.data;
  },

  // Add truck to batch (supports any liter amount now)
  addTruckToBatch: async (data: { truckSuffix: string; extraLiters: number; truckNumber?: string }): Promise<TruckBatchConfig> => {
    const response = await apiClient.post('/admin/truck-batches', data);
    return response.data.data;
  },

  // Remove truck from batches
  removeTruckFromBatch: async (truckSuffix: string): Promise<TruckBatchConfig> => {
    const response = await apiClient.delete(`/admin/truck-batches/${truckSuffix}`);
    return response.data.data;
  },

  // Truck-level Destination Rules
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
  }): Promise<TruckBatchConfig> => {
    const response = await apiClient.put('/admin/truck-batches/destination-rules', data);
    return response.data.data;
  },

  deleteDestinationRule: async (truckSuffix: string, destination: string): Promise<TruckBatchConfig> => {
    const response = await apiClient.delete(`/admin/truck-batches/${truckSuffix}/destination-rules/${destination}`);
    return response.data.data;
  },

  // Batch-level Destination Rules
  addBatchDestinationRule: async (data: {
    extraLiters: number;
    destination: string;
    extraLitersOverride: number;
  }): Promise<TruckBatchConfig> => {
    const response = await apiClient.post('/admin/truck-batches/batch-destination-rules', data);
    return response.data.data;
  },

  updateBatchDestinationRule: async (data: {
    extraLiters: number;
    oldDestination: string;
    newDestination?: string;
    extraLitersOverride: number;
  }): Promise<TruckBatchConfig> => {
    const response = await apiClient.put('/admin/truck-batches/batch-destination-rules', data);
    return response.data.data;
  },

  deleteBatchDestinationRule: async (extraLiters: number, destination: string): Promise<TruckBatchConfig> => {
    const response = await apiClient.delete(`/admin/truck-batches/batch-destination-rules/${extraLiters}/${destination}`);
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
  // Overview Dashboard — single aggregated endpoint
  getOverviewStats: async () => {
    const response = await apiClient.get('/admin/overview-stats');
    return response.data.data;
  },

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
    outcome?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/admin/audit-logs', { params });
    return response.data;
  },

  getAuditStats: async () => {
    const response = await apiClient.get('/admin/audit-logs/stats');
    return response.data.data;
  },

  getActivitySummary: async (days: number = 7) => {
    const response = await apiClient.get('/admin/audit-logs/summary', { params: { days } });
    return response.data.data;
  },

  getCriticalEvents: async (limit: number = 10) => {
    const response = await apiClient.get('/admin/audit-logs/critical', { params: { limit } });
    return response.data.data;
  },

  verifyAuditIntegrity: async (params?: { startDate?: string; endDate?: string; limit?: number }) => {
    const response = await apiClient.get('/admin/audit-logs/verify-integrity', { params });
    return response.data.data;
  },

  exportAuditLogs: async (params?: {
    action?: string; resourceType?: string; username?: string;
    severity?: string; outcome?: string; startDate?: string; endDate?: string;
  }) => {
    const response = await apiClient.get('/admin/audit-logs/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // System Stats
  getSystemStats: async () => {
    const response = await apiClient.get('/admin/system-stats');
    return response.data.data;
  },

  // Session Management
  getActiveSessions: async () => {
    const response = await apiClient.get('/system-admin/sessions');
    return response.data.data;
  },

  revokeSession: async (userId: string) => {
    const response = await apiClient.delete(`/system-admin/sessions/${userId}`);
    return response.data;
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

  getRolePermissions: async () => {
    const response = await apiClient.get('/system-admin/role-permissions');
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
    const response = await measureSettingsAction('platform', 'admin.system_settings', 'load', () =>
      apiClient.get('/admin/system-settings')
    );
    return response.data.data;
  },

  updateSystemSettings: async (section: string, settings: any) => {
    const response = await measureSettingsAction('platform', `admin.${section}`, 'save', () =>
      apiClient.put('/admin/system-settings', { section, settings })
    );
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
  getSecuritySettings: async () => {
    const response = await measureSettingsAction('security', 'admin.security_settings', 'load', () =>
      apiClient.get('/admin/security-settings')
    );
    return response.data.data;
  },

  updateSecuritySettings: async (type: 'password' | 'session' | 'mfa' | 'notifications', settings: any) => {
    const response = await measureSettingsAction('security', `admin.${type}`, 'save', () =>
      apiClient.put('/admin/security-settings', { type, settings })
    );
    return response.data;
  },
};

// Backup & Recovery API
export const backupAPI = {
  // Get all backups
  getBackups: async (params?: {
    status?: 'in_progress' | 'completed' | 'failed' | 'deleted' | 'restoring';
    type?: 'manual' | 'scheduled';
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get('/backup/backups', { params });
    const data = response.data.data;
    // lean() strips the virtual `id` getter — normalise _id → id
    if (data?.backups) {
      data.backups = data.backups.map((b: any) => ({ ...b, id: b.id ?? b._id?.toString() }));
    }
    return data;
  },

  // Get backup by ID
  getBackupById: async (id: string) => {
    const response = await apiClient.get(`/backup/backups/${id}`);
    return response.data.data;
  },

  // Create manual backup (optionally selective collections)
  createBackup: async (collections?: string[]) => {
    const response = await apiClient.post('/backup/backups', collections?.length ? { collections } : {});
    return response.data.data;
  },

  // Download backup
  downloadBackup: async (id: string) => {
    const response = await apiClient.get(`/backup/backups/${id}/download`);
    return response.data.data;
  },

  // Restore backup
  restoreBackup: async (id: string) => {
    const response = await apiClient.post(`/backup/backups/${id}/restore`);
    return response.data;
  },

  // ME-1: Verify backup integrity
  verifyBackup: async (id: string): Promise<{ passed: boolean; details: string }> => {
    const response = await apiClient.post(`/backup/backups/${id}/verify`);
    return response.data.data;
  },

  // LE-3: Soft delete (moves to trash)
  deleteBackup: async (id: string) => {
    const response = await apiClient.delete(`/backup/backups/${id}`);
    return response.data;
  },

  // LE-3: Get soft-deleted backups (trash)
  getDeletedBackups: async (params?: { page?: number; limit?: number }) => {
    const response = await apiClient.get('/backup/backups/trash', { params });
    const data = response.data.data;
    if (data?.backups) {
      data.backups = data.backups.map((b: any) => ({ ...b, id: b.id ?? b._id?.toString() }));
    }
    return data;
  },

  // LE-3: Restore from trash
  undeleteBackup: async (id: string) => {
    const response = await apiClient.post(`/backup/backups/${id}/undelete`);
    return response.data;
  },

  // LE-3: Permanently delete from R2 + DB
  permanentlyDeleteBackup: async (id: string) => {
    const response = await apiClient.delete(`/backup/backups/${id}/permanent`);
    return response.data;
  },

  // Get backup statistics
  getStats: async () => {
    const response = await apiClient.get('/backup/backups/stats');
    return response.data.data;
  },

  // Cleanup old backups
  cleanupBackups: async (retentionDays: number) => {
    const response = await apiClient.post('/backup/backups/cleanup', { retentionDays });
    return response.data;
  },

  // Sync local MongoDB backup catalog from the R2 manifest.
  // Call this when the local DB is missing backup records that exist in R2.
  syncFromR2: async (): Promise<{ restored: number; source: 'manifest' | 'listing' }> => {
    const response = await apiClient.post('/backup/sync-from-r2');
    return response.data.data;
  },

  // Backup schedules
  getSchedules: async () => {
    const response = await apiClient.get('/backup/backup-schedules');
    const schedules = response.data.data;
    // normalise _id → id for lean() responses
    if (Array.isArray(schedules)) {
      return schedules.map((s: any) => ({ ...s, id: s.id ?? s._id?.toString() }));
    }
    return schedules;
  },

  createSchedule: async (data: {
    name: string;
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
    time: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
    retentionDays: number;
  }) => {
    const response = await apiClient.post('/backup/backup-schedules', data);
    return response.data.data;
  },

  updateSchedule: async (id: string, data: any) => {
    const response = await apiClient.put(`/backup/backup-schedules/${id}`, data);
    return response.data.data;
  },

  deleteSchedule: async (id: string) => {
    const response = await apiClient.delete(`/backup/backup-schedules/${id}`);
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
    currency?: 'USD' | 'TZS';
    supplierName?: string;
    supplierAddress?: string;
    supplierPlotNo?: string;
    supplierPoBox?: string;
    description?: string;
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

  // Standard Allocations
  getStandardAllocations: async (): Promise<StandardAllocations> => {
    const response = await apiClient.get('/config/standard-allocations');
    return response.data.data;
  },

  updateStandardAllocations: async (allocations: Partial<StandardAllocations>): Promise<StandardAllocations> => {
    const response = await apiClient.put('/admin/standard-allocations', allocations);
    return response.data.data;
  },

  // Yard Configs (rate + supplier info per yard, for LPO auto-fill)
  getYardConfigs: async (): Promise<YardConfig[]> => {
    const response = await apiClient.get('/config/yards');
    return response.data.data;
  },

  updateYardConfig: async (yard: 'DAR' | 'TANGA', data: {
    rate: number;
    description?: string;
    supplierName?: string;
    supplierAddress?: string;
    supplierPlotNo?: string;
    supplierPoBox?: string;
  }): Promise<YardConfig> => {
    const response = await apiClient.put(`/system-config/yards/${yard}`, data);
    return response.data.data;
  },

  // Yard Fuel Time Limit Settings
  getYardFuelTimeLimit: async (): Promise<YardFuelTimeLimitConfig> => {
    const response = await apiClient.get('/config/yard-fuel-time-limit');
    return response.data.data;
  },

  updateYardFuelTimeLimit: async (settings: Partial<YardFuelTimeLimitConfig>): Promise<YardFuelTimeLimitConfig> => {
    const response = await apiClient.put('/system-config/yard-fuel-time-limit', settings);
    return response.data.data;
  },

  // Journey Configuration (start columns that trigger journey promotion)
  getJourneyConfig: async (): Promise<JourneyConfig> => {
    const response = await apiClient.get('/config/journey-config');
    return response.data.data;
  },

  updateJourneyConfig: async (startColumns: string[]): Promise<JourneyConfig> => {
    const response = await apiClient.put('/admin/journey-config', { startColumns });
    return response.data.data;
  },

  // Update only the super-manager allowed-stations list (partial journey-config update)
  updateSuperManagerStations: async (superManagerStations: string[]): Promise<JourneyConfig> => {
    const response = await apiClient.put('/admin/journey-config', { superManagerStations });
    return response.data.data;
  },

  // Update PDF auto-download toggles (partial journey-config update)
  updatePdfDownloadSettings: async (settings: { autoDownloadDOPdf?: boolean; autoDownloadLPOPdf?: boolean }): Promise<JourneyConfig> => {
    const response = await apiClient.put('/admin/journey-config', settings);
    return response.data.data;
  },

  // Update the CASH LPO lookback window (partial journey-config update)
  updateCashLpoLookbackDays: async (cashLpoLookbackDays: number): Promise<JourneyConfig> => {
    const response = await apiClient.put('/admin/journey-config', { cashLpoLookbackDays });
    return response.data.data;
  },

  // Update fuel-record automation toggles (partial journey-config update).
  // Accepts a partial set of keys; unspecified keys are preserved server-side.
  updateFuelAutomation: async (fuelAutomation: Partial<FuelAutomationConfig>): Promise<JourneyConfig> => {
    const response = await apiClient.put('/admin/journey-config', { fuelAutomation });
    return response.data.data;
  },

  // Update dashboard unified-search configuration (partial journey-config update).
  updateSearchConfig: async (searchConfig: NonNullable<JourneyConfig['searchConfig']>): Promise<JourneyConfig> => {
    const response = await apiClient.put('/admin/journey-config', { searchConfig });
    return response.data.data;
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

  // Get cancelled items (fuel_records, delivery_orders, lpo_summaries)
  getCancelledItems: async (
    type: string,
    params?: { dateFrom?: string; dateTo?: string; page?: number; limit?: number }
  ) => {
    const response = await apiClient.get(`/trash/cancelled/${type}`, { params });
    return response.data;
  },

  // Uncancel a single item; pass truckNo for lpo_summaries entries
  uncancelItem: async (type: string, id: string, truckNo?: string) => {
    const response = await apiClient.post(`/trash/cancelled/${type}/${id}/uncancel`, truckNo ? { truckNo } : {});
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

// Archival Management API
export const archivalAPI = {
  // Run archival process manually
  runArchival: async (options: {
    monthsToKeep?: number;
    auditLogMonthsToKeep?: number;
    dryRun?: boolean;
    collections?: string[];
  }) => {
    const response = await apiClient.post('/archival/run', options);
    return response.data;
  },

  // Get archival statistics (active vs archived counts)
  getStats: async () => {
    const response = await apiClient.get('/archival/stats');
    return response.data.data;
  },

  // Query archived data
  queryArchived: async (params: {
    collectionName: string;
    query?: any;
    limit?: number;
    skip?: number;
    sort?: any;
    select?: string;
  }) => {
    const response = await apiClient.post('/archival/query', params);
    return response.data.data;
  },

  // Restore archived data (emergency rollback)
  restoreArchived: async (params: {
    collectionName: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.post('/archival/restore', params);
    return response.data;
  },

  // Get archival execution history
  getHistory: async (params?: {
    limit?: number;
    skip?: number;
  }) => {
    const response = await apiClient.get('/archival/history', { params });
    return response.data.data;
  },

  // Export unified data (active + archived) to Excel
  exportUnified: async (params: {
    collectionName: string;
    startDate?: string;
    endDate?: string;
    format?: 'excel' | 'csv';
  }) => {
    const response = await apiClient.post('/archival/export', params, {
      responseType: 'blob'
    });
    
    // Create download link
    const blob = new Blob([response.data], { 
      type: params.format === 'csv' 
        ? 'text/csv' 
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const extension = params.format === 'csv' ? 'csv' : 'xlsx';
    link.download = `${params.collectionName}_unified_export_${new Date().toISOString().split('T')[0]}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { success: true, filename: link.download };
  },
};

// ── Tanga LPO API ─────────────────────────────────────────────────────────────

export const tangaLPOAPI = {
  getAll: async (params?: Record<string, unknown>) => {
    const response = await apiClient.get('/tanga-lpo', { params });
    return response.data.data;
  },
  getById: async (id: string) => {
    const response = await apiClient.get(`/tanga-lpo/${id}`);
    return response.data.data;
  },
  getByLPONo: async (lpoNo: string) => {
    const response = await apiClient.get(`/tanga-lpo/lpo/${encodeURIComponent(lpoNo)}`);
    return response.data.data;
  },
  getWorkbookYear: async (year: number) => {
    const response = await apiClient.get(`/tanga-lpo/workbooks/${year}`);
    return response.data.data;
  },
  getYears: async (): Promise<number[]> => {
    const response = await apiClient.get('/tanga-lpo/years');
    return response.data.data || [];
  },
  getFilterOptions: async (params?: Record<string, unknown>): Promise<{ months: number[]; entities: string[] }> => {
    const response = await apiClient.get('/tanga-lpo/filter-options', { params });
    return response.data.data || { months: [], entities: [] };
  },
  getNextNumber: async (): Promise<string> => {
    const response = await apiClient.get('/tanga-lpo/next-number');
    return response.data.data?.nextLpoNo || '';
  },
  create: async (data: Record<string, unknown>) => {
    const response = await apiClient.post('/tanga-lpo', data);
    return response.data;
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const response = await apiClient.put(`/tanga-lpo/${id}`, data);
    return response.data.data;
  },
  cancelEntry: async (data: { lpoId: string; entryId: string; cancellationReason?: string }) => {
    const response = await apiClient.post('/tanga-lpo/cancel-entry', data);
    return response.data.data;
  },
  amendEntry: async (data: { lpoId: string; entryId: string; newLiters: number; amendReason?: string }) => {
    const response = await apiClient.post('/tanga-lpo/amend-entry', data);
    return response.data.data;
  },
  cancelAll: async (id: string, cancellationReason?: string) => {
    const response = await apiClient.post(`/tanga-lpo/${id}/cancel-all`, { cancellationReason });
    return response.data.data;
  },
  acquireLock: async (id: string) => {
    const response = await apiClient.post(`/tanga-lpo/${id}/lock`);
    return response.data.data;
  },
  releaseLock: async (id: string) => {
    const response = await apiClient.delete(`/tanga-lpo/${id}/lock`);
    return response.data.data;
  },
  manualLink: async (data: { lpoId: string; entryId: string; doNo: string; dispenseLiters?: number }) => {
    const response = await apiClient.post('/tanga-lpo/manual-link', data);
    return response.data.data;
  },
  previewManualLink: async (data: { lpoId: string; entryId: string; doNo: string }) => {
    const response = await apiClient.post('/tanga-lpo/preview-manual-link', data);
    return response.data.data;
  },
  bulkLink: async (lpoId: string, data: { entryIds: string[]; topUpEntryIds?: string[]; dispenseOverrides?: Record<string, number> }) => {
    const response = await apiClient.post(`/tanga-lpo/${lpoId}/bulk-link`, data);
    return response.data;
  },
  previewBulkLink: async (lpoId: string, data: { entryIds: string[] }) => {
    const response = await apiClient.post(`/tanga-lpo/${lpoId}/preview-bulk-link`, data);
    return response.data;
  },
  downloadPDF: async (id: string): Promise<void> => {
    const response = await apiClient.get(`/tanga-lpo/${id}/pdf`, { responseType: 'blob' });
    const contentDisposition = (response.headers['content-disposition'] as string) || '';
    const match = contentDisposition.match(/filename="(.+?)"/);
    const filename = match ? match[1] : `LPO-${id}.pdf`;
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  downloadMonthPDF: async (year: number, month: number): Promise<void> => {
    const response = await apiClient.get(`/tanga-lpo/workbooks/${year}/${month}/pdf`, { responseType: 'blob' });
    const contentDisposition = (response.headers['content-disposition'] as string) || '';
    const match = contentDisposition.match(/filename="(.+?)"/);
    const filename = match ? match[1] : `TANGA-LPOs-${year}-${month}.pdf`;
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

// ── Dar LPO API ───────────────────────────────────────────────────────────────

export const darLPOAPI = {
  getAll: async (params?: Record<string, unknown>) => {
    const response = await apiClient.get('/dar-lpo', { params });
    return response.data.data;
  },
  getById: async (id: string) => {
    const response = await apiClient.get(`/dar-lpo/${id}`);
    return response.data.data;
  },
  getByLPONo: async (lpoNo: string) => {
    const response = await apiClient.get(`/dar-lpo/lpo/${encodeURIComponent(lpoNo)}`);
    return response.data.data;
  },
  getWorkbookYear: async (year: number) => {
    const response = await apiClient.get(`/dar-lpo/workbooks/${year}`);
    return response.data.data;
  },
  getYears: async (): Promise<number[]> => {
    const response = await apiClient.get('/dar-lpo/years');
    return response.data.data || [];
  },
  getFilterOptions: async (params?: Record<string, unknown>): Promise<{ months: number[]; entities: string[] }> => {
    const response = await apiClient.get('/dar-lpo/filter-options', { params });
    return response.data.data || { months: [], entities: [] };
  },
  getNextNumber: async (): Promise<string> => {
    const response = await apiClient.get('/dar-lpo/next-number');
    return response.data.data?.nextLpoNo || '';
  },
  create: async (data: Record<string, unknown>) => {
    const response = await apiClient.post('/dar-lpo', data);
    return response.data;
  },
  update: async (id: string, data: Record<string, unknown>) => {
    const response = await apiClient.put(`/dar-lpo/${id}`, data);
    return response.data.data;
  },
  cancelEntry: async (data: { lpoId: string; entryId: string; cancellationReason?: string }) => {
    const response = await apiClient.post('/dar-lpo/cancel-entry', data);
    return response.data.data;
  },
  amendEntry: async (data: { lpoId: string; entryId: string; newLiters: number; amendReason?: string }) => {
    const response = await apiClient.post('/dar-lpo/amend-entry', data);
    return response.data.data;
  },
  cancelAll: async (id: string, cancellationReason?: string) => {
    const response = await apiClient.post(`/dar-lpo/${id}/cancel-all`, { cancellationReason });
    return response.data.data;
  },
  acquireLock: async (id: string) => {
    const response = await apiClient.post(`/dar-lpo/${id}/lock`);
    return response.data.data;
  },
  releaseLock: async (id: string) => {
    const response = await apiClient.delete(`/dar-lpo/${id}/lock`);
    return response.data.data;
  },
  manualLink: async (data: { lpoId: string; entryId: string; doNo: string; dispenseLiters?: number }) => {
    const response = await apiClient.post('/dar-lpo/manual-link', data);
    return response.data.data;
  },
  previewManualLink: async (data: { lpoId: string; entryId: string; doNo: string }) => {
    const response = await apiClient.post('/dar-lpo/preview-manual-link', data);
    return response.data.data;
  },
  bulkLink: async (lpoId: string, data: { entryIds: string[]; topUpEntryIds?: string[]; dispenseOverrides?: Record<string, number> }) => {
    const response = await apiClient.post(`/dar-lpo/${lpoId}/bulk-link`, data);
    return response.data;
  },
  previewBulkLink: async (lpoId: string, data: { entryIds: string[] }) => {
    const response = await apiClient.post(`/dar-lpo/${lpoId}/preview-bulk-link`, data);
    return response.data;
  },
  downloadPDF: async (id: string): Promise<void> => {
    const response = await apiClient.get(`/dar-lpo/${id}/pdf`, { responseType: 'blob' });
    const contentDisposition = (response.headers['content-disposition'] as string) || '';
    const match = contentDisposition.match(/filename="(.+?)"/);
    const filename = match ? match[1] : `LPO-${id}.pdf`;
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
  downloadMonthPDF: async (year: number, month: number): Promise<void> => {
    const response = await apiClient.get(`/dar-lpo/workbooks/${year}/${month}/pdf`, { responseType: 'blob' });
    const contentDisposition = (response.headers['content-disposition'] as string) || '';
    const match = contentDisposition.match(/filename="(.+?)"/);
    const filename = match ? match[1] : `DAR-LPOs-${year}-${month}.pdf`;
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};

export default apiClient;
