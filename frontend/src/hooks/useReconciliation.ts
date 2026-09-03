import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { reconciliationAPI, ReconciliationSession } from '../services/api';

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  list: (params?: Record<string, unknown>) => ['reconciliation', 'list', params] as const,
  detail: (id: string) => ['reconciliation', id] as const,
  lines: (id: string, params?: Record<string, unknown>) =>
    ['reconciliation', id, 'lines', params] as const,
  lineFilterOptions: (id: string, side?: string) =>
    ['reconciliation', id, 'lines', 'filter-options', side || 'lpo'] as const,
  statementRows: (id: string, params?: Record<string, unknown>) =>
    ['reconciliation', id, 'statement-rows', params] as const,
  statementFilterOptions: (id: string) =>
    ['reconciliation', id, 'statement-rows', 'filter-options'] as const,
  matchCandidates: (id: string, params?: Record<string, unknown>) =>
    ['reconciliation', id, 'match-candidates', params] as const,
  variance: (id: string, params?: Record<string, unknown>) =>
    ['reconciliation', id, 'variance', params] as const,
  pending: (stations: string[], extra?: Record<string, unknown>) =>
    ['reconciliation', 'pending', stations.join('|'), extra] as const,
  stationsInRange: (dateFrom: string, dateTo: string) =>
    ['reconciliation', 'stations-in-range', dateFrom, dateTo] as const,
};

const PAGE_SIZE = 100;

export function useReconciliationSessions(params?: {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  stations?: string[];
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: reconciliationKeys.list(params),
    queryFn: () => reconciliationAPI.list(params),
  });
}

export function useReconciliationSession(id: string | null) {
  return useQuery({
    queryKey: reconciliationKeys.detail(id || ''),
    queryFn: () => reconciliationAPI.get(id!),
    enabled: !!id,
  });
}

export function useReconciliationSessionLines(
  id: string | null,
  params?: {
    filter?: string;
    search?: string;
    truck?: string;
    station?: string;
    exceptionCode?: string;
    side?: 'lpo' | 'statement' | 'all';
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    limit?: number;
    enabled?: boolean;
  }
) {
  const { enabled: queryEnabled = true, limit = PAGE_SIZE, ...apiParams } = params || {};
  return useInfiniteQuery({
    queryKey: reconciliationKeys.lines(id || '', { ...apiParams, limit, infinite: true }),
    queryFn: ({ pageParam }) =>
      reconciliationAPI.getSessionLines(id!, { ...apiParams, page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, totalPages } = last.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    enabled: queryEnabled && !!id,
  });
}

export function useReconciliationLineFilterOptions(
  id: string | null,
  opts?: { enabled?: boolean; side?: 'lpo' | 'statement' | 'all' }
) {
  const side = opts?.side || 'lpo';
  return useQuery({
    queryKey: reconciliationKeys.lineFilterOptions(id || '', side),
    queryFn: () => reconciliationAPI.getSessionLineFilterOptions(id!, { side }),
    enabled: (opts?.enabled ?? true) && !!id,
    staleTime: 30_000,
  });
}

export function useReconciliationStatementFilterOptions(
  id: string | null,
  opts?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: reconciliationKeys.statementFilterOptions(id || ''),
    queryFn: () => reconciliationAPI.getStatementRowFilterOptions(id!),
    enabled: (opts?.enabled ?? true) && !!id,
    staleTime: 30_000,
  });
}

