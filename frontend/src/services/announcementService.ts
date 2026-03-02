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
  // CSRF
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

export interface SystemAnnouncement {
  _id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  targetRoles: string[];
  showFrom: string;
  showUntil: string | null;
  isDismissible: boolean;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAnnouncementPayload {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  targetRoles: string[];
  showFrom: string;
  showUntil: string | null;
  isDismissible: boolean;
  isActive: boolean;
}

const announcementService = {
  /** Get active announcements visible to the current user */
  getActive: async (): Promise<SystemAnnouncement[]> => {
    const res = await apiClient.get('/announcements/active');
    return res.data.data;
  },

  /** Get ALL announcements — super admin only */
  getAll: async (): Promise<SystemAnnouncement[]> => {
    const res = await apiClient.get('/announcements');
    return res.data.data;
  },

  create: async (payload: CreateAnnouncementPayload): Promise<SystemAnnouncement> => {
    const res = await apiClient.post('/announcements', payload);
    return res.data.data;
  },

  update: async (id: string, payload: Partial<CreateAnnouncementPayload>): Promise<SystemAnnouncement> => {
    const res = await apiClient.put(`/announcements/${id}`, payload);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/announcements/${id}`);
  },

  toggle: async (id: string): Promise<SystemAnnouncement> => {
    const res = await apiClient.patch(`/announcements/${id}/toggle`);
    return res.data.data;
  },
};

export default announcementService;
