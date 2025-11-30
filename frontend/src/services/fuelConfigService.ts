/**
 * Fuel System Configuration Types
 * Manage all configurable settings for fuel record calculations
 */

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
   * Get truck extra fuel allocation based on truck number
   */
  static getExtraFuel(truckNo: string, config?: FuelConfig): number {
    const cfg = config || this.loadConfig();
    const truckSuffix = truckNo.toLowerCase().split(' ').pop() || '';
    
    if (cfg.truckBatches.batch_100.includes(truckSuffix)) {
      return 100;
    } else if (cfg.truckBatches.batch_80.includes(truckSuffix)) {
      return 80;
    } else if (cfg.truckBatches.batch_60.includes(truckSuffix)) {
      return 60;
    }
    
    return 60; // Default
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
   * Get total liters allocation based on destination
   * Returns default 2200L if destination is not found
   */
  static getTotalLitersByDestination(destination: string, config?: FuelConfig): number {
    const cfg = config || this.loadConfig();
    const dest = destination?.toUpperCase().trim() || '';
    
    // Direct match
    if (cfg.routeTotalLiters[dest]) {
      return cfg.routeTotalLiters[dest];
    }
    
    // Partial match - check if destination contains any of the route names
    for (const [route, liters] of Object.entries(cfg.routeTotalLiters)) {
      if (dest.includes(route)) {
        return liters;
      }
    }
    
    // Default for unknown destinations (most common case)
    return 2200;
  }
  
  /**
   * Add or update truck in a batch
   */
  static updateTruckBatch(
    truckSuffix: string, 
    batch: 100 | 80 | 60,
    config?: FuelConfig
  ): FuelConfig {
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
    
    return cfg;
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
}

export default FuelConfigService;
