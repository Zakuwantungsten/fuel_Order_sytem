/**
 * React Query hooks for Route Configuration
 * Replaces localStorage with API-based state management
 */

import { useQuery } from '@tanstack/react-query';
import { configService } from '../services/configService';

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
 * Helper function to get total liters from routes data
 * Replaces FuelConfigService.getTotalLitersByRoute()
 */
export function getTotalLitersFromRoutes(
  routes: any[] | undefined,
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

  const normalizedDest = destination.toUpperCase().trim();

  // Try exact match first
  const exactMatch = routes.find(
    route => route.isActive && route.destination.toUpperCase() === normalizedDest
  );

  if (exactMatch) {
    return {
      liters: exactMatch.defaultTotalLiters,
      matched: true,
      matchType: 'exact',
      routeName: exactMatch.destination,
    };
  }

  // Try alias match
  for (const route of routes) {
    if (route.isActive && route.destinationAliases) {
      const aliasMatch = route.destinationAliases.find(
        (alias: string) => alias.toUpperCase() === normalizedDest
      );
      if (aliasMatch) {
        return {
          liters: route.defaultTotalLiters,
          matched: true,
          matchType: 'alias',
          routeName: route.destination,
        };
      }
    }
  }

  // Try partial match
  const partialMatch = routes.find(
    route => 
      route.isActive &&
      (route.destination.toUpperCase().includes(normalizedDest) ||
       normalizedDest.includes(route.destination.toUpperCase()))
  );

  if (partialMatch) {
    return {
      liters: partialMatch.defaultTotalLiters,
      matched: true,
      matchType: 'partial',
      routeName: partialMatch.destination,
    };
  }

  // Not found
  return { liters: 0, matched: false };
}

/**
 * Combined helper to get both route and truck batch info
 * Used during DO creation to check for missing configurations
 */
export function getDoConfiguration(params: {
  destination: string;
  truckNo: string;
  routes: any[] | undefined;
  batches: any | undefined;
}) {
  const { destination, truckNo, routes, batches } = params;

  const routeInfo = getTotalLitersFromRoutes(routes, destination);
  
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
