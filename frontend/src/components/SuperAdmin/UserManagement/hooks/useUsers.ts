import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { usersAPI } from '../../../../services/api';
import { useRealtimeSync } from '../../../../hooks/useRealtimeSync';
import type { UserFilters, SortConfig, SortField, SortDirection } from '../types';
import { DEFAULT_PAGE_SIZE } from '../constants';

// ── Query Keys ───────────────────────────────────────────────────────────────
export const userQueryKeys = {
  all: ['users'] as const,
  list: (params: Record<string, unknown>) => ['users', 'list', params] as const,
  detail: (id: string | number) => ['users', 'detail', id] as const,
};

// ── URL Param Helpers ────────────────────────────────────────────────────────
function filtersFromParams(params: URLSearchParams): UserFilters {
  return {
    q: params.get('q') || '',
    role: params.get('role') || '',
    status: params.get('status') || '',
    mfaStatus: params.get('mfa') || '',
  };
}

function sortFromParams(params: URLSearchParams): SortConfig | null {
  const field = params.get('sort') as SortField | null;
  const direction = params.get('order') as SortDirection | null;
  if (field && direction) return { field, direction };
  return null;
}

function pageFromParams(params: URLSearchParams): number {
  const p = parseInt(params.get('page') || '1', 10);
  return Number.isNaN(p) || p < 1 ? 1 : p;
}

function limitFromParams(params: URLSearchParams): number {
  const l = parseInt(params.get('limit') || String(DEFAULT_PAGE_SIZE), 10);
  return [25, 50, 100, 250, 500].includes(l) ? l : DEFAULT_PAGE_SIZE;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useUsers() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive state from URL params (single source of truth)
  const filters = filtersFromParams(searchParams);
  const sort = sortFromParams(searchParams);
  const page = pageFromParams(searchParams);
  const limit = limitFromParams(searchParams);

  // Debounced search value
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(debounceRef.current);
  }, [filters.q]);

  // Build API params
  const apiParams = {
    page,
    limit,
    ...(debouncedQ && { q: debouncedQ }),
    ...(filters.role && { role: filters.role }),
    ...(filters.status && { isActive: filters.status }),
    ...(sort && { sort: sort.field, order: sort.direction }),
  };

  // Server-side paginated query
  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: userQueryKeys.list(apiParams),
    queryFn: () => usersAPI.getPaginated(apiParams),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData,
  });

  // Real-time sync: invalidate cache when backend pushes data-change events
  useRealtimeSync('users', () => {
    queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
  }, 'um-users-list');

  // ── URL State Updaters ─────────────────────────────────────────────────────
  const updateParams = useCallback((updates: Record<string, string>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next.set(k, v);
        else next.delete(k);
      });
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setSearch = useCallback((q: string) => {
    updateParams({ q, page: '' }); // Reset to page 1 on new search
  }, [updateParams]);

  const setFilter = useCallback((key: 'role' | 'status' | 'mfa', value: string) => {
    const paramKey = key === 'mfa' ? 'mfa' : key;
    updateParams({ [paramKey]: value, page: '' });
  }, [updateParams]);

  const setSort = useCallback((field: SortField) => {
    const current = sortFromParams(searchParams);
    let newDirection: SortDirection | '' = 'asc';
    if (current?.field === field) {
      if (current.direction === 'asc') newDirection = 'desc';
      else newDirection = ''; // Third click removes sort
    }
    updateParams({
      sort: newDirection ? field : '',
      order: newDirection || '',
      page: '',
    });
  }, [searchParams, updateParams]);

  const setPage = useCallback((p: number) => {
    updateParams({ page: p > 1 ? String(p) : '' });
  }, [updateParams]);

  const setLimit = useCallback((l: number) => {
    updateParams({ limit: l !== DEFAULT_PAGE_SIZE ? String(l) : '', page: '' });
  }, [updateParams]);

  const clearFilters = useCallback(() => {
    updateParams({ q: '', role: '', status: '', mfa: '', sort: '', order: '', page: '' });
  }, [updateParams]);

  const hasActiveFilters = !!(filters.q || filters.role || filters.status || filters.mfaStatus);

  return {
    // Data
    users: data?.data || [],
    pagination: data?.pagination || { page: 1, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
    // State
    filters,
    sort,
    page,
    limit,
    isLoading,
    isFetching,
    isError,
    error,
    hasActiveFilters,
    // Actions
    setSearch,
    setFilter,
    setSort,
    setPage,
    setLimit,
    clearFilters,
    refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: userQueryKeys.all }),
  };
}
