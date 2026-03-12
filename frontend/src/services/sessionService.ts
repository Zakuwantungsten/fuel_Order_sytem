import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('fuel_order_token');
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // ✅ SECURITY: Read CSRF token from sessionStorage (set via GET /csrf-token
  // response body). The XSRF-TOKEN cookie is now httpOnly, so document.cookie
  // cannot access it — sessionStorage is the correct source.
  const csrfToken = sessionStorage.getItem('xsrf_token');
  if (csrfToken && csrfToken !== '[REDACTED]') {
    config.headers['X-XSRF-TOKEN'] = csrfToken;
  }
  return config;
});

export interface ActiveSession {
  userId: string;
  username: string;
  role: string;
  ip: string;
  firstSeen: string;
  lastSeen: string;
  requestCount: number;
}

const BASE = '/system-admin/sessions';

export const sessionService = {
  getActive: async (): Promise<ActiveSession[]> => {
    const res = await apiClient.get(BASE);
    return res.data.data;
  },

  terminate: async (userId: string): Promise<{ message: string }> => {
    const res = await apiClient.delete(`${BASE}/${userId}`);
    return res.data;
  },

  terminateAll: async (): Promise<{ terminated: number; message: string }> => {
    const res = await apiClient.delete(BASE);
    return res.data;
  },
};
