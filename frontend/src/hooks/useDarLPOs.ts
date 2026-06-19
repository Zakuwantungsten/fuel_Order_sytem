import { useQuery } from '@tanstack/react-query';
import { darLPOAPI } from '../services/api';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const darLPOKeys = {
  all: ['darLPOs'] as const,
  lists: () => [...darLPOKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...darLPOKeys.lists(), filters] as const,
  detail: (id: string) => [...darLPOKeys.all, 'detail', id] as const,
  byLPONo: (lpoNo: string) => [...darLPOKeys.all, 'lpoNo', lpoNo] as const,
  workbook: (year: number) => [...darLPOKeys.all, 'workbook', year] as const,
  years: () => [...darLPOKeys.all, 'years'] as const,
  nextNumber: () => [...darLPOKeys.all, 'nextNumber'] as const,
};

// ---------------------------------------------------------------------------
// Filters interface
// ---------------------------------------------------------------------------
export interface DarLPOFilters {
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
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useDarLPOList(filters: DarLPOFilters = {}, enabled = true) {
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

  return useQuery({
    queryKey: darLPOKeys.list(params),
    queryFn: async () => {
      const data = await darLPOAPI.getAll(params);
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

export function useDarLPOById(id: string, enabled = true) {
  return useQuery({
    queryKey: darLPOKeys.detail(id),
    queryFn: () => darLPOAPI.getById(id),
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDarLPOByLPONo(lpoNo: string, enabled = true) {
  return useQuery({
    queryKey: darLPOKeys.byLPONo(lpoNo),
    queryFn: () => darLPOAPI.getByLPONo(lpoNo),
    enabled: enabled && !!lpoNo,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDarWorkbook(year: number, enabled = true) {
  return useQuery({
    queryKey: darLPOKeys.workbook(year),
    queryFn: () => darLPOAPI.getWorkbookYear(year),
    enabled: enabled && !!year,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDarYears() {
  return useQuery({
    queryKey: darLPOKeys.years(),
    queryFn: async () => {
      const years = await darLPOAPI.getYears();
      return years.length ? years : [new Date().getFullYear()];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useDarNextNumber() {
  return useQuery({
    queryKey: darLPOKeys.nextNumber(),
    queryFn: () => darLPOAPI.getNextNumber(),
    staleTime: 0, // always fresh — sequential number must be up-to-date
  });
}
