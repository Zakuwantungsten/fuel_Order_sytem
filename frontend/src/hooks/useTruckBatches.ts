/**
 * React Query hooks for Truck Batches
 * Replaces localStorage with API-based state management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI, TruckBatches } from '../services/api';

// Query keys for cache management
export const truckBatchKeys = {
  all: ['truckBatches'] as const,
  detail: (suffix: string) => ['truckBatches', suffix] as const,
};

/**
 * Fetch truck batches from backend
 * Automatically caches and refetches based on QueryClient config
 */
export function useTruckBatches() {
  return useQuery({
    queryKey: truckBatchKeys.all,
    queryFn: async () => {
      const batches = await adminAPI.getTruckBatches();
      console.log('✓ Fetched truck batches from API:', {
        batch_100: batches.batch_100.length,
        batch_80: batches.batch_80.length,
        batch_60: batches.batch_60.length,
      });
      return batches;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Add truck to a batch
 * Automatically invalidates cache to trigger refetch across all components
 */
export function useAddTruckBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { truckSuffix: string; extraLiters: number; truckNumber?: string }) => {
      console.log('→ Adding truck to batch:', data);
      const result = await adminAPI.addTruckToBatch(data);
      return result;
    },
    onSuccess: (_data, variables) => {
      console.log(`✓ Truck ${variables.truckSuffix.toUpperCase()} added to ${variables.extraLiters}L batch`);
      // Invalidate and refetch - ALL components using useTruckBatches() will update!
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to add truck to batch:', error);
    },
  });
}

/**
 * Remove truck from batches
 * Automatically invalidates cache to trigger refetch
 */
export function useRemoveTruckBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (truckSuffix: string) => {
      console.log('→ Removing truck from batches:', truckSuffix);
      const result = await adminAPI.removeTruckFromBatch(truckSuffix);
      return result;
    },
    onSuccess: (_data, truckSuffix) => {
      console.log(`✓ Truck ${truckSuffix.toUpperCase()} removed from batches`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to remove truck from batch:', error);
    },
  });
}

/**
 * Add destination rule for a truck
 * Overrides batch default for specific destinations
 */
export function useAddDestinationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      truckSuffix: string;
      destination: string;
      extraLiters: number;
    }) => {
      console.log('→ Adding destination rule:', data);
      const result = await adminAPI.addDestinationRule(data);
      return result;
    },
    onSuccess: (_data, variables) => {
      console.log(`✓ Destination rule added: ${variables.truckSuffix.toUpperCase()} → ${variables.destination} = ${variables.extraLiters}L`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to add destination rule:', error);
    },
  });
}

/**
 * Delete destination rule
 */
export function useDeleteDestinationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { truckSuffix: string; destination: string }) => {
      console.log('→ Deleting destination rule:', data);
      const result = await adminAPI.deleteDestinationRule(data.truckSuffix, data.destination);
      return result;
    },
    onSuccess: (_data, variables) => {
      console.log(`✓ Destination rule deleted: ${variables.truckSuffix.toUpperCase()} → ${variables.destination}`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to delete destination rule:', error);
    },
  });
}

/**
 * Helper function to get extra fuel from batches data
 * This replaces FuelConfigService.getExtraFuel() but accepts data as parameter
 */
export function getExtraFuelFromBatches(
  truckNo: string,
  batches: TruckBatches | undefined,
  destination?: string
): {
  extraFuel: number;
  matched: boolean;
  batchName?: string;
  truckSuffix: string;
  destinationOverride?: boolean;
} {
  if (!batches) {
    return { extraFuel: 0, matched: false, truckSuffix: '' };
  }

  const truckSuffix = truckNo.toLowerCase().split(' ').pop() || '';

  if (!truckSuffix) {
    return { extraFuel: 0, matched: false, truckSuffix: '' };
  }

  // Check batch_100
  const truck100 = batches.batch_100.find(t => t.truckSuffix === truckSuffix);
  if (truck100) {
    // Check destination rules if destination provided
    if (destination && truck100.destinationRules && truck100.destinationRules.length > 0) {
      const normalizedDest = destination.toLowerCase().trim();
      const matchingRule = truck100.destinationRules.find((rule: any) => {
        const ruleDestination = rule.destination.toLowerCase().trim();
        return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
      });

      if (matchingRule) {
        return {
          extraFuel: matchingRule.extraLiters,
          matched: true,
          batchName: 'batch_100',
          truckSuffix,
          destinationOverride: true,
        };
      }
    }
    return { extraFuel: 100, matched: true, batchName: 'batch_100', truckSuffix };
  }

  // Check batch_80
  const truck80 = batches.batch_80.find(t => t.truckSuffix === truckSuffix);
  if (truck80) {
    if (destination && truck80.destinationRules && truck80.destinationRules.length > 0) {
      const normalizedDest = destination.toLowerCase().trim();
      const matchingRule = truck80.destinationRules.find((rule: any) => {
        const ruleDestination = rule.destination.toLowerCase().trim();
        return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
      });

      if (matchingRule) {
        return {
          extraFuel: matchingRule.extraLiters,
          matched: true,
          batchName: 'batch_80',
          truckSuffix,
          destinationOverride: true,
        };
      }
    }
    return { extraFuel: 80, matched: true, batchName: 'batch_80', truckSuffix };
  }

  // Check batch_60
  const truck60 = batches.batch_60.find(t => t.truckSuffix === truckSuffix);
  if (truck60) {
    if (destination && truck60.destinationRules && truck60.destinationRules.length > 0) {
      const normalizedDest = destination.toLowerCase().trim();
      const matchingRule = truck60.destinationRules.find((rule: any) => {
        const ruleDestination = rule.destination.toLowerCase().trim();
        return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
      });

      if (matchingRule) {
        return {
          extraFuel: matchingRule.extraLiters,
          matched: true,
          batchName: 'batch_60',
          truckSuffix,
          destinationOverride: true,
        };
      }
    }
    return { extraFuel: 60, matched: true, batchName: 'batch_60', truckSuffix };
  }

  // Not found in any batch
  return { extraFuel: 0, matched: false, truckSuffix };
}
