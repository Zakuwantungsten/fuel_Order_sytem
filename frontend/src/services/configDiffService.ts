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

export interface ConfigChangeEntry {
  _id: string;
  timestamp: string;
  username: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  previousValue?: any;
  newValue?: any;
  details?: string;
  severity: string;
  outcome: string;
  ipAddress?: string;
}

export interface ConfigChangePagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const BASE = '/system-admin/config-diff';

export const configDiffService = {
  getChanges: async (params: {
    page?: number;
    limit?: number;
    username?: string;
    resourceType?: string;
    from?: string;
    to?: string;
  }): Promise<{ data: ConfigChangeEntry[]; pagination: ConfigChangePagination }> => {
    const res = await apiClient.get(BASE, { params });
    return res.data;
  },

  getResourceTypes: async (): Promise<string[]> => {
    const res = await apiClient.get(`${BASE}/resource-types`);
    return res.data.data;
  },
};
