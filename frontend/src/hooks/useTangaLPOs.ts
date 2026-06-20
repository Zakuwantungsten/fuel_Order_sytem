import { useQuery } from '@tanstack/react-query';
import { tangaLPOAPI } from '../services/api';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const tangaLPOKeys = {
  all: ['tangaLPOs'] as const,
  lists: () => [...tangaLPOKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...tangaLPOKeys.lists(), filters] as const,
  detail: (id: string) => [...tangaLPOKeys.all, 'detail', id] as const,
  byLPONo: (lpoNo: string) => [...tangaLPOKeys.all, 'lpoNo', lpoNo] as const,
  workbook: (year: number) => [...tangaLPOKeys.all, 'workbook', year] as const,
  years: () => [...tangaLPOKeys.all, 'years'] as const,
  nextNumber: () => [...tangaLPOKeys.all, 'nextNumber'] as const,
};

// ---------------------------------------------------------------------------
// Filters interface
// ---------------------------------------------------------------------------
export interface TangaLPOFilters {
  page?: number;
  limit?: number;
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  lpoNo?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  filter?: 'unlinked';
  month?: number;
  entity?: string;
  linked?: 'linked' | 'unlinked';
  status?: 'active' | 'cancelled';
}

export interface TangaFilterOptionParams {
  year?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  month?: number;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useTangaLPOList(filters: TangaLPOFilters = {}, enabled = true) {
  const params: Record<string, unknown> = {
    page:  filters.page  ?? 1,
    limit: filters.limit ?? 20,
    sort:  filters.sort  || 'date',
    order: filters.order || 'desc',
  };
  if (filters.year)     params.year     = filters.year;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo)   params.dateTo   = filters.dateTo;
  if (filters.search)   params.search   = filters.search;
  if (filters.lpoNo)    params.lpoNo    = filters.lpoNo;
  if (filters.filter)   params.filter   = filters.filter;
  if (filters.month)    params.month    = filters.month;
  if (filters.entity)   params.entity   = filters.entity;
  if (filters.linked)   params.linked   = filters.linked;
  if (filters.status)   params.status   = filters.status;

  return useQuery({
    queryKey: tangaLPOKeys.list(params),
    queryFn: async () => {
      const data = await tangaLPOAPI.getAll(params);
      return {
        lpos:       data?.data  ?? [],
        pagination: data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useTangaLPOById(id: string, enabled = true) {
  return useQuery({
    queryKey: tangaLPOKeys.detail(id),
    queryFn: () => tangaLPOAPI.getById(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTangaLPOByLPONo(lpoNo: string, enabled = true) {
  return useQuery({
    queryKey: tangaLPOKeys.byLPONo(lpoNo),
    queryFn: () => tangaLPOAPI.getByLPONo(lpoNo),
    enabled: enabled && !!lpoNo,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTangaWorkbook(year: number, enabled = true) {
  return useQuery({
    queryKey: tangaLPOKeys.workbook(year),
    queryFn: () => tangaLPOAPI.getWorkbookYear(year),
    enabled: enabled && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTangaFilterOptions(filters: TangaFilterOptionParams = {}, enabled = true) {
  const params: Record<string, unknown> = {};
  if (filters.year)     params.year     = filters.year;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo)   params.dateTo   = filters.dateTo;
  if (filters.search)   params.search   = filters.search;
  if (filters.month)    params.month    = filters.month;

  return useQuery({
    queryKey: [...tangaLPOKeys.all, 'filterOptions', params],
    queryFn: () => tangaLPOAPI.getFilterOptions(params),
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useTangaYears() {
  return useQuery({
    queryKey: tangaLPOKeys.years(),
    queryFn: async () => {
      const years = await tangaLPOAPI.getYears();
      return years.length ? years : [new Date().getFullYear()];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useTangaNextNumber() {
  return useQuery({
    queryKey: tangaLPOKeys.nextNumber(),
    queryFn: () => tangaLPOAPI.getNextNumber(),
    staleTime: 0, // always fresh — sequential number must be up-to-date
  });
}
