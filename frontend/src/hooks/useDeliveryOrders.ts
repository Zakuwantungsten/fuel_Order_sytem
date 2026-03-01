/**
 * React Query hooks for Delivery Orders
 * Replaces manual useEffect + useState with cached, server-side paginated queries.
 * Tab navigation is now instant (cache hit), and mutations sync via WebSocket.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deliveryOrdersAPI, doWorkbookAPI, sdoWorkbookAPI } from '../services/api';
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
};

// ---------------------------------------------------------------------------
// Paginated delivery orders list (server-side filtered)
// ---------------------------------------------------------------------------
export interface DeliveryOrderFilters {
  page: number;
  limit: number;
  search?: string;
  importOrExport?: string;   // 'ALL' | 'IMPORT' | 'EXPORT'
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

export function useDeleteDeliveryOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => deliveryOrdersAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
    },
  });
}
