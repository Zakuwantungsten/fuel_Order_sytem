import apiClient from './api';

const API_BASE = '/system-admin/feature-flags';

export interface FeatureFlag {
  _id: string;
  key: string;
  name: string;
  description: string;
  isEnabled: boolean;
  enabledForRoles: string[];
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
}

const featureFlagService = {
  list: async (): Promise<FeatureFlag[]> => {
    const res = await apiClient.get(`${API_BASE}`);
    return res.data.data;
  },

  toggle: async (key: string): Promise<FeatureFlag> => {
    const res = await apiClient.patch(`${API_BASE}/${key}/toggle`);
    return res.data.data;
  },

  update: async (key: string, payload: Partial<Pick<FeatureFlag, 'name' | 'description' | 'isEnabled' | 'enabledForRoles'>>): Promise<FeatureFlag> => {
    const res = await apiClient.put(`${API_BASE}/${key}`, payload);
    return res.data.data;
  },

  create: async (payload: { key: string; name: string; description?: string; isEnabled?: boolean; enabledForRoles?: string[] }): Promise<FeatureFlag> => {
    const res = await apiClient.post(`${API_BASE}`, payload);
    return res.data.data;
  },

  delete: async (key: string): Promise<void> => {
    await apiClient.delete(`${API_BASE}/${key}`);
  },
};

export default featureFlagService;