export function useReconciliationStatementRows(
  id: string | null,
  params?: {
    filter?: string;
    search?: string;
    truck?: string;
    station?: string;
    detail?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    limit?: number;
    enabled?: boolean;
  }
) {
  const { enabled: queryEnabled = true, limit = PAGE_SIZE, ...apiParams } = params || {};
  return useInfiniteQuery({
    queryKey: reconciliationKeys.statementRows(id || '', { ...apiParams, limit, infinite: true }),
    queryFn: ({ pageParam }) =>
      reconciliationAPI.getStatementRows(id!, { ...apiParams, page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const { page, totalPages } = last.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    enabled: queryEnabled && !!id,
  });
}

export function useReconciliationMatchCandidates(
  id: string | null,
  params: {
    side: 'lpo' | 'statement';
    search?: string;
    limit?: number;
    enabled?: boolean;
  }
) {
  const { enabled: queryEnabled = true, ...apiParams } = params;
  return useQuery({
    queryKey: reconciliationKeys.matchCandidates(id || '', apiParams),
    queryFn: () => reconciliationAPI.getMatchCandidates(id!, apiParams),
    enabled: queryEnabled && !!id,
  });
}

export function useReconciliationVarianceDetails(
  id: string | null,
  params?: {
    category?: string;
    search?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    page?: number;
    limit?: number;
    enabled?: boolean;
  }
) {
  const { enabled: queryEnabled = true, ...apiParams } = params || {};
  return useQuery({
    queryKey: reconciliationKeys.variance(id || '', params),
    queryFn: () => reconciliationAPI.getVarianceDetails(id!, apiParams),
    enabled: queryEnabled && !!id,
  });
}

export function usePendingLpoEntries(
  stations: string[],
  opts?: {
    pendingMode?: string;
    pendingDateFrom?: string;
    pendingDateTo?: string;
    view?: 'active' | 'dropped';
    search?: string;
    sortBy?: 'lpoDate' | 'lpoTruck' | 'station' | 'lpoLiters' | 'lpoNo';
    sortDir?: 'asc' | 'desc';
    enabled?: boolean;
  }
) {
  return useQuery({
    queryKey: reconciliationKeys.pending(stations, opts),
    queryFn: () =>
      reconciliationAPI.getPending({
        stations,
        pendingMode: opts?.pendingMode,
        pendingDateFrom: opts?.pendingDateFrom,
        pendingDateTo: opts?.pendingDateTo,
        view: opts?.view || 'active',
        search: opts?.search,
        sortBy: opts?.sortBy,
        sortDir: opts?.sortDir,
      }),
    enabled: (opts?.enabled ?? true) && stations.length > 0,
  });
}

export function useReconciliationStationsInRange(dateFrom: string, dateTo: string) {
  return useQuery<string[]>({
    queryKey: reconciliationKeys.stationsInRange(dateFrom, dateTo),
    queryFn: () => reconciliationAPI.getStationsInRange(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
  });
}

export function useReconciliationMutations() {
  const queryClient = useQueryClient();

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
    if (id) {
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });
    }
  };

  return {
    create: useMutation({
      mutationFn: (payload: Partial<ReconciliationSession>) => reconciliationAPI.create(payload),
      onSuccess: () => invalidate(),
    }),
    update: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Partial<ReconciliationSession> }) =>
        reconciliationAPI.update(id, payload),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    loadLpo: useMutation({
      mutationFn: (id: string) => reconciliationAPI.loadLpo(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    uploadStatement: useMutation({
      mutationFn: ({
        id,
        file,
        stationMappings,
        flaggedStatementStations,
        forceImport,
      }: {
        id: string;
        file: File;
        stationMappings?: Record<string, string>;
        flaggedStatementStations?: string[];
        forceImport?: boolean;
      }) =>
        reconciliationAPI.uploadStatement(id, file, {
          stationMappings,
          flaggedStatementStations,
          forceImport,
        }),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    validateStatement: useMutation({
      mutationFn: ({ id, file }: { id: string; file: File }) =>
        reconciliationAPI.validateStatement(id, file),
    }),
    runMatch: useMutation({
      mutationFn: (id: string) => reconciliationAPI.runMatch(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    manualMatch: useMutation({
      mutationFn: ({
        id,
        payload,
      }: {
        id: string;
        payload: Parameters<typeof reconciliationAPI.manualMatch>[1];
      }) => reconciliationAPI.manualMatch(id, payload),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    updateLine: useMutation({
      mutationFn: ({
        id,
        lineId,
        payload,
      }: {
        id: string;
        lineId: string;
        payload: Parameters<typeof reconciliationAPI.updateLine>[2];
      }) => reconciliationAPI.updateLine(id, lineId, payload),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    reopen: useMutation({
      mutationFn: (id: string) => reconciliationAPI.reopen(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    addStations: useMutation({
      mutationFn: ({ id, stations }: { id: string; stations: string[] }) =>
        reconciliationAPI.addStations(id, stations),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    updateSessionStations: useMutation({
      mutationFn: ({
        id,
        stations,
        dateFrom,
        dateTo,
      }: {
        id: string;
        stations: string[];
        dateFrom?: string;
        dateTo?: string;
      }) => reconciliationAPI.updateSessionStations(id, { stations, dateFrom, dateTo }),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    saveDraft: useMutation({
      mutationFn: ({ id, title }: { id: string; title?: string }) =>
        reconciliationAPI.saveDraft(id, title ? { title } : undefined),
      onSuccess: (_d, v) => invalidate(v.id),
    }),
    complete: useMutation({
      mutationFn: (id: string) => reconciliationAPI.complete(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    drop: useMutation({
      mutationFn: (id: string) => reconciliationAPI.drop(id),
      onSuccess: (_d, id) => invalidate(id),
    }),
    remove: useMutation({
      mutationFn: (id: string) => reconciliationAPI.delete(id),
      onSuccess: () => invalidate(),
    }),
  };
}
