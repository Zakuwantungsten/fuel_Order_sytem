/**
 * React Query hooks for LPO Entries
 * Replaces manual useEffect + useState with cached, server-side paginated queries.
 * Tab navigation is now instant (cache hit), and mutations sync via WebSocket.
 */

import { useQuery } from '@tanstack/react-query';
import { lposAPI, lpoWorkbookAPI } from '../services/api';
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
  referEntries: () => [...lpoKeys.all, 'referEntries'] as const,
  driverAccountEntries: () => [...lpoKeys.all, 'driverAccountEntries'] as const,
};

// ---------------------------------------------------------------------------
// Paginated LPO list (server-side filtered + merged with driver accounts)
// ---------------------------------------------------------------------------
export interface LPOFilters {
  page: number;
  limit: number;
  search?: string;
  station?: string;
  stations?: string[];
  periods?: Array<{ year: number; month: number }>;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  status?: string; // 'all' | 'active' | 'cancelled'
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

export function buildLPOQueryParams(filters: LPOFilters): Record<string, unknown> {
  const stations = [...new Set(
    (filters.stations ?? []).map((station) => station.trim().toUpperCase()).filter(Boolean)
  )].sort();
  const periods = [...new Set(
    (filters.periods ?? []).map(
      ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`
    )
  )].sort();
  const queryParams: Record<string, unknown> = {
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort || 'lpo_desc',
    order: filters.order || 'desc',
  };
  if (filters.search) queryParams.search = filters.search;
  if (filters.station) queryParams.station = filters.station;
  if (stations.length) queryParams.stations = stations.join(',');
  if (periods.length) queryParams.periods = periods.join(',');
  if (filters.dateFrom) queryParams.dateFrom = filters.dateFrom;
  if (filters.dateTo) queryParams.dateTo = filters.dateTo;
  if (filters.status && filters.status !== 'all') queryParams.status = filters.status;
  return queryParams;
}

export function useLPOList(filters: LPOFilters, enabled = true) {
  const queryParams = buildLPOQueryParams(filters);

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
// Driver account entries (flag-only — same pattern as reefer / isRefer)
// ---------------------------------------------------------------------------
export function useDriverAccountEntries() {
  return useQuery({
    queryKey: lpoKeys.driverAccountEntries(),
    queryFn: async () => {
      const response = await lposAPI.getAll({ isDriverAccount: 'true', limit: 5000, sort: 'lpo_desc', order: 'desc' });
      const entries = Array.isArray(response.data) ? response.data : [];
      if (response.pagination && response.pagination.total > entries.length) {
        console.warn(`useDriverAccountEntries: ${response.pagination.total} DA entries exist but only ${entries.length} loaded — add pagination UI to view the rest.`);
      }
      return entries.map((entry: any, idx: number) => ({
        id: `da-${entry.id || entry._id || idx}`,
        sn: idx + 1,
        date: entry.date,
        lpoNo: entry.lpoNo,
        dieselAt: entry.dieselAt,
        doSdo: 'DA(NIL)',
        truckNo: entry.truckNo,
        ltrs: entry.ltrs,
        pricePerLtr: entry.pricePerLtr,
        destinations: entry.destinations || 'NIL',
        currency: entry.currency,
        createdAt: entry.createdAt,
        isCancelled: entry.isCancelled || false,
        isDriverAccount: true,
      } as LPOEntry));
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Reefer entries (partner/third-party trucks)
// ---------------------------------------------------------------------------
export function useReferEntries() {
  return useQuery({
    queryKey: lpoKeys.referEntries(),
    queryFn: async () => {
      // 5000 is the backend's hard cap (getPaginationParams). Requesting more is pointless;
      // if refer entries ever exceed this, interactive pagination is needed here.
      const response = await lposAPI.getAll({ isRefer: 'true', limit: 5000, sort: 'lpo_desc', order: 'desc' });
      const entries = Array.isArray(response.data) ? response.data : [];
      if (response.pagination && response.pagination.total > entries.length) {
        console.warn(`useReferEntries: ${response.pagination.total} refer entries exist but only ${entries.length} loaded — add pagination UI to view the rest.`);
      }
      return entries.map((entry: any, idx: number) => ({
        id: `ref-${entry.id || entry._id || idx}`,
        sn: idx + 1,
        date: entry.date,
        lpoNo: entry.lpoNo,
        dieselAt: entry.dieselAt,
        doSdo: 'REF',
        truckNo: entry.truckNo,
        ltrs: entry.ltrs,
        pricePerLtr: entry.pricePerLtr,
        destinations: entry.destinations || 'REEFER',
        currency: entry.currency,
        createdAt: entry.createdAt,
        isCancelled: entry.isCancelled || false,
        isRefer: true,
      } as LPOEntry));
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
// Available filters for the filter dropdowns.
// Periods are global; selected periods only scope the station list.
// ---------------------------------------------------------------------------
export function useLPOAvailableFilters(filters?: {
  periods?: Array<{ year: number; month: number }>;
  dateFrom?: string;
  dateTo?: string;
}) {
  const periods = [...new Set(
    (filters?.periods ?? []).map(
      ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`
    )
  )].sort();
  const params = {
    ...(periods.length ? { periods: periods.join(',') } : {}),
    ...(filters?.dateFrom ? { dateFrom: filters.dateFrom } : {}),
    ...(filters?.dateTo ? { dateTo: filters.dateTo } : {}),
  };
  return useQuery({
    queryKey: [...lpoKeys.availableFilters(), periods, filters?.dateFrom ?? '', filters?.dateTo ?? ''] as const,
    queryFn: () => lposAPI.getAvailableFilters(Object.keys(params).length ? params : undefined),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// LPO Summary tab — server aggregate + server entries (no client 5000 loops)
// ---------------------------------------------------------------------------
export function useLPOSummaryAggregate(
  filters: { dateFrom?: string; dateTo?: string; stations?: string[] },
  enabled = true
) {
  return useQuery({
    queryKey: [...lpoKeys.all, 'summaryAggregate', filters] as const,
    queryFn: () =>
      lposAPI.getSummaryAggregate({
        dateFrom: filters.dateFrom!,
        dateTo: filters.dateTo!,
        stations: filters.stations,
      }),
    enabled: enabled && !!filters.dateFrom && !!filters.dateTo,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLPOSummaryEntries(
  filters: { dateFrom?: string; dateTo?: string; stations?: string[] },
  enabled = true
) {
  return useQuery({
    queryKey: [...lpoKeys.all, 'summaryEntries', filters] as const,
    queryFn: () =>
      lposAPI.getSummaryEntries({
        dateFrom: filters.dateFrom!,
        dateTo: filters.dateTo!,
        stations: filters.stations,
      }),
    enabled: enabled && !!filters.dateFrom && !!filters.dateTo,
    staleTime: 5 * 60 * 1000,
  });
}

