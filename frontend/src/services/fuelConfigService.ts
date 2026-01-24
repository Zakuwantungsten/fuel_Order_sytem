/**
 * Fuel System Configuration Types
 * Manage all configurable settings for fuel record calculations
 */

import { adminAPI } from './api';
import { configService } from './configService';

export interface DestinationFuelRule {
  destination: string;
  extraLiters: number;
}

export interface FuelConfig {
  // Truck batch configurations
  truckBatches: {
    batch_100: string[];
    batch_80: string[];
    batch_60: string[];
  };
  
  // Destination-based rules for each batch
  batchDestinationRules?: {
    batch_100: { [truckSuffix: string]: DestinationFuelRule[] };
    batch_80: { [truckSuffix: string]: DestinationFuelRule[] };
    batch_60: { [truckSuffix: string]: DestinationFuelRule[] };
  };
  
  // Standard fuel allocations per checkpoint
  standardAllocations: {
    tangaYardToDar: number;
    darYardStandard: number;
    darYardKisarawe: number;
    mbeyaGoing: number;
    tundumaReturn: number;
    mbeyaReturn: number;
    moroReturnToMombasa: number;
    tangaReturnToMombasa: number;
  };
  
  // Special destination allocations
  specialDestinations: {
    lusaka: number;
    lubumbashi: number;
  };
  
  // Zambia return station allocations
  zambiaReturnStations: {
    lakeNdola: {
      name: string;
      liters: number;
    };
    lakeKapiri: {
      name: string;
      liters: number;
    };
    total: number;
  };
  
  // Loading points
  loadingPoints: {
    darYard: string;
    kisarawe: string;
    darStation: string;
  };
  
  // Fuel stations with rates
  fuelStations: FuelStation[];
  
  // Default fuel prices
  defaultFuelPrice: number;
  
  // Route-based total liters allocations
  routeTotalLiters: {
    [destination: string]: number;
  };
  
  // Note: Loading point extras and destination extras are now managed via database
  // through RouteConfig with destination-specific rules configured in admin panel
}

export interface FuelStation {
  id: string;
  name: string;
  location: string;
  pricePerLiter: number;
  isActive: boolean;
}

// Default configuration
export const DEFAULT_FUEL_CONFIG: FuelConfig = {
  truckBatches: {
    batch_100: ['dnh', 'dny', 'dpn', 'dre', 'drf', 'dnw', 'dxy', 'eaf', 'dtb'],
    batch_80: ['dvk', 'dvl', 'dwk'],
    batch_60: ['dyy', 'dzy', 'eag', 'ecq', 'edd', 'egj', 'ehj', 'ehe', 
               'ely', 'elv', 'eeq', 'eng', 'efp', 'efn', 'ekt', 'eks'],
  },
  
  standardAllocations: {
    tangaYardToDar: 100,
    darYardStandard: 550,
    darYardKisarawe: 580,
    mbeyaGoing: 450,
    tundumaReturn: 100,
    mbeyaReturn: 400,
    moroReturnToMombasa: 100,
    tangaReturnToMombasa: 70,
  },
  
  specialDestinations: {
    lusaka: 60,
    lubumbashi: 260,
  },
  
  zambiaReturnStations: {
    lakeNdola: {
      name: 'LAKE NDOLA',
      liters: 50,
    },
    lakeKapiri: {
      name: 'LAKE KAPIRI',
      liters: 350,
    },
    total: 400,
  },
  
  loadingPoints: {
    darYard: 'DAR_YARD',
    kisarawe: 'KISARAWE',
    darStation: 'DAR_STATION',
  },
  
  fuelStations: [
    {
      id: 'lake_ndola',
      name: 'LAKE NDOLA',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'lake_kapiri',
      name: 'LAKE KAPIRI',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'lake_chilabombwe',
      name: 'LAKE CHILABOMBWE',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'cash',
      name: 'CASH',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'tcc',
      name: 'TCC',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'zhanfei',
      name: 'ZHANFEI',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'kamoa',
      name: 'KAMOA',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'comika',
      name: 'COMIKA',
      location: 'Zambia',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'tunduma_station',
      name: 'TUNDUMA STATION',
      location: 'Tanzania',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'mbeya_station',
      name: 'MBEYA STATION',
      location: 'Tanzania',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'mbeya_return_station',
      name: 'MBEYA RETURN STATION',
      location: 'Tanzania',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'moro_station',
      name: 'MORO STATION',
      location: 'Tanzania',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'tanga_station',
      name: 'TANGA STATION',
      location: 'Tanzania',
      pricePerLiter: 1450,
      isActive: true,
    },
    {
      id: 'dar_station',
      name: 'DAR STATION',
      location: 'Dar es Salaam',
      pricePerLiter: 1450,
      isActive: true,
    },
  ],
  
  defaultFuelPrice: 1450,
  
  // Route-based total liters based on destination
  routeTotalLiters: {
    'LUBUMBASHI': 2100,
    'LUBUMBASH': 2100,
    'LIKASI': 2200,
    'KAMBOVE': 2220,
    'FUNGURUME': 2300,
    'KINSANFU': 2360,
    'LAMIKAL': 2360,
    'KOLWEZI': 2400,
    'KAMOA': 2440,
    'KALONGWE': 2440,
    'LUSAKA': 1900,
  },
  
  // Loading point extras and destination extras removed - now managed via database
};

