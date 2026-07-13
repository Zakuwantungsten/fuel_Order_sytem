/**
 * React Query hooks for Delivery Orders
 * Replaces manual useEffect + useState with cached, server-side paginated queries.
 * Tab navigation is now instant (cache hit), and mutations sync via WebSocket.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deliveryOrdersAPI, doWorkbookAPI, sdoWorkbookAPI } from '../services/api';
import type { DOSummaryAggregate } from '../services/api';
import type { DeliveryOrder } from '../types';
import { cleanDeliveryOrders } from '../utils/dataCleanup';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const deliveryOrderKeys = {
  all: ['deliveryOrders'] as const,
  lists: () => [...deliveryOrderKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...deliveryOrderKeys.lists(), filters] as const,
  detail: (id: string | number) => [...deliveryOrderKeys.all, 'detail', id] as const,
  workbooks: (doType: string) => [...deliveryOrderKeys.all, 'workbooks', doType] as const,
  availableYears: (doType: string) => [...deliveryOrderKeys.all, 'years', doType] as const,
  availablePeriods: (filters: Record<string, unknown>) => [...deliveryOrderKeys.all, 'periods', filters] as const,
  summaryAll: (filters: Record<string, unknown>) => [...deliveryOrderKeys.all, 'summaryAll', filters] as const,
  summaryAggregate: (filters: Record<string, unknown>) => [...deliveryOrderKeys.all, 'summaryAggregate', filters] as const,
};

// ---------------------------------------------------------------------------
// Paginated delivery orders list (server-side filtered)
// ---------------------------------------------------------------------------
export interface DeliveryOrderFilters {
  page: number;
  limit: number;
  search?: string;
  importOrExport?: string;   // 'ALL' | 'IMPORT' | 'EXPORT' | 'PENDING' | 'PENDING_GOING' | 'PENDING_RETURN'
  doType?: 'DO' | 'SDO';     // undefined = all
  status?: 'all' | 'active' | 'cancelled';
  dateFrom?: string;          // ISO date
  dateTo?: string;            // ISO date
  sort?: string;
  order?: 'asc' | 'desc';
}

/** Convert selectedPeriods [{year,month}] to dateFrom/dateTo range */
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

