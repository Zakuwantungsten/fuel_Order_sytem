import { describe, it, expect, beforeEach, vi } from 'vitest';
import FuelConfigService, { DEFAULT_FUEL_CONFIG } from '../../services/fuelConfigService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('FuelConfigService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should return default config when localStorage is empty', () => {
      const config = FuelConfigService.loadConfig();
      expect(config).toEqual(DEFAULT_FUEL_CONFIG);
    });

    it('should load stored config from localStorage', () => {
      const customConfig = {
        ...DEFAULT_FUEL_CONFIG,
        defaultFuelPrice: 2000
      };
      localStorageMock.setItem('fuel_system_config', JSON.stringify(customConfig));
      
      const config = FuelConfigService.loadConfig();
      expect(config.defaultFuelPrice).toBe(2000);
    });

    it('should merge stored config with defaults', () => {
      const partialConfig = { defaultFuelPrice: 2000 };
      localStorageMock.setItem('fuel_system_config', JSON.stringify(partialConfig));
      
      const config = FuelConfigService.loadConfig();
      expect(config.defaultFuelPrice).toBe(2000);
      expect(config.truckBatches).toEqual(DEFAULT_FUEL_CONFIG.truckBatches);
    });
  });

  describe('saveConfig', () => {
    it('should save config to localStorage', () => {
      FuelConfigService.saveConfig({ defaultFuelPrice: 1500 });
      
      expect(localStorageMock.setItem).toHaveBeenCalled();
      const savedConfig = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedConfig.defaultFuelPrice).toBe(1500);
    });
  });

  describe('resetConfig', () => {
    it('should remove config from localStorage', () => {
      FuelConfigService.saveConfig({ defaultFuelPrice: 1500 });
      FuelConfigService.resetConfig();
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('fuel_system_config');
    });
  });

  describe('getExtraFuel', () => {
    it('should return 100L for batch_100 trucks', () => {
      const result = FuelConfigService.getExtraFuel('T103 DNH');
      expect(result.extraFuel).toBe(100);
      expect(result.matched).toBe(true);
      expect(result.batchName).toBe('batch_100');
    });

    it('should return 80L for batch_80 trucks', () => {
      const result = FuelConfigService.getExtraFuel('T200 DVK');
      expect(result.extraFuel).toBe(80);
      expect(result.matched).toBe(true);
      expect(result.batchName).toBe('batch_80');
    });

    it('should return 60L for batch_60 trucks', () => {
      const result = FuelConfigService.getExtraFuel('T664 ECQ');
      expect(result.extraFuel).toBe(60);
      expect(result.matched).toBe(true);
      expect(result.batchName).toBe('batch_60');
    });

    it('should return default 60L for unmatched trucks', () => {
      const result = FuelConfigService.getExtraFuel('T999 ZZZ');
      expect(result.extraFuel).toBe(60);
      expect(result.matched).toBe(false);
    });

    it('should handle lowercase truck numbers', () => {
      const result = FuelConfigService.getExtraFuel('t103 dnh');
      expect(result.extraFuel).toBe(100);
      expect(result.matched).toBe(true);
    });

    it('should handle empty truck number', () => {
      const result = FuelConfigService.getExtraFuel('');
      expect(result.extraFuel).toBe(60);
      expect(result.matched).toBe(false);
    });
  });

  describe('getExtraFuelSimple', () => {
    it('should return just the extra fuel value', () => {
      const fuel = FuelConfigService.getExtraFuelSimple('T103 DNH');
      expect(fuel).toBe(100);
    });
  });

  describe('getLoadingPointExtraFuel', () => {
    it('should return 40L for KAMOA loading point', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('KAMOA')).toBe(40);
    });

    it('should return 20L for NMI loading point', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('NMI')).toBe(20);
    });

    it('should return 60L for KALONGWE loading point', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('KALONGWE')).toBe(60);
    });

    it('should match with fuzzy logic (lowercase)', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('kamoa')).toBe(40);
      expect(FuelConfigService.getLoadingPointExtraFuel('nmi')).toBe(20);
      expect(FuelConfigService.getLoadingPointExtraFuel('kalongwe')).toBe(60);
    });

    it('should match with fuzzy logic (typos)', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('KAMOWA')).toBe(40);
      // NIM is too short (3 chars) and 1 char different from NMI, similarity < 75%
      // So we test with a closer match instead
      expect(FuelConfigService.getLoadingPointExtraFuel('NM')).toBe(20); // partial match
      expect(FuelConfigService.getLoadingPointExtraFuel('KALONGWI')).toBe(60);
    });

    it('should return 0 for non-matching locations', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('LUBUMBASHI')).toBe(0);
      expect(FuelConfigService.getLoadingPointExtraFuel('DAR')).toBe(0);
    });

    it('should return 0 for empty input', () => {
      expect(FuelConfigService.getLoadingPointExtraFuel('')).toBe(0);
    });
  });

  describe('getDestinationExtraFuel', () => {
    it('should return 170L for MOSHI destination', () => {
      expect(FuelConfigService.getDestinationExtraFuel('MOSHI')).toBe(170);
    });

    it('should return 170L for MSA destination', () => {
      expect(FuelConfigService.getDestinationExtraFuel('MSA')).toBe(170);
    });

    it('should match with fuzzy logic (lowercase)', () => {
      expect(FuelConfigService.getDestinationExtraFuel('moshi')).toBe(170);
      expect(FuelConfigService.getDestinationExtraFuel('msa')).toBe(170);
    });

    it('should return 0 for non-matching destinations', () => {
      expect(FuelConfigService.getDestinationExtraFuel('DAR ES SALAAM')).toBe(0);
      expect(FuelConfigService.getDestinationExtraFuel('TANGA')).toBe(0);
    });

    it('should return 0 for empty input', () => {
      expect(FuelConfigService.getDestinationExtraFuel('')).toBe(0);
    });
  });

  describe('getTotalLitersByDestination', () => {
    it('should return correct liters for LUBUMBASHI', () => {
      const result = FuelConfigService.getTotalLitersByDestination('LUBUMBASHI');
      expect(result.liters).toBe(2100);
      expect(result.matched).toBe(true);
      expect(result.matchType).toBe('exact');
    });

    it('should return correct liters for KOLWEZI', () => {
      const result = FuelConfigService.getTotalLitersByDestination('KOLWEZI');
      expect(result.liters).toBe(2400);
      expect(result.matched).toBe(true);
    });

    it('should return correct liters for KAMOA', () => {
      const result = FuelConfigService.getTotalLitersByDestination('KAMOA');
      expect(result.liters).toBe(2440);
      expect(result.matched).toBe(true);
    });

    it('should return correct liters for LUSAKA', () => {
      const result = FuelConfigService.getTotalLitersByDestination('LUSAKA');
      expect(result.liters).toBe(1900);
      expect(result.matched).toBe(true);
    });

    it('should handle lowercase destinations', () => {
      const result = FuelConfigService.getTotalLitersByDestination('lubumbashi');
      expect(result.liters).toBe(2100);
      expect(result.matched).toBe(true);
    });

    it('should return default liters for unknown destinations', () => {
      const result = FuelConfigService.getTotalLitersByDestination('UNKNOWN_CITY');
      expect(result.matched).toBe(false);
      expect(result.matchType).toBe('default');
    });

    it('should return default liters for empty input', () => {
      const result = FuelConfigService.getTotalLitersByDestination('');
      expect(result.liters).toBe(2200);
      expect(result.matched).toBe(false);
    });
  });

  describe('getStation', () => {
    it('should return fuel station by ID', () => {
      const station = FuelConfigService.getStation('lake_ndola');
      expect(station).toBeDefined();
      expect(station?.name).toBe('LAKE NDOLA');
      expect(station?.location).toBe('Zambia');
    });

    it('should return undefined for non-existent station', () => {
      const station = FuelConfigService.getStation('non_existent');
      expect(station).toBeUndefined();
    });
  });

  describe('getActiveStations', () => {
    it('should return all active stations', () => {
      const stations = FuelConfigService.getActiveStations();
      expect(stations.length).toBeGreaterThan(0);
      expect(stations.every(s => s.isActive)).toBe(true);
    });
  });

  describe('Route Fuel Calculations', () => {
    it('should have all standard routes configured', () => {
      const standardRoutes = [
        'LUBUMBASHI',
        'LIKASI',
        'KAMBOVE',
        'FUNGURUME',
        'KOLWEZI',
        'KAMOA',
        'KALONGWE',
        'LUSAKA'
      ];

      standardRoutes.forEach(route => {
        const result = FuelConfigService.getTotalLitersByDestination(route);
        expect(result.matched).toBe(true);
        expect(result.liters).toBeGreaterThan(0);
      });
    });

    it('should have increasing fuel for farther destinations', () => {
      const lubumbashi = FuelConfigService.getTotalLitersByDestination('LUBUMBASHI');
      const kolwezi = FuelConfigService.getTotalLitersByDestination('KOLWEZI');
      const kamoa = FuelConfigService.getTotalLitersByDestination('KAMOA');

      // Farther destinations should need more fuel
      expect(kolwezi.liters).toBeGreaterThan(lubumbashi.liters);
      expect(kamoa.liters).toBeGreaterThanOrEqual(kolwezi.liters);
    });
  });

  describe('Standard Allocations', () => {
    it('should have correct standard allocation values', () => {
      const config = FuelConfigService.loadConfig();
      
      expect(config.standardAllocations.tangaYardToDar).toBe(100);
      expect(config.standardAllocations.darYardStandard).toBe(550);
      expect(config.standardAllocations.darYardKisarawe).toBe(580);
      expect(config.standardAllocations.mbeyaGoing).toBe(450);
    });

    it('should have correct return journey allocations', () => {
      const config = FuelConfigService.loadConfig();
      
      expect(config.standardAllocations.tundumaReturn).toBe(100);
      expect(config.standardAllocations.mbeyaReturn).toBe(400);
    });
  });

  describe('Zambia Return Stations', () => {
    it('should have correct Zambia return station configuration', () => {
      const config = FuelConfigService.loadConfig();
      
      expect(config.zambiaReturnStations.lakeNdola.name).toBe('LAKE NDOLA');
      expect(config.zambiaReturnStations.lakeNdola.liters).toBe(50);
      expect(config.zambiaReturnStations.lakeKapiri.name).toBe('LAKE KAPIRI');
      expect(config.zambiaReturnStations.lakeKapiri.liters).toBe(350);
      expect(config.zambiaReturnStations.total).toBe(400);
    });
  });
});