/**
 * Configuration service to manage fuel system settings
 */
export class FuelConfigService {
  private static CONFIG_KEY = 'fuel_system_config';
  
  /**
   * Load configuration from localStorage or return defaults
   */
  static loadConfig(): FuelConfig {
    try {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (stored) {
        return { ...DEFAULT_FUEL_CONFIG, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load fuel config:', error);
    }
    return DEFAULT_FUEL_CONFIG;
  }
  
  /**
   * Sync truck batches from backend and update localStorage
   */
  static async syncTruckBatchesFromBackend(): Promise<void> {
    try {
      const backendBatches = await adminAPI.getTruckBatches();
      
      // Transform backend format (objects) to frontend format (strings)
      const config = this.loadConfig();
      config.truckBatches = {
        batch_100: backendBatches.batch_100.map(t => t.truckSuffix),
        batch_80: backendBatches.batch_80.map(t => t.truckSuffix),
        batch_60: backendBatches.batch_60.map(t => t.truckSuffix),
      };
      
      this.saveConfig(config);
      console.log('✓ Truck batches synced from backend');
    } catch (error) {
      console.warn('Failed to sync truck batches from backend:', error);
    }
  }
  
  /**
   * Sync routes from database and update localStorage
   */
  static async syncRoutesFromDatabase(): Promise<void> {
    try {
      const dbRoutes = await configService.getRoutes();
      
      // Build routeTotalLiters from database routes
      const config = this.loadConfig();
      config.routeTotalLiters = {};
      
      dbRoutes.forEach(route => {
        if (route.isActive && route.destination) {
          const key = route.destination.toUpperCase();
          config.routeTotalLiters[key] = route.defaultTotalLiters;
          
          // Also add aliases if they exist
          if (route.destinationAliases && route.destinationAliases.length > 0) {
            route.destinationAliases.forEach(alias => {
              const aliasKey = alias.toUpperCase();
              config.routeTotalLiters[aliasKey] = route.defaultTotalLiters;
            });
          }
        }
      });
      
      this.saveConfig(config);
      console.log('✓ Routes synced from database:', Object.keys(config.routeTotalLiters).length, 'routes');
    } catch (error) {
      console.warn('Failed to sync routes from database:', error);
    }
  }
  
  /**
   * Save configuration to localStorage
   */
  static saveConfig(config: Partial<FuelConfig>): void {
    try {
      const currentConfig = this.loadConfig();
      const updatedConfig = { ...currentConfig, ...config };
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(updatedConfig));
    } catch (error) {
      console.error('Failed to save fuel config:', error);
      throw error;
    }
  }
  
  /**
   * Reset configuration to defaults
   */
  static resetConfig(): void {
    try {
      localStorage.removeItem(this.CONFIG_KEY);
    } catch (error) {
      console.error('Failed to reset fuel config:', error);
    }
  }
  
  /**
   * Get truck extra fuel allocation based on truck number with detailed match information
   * Now supports destination-based rules that override batch defaults
   */
  static getExtraFuel(
    truckNo: string, 
    destination?: string,
    config?: FuelConfig
  ): { 
    extraFuel: number; 
    matched: boolean; 
    batchName?: string;
    truckSuffix: string;
    suggestions?: string[];
    destinationOverride?: boolean;
  } {
    const cfg = config || this.loadConfig();
    const truckSuffix = truckNo.toLowerCase().split(' ').pop() || '';
    
    if (!truckSuffix) {
      return { 
        extraFuel: 0, 
        matched: false, 
        truckSuffix: '' 
      };
    }
    
    // Determine which batch this truck belongs to
    let batchName: 'batch_100' | 'batch_80' | 'batch_60' | undefined;
    let defaultExtraFuel = 0;
    
    if (cfg.truckBatches.batch_100.includes(truckSuffix)) {
      batchName = 'batch_100';
      defaultExtraFuel = 100;
    } else if (cfg.truckBatches.batch_80.includes(truckSuffix)) {
      batchName = 'batch_80';
      defaultExtraFuel = 80;
    } else if (cfg.truckBatches.batch_60.includes(truckSuffix)) {
      batchName = 'batch_60';
      defaultExtraFuel = 60;
    }
    
    // If truck is in a batch and destination is provided, check for destination rules
    if (batchName && destination && cfg.batchDestinationRules) {
      const batchRules = cfg.batchDestinationRules[batchName];
      if (batchRules && batchRules[truckSuffix]) {
        const rules = batchRules[truckSuffix];
        const normalizedDest = destination.toLowerCase().trim();
        
        // Find matching rule (case-insensitive partial match)
        const matchingRule = rules.find(rule => {
          const ruleDestination = rule.destination.toLowerCase().trim();
          return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
        });
        
        if (matchingRule) {
          return {
            extraFuel: matchingRule.extraLiters,
            matched: true,
            batchName,
            truckSuffix,
            destinationOverride: true
          };
        }
      }
    }
    
    // Return batch default if matched, or 0 if not configured
    if (batchName) {
      return { 
        extraFuel: defaultExtraFuel, 
        matched: true, 
        batchName,
        truckSuffix 
      };
    }
    
    // No match found - return 0 to force manual configuration
    // Admin will be notified to configure this truck batch
    
    return { 
      extraFuel: 0, 
      matched: false, 
      truckSuffix,
      suggestions: undefined
    };
  }
  
  /**
   * Get extra fuel (simplified - for backward compatibility)
   * When destination is not needed, use this method
   */
  static getExtraFuelSimple(truckNo: string, config?: FuelConfig): number {
    const result = this.getExtraFuel(truckNo, undefined, config);
    return result.extraFuel;
  }
  
  /**
   * Get fuel station by ID
   */
  static getStation(stationId: string, config?: FuelConfig): FuelStation | undefined {
    const cfg = config || this.loadConfig();
    return cfg.fuelStations.find(s => s.id === stationId);
  }
  
  /**
   * Get all active fuel stations
   */
  static getActiveStations(config?: FuelConfig): FuelStation[] {
    const cfg = config || this.loadConfig();
    return cfg.fuelStations.filter(s => s.isActive);
  }
  
  /**
   * Calculate Levenshtein distance for fuzzy string matching
   * Used to match location names even with spelling variations
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Check if two location names match with fuzzy logic
   * Matches if the strings are at least 50% similar (allowing for typos/variations)
   */
  private static isFuzzyMatch(input: string, target: string, threshold: number = 0.5): boolean {
    const inputClean = input.toUpperCase().trim();
    const targetClean = target.toUpperCase().trim();
    
    // Exact match
    if (inputClean === targetClean) return true;
    
    // Contains match
    if (inputClean.includes(targetClean) || targetClean.includes(inputClean)) return true;
    
    // Levenshtein distance match (allow variations)
    const maxLength = Math.max(inputClean.length, targetClean.length);
    const distance = this.levenshteinDistance(inputClean, targetClean);
    const similarity = 1 - (distance / maxLength);
    
    return similarity >= threshold;
  }

  /**
   * DEPRECATED: Loading point and destination extras are now managed via database
   * Use RouteConfig with destination-specific rules configured in admin panel
   * These methods kept for backward compatibility but return 0
   */
  static getLoadingPointExtraFuel(loadingPoint: string, config?: FuelConfig): number {
    console.warn('⚠️ getLoadingPointExtraFuel is deprecated. Configure extras via admin panel RouteConfig.');
    return 0; // All extras now managed via database
  }

  static getDestinationExtraFuel(destination: string, config?: FuelConfig): number {
    console.warn('⚠️ getDestinationExtraFuel is deprecated. Configure extras via admin panel RouteConfig.');
    return 0; // All extras now managed via database
  }

  /**
   * Get total liters for a route (origin + destination) with smart matching from database
   * @param routeType - Optional filter by 'IMPORT' or 'EXPORT' route type
   */
  static async getTotalLitersByRoute(
    origin: string,
    destination: string,
    routeType?: 'IMPORT' | 'EXPORT'
  ): Promise<{ 
    liters: number; 
    matched: boolean; 
    matchType: 'exact' | 'partial' | 'fuzzy' | 'default';
    matchedRoute?: string;
    suggestions?: Array<{ route: string; liters: number; similarity: number }>;
  }> {
    try {
      // Fetch routes from database (optionally filtered by routeType)
      const dbRoutes = await configService.getRoutes(routeType);
      const orig = origin?.toUpperCase().trim() || '';
      const dest = destination?.toUpperCase().trim() || '';
      
      if (!dest) {
        return { 
          liters: 2200, 
          matched: false, 
          matchType: 'default',
          suggestions: [] 
        };
      }
      
      // 1. Exact match: origin AND destination match
      if (orig) {
        const exactMatch = dbRoutes.find(route => 
          route.isActive &&
          route.origin?.toUpperCase().trim() === orig &&
          (route.destination.toUpperCase().trim() === dest ||
           route.destinationAliases?.some(alias => alias.toUpperCase().trim() === dest))
        );
        
        if (exactMatch) {
          return { 
            liters: exactMatch.defaultTotalLiters, 
            matched: true, 
            matchType: 'exact',
            matchedRoute: `${exactMatch.origin} → ${exactMatch.destination}` 
          };
        }
      }
      
      // 2. Destination-only match (if origin not provided or no origin match)
      const destMatch = dbRoutes.find(route =>
        route.isActive &&
        (route.destination.toUpperCase().trim() === dest ||
         route.destinationAliases?.some(alias => alias.toUpperCase().trim() === dest))
      );
      
      if (destMatch) {
        return { 
          liters: destMatch.defaultTotalLiters, 
          matched: true, 
          matchType: orig ? 'partial' : 'exact',
          matchedRoute: destMatch.destination 
        };
      }
      
      // 3. Partial match: destination contains route name
      const partialMatch = dbRoutes.find(route =>
        route.isActive &&
        dest.includes(route.destination.toUpperCase().trim())
      );
      
      if (partialMatch) {
        return { 
          liters: partialMatch.defaultTotalLiters, 
          matched: true, 
          matchType: 'partial',
          matchedRoute: partialMatch.destination 
        };
      }
      
      // 4. Fuzzy match with suggestions
      const suggestions: Array<{ route: string; liters: number; similarity: number }> = [];
      
      for (const route of dbRoutes) {
        if (!route.isActive) continue;
        
        const similarity = this.calculateSimilarity(dest, route.destination.toUpperCase());
        if (similarity >= 0.6) {
          suggestions.push({
            route: route.destination,
            liters: route.defaultTotalLiters,
            similarity
          });
        }
      }
      
      suggestions.sort((a, b) => b.similarity - a.similarity);
      
      if (suggestions.length > 0) {
        return {
          liters: suggestions[0].liters,
          matched: true,
          matchType: 'fuzzy',
          matchedRoute: suggestions[0].route,
          suggestions: suggestions.slice(0, 3)
        };
      }
      
      // 5. Default fallback
      return { 
        liters: 2200, 
        matched: false, 
        matchType: 'default',
        suggestions: [] 
      };
    } catch (error) {
      console.error('Failed to fetch routes for matching:', error);
      // Fallback to localStorage/hardcoded method
      return this.getTotalLitersByDestination(destination);
    }
  }

  /**
   * Get total liters allocation based on destination with detailed match information
   * Legacy method using localStorage - use getTotalLitersByRoute() for database routes
   * Returns object with liters and match details
   */
  static getTotalLitersByDestination(
    destination: string, 
    config?: FuelConfig
  ): { 
    liters: number; 
    matched: boolean; 
    matchType: 'exact' | 'partial' | 'fuzzy' | 'default';
    matchedRoute?: string;
    suggestions?: Array<{ route: string; liters: number; similarity: number }>;
  } {
    const cfg = config || this.loadConfig();
    const dest = destination?.toUpperCase().trim() || '';
    
    if (!dest) {
      return { 
        liters: 2200, 
        matched: false, 
        matchType: 'default',
        suggestions: [] 
      };
    }
    
    // Direct exact match
    if (cfg.routeTotalLiters[dest]) {
      return { 
        liters: cfg.routeTotalLiters[dest], 
        matched: true, 
        matchType: 'exact',
        matchedRoute: dest 
      };
    }
    
    // Partial match - check if destination contains any of the route names
    for (const [route, liters] of Object.entries(cfg.routeTotalLiters)) {
      if (dest.includes(route)) {
        return { 
          liters, 
          matched: true, 
          matchType: 'partial',
          matchedRoute: route 
        };
      }
    }
    
    // Fuzzy match - find similar routes using Levenshtein distance
    const suggestions: Array<{ route: string; liters: number; similarity: number }> = [];
    
    for (const [route, liters] of Object.entries(cfg.routeTotalLiters)) {
      const similarity = this.calculateSimilarity(dest, route);
      if (similarity >= 0.6) { // 60% similarity threshold
        suggestions.push({ route, liters, similarity });
      }
    }
    
    // Sort suggestions by similarity (highest first)
    suggestions.sort((a, b) => b.similarity - a.similarity);
    
    // If we have a very close fuzzy match (80%+), use it
    if (suggestions.length > 0 && suggestions[0].similarity >= 0.8) {
      return {
        liters: suggestions[0].liters,
        matched: true,
        matchType: 'fuzzy',
        matchedRoute: suggestions[0].route,
        suggestions
      };
    }
    
    // No match found - return default with suggestions
    return { 
      liters: 2200, 
      matched: false, 
      matchType: 'default',
      suggestions: suggestions.slice(0, 3) // Top 3 suggestions
    };
  }
  
  /**
   * Calculate similarity between two strings (0-1 scale)
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLength);
  }
  
  /**
   * Get total liters by destination (simplified - for backward compatibility)
   * Returns just the number of liters
   */
  static getTotalLitersSimple(destination: string, config?: FuelConfig): number {
    const result = this.getTotalLitersByDestination(destination, config);
    return result.liters;
  }
  
  /**
   * Add or update truck in a batch (localStorage + backend sync)
   */
  static async updateTruckBatch(
    truckSuffix: string, 
    batch: 100 | 80 | 60,
    config?: FuelConfig
  ): Promise<FuelConfig> {
    const cfg = config || this.loadConfig();
    const suffix = truckSuffix.toLowerCase();
    
    // Remove from all batches first
    cfg.truckBatches.batch_100 = cfg.truckBatches.batch_100.filter(t => t !== suffix);
    cfg.truckBatches.batch_80 = cfg.truckBatches.batch_80.filter(t => t !== suffix);
    cfg.truckBatches.batch_60 = cfg.truckBatches.batch_60.filter(t => t !== suffix);
    
    // Add to the specified batch
    if (batch === 100) {
      cfg.truckBatches.batch_100.push(suffix);
    } else if (batch === 80) {
      cfg.truckBatches.batch_80.push(suffix);
    } else {
      cfg.truckBatches.batch_60.push(suffix);
    }
    
    // Save to localStorage
    this.saveConfig(cfg);
    
    // Sync to backend
    try {
      await adminAPI.addTruckToBatch({ 
        truckSuffix: suffix, 
        extraLiters: batch 
      });
      console.log(`✓ Truck batch synced to backend: ${suffix} → ${batch}L`);
    } catch (error) {
      console.warn('Failed to sync truck batch to backend:', error);
      // Continue even if backend sync fails (localStorage is updated)
    }
    
    return cfg;
  }
  
  /**
   * Remove truck from all batches (localStorage + backend sync)
   */
  static async removeTruckFromBatches(truckSuffix: string, config?: FuelConfig): Promise<FuelConfig> {
    const cfg = config || this.loadConfig();
    const suffix = truckSuffix.toLowerCase();
    
    cfg.truckBatches.batch_100 = cfg.truckBatches.batch_100.filter(t => t !== suffix);
    cfg.truckBatches.batch_80 = cfg.truckBatches.batch_80.filter(t => t !== suffix);
    cfg.truckBatches.batch_60 = cfg.truckBatches.batch_60.filter(t => t !== suffix);
    
    // Save to localStorage
    this.saveConfig(cfg);
    
    // Sync to backend
    try {
      await adminAPI.removeTruckFromBatch(suffix);
      console.log(`✓ Truck removal synced to backend: ${suffix}`);
    } catch (error) {
      console.warn('Failed to sync truck removal to backend:', error);
      // Continue even if backend sync fails (localStorage is updated)
    }
    
    return cfg;
  }
  
  /**
   * Get all trucks in all batches
   */
  static getAllTruckBatches(config?: FuelConfig): {
    batch_100: string[];
    batch_80: string[];
    batch_60: string[];
  } {
    const cfg = config || this.loadConfig();
    return {
      batch_100: [...cfg.truckBatches.batch_100].sort(),
      batch_80: [...cfg.truckBatches.batch_80].sort(),
      batch_60: [...cfg.truckBatches.batch_60].sort(),
    };
  }
  
  /**
   * Update fuel station
   */
  static updateStation(station: FuelStation, config?: FuelConfig): FuelConfig {
    const cfg = config || this.loadConfig();
    const index = cfg.fuelStations.findIndex(s => s.id === station.id);
    
    if (index >= 0) {
      cfg.fuelStations[index] = station;
    } else {
      cfg.fuelStations.push(station);
    }
    
    return cfg;
  }
  
  /**
   * Add or update a route's total liters allocation
   */
  static addOrUpdateRoute(
    destination: string, 
    totalLiters: number, 
    config?: FuelConfig
  ): FuelConfig {
    const cfg = config || this.loadConfig();
    const dest = destination.toUpperCase().trim();
    
    cfg.routeTotalLiters[dest] = totalLiters;
    
    // Save to localStorage
    this.saveConfig(cfg);
    
    return cfg;
  }
  
  /**
   * Remove a route from configuration
   */
  static removeRoute(destination: string, config?: FuelConfig): FuelConfig {
    const cfg = config || this.loadConfig();
    const dest = destination.toUpperCase().trim();
    
    delete cfg.routeTotalLiters[dest];
    
    // Save to localStorage
    this.saveConfig(cfg);
    
    return cfg;
  }
  
  /**
   * Get all configured routes
   */
  static getAllRoutes(config?: FuelConfig): Array<{ destination: string; liters: number }> {
    const cfg = config || this.loadConfig();
    return Object.entries(cfg.routeTotalLiters)
      .map(([destination, liters]) => ({ destination, liters }))
      .sort((a, b) => a.destination.localeCompare(b.destination));
  }
}

export default FuelConfigService;