export function useDeliveryOrdersList(filters: DeliveryOrderFilters, enabled = true) {
  const queryParams: Record<string, unknown> = {
    page: filters.page,
    limit: filters.limit,
    sort: filters.sort || 'date',
    order: filters.order || 'desc',
  };
  if (filters.search) queryParams.search = filters.search;
  if (filters.importOrExport && filters.importOrExport !== 'ALL') queryParams.importOrExport = filters.importOrExport;
  if (filters.doType) queryParams.doType = filters.doType;
  if (filters.status && filters.status !== 'all') {
    queryParams.status = filters.status;
  }
  if (filters.dateFrom) queryParams.dateFrom = filters.dateFrom;
  if (filters.dateTo) queryParams.dateTo = filters.dateTo;

  return useQuery({
    queryKey: deliveryOrderKeys.list(queryParams),
    queryFn: async () => {
      const response = await deliveryOrdersAPI.getAll(queryParams);
      const cleaned = cleanDeliveryOrders(response.data);
      return {
        orders: cleaned,
        pagination: response.pagination ?? {
          page: 1,
          limit: filters.limit,
          total: cleaned.length,
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
// Bounded set of delivery-order rows (used by the Summary tab's Detailed view)
// ---------------------------------------------------------------------------
// Fetches every row matching the filter/date-range (looping through pages so
// nothing is silently truncated). Scoped to a date range so it only ever pulls
// the month(s) the user is actually looking at.
export interface AllDeliveryOrderFilters {
  search?: string;
  importOrExport?: string;   // 'ALL' | 'IMPORT' | 'EXPORT' | 'PENDING' | 'PENDING_GOING' | 'PENDING_RETURN'
  doType?: 'DO' | 'SDO';     // undefined = all
  status?: 'all' | 'active' | 'cancelled';
  dateFrom?: string;
  dateTo?: string;
}

/** Fetch DOs for a date range via one server summary-entries call (no client paging). */
export async function fetchAllDeliveryOrders(filters: AllDeliveryOrderFilters): Promise<DeliveryOrder[]> {
  if (filters.dateFrom && filters.dateTo) {
    const rows = await deliveryOrdersAPI.getSummaryEntries({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      doType: filters.doType,
      importOrExport: filters.importOrExport,
      status: filters.status,
    });
    return cleanDeliveryOrders(rows);
  }

  const baseParams: Record<string, unknown> = { sort: 'date', order: 'desc', limit: 5000, page: 1 };
  if (filters.search) baseParams.search = filters.search;
  if (filters.importOrExport && filters.importOrExport !== 'ALL') baseParams.importOrExport = filters.importOrExport;
  if (filters.doType) baseParams.doType = filters.doType;
  if (filters.status && filters.status !== 'all') baseParams.status = filters.status;
  const response = await deliveryOrdersAPI.getAll(baseParams);
  return cleanDeliveryOrders(response.data);
}

export function useAllDeliveryOrders(filters: AllDeliveryOrderFilters, enabled = true) {
  const keyParams: Record<string, unknown> = {};
  if (filters.search) keyParams.search = filters.search;
  if (filters.importOrExport && filters.importOrExport !== 'ALL') keyParams.importOrExport = filters.importOrExport;
  if (filters.doType) keyParams.doType = filters.doType;
  if (filters.status && filters.status !== 'all') keyParams.status = filters.status;
  if (filters.dateFrom) keyParams.dateFrom = filters.dateFrom;
  if (filters.dateTo) keyParams.dateTo = filters.dateTo;

  return useQuery({
    queryKey: deliveryOrderKeys.summaryAll(keyParams),
    queryFn: () => fetchAllDeliveryOrders(filters),
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------------------
// Server-side aggregated summary metrics (Summary tab metric cards)
// ---------------------------------------------------------------------------
// Returns just the computed totals/breakdowns for the given filter + date
// range, so the metric cards never need to download raw rows.
export interface SummaryAggregateFilters {
  importOrExport?: string;
  doType?: 'DO' | 'SDO';
  dateFrom?: string;
  dateTo?: string;
}

export function useDOSummaryAggregate(filters: SummaryAggregateFilters, enabled = true) {
  const params: Record<string, string> = {};
  if (filters.importOrExport && filters.importOrExport !== 'ALL') params.importOrExport = filters.importOrExport;
  if (filters.doType) params.doType = filters.doType;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;

  return useQuery<DOSummaryAggregate>({
    queryKey: deliveryOrderKeys.summaryAggregate(params),
    queryFn: () => deliveryOrdersAPI.getSummaryAggregate(params),
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

// ---------------------------------------------------------------------------
// Workbooks
// ---------------------------------------------------------------------------
export function useDOWorkbooks(filterDoType: 'ALL' | 'DO' | 'SDO') {
  return useQuery({
    queryKey: deliveryOrderKeys.workbooks(filterDoType),
    queryFn: async () => {
      if (filterDoType === 'ALL') {
        const [doData, sdoData] = await Promise.all([
          doWorkbookAPI.getAll().catch(() => []),
          sdoWorkbookAPI.getAll().catch(() => []),
        ]);
        return [
          ...(Array.isArray(doData) ? doData.map(w => ({ ...w, type: 'DO' as const })) : []),
          ...(Array.isArray(sdoData) ? sdoData.map(w => ({ ...w, type: 'SDO' as const })) : []),
        ].sort((a, b) => (b.year || 0) - (a.year || 0));
      }
      const api = filterDoType === 'SDO' ? sdoWorkbookAPI : doWorkbookAPI;
      const data = await api.getAll();
      return (Array.isArray(data) ? data : []).map(w => ({ ...w, type: filterDoType as 'DO' | 'SDO' }));
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDOAvailableYears(filterDoType: 'ALL' | 'DO' | 'SDO') {
  return useQuery({
    queryKey: deliveryOrderKeys.availableYears(filterDoType),
    queryFn: async () => {
      if (filterDoType === 'ALL') {
        const [doYears, sdoYears] = await Promise.all([
          doWorkbookAPI.getAvailableYears().catch(() => []),
          sdoWorkbookAPI.getAvailableYears().catch(() => []),
        ]);
        const all = [...new Set([...doYears, ...sdoYears])].sort((a, b) => b - a);
        return all.length ? all : [new Date().getFullYear()];
      }
      const api = filterDoType === 'SDO' ? sdoWorkbookAPI : doWorkbookAPI;
      const years = await api.getAvailableYears();
      return years.length ? years.sort((a: number, b: number) => b - a) : [new Date().getFullYear()];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Available periods (for the month-picker dropdown)
// ---------------------------------------------------------------------------
export function useDOAvailablePeriods(
  importOrExport?: string,
  doType?: 'DO' | 'SDO',
  status?: 'all' | 'active' | 'cancelled'
) {
  const params: Record<string, unknown> = {};
  if (importOrExport && importOrExport !== 'ALL') params.importOrExport = importOrExport;
  if (doType) params.doType = doType;
  if (status && status !== 'all') params.status = status;

  return useQuery({
    queryKey: deliveryOrderKeys.availablePeriods(params),
    queryFn: () => deliveryOrdersAPI.getAvailablePeriods(params as any),
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function useCreateDeliveryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<DeliveryOrder>) => deliveryOrdersAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks('ALL') });
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks('DO') });
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks('SDO') });
    },
  });
}

export function useUpdateDeliveryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string | number; data: Partial<DeliveryOrder> }) =>
      deliveryOrdersAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
    },
  });
}

export function useCancelDeliveryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deliveryOrdersAPI.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
    },
  });
}

// NOTE: No delete hook — delivery orders are cancelled, never deleted (business rule).
