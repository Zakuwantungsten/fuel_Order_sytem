/**
 * Fuel System Configuration Types
 * Manage all configurable settings for fuel record calculations
 */

import { adminAPI } from './api';

export interface FuelConfig {
  // Truck batch configurations
  truckBatches: {
    batch_100: string[];
    batch_80: string[];
    batch_60: string[];
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
  
  // Special loading point extra fuel allocations (for return journeys)
  loadingPointExtraFuel: {
    kamoa: number;
    nmi: number;
    kalongwe: number;
  };
  
  // Special destination extra fuel (for return journeys)
  destinationExtraFuel: {
    moshi: number; // Msa
  };
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
  
  // Special loading point extra fuel allocations (for return journeys)
  loadingPointExtraFuel: {
    kamoa: 40,      // Extra 40L when loading from Kamoa
    nmi: 20,        // Extra 20L when loading from NMI
    kalongwe: 60,   // Extra 60L when loading from Kalongwe
  },
  
  // Special destination extra fuel (for return journeys)
  destinationExtraFuel: {
    moshi: 170,     // Extra 170L when final destination is Moshi (Msa)
  },
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
   */
  static getExtraFuel(
    truckNo: string, 
    config?: FuelConfig
  ): { 
    extraFuel: number; 
    matched: boolean; 
    batchName?: string;
    truckSuffix: string;
    suggestions?: string[];
  } {
    const cfg = config || this.loadConfig();
    const truckSuffix = truckNo.toLowerCase().split(' ').pop() || '';
    
    if (!truckSuffix) {
      return { 
        extraFuel: 60, 
        matched: false, 
        truckSuffix: '' 
      };
    }
    
    if (cfg.truckBatches.batch_100.includes(truckSuffix)) {
      return { 
        extraFuel: 100, 
        matched: true, 
        batchName: 'batch_100',
        truckSuffix 
      };
    } else if (cfg.truckBatches.batch_80.includes(truckSuffix)) {
      return { 
        extraFuel: 80, 
        matched: true, 
        batchName: 'batch_80',
        truckSuffix 
      };
    } else if (cfg.truckBatches.batch_60.includes(truckSuffix)) {
      return { 
        extraFuel: 60, 
        matched: true, 
        batchName: 'batch_60',
        truckSuffix 
      };
    }
    
    // No match found - find similar truck suffixes and return default
    const allSuffixes = [
      ...cfg.truckBatches.batch_100,
      ...cfg.truckBatches.batch_80,
      ...cfg.truckBatches.batch_60
    ];
    const suggestions = this.findSimilarStrings(truckSuffix, allSuffixes, 0.5).slice(0, 3);
    
    return { 
      extraFuel: 60, 
      matched: false, 
      truckSuffix,
      suggestions: suggestions.length > 0 ? suggestions : undefined
    };
  }
  
  /**
   * Get extra fuel (simplified - for backward compatibility)
   */
  static getExtraFuelSimple(truckNo: string, config?: FuelConfig): number {
    const result = this.getExtraFuel(truckNo, config);
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
   * Get extra fuel for special loading points (return journey)
   * Matches location names with fuzzy logic to handle spelling variations
   */
  static getLoadingPointExtraFuel(loadingPoint: string, config?: FuelConfig): number {
    const cfg = config || this.loadConfig();
    const location = loadingPoint?.toUpperCase().trim() || '';
    
    if (!location) return 0;
    
    // Check each special loading point with fuzzy matching
    if (this.isFuzzyMatch(location, 'KAMOA')) {
      return cfg.loadingPointExtraFuel.kamoa;
    }
    
    if (this.isFuzzyMatch(location, 'NMI')) {
      return cfg.loadingPointExtraFuel.nmi;
    }
    
    if (this.isFuzzyMatch(location, 'KALONGWE')) {
      return cfg.loadingPointExtraFuel.kalongwe;
    }
    
    return 0;
  }

  /**
   * Get extra fuel for special destinations (return journey)
   * Matches destination names with fuzzy logic to handle spelling variations
   */
  static getDestinationExtraFuel(destination: string, config?: FuelConfig): number {
    const cfg = config || this.loadConfig();
    const dest = destination?.toUpperCase().trim() || '';
    
    if (!dest) return 0;
    
    // Check for Moshi/Msa with fuzzy matching
    if (this.isFuzzyMatch(dest, 'MOSHI') || this.isFuzzyMatch(dest, 'MSA')) {
      return cfg.destinationExtraFuel.moshi;
    }
    
    return 0;
  }

  /**
   * Get total liters allocation based on destination with detailed match information
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
