/**
 * React Query hooks for Fuel Stations Configuration
 * Replaces configService cache with real-time API-based state management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { configAPI } from '../services/api';
import { FuelStationConfig } from '../types';

// Query keys for cache management
export const fuelStationKeys = {
  all: ['fuelStations'] as const,
  active: ['fuelStations', 'active'] as const,
  byId: (id: string) => ['fuelStations', id] as const,
};

/**
 * Fetch all fuel stations from backend
 * Automatically caches and refetches based on QueryClient config
 */
export function useFuelStations() {
  return useQuery({
    queryKey: fuelStationKeys.all,
    queryFn: async () => {
      const stations = await configAPI.getStations();
      console.log('✓ Fetched fuel stations from API:', stations.length, 'stations');
      return stations;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch only active fuel stations
 */
export function useActiveFuelStations() {
  return useQuery({
    queryKey: fuelStationKeys.active,
    queryFn: async () => {
      const stations = await configAPI.getStations();
      const activeStations = stations.filter((s: FuelStationConfig) => s.isActive !== false);
      console.log('✓ Fetched active fuel stations from API:', activeStations.length, 'stations');
      return activeStations;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Create new fuel station
 * Automatically invalidates cache to trigger refetch across all components
 */
export function useCreateFuelStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      stationName: string;
      defaultRate: number;
      defaultLitersGoing: number;
      defaultLitersReturning: number;
      fuelRecordFieldGoing?: string;
      fuelRecordFieldReturning?: string;
      formulaGoing?: string;
      formulaReturning?: string;
    }) => {
      console.log('→ Creating fuel station:', data.stationName);
      const result = await configAPI.createStation(data);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Fuel station ${variables.stationName} created`);
      // Invalidate ALL fuel station queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.active });
    },
    onError: (error: any) => {
      console.error('✗ Failed to create fuel station:', error);
    },
  });
}

/**
 * Update fuel station
 * Automatically invalidates cache to trigger refetch
 */
export function useUpdateFuelStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; updates: any }) => {
      console.log('→ Updating fuel station:', data.id);
      const result = await configAPI.updateStation(data.id, data.updates);
      return result;
    },
    onSuccess: (_, variables) => {
      console.log(`✓ Fuel station ${variables.id} updated`);
      // Invalidate ALL fuel station queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.active });
    },
    onError: (error: any) => {
      console.error('✗ Failed to update fuel station:', error);
    },
  });
}

/**
 * Delete fuel station
 * Automatically invalidates cache to trigger refetch
 */
export function useDeleteFuelStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      console.log('→ Deleting fuel station:', id);
      const result = await configAPI.deleteStation(id);
      return result;
    },
    onSuccess: (_, id) => {
      console.log(`✓ Fuel station ${id} deleted`);
      // Invalidate ALL fuel station queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
      queryClient.invalidateQueries({ queryKey: fuelStationKeys.active });
    },
    onError: (error: any) => {
      console.error('✗ Failed to delete fuel station:', error);
    },
  });
}

/**
 * Helper function to get station by name from cached data
 */
export function getStationByName(
  stations: FuelStationConfig[] | undefined,
  stationName: string
): FuelStationConfig | undefined {
  if (!stations) return undefined;
  return stations.find(s => s.stationName.toUpperCase() === stationName.toUpperCase());
}

/**
 * Helper function to get active stations from cached data
 */
export function getActiveStations(
  stations: FuelStationConfig[] | undefined
): FuelStationConfig[] {
  if (!stations) return [];
  return stations.filter(s => s.isActive !== false);
}
