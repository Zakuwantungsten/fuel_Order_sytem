/**
 * Configuration Service
 * 
 * Centralized service for fetching fuel stations and routes dynamically from the database.
 * This replaces all hardcoded station and route arrays throughout the application.
 */

import { configAPI } from './api';
import { FuelStationConfig, RouteConfig } from '../types';

class ConfigurationService {
  private stationsCache: FuelStationConfig[] | null = null;
  private routesCache: RouteConfig[] | null = null;
  private lastFetch: { stations?: number; routes?: number } = {};
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all fuel stations from the database
   * Uses caching to reduce API calls
   */
  async getStations(forceRefresh = false): Promise<FuelStationConfig[]> {
    const now = Date.now();
    const isStale = !this.lastFetch.stations || now - this.lastFetch.stations > this.CACHE_DURATION;

    if (!this.stationsCache || isStale || forceRefresh) {
      try {
        this.stationsCache = await configAPI.getStations();
        this.lastFetch.stations = now;
      } catch (error) {
        console.error('Failed to fetch stations:', error);
        // Return cached data if available, otherwise empty array
        return this.stationsCache || [];
      }
    }

    return this.stationsCache || [];
  }

  /**
   * Get all routes from the database
   * Uses caching to reduce API calls
   */
  async getRoutes(forceRefresh = false): Promise<RouteConfig[]> {
    const now = Date.now();
    const isStale = !this.lastFetch.routes || now - this.lastFetch.routes > this.CACHE_DURATION;

    if (!this.routesCache || isStale || forceRefresh) {
      try {
        this.routesCache = await configAPI.getRoutes();
        this.lastFetch.routes = now;
      } catch (error) {
        console.error('Failed to fetch routes:', error);
        // Return cached data if available, otherwise empty array
        return this.routesCache || [];
      }
    }

    return this.routesCache || [];
  }

  /**
   * Get active stations only
   */
  async getActiveStations(): Promise<FuelStationConfig[]> {
    const stations = await this.getStations();
    return stations.filter(s => s.isActive);
  }

  /**
   * Get active routes only
   */
  async getActiveRoutes(): Promise<RouteConfig[]> {
    const routes = await this.getRoutes();
    return routes.filter(r => r.isActive);
  }

  /**
   * Get station names only (for dropdowns/selects)
   */
  async getStationNames(): Promise<string[]> {
    const stations = await this.getActiveStations();
    return stations.map(s => s.stationName).sort();
  }

  /**
   * Get station by name
   */
  async getStationByName(name: string): Promise<FuelStationConfig | undefined> {
    const stations = await this.getStations();
    return stations.find(s => s.stationName.toUpperCase() === name.toUpperCase());
  }

  /**
   * Get route by destination
   */
  async getRouteByDestination(destination: string): Promise<RouteConfig | undefined> {
    const routes = await this.getRoutes();
    const destUpper = destination.toUpperCase().trim();
    
    return routes.find(r => 
      r.destination === destUpper || 
      r.destinationAliases?.some(alias => alias.toUpperCase() === destUpper)
    );
  }

  /**
   * Get routes by origin
   */
  async getRoutesByOrigin(origin: string): Promise<RouteConfig[]> {
    const routes = await this.getRoutes();
    const originUpper = origin.toUpperCase().trim();
    
    return routes.filter(r => r.origin === originUpper);
  }

  /**
   * Clear cache (call this after creating/updating/deleting stations or routes)
   */
  clearCache() {
    this.stationsCache = null;
    this.routesCache = null;
    this.lastFetch = {};
  }

  /**
   * Get station info for a given station name
   * Returns rate, currency, and default liters
   */
  async getStationInfo(stationName: string): Promise<{
    rate: number;
    currency: 'USD' | 'TZS';
    defaultLitersGoing: number;
    defaultLitersReturning: number;
  } | null> {
    const station = await this.getStationByName(stationName);
    if (!station) return null;

    // Determine currency based on rate (heuristic: USD rates < 10, TZS rates > 100)
    const currency: 'USD' | 'TZS' = station.defaultRate < 10 ? 'USD' : 'TZS';

    return {
      rate: station.defaultRate,
      currency,
      defaultLitersGoing: station.defaultLitersGoing,
      defaultLitersReturning: station.defaultLitersReturning,
    };
  }

  /**
   * Get all stations excluding specific ones (for manager views, etc.)
   */
  async getStationsExcluding(excludedStations: string[]): Promise<FuelStationConfig[]> {
    const stations = await this.getActiveStations();
    const excludedUpper = excludedStations.map(s => s.toUpperCase());
    return stations.filter(s => !excludedUpper.includes(s.stationName.toUpperCase()));
  }

  /**
   * Get forwarding routes from a source station
   * Used for LPO forwarding feature
   */
  async getForwardingRoutes(sourceStation: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    fromStation: string;
    toStation: string;
    defaultLiters: number;
    rate: number;
    currency: 'USD' | 'TZS';
  }>> {
    const stations = await this.getStations();
    const sourceUpper = sourceStation.toUpperCase().trim();

    // Find potential forwarding destinations based on common patterns
    // Zambia Return: Ndola → Kapiri
    // Tunduma Return: Lake Tunduma → Infinity
    
    const forwardingMap: Record<string, string[]> = {
      'LAKE NDOLA': ['LAKE KAPIRI'],
      'LAKE TUNDUMA': ['INFINITY'],
    };

    const targetStationNames = forwardingMap[sourceUpper] || [];
    const targetStations = stations.filter(s => targetStationNames.includes(s.stationName));

    return targetStations.map(target => {
      const currency: 'USD' | 'TZS' = target.defaultRate < 10 ? 'USD' : 'TZS';
      return {
        id: `${sourceUpper}-to-${target.stationName}`,
        name: `${sourceUpper} → ${target.stationName}`,
        description: `Forward from ${sourceUpper} to ${target.stationName}`,
        fromStation: sourceUpper,
        toStation: target.stationName,
        defaultLiters: target.defaultLitersReturning,
        rate: target.defaultRate,
        currency,
      };
    });
  }
}

// Export singleton instance
export const configService = new ConfigurationService();
