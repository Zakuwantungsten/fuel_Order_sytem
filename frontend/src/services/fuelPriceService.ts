import apiClient from './api';

const API_BASE = '/system-admin/fuel-prices';
/* NOTE: apiClient baseURL is /api/v1, so paths below are relative to that */

export interface FuelStation {
  id: string;
  name: string;
  location: string;
  pricePerLiter: number;
  currency: 'USD' | 'TZS';
  isActive: boolean;
}

export interface FuelPriceHistoryEntry {
  _id: string;
  stationId: string;
  stationName: string;
  oldPrice: number;
  newPrice: number;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

export interface FuelPriceScheduleEntry {
  _id: string;
  stationId: string;
  stationName: string;
  currentPrice: number;
  newPrice: number;
  effectiveAt: string;
  createdBy: string;
  isApplied: boolean;
  appliedAt?: string;
  isCancelled: boolean;
  cancelledAt?: string;
  reason?: string;
}

export interface PriceHistoryParams {
  stationId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

const fuelPriceService = {
  getCurrentPrices: async (): Promise<FuelStation[]> => {
    const res = await apiClient.get(`${API_BASE}/current`);
    return res.data.data;
  },

  getPriceHistory: async (params: PriceHistoryParams = {}): Promise<{
    history: FuelPriceHistoryEntry[];
    total: number;
    pages: number;
  }> => {
    const res = await apiClient.get(`${API_BASE}/history`, { params });
    return {
      history: Array.isArray(res.data.data) ? res.data.data : [],
      total: res.data.pagination?.total ?? 0,
      pages: res.data.pagination?.pages ?? 1,
    };
  },

  updatePrice: async (payload: { stationId: string; newPrice: number; reason?: string }): Promise<void> => {
    await apiClient.post(`${API_BASE}/update`, payload);
  },

  getSchedules: async (): Promise<FuelPriceScheduleEntry[]> => {
    const res = await apiClient.get(`${API_BASE}/schedules`);
    return res.data.data;
  },

  createSchedule: async (payload: {
    stationId: string;
    newPrice: number;
    effectiveAt: string;
    reason?: string;
  }): Promise<void> => {
    await apiClient.post(`${API_BASE}/schedules`, payload);
  },

  cancelSchedule: async (id: string): Promise<void> => {
    await apiClient.delete(`${API_BASE}/schedules/${id}`);
  },

  applyDueSchedules: async (): Promise<{ applied: number }> => {
    const res = await apiClient.post(`${API_BASE}/schedules/apply-due`);
    return res.data.data;
  },
};

export default fuelPriceService;
