/**
 * Admin Configuration Sync Service
 * Syncs configuration between backend database and frontend
 */

import { adminAPI } from './api';
import { FuelConfigService, FuelConfig, DEFAULT_FUEL_CONFIG } from './fuelConfigService';

export class AdminConfigSyncService {
  private static SYNC_KEY = 'admin_config_last_sync';
  private static SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

  /**
   * Check if sync is needed based on last sync time
   */
  static needsSync(): boolean {
    try {
      const lastSync = localStorage.getItem(this.SYNC_KEY);
      if (!lastSync) return true;
      
      const lastSyncTime = parseInt(lastSync, 10);
      return Date.now() - lastSyncTime > this.SYNC_INTERVAL;
    } catch {
      return true;
    }
  }

  /**
   * Sync configuration from backend to frontend localStorage
   */
  static async syncFromBackend(): Promise<FuelConfig> {
    try {
      const backendConfig = await adminAPI.getAllConfig();
      
      // Convert backend format to frontend format
      const frontendConfig: FuelConfig = {
        ...DEFAULT_FUEL_CONFIG,
        
        // Map fuel stations
        fuelStations: backendConfig.fuelStations.map(station => ({
          id: station.id,
          name: station.name,
          location: station.location,
          pricePerLiter: station.pricePerLiter,
          isActive: station.isActive,
        })),
        
        // Map routes to routeTotalLiters
        routeTotalLiters: backendConfig.routes.reduce((acc, route) => {
          if (route.isActive) {
            acc[route.destination] = route.totalLiters;
          }
          return acc;
        }, {} as Record<string, number>),
        
        // Map truck batches
        truckBatches: {
          batch_100: backendConfig.truckBatches.batch_100.map(t => t.truckSuffix),
          batch_80: backendConfig.truckBatches.batch_80.map(t => t.truckSuffix),
          batch_60: backendConfig.truckBatches.batch_60.map(t => t.truckSuffix),
        },
        
        // Map standard allocations
        standardAllocations: backendConfig.standardAllocations,
      };
      
      // Save to localStorage
      FuelConfigService.saveConfig(frontendConfig);
      
      // Update sync timestamp
      localStorage.setItem(this.SYNC_KEY, Date.now().toString());
      
      console.log('Configuration synced from backend');
      return frontendConfig;
    } catch (error) {
      console.error('Failed to sync configuration from backend:', error);
      // Return current local config on failure
      return FuelConfigService.loadConfig();
    }
  }

  /**
   * Push local configuration to backend
   */
  static async syncToBackend(config: FuelConfig): Promise<void> {
    try {
      // Update fuel stations
      const currentStations = await adminAPI.getFuelStations();
      for (const station of config.fuelStations) {
        const existing = currentStations.find(s => s.id === station.id);
        if (existing) {
          if (existing.pricePerLiter !== station.pricePerLiter || existing.isActive !== station.isActive) {
            await adminAPI.updateFuelStation(station.id, {
              pricePerLiter: station.pricePerLiter,
              isActive: station.isActive,
            });
          }
        } else {
          await adminAPI.addFuelStation(station);
        }
      }

      // Update routes
      for (const [destination, totalLiters] of Object.entries(config.routeTotalLiters)) {
        try {
          await adminAPI.updateRoute(destination, { totalLiters });
        } catch {
          // Route might not exist, try adding it
          await adminAPI.addRoute({ destination, totalLiters });
        }
      }

      // Update standard allocations
      await adminAPI.updateStandardAllocations(config.standardAllocations);

      // Update truck batches
      // First sync each batch
      for (const suffix of config.truckBatches.batch_100) {
        await adminAPI.addTruckToBatch({ truckSuffix: suffix, extraLiters: 100 });
      }
      for (const suffix of config.truckBatches.batch_80) {
        await adminAPI.addTruckToBatch({ truckSuffix: suffix, extraLiters: 80 });
      }
      for (const suffix of config.truckBatches.batch_60) {
        await adminAPI.addTruckToBatch({ truckSuffix: suffix, extraLiters: 60 });
      }

      console.log('Configuration synced to backend');
    } catch (error) {
      console.error('Failed to sync configuration to backend:', error);
      throw error;
    }
  }

  /**
   * Get configuration with auto-sync from backend if needed
   */
  static async getConfigWithSync(): Promise<FuelConfig> {
    if (this.needsSync()) {
      return await this.syncFromBackend();
    }
    return FuelConfigService.loadConfig();
  }

  /**
   * Force sync from backend
   */
  static async forceSyncFromBackend(): Promise<FuelConfig> {
    return await this.syncFromBackend();
  }

  /**
   * Clear sync state (useful for testing)
   */
  static clearSyncState(): void {
    localStorage.removeItem(this.SYNC_KEY);
  }
}

export default AdminConfigSyncService;
