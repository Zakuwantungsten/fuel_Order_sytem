/**
 * React Query hooks for Fuel Records
 * Replaces manual useEffect + useState with cached, server-side paginated queries.
 * Tab navigation is now instant (cache hit), and mutations sync via WebSocket.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fuelRecordsAPI, lposAPI } from '../services/api';
import type { FuelRecord } from '../types';

// ---------------------------------------------------------------------------
// Query keys — structured so we can invalidate at the right granularity
// ---------------------------------------------------------------------------
export const fuelRecordKeys = {
  all: ['fuelRecords'] as const,
  lists: () => [...fuelRecordKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...fuelRecordKeys.lists(), filters] as const,
  detail: (id: string | number) => [...fuelRecordKeys.all, 'detail', id] as const,
  routes: (month: string, routeType: string) => [...fuelRecordKeys.all, 'routes', month, routeType] as const,
  availablePeriods: () => [...fuelRecordKeys.all, 'availablePeriods'] as const,
  lpoDropdown: () => ['lpoDropdown'] as const,
};

// ---------------------------------------------------------------------------
// Paginated fuel records list
// ---------------------------------------------------------------------------
export interface FuelRecordFilters {
  page: number;
  limit: number;
  search?: string;
  month?: string;        // "Month YYYY" format
  routeFrom?: string;
  routeTo?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export function useFuelRecordsList(filters: FuelRecordFilters, enabled = true) {
  const queryParams: Record<string, unknown> = {
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort || 'date',
    order: filters.order || 'desc',
  };
  if (filters.search) queryParams.search = filters.search;
  if (filters.month) queryParams.month = filters.month;
  if (filters.routeFrom) queryParams.from = filters.routeFrom;
  if (filters.routeTo) queryParams.to = filters.routeTo;

  return useQuery({
    queryKey: fuelRecordKeys.list(queryParams),
    queryFn: async () => {
      const response = await fuelRecordsAPI.getAll(queryParams);
      return {
        records: response.data,
        pagination: response.pagination ?? { page: 1, limit: filters.limit, total: response.data.length, totalPages: 1 },
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev, // keep previous data while fetching next page
  });
}

// ---------------------------------------------------------------------------
// Available routes for a given month (for route filter dropdown)
// ---------------------------------------------------------------------------
export function useFuelRecordRoutes(month: string, routeTypeFilter: 'IMPORT' | 'EXPORT', enabled = true) {
  return useQuery({
    queryKey: fuelRecordKeys.routes(month, routeTypeFilter),
    queryFn: async () => {
      const { routes } = await fuelRecordsAPI.getAvailableRoutes({ month, routeType: routeTypeFilter });
      return routes;
    },
    enabled: enabled && !!month,
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Available months + years (for month picker)
// ---------------------------------------------------------------------------
export function useFuelRecordPeriods() {
  return useQuery({
    queryKey: fuelRecordKeys.availablePeriods(),
    queryFn: async () => {
      const { periods } = await fuelRecordsAPI.getAvailablePeriods();

      const months = new Set<string>();
      const years = new Set<number>();
      periods.forEach((p: { year: number; month: number }) => {
        months.add(`${p.year}-${String(p.month).padStart(2, '0')}`);
        years.add(p.year);
      });

      return {
        months: Array.from(months).sort().reverse(),
        years: Array.from(years).sort((a, b) => b - a),
      };
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// LPO dropdown data (used to link fuel records to LPOs)
// ---------------------------------------------------------------------------
export function useLPODropdown() {
  return useQuery({
    queryKey: fuelRecordKeys.lpoDropdown(),
    queryFn: async () => {
      // Fetch current month's LPOs for the dropdown (lightweight)
      const now = new Date();
      const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dateTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
      const response = await lposAPI.getAll({ limit: 500, dateFrom, dateTo });
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useCreateFuelRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<FuelRecord>) => fuelRecordsAPI.create(data),
    onSuccess: () => {
      // WebSocket will also trigger invalidation, but this ensures immediate cache update
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.availablePeriods() });
    },
  });
}

export function useUpdateFuelRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: Partial<FuelRecord> }) =>
      fuelRecordsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
    },
  });
}

export function useDeleteFuelRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => fuelRecordsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
    },
  });
}
