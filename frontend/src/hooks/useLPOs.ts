/**
 * React Query hooks for LPO Entries
 * Replaces manual useEffect + useState with cached, server-side paginated queries.
 * Tab navigation is now instant (cache hit), and mutations sync via WebSocket.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lposAPI, lpoWorkbookAPI, driverAccountAPI } from '../services/api';
import type { LPOEntry } from '../types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const lpoKeys = {
  all: ['lpos'] as const,
  lists: () => [...lpoKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...lpoKeys.lists(), filters] as const,
  detail: (id: string | number) => [...lpoKeys.all, 'detail', id] as const,
  workbooks: () => [...lpoKeys.all, 'workbooks'] as const,
  availableYears: () => [...lpoKeys.all, 'years'] as const,
  availableFilters: () => [...lpoKeys.all, 'filters'] as const,
};

// ---------------------------------------------------------------------------
// Paginated LPO list (server-side filtered + merged with driver accounts)
// ---------------------------------------------------------------------------
export interface LPOFilters {
  page: number;
  limit: number;
  search?: string;
  station?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Convert selectedPeriods to dateFrom/dateTo */
export function periodsToDateRange(periods: Array<{ year: number; month: number }>) {
  if (!periods.length) return {};
  let minDate = `${periods[0].year}-${String(periods[0].month).padStart(2, '0')}-01`;
  let maxDate = minDate;

  periods.forEach(p => {
    const start = `${p.year}-${String(p.month).padStart(2, '0')}-01`;
    const lastDay = new Date(p.year, p.month, 0).getDate();
    const end = `${p.year}-${String(p.month).padStart(2, '0')}-${lastDay}`;
    if (start < minDate) minDate = start;
    if (end > maxDate) maxDate = end;
  });
  return { dateFrom: minDate, dateTo: maxDate };
}

export function useLPOList(filters: LPOFilters, enabled = true) {
  const queryParams: Record<string, unknown> = {
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort || 'createdAt',
    order: filters.order || 'desc',
  };
  if (filters.search) queryParams.search = filters.search;
  if (filters.station) queryParams.station = filters.station;
  if (filters.dateFrom) queryParams.dateFrom = filters.dateFrom;
  if (filters.dateTo) queryParams.dateTo = filters.dateTo;

  return useQuery({
    queryKey: lpoKeys.list(queryParams),
    queryFn: async () => {
      const response = await lposAPI.getAll(queryParams);
      const lposData = Array.isArray(response.data) ? response.data : [];

      return {
        lpos: lposData,
        pagination: response.pagination ?? {
          page: 1,
          limit: filters.limit,
          total: lposData.length,
          totalPages: 1,
        },
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------------------
// Driver account entries (separate cache — few entries, rarely changes)
// ---------------------------------------------------------------------------
export function useDriverAccountEntries() {
  return useQuery({
    queryKey: [...lpoKeys.all, 'driverAccounts'] as const,
    queryFn: async () => {
      const entries = await driverAccountAPI.getAll().catch(() => [] as any[]);
      return (entries || []).map((entry: any, idx: number) => {
        const numMatch = String(entry.lpoNo || '').match(/(\d+)/);
        const numericSn = numMatch ? parseInt(numMatch[1], 10) : idx + 1;
        return {
          id: `da-${entry.id || entry._id}`,
          sn: numericSn,
          date: entry.date,
          lpoNo: entry.lpoNo,
          dieselAt: entry.station,
          doSdo: 'NIL',
          truckNo: entry.truckNo,
          ltrs: entry.liters,
          pricePerLtr: entry.rate,
          destinations: 'NIL',
          createdAt: entry.createdAt,
        } as LPOEntry;
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Workbooks & years
// ---------------------------------------------------------------------------
export function useLPOWorkbooks() {
  return useQuery({
    queryKey: lpoKeys.workbooks(),
    queryFn: async () => {
      const data = await lpoWorkbookAPI.getAll();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLPOAvailableYears() {
  return useQuery({
    queryKey: lpoKeys.availableYears(),
    queryFn: async () => {
      const years = await lpoWorkbookAPI.getAvailableYears();
      return years.length ? years : [new Date().getFullYear()];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Available filters (periods + stations) for the filter dropdowns
// ---------------------------------------------------------------------------
export function useLPOAvailableFilters() {
  return useQuery({
    queryKey: lpoKeys.availableFilters(),
    queryFn: () => lposAPI.getAvailableFilters(),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useCreateLPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LPOEntry>) => lposAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lpoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: lpoKeys.workbooks() });
    },
  });
}

export function useUpdateLPO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: Partial<LPOEntry> }) =>
      lposAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lpoKeys.lists() });
    },
  });
}
