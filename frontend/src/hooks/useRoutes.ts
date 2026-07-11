/**
 * React Query hooks for Route Configuration
 * Replaces localStorage with API-based state management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configService } from '../services/configService';
import { configAPI } from '../services/api';

// Query keys for cache management
export const routeKeys = {
  all: ['routes'] as const,
  byType: (type?: 'IMPORT' | 'EXPORT') => ['routes', type] as const,
};

/**
 * Fetch routes from backend
 */
export function useRoutes() {
  return useQuery({
    queryKey: routeKeys.all,
    queryFn: async () => {
      const routes = await configService.getRoutes();
      console.log('✓ Fetched routes from API:', routes.length, 'routes');
      return routes;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Create new route
 * Automatically invalidates cache to trigger refetch across all components
 */
export function useCreateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      routeName: string;
      origin?: string;
      destination: string;
      destinationAliases?: string[];
      routeType?: 'IMPORT' | 'EXPORT';
      defaultTotalLiters: number;
      formula?: string;
      description?: string;
    }) => {
      console.log('→ Creating route:', data.routeName);
      const result = await configAPI.createRoute(data);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Route ${variables.routeName} created`);
      // Invalidate ALL route queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: routeKeys.all });
      // Clear configService cache for backward compatibility
      configService.clearCache();
    },
    onError: (error: any) => {
      console.error('✗ Failed to create route:', error);
    },
  });
}

/**
 * Update route
 * Automatically invalidates cache to trigger refetch
 */
export function useUpdateRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; updates: any }) => {
      console.log('→ Updating route:', data.id);
      const result = await configAPI.updateRoute(data.id, data.updates);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Route ${variables.id} updated`);
      // Invalidate ALL route queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: routeKeys.all });
      // Clear configService cache for backward compatibility
      configService.clearCache();
    },
    onError: (error: any) => {
      console.error('✗ Failed to update route:', error);
    },
  });
}

/**
 * Delete route
 * Automatically invalidates cache to trigger refetch
 */
export function useDeleteRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log('→ Deleting route:', id);
      const result = await configAPI.deleteRoute(id);
      return result;
    },
    onSuccess: (_, id) => {
      console.log(`✓ Route ${id} deleted`);
      // Invalidate ALL route queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: routeKeys.all });
      // Clear configService cache for backward compatibility
      configService.clearCache();
    },
    onError: (error: any) => {
      console.error('✗ Failed to delete route:', error);
    },
  });
}

/**
 * Helper function to get total liters from routes data.
 * Requires origin + destination (or origin + destination alias). No dest-only fallback.
 */
export function getTotalLitersFromRoutes(
  routes: any[] | undefined,
  origin: string,
  destination: string
): {
  liters: number;
  matched: boolean;
  matchType?: string;
  routeName?: string;
} {
  if (!routes || routes.length === 0) {
    return { liters: 0, matched: false };
  }

  const normalizedOrig = (origin || '').toUpperCase().trim();
  const normalizedDest = (destination || '').toUpperCase().trim();
  if (!normalizedOrig || !normalizedDest) {
    return { liters: 0, matched: false };
  }

  const originsMatch = (a?: string, b?: string): boolean => {
    const na = (a || '').toUpperCase().trim();
    const nb = (b || '').toUpperCase().trim();
    if (!na || !nb) return false;
    if (na === nb) return true;
    return na.includes(nb) || nb.includes(na);
  };

  const match = routes.find((route) => {
    if (route.isActive === false) return false;
    if (route.routeType && route.routeType !== 'IMPORT') return false;
    if (!originsMatch(route.origin, normalizedOrig)) return false;
    const destExact = route.destination.toUpperCase().trim() === normalizedDest;
    const destAlias = route.destinationAliases?.some(
      (alias: string) => alias.toUpperCase().trim() === normalizedDest
    );
    return destExact || destAlias;
  });

  if (!match) {
    return { liters: 0, matched: false };
  }

  const matchType =
    match.destination.toUpperCase().trim() === normalizedDest ? 'exact' : 'alias';

  return {
    liters: match.defaultTotalLiters,
    matched: true,
    matchType,
    routeName: `${match.origin || normalizedOrig} → ${match.destination}`,
  };
}

/**
 * Combined helper to get both route and truck batch info
 * Used during DO creation to check for missing configurations
 */
export function getDoConfiguration(params: {
  destination: string;
  loadingPoint: string;
  truckNo: string;
  routes: any[] | undefined;
  batches: any | undefined;
}) {
  const { destination, loadingPoint, truckNo, routes, batches } = params;

  const routeInfo = getTotalLitersFromRoutes(routes, loadingPoint, destination);
  
  // Import getExtraFuelFromBatches to avoid circular dependency
  const truckSuffix = truckNo.toLowerCase().split(' ').pop() || '';
  let truckInfo = {
    extraFuel: 0,
    matched: false,
    truckSuffix,
  };

  if (batches) {
    // Check batches for truck suffix
    const truck100 = batches.batch_100?.find((t: any) => t.truckSuffix === truckSuffix);
    const truck80 = batches.batch_80?.find((t: any) => t.truckSuffix === truckSuffix);
    const truck60 = batches.batch_60?.find((t: any) => t.truckSuffix === truckSuffix);

    if (truck100) {
      truckInfo = { extraFuel: 100, matched: true, truckSuffix };
    } else if (truck80) {
      truckInfo = { extraFuel: 80, matched: true, truckSuffix };
    } else if (truck60) {
      truckInfo = { extraFuel: 60, matched: true, truckSuffix };
    }
  }

  return {
    route: routeInfo,
    truck: truckInfo,
    hasIssues: !routeInfo.matched || !truckInfo.matched,
    missingFields: [
      ...(!routeInfo.matched ? ['totalLiters'] : []),
      ...(!truckInfo.matched ? ['extraFuel'] : []),
    ],
  };
}
