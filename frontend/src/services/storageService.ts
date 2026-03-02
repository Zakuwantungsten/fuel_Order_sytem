import apiClient from './api';

const API_BASE = '/system-admin/storage';

export interface StorageFileEntry {
  key: string;
  size: number;
  lastModified: string;
}

export interface StorageInfo {
  enabled: boolean;
  bucketName?: string;
  totalFiles: number;
  totalBytes: number;
  categories?: Record<string, { count: number; bytes: number }>;
  recentFiles?: StorageFileEntry[];
}

export const getStorageInfo = async (): Promise<StorageInfo> => {
  const res = await apiClient.get(`${API_BASE}/info`);
  return res.data.data;
};

export const purgeTempFiles = async (): Promise<{ deleted: number; failed: number }> => {
  const res = await apiClient.delete(`${API_BASE}/purge-temp`);
  return res.data.data;
};
