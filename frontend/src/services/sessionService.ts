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
  const name = 'XSRF-TOKEN=';
  const decoded = decodeURIComponent(document.cookie);
  for (const part of decoded.split(';')) {
    const c = part.trim();
    if (c.startsWith(name)) {
      config.headers['X-XSRF-TOKEN'] = c.substring(name.length);
      break;
    }
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
