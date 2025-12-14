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
      const batchSummary = Object.entries(batches).reduce((acc, [key, trucks]) => {
        acc[key] = Array.isArray(trucks) ? trucks.length : 0;
        return acc;
      }, {} as Record<string, number>);
      console.log('✓ Fetched truck batches from API:', batchSummary);
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
 * Create a new batch with custom extra liters
 */
export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { extraLiters: number }) => {
      console.log('→ Creating batch:', data);
      const result = await adminAPI.createBatch(data);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Batch ${variables.extraLiters}L created`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to create batch:', error);
    },
  });
}

/**
 * Update batch allocation
 */
export function useUpdateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { oldExtraLiters: number; newExtraLiters: number }) => {
      console.log('→ Updating batch:', data);
      const result = await adminAPI.updateBatch(data);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Batch updated: ${variables.oldExtraLiters}L → ${variables.newExtraLiters}L`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to update batch:', error);
    },
  });
}

/**
 * Delete a batch (only if empty)
 */
export function useDeleteBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (extraLiters: number) => {
      console.log('→ Deleting batch:', extraLiters);
      const result = await adminAPI.deleteBatch(extraLiters);
      return result;
    },
    onSuccess: (_, extraLiters) => {
      console.log(`✓ Batch ${extraLiters}L deleted`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to delete batch:', error);
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
 * Helper function to get extra fuel from batches data (now supports dynamic batches)
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

  // Search dynamically across all batches
  for (const [extraLitersStr, trucks] of Object.entries(batches)) {
    if (!Array.isArray(trucks)) continue;
    
    const truck = trucks.find(t => t.truckSuffix === truckSuffix);
    if (truck) {
      // Check destination rules if destination provided
      if (destination && truck.destinationRules && truck.destinationRules.length > 0) {
        const normalizedDest = destination.toLowerCase().trim();
        const matchingRule = truck.destinationRules.find((rule: any) => {
          const ruleDestination = rule.destination.toLowerCase().trim();
          return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
        });

        if (matchingRule) {
          return {
            extraFuel: matchingRule.extraLiters,
            matched: true,
            batchName: `batch_${extraLitersStr}`,
            truckSuffix,
            destinationOverride: true,
          };
        }
      }

      // Return batch default
      return {
        extraFuel: parseInt(extraLitersStr),
        matched: true,
        batchName: `batch_${extraLitersStr}`,
        truckSuffix,
      };
    }
  }

  // Not found in any batch
  return { extraFuel: 0, matched: false, truckSuffix };
}
