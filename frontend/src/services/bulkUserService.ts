import apiClient from './api';

const API_BASE = '/system-admin/bulk-users';

export interface BulkUser {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  role: string;
  isActive: boolean;
  isBanned: boolean;
  createdAt: string;
}

export type BulkAction = 'activate' | 'deactivate' | 'change_role';

export const listUsers = async (params?: {
  role?: string;
  status?: string;
  q?: string;
}): Promise<{ data: BulkUser[]; total: number }> => {
  const res = await apiClient.get(API_BASE, { params });
  return res.data;
};

export const bulkAction = async (payload: {
  userIds: string[];
  action: BulkAction;
  role?: string;
}): Promise<{ matched: number; modified: number }> => {
  const res = await apiClient.post(`${API_BASE}/bulk-action`, payload);
  return res.data.data;
};
