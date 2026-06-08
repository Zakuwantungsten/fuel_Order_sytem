/**
 * React Query hooks for Truck Batches
 * Replaces localStorage with API-based state management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI, TruckBatches, BatchDestinationRule } from '../services/api';

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
      const config = await adminAPI.getTruckBatches();
      const batchSummary = Object.entries(config.truckBatches).reduce((acc, [key, trucks]) => {
        acc[key] = Array.isArray(trucks) ? trucks.length : 0;
        return acc;
      }, {} as Record<string, number>);
      console.log('✓ Fetched truck batches from API:', batchSummary);
      return config;
    },
    staleTime: 5 * 60 * 1000,
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
 * Add batch-level destination rule
 */
export function useAddBatchDestinationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { extraLiters: number; destination: string; extraLitersOverride: number }) => {
      return adminAPI.addBatchDestinationRule(data);
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Batch destination rule added: ${variables.extraLiters}L → ${variables.destination} = ${variables.extraLitersOverride}L`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to add batch destination rule:', error);
    },
  });
}

/**
 * Update batch-level destination rule
 */
export function useUpdateBatchDestinationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { extraLiters: number; oldDestination: string; newDestination?: string; extraLitersOverride: number }) => {
      return adminAPI.updateBatchDestinationRule(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to update batch destination rule:', error);
    },
  });
}

/**
 * Delete batch-level destination rule
 */
export function useDeleteBatchDestinationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { extraLiters: number; destination: string }) => {
      return adminAPI.deleteBatchDestinationRule(data.extraLiters, data.destination);
    },
    onSuccess: (_data, variables) => {
      console.log(`✓ Batch destination rule deleted: ${variables.extraLiters}L → ${variables.destination}`);
      queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
    },
    onError: (error: any) => {
      console.error('✗ Failed to delete batch destination rule:', error);
    },
  });
}

/**
 * Helper function to get extra fuel from batches data.
 * Priority: truck-level rule → batch-level rule → batch default.
 */
export function getExtraFuelFromBatches(
  truckNo: string,
  batches: TruckBatches | undefined,
  destination?: string,
  batchDestinationRules?: { [extraLiters: string]: BatchDestinationRule[] }
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

  for (const [extraLitersStr, trucks] of Object.entries(batches)) {
    if (!Array.isArray(trucks)) continue;

    const truck = trucks.find(t => t.truckSuffix === truckSuffix);
    if (truck) {
      if (destination) {
        const normalizedDest = destination.toLowerCase().trim();

        // 1. Truck-level destination rules (highest priority)
        if (truck.destinationRules && truck.destinationRules.length > 0) {
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

        // 2. Batch-level destination rules (middle priority)
        const batchRules = batchDestinationRules?.[extraLitersStr];
        if (batchRules && batchRules.length > 0) {
          const matchingBatchRule = batchRules.find((rule) => {
            const ruleDestination = rule.destination.toLowerCase().trim();
            return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
          });
          if (matchingBatchRule) {
            return {
              extraFuel: matchingBatchRule.extraLiters,
              matched: true,
              batchName: `batch_${extraLitersStr}`,
              truckSuffix,
              destinationOverride: true,
            };
          }
        }
      }

      // 3. Batch default
      return {
        extraFuel: parseInt(extraLitersStr),
        matched: true,
        batchName: `batch_${extraLitersStr}`,
        truckSuffix,
      };
    }
  }

  return { extraFuel: 0, matched: false, truckSuffix };
}
