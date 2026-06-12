import { useQuery } from '@tanstack/react-query';
import { configAPI } from '../services/api';

export const journeyConfigKey = ['journey-config'] as const;

/**
 * Shared React Query hook for journey config.
 * Any number of components can call this — React Query deduplicates
 * the network request and serves all of them from the same cache.
 * Stays fresh for 5 minutes so tab navigation never triggers a refetch.
 */
export function useJourneyConfig() {
  return useQuery({
    queryKey: journeyConfigKey,
    queryFn: () => configAPI.getJourneyConfig(),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
