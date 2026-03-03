import apiClient from './api';

export interface IPRule {
  _id: string;
  ip: string;
  type: 'allow' | 'block';
  description: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPTestResult {
  ip: string;
  verdict: 'allow' | 'block' | 'none';
  matchedRule?: string;
}

export interface CreateIPRulePayload {
  ip: string;
  type: 'allow' | 'block';
  description?: string;
  isActive?: boolean;
}

const BASE = '/system-admin/ip-rules';

export const ipRuleService = {
  getAll: async (): Promise<IPRule[]> => {
    const res = await apiClient.get(BASE);
    return res.data.data;
  },

  create: async (payload: CreateIPRulePayload): Promise<IPRule> => {
    const res = await apiClient.post(BASE, payload);
    return res.data.data;
  },

  update: async (id: string, payload: Partial<CreateIPRulePayload>): Promise<IPRule> => {
    const res = await apiClient.put(`${BASE}/${id}`, payload);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE}/${id}`);
  },

  toggle: async (id: string): Promise<IPRule> => {
    const res = await apiClient.patch(`${BASE}/${id}/toggle`);
    return res.data.data;
  },

  testIP: async (ip: string): Promise<IPTestResult> => {
    const res = await apiClient.post(`${BASE}/test`, { ip });
    return res.data.data;
  },

  getGatingConfig: async (): Promise<{ ipGatingEnabled: boolean }> => {
    const res = await apiClient.get('/system-admin/security-blocklist/config');
    return { ipGatingEnabled: res.data.data.ipGatingEnabled ?? false };
  },

  updateGating: async (ipGatingEnabled: boolean): Promise<void> => {
    await apiClient.put('/system-admin/security-blocklist/config', { ipGatingEnabled });
  },
};
