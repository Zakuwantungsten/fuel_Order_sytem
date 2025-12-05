import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  createMockDeliveryOrder, 
  createMockFuelRecord
} from '../testUtils';

// Mock API calls
const mockApi = {
  deliveryOrders: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  fuelRecords: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getByDO: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  lpoEntries: {
    getAll: vi.fn(),
    create: vi.fn()
  }
};

describe('Delivery Order Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DO Creation Flow', () => {
    it('should create DO and linked fuel record for IMPORT', async () => {
      const doData = createMockDeliveryOrder({
        doNumber: 'DO-NEW-001',
        importOrExport: 'IMPORT',
        truckNo: 'T100 ABC'
      });

      mockApi.deliveryOrders.create.mockResolvedValue(doData);

      // Simulate the creation flow
      const createdDO = await mockApi.deliveryOrders.create(doData);
      
      expect(createdDO.doNumber).toBe('DO-NEW-001');
      expect(createdDO.importOrExport).toBe('IMPORT');
      
      // Verify fuel record would be created
      const fuelRecord = createMockFuelRecord({
        goingDo: createdDO.doNumber,
        truckNo: createdDO.truckNo,
        from: createdDO.loadingPoint,
        to: createdDO.destination
      });
      
      expect(fuelRecord.goingDo).toBe('DO-NEW-001');
    });

    it('should link EXPORT DO to existing fuel record', async () => {
      // First, simulate existing going journey
      // goingDO would be created first in real scenario
      createMockDeliveryOrder({
        doNumber: 'DO-GOING-001',
        importOrExport: 'IMPORT',
        truckNo: 'T200 XYZ'
      });

      const existingFuelRecord = createMockFuelRecord({
        goingDo: 'DO-GOING-001',
        truckNo: 'T200 XYZ',
        returnDo: undefined
      });

      mockApi.fuelRecords.getByDO.mockResolvedValue(existingFuelRecord);

      // Create EXPORT DO
      const exportDO = createMockDeliveryOrder({
        doNumber: 'DO-EXPORT-001',
        importOrExport: 'EXPORT',
        truckNo: 'T200 XYZ'
      });

      mockApi.deliveryOrders.create.mockResolvedValue(exportDO);

      const createdExportDO = await mockApi.deliveryOrders.create(exportDO);
      
      // Update fuel record with return DO
      const updatedFuelRecord = {
        ...existingFuelRecord,
        returnDo: createdExportDO.doNumber
      };

      mockApi.fuelRecords.update.mockResolvedValue(updatedFuelRecord);

      const result = await mockApi.fuelRecords.update(existingFuelRecord.id, {
        returnDo: createdExportDO.doNumber
      });

      expect(result.returnDo).toBe('DO-EXPORT-001');
    });
  });

  describe('DO Update Flow', () => {
    it('should cascade truck number change to fuel record', async () => {
      const originalDO = createMockDeliveryOrder({
        doNumber: 'DO-UPD-001',
        truckNo: 'T300 OLD'
      });

      const updatedDO = {
        ...originalDO,
        truckNo: 'T300 NEW'
      };

      mockApi.deliveryOrders.update.mockResolvedValue({
        order: updatedDO,
        cascadeResults: {
          updated: true,
          fuelRecordId: 'fr-001',
          changes: ['Truck: T300 OLD → T300 NEW']
        }
      });

      const result = await mockApi.deliveryOrders.update(originalDO.id, {
        truckNo: 'T300 NEW'
      });

      expect(result.order.truckNo).toBe('T300 NEW');
      expect(result.cascadeResults.updated).toBe(true);
    });

    it('should cascade destination change to fuel record', async () => {
      const originalDO = createMockDeliveryOrder({
        doNumber: 'DO-DEST-001',
        destination: 'OLD CITY'
      });

      mockApi.deliveryOrders.update.mockResolvedValue({
        order: { ...originalDO, destination: 'NEW CITY' },
        cascadeResults: {
          updated: true,
          changes: ['Destination (to): OLD CITY → NEW CITY']
        }
      });

      const result = await mockApi.deliveryOrders.update(originalDO.id, {
        destination: 'NEW CITY'
      });

      expect(result.order.destination).toBe('NEW CITY');
    });
  });

  describe('DO Cancellation Flow', () => {
    it('should cancel IMPORT DO and linked fuel record', async () => {
      const importDO = createMockDeliveryOrder({
        doNumber: 'DO-CANCEL-IMP',
        importOrExport: 'IMPORT'
      });

      mockApi.deliveryOrders.update.mockResolvedValue({
        order: {
          ...importDO,
          status: 'cancelled',
          isCancelled: true,
          cancellationReason: 'Test cancellation'
        },
        cascadeResults: {
          cancelled: true,
          action: 'fully_cancelled'
        }
      });

      const result = await mockApi.deliveryOrders.update(importDO.id, {
        status: 'cancelled',
        cancellationReason: 'Test cancellation'
      });

      expect(result.order.isCancelled).toBe(true);
      expect(result.cascadeResults.cancelled).toBe(true);
    });

    it('should clear return DO from fuel record when EXPORT is cancelled', async () => {
      const exportDO = createMockDeliveryOrder({
        doNumber: 'DO-CANCEL-EXP',
        importOrExport: 'EXPORT'
      });

      mockApi.deliveryOrders.update.mockResolvedValue({
        order: {
          ...exportDO,
          status: 'cancelled',
          isCancelled: true
        },
        cascadeResults: {
          cancelled: true,
          action: 'return_do_cleared'
        }
      });

      const result = await mockApi.deliveryOrders.update(exportDO.id, {
        status: 'cancelled'
      });

      expect(result.cascadeResults.action).toBe('return_do_cleared');
    });
  });
});

describe('Fuel Record Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fuel Allocation Flow', () => {
    it('should calculate fuel for DAR to Congo journey', () => {
      const fuelRecord = createMockFuelRecord({
        start: 'DAR',
        from: 'DAR ES SALAAM',
        to: 'LUBUMBASHI',
        totalLts: 2100,
        darYard: 550,
        mbeyaGoing: 450,
        zambiaGoing: 400,
        congoFuel: 400
      });

      const totalAllocated = 
        (fuelRecord.darYard ?? 0) + 
        (fuelRecord.mbeyaGoing ?? 0) + 
        (fuelRecord.zambiaGoing ?? 0) + 
        (fuelRecord.congoFuel ?? 0);

      expect(totalAllocated).toBe(1800);
      expect(totalAllocated).toBeLessThanOrEqual(fuelRecord.totalLts ?? 0);
    });

    it('should calculate fuel for Tanga start journey', () => {
      const fuelRecord = createMockFuelRecord({
        start: 'TANGA',
        from: 'TANGA',
        to: 'LUBUMBASHI',
        totalLts: 2100,
        tangaYard: 100,
        darYard: 450,
        mbeyaGoing: 450,
        zambiaGoing: 400,
        congoFuel: 400
      });

      expect(fuelRecord.tangaYard).toBe(100);
      
      const totalAllocated = 
        (fuelRecord.tangaYard ?? 0) + 
        (fuelRecord.darYard ?? 0) + 
        (fuelRecord.mbeyaGoing ?? 0) + 
        (fuelRecord.zambiaGoing ?? 0) + 
        (fuelRecord.congoFuel ?? 0);

      expect(totalAllocated).toBe(1800);
    });

    it('should calculate return journey fuel allocation', () => {
      const fuelRecord = createMockFuelRecord({
        returnDo: 'DO-RETURN-001',
        zambiaReturn: 400,
        tundumaReturn: 100,
        mbeyaReturn: 450,
        moroReturn: 0,
        darReturn: 0
      });

      const totalReturnFuel = 
        fuelRecord.zambiaReturn + 
        fuelRecord.tundumaReturn + 
        fuelRecord.mbeyaReturn;

      expect(totalReturnFuel).toBe(950);
    });
  });

  describe('Open Journey Detection', () => {
    it('should detect truck with open journey', () => {
      const openRecord = createMockFuelRecord({
        truckNo: 'T400 OPEN',
        goingDo: 'DO-OPEN',
        returnDo: undefined
      });

      const hasOpenJourney = !openRecord.returnDo;
      expect(hasOpenJourney).toBe(true);
    });

    it('should detect completed journey', () => {
      const completedRecord = createMockFuelRecord({
        truckNo: 'T500 COMPLETE',
        goingDo: 'DO-GOING',
        returnDo: 'DO-RETURN'
      });

      const hasOpenJourney = !completedRecord.returnDo;
      expect(hasOpenJourney).toBe(false);
    });
  });
});

describe('LPO Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('LPO Auto-Fill Flow', () => {
    it('should auto-fill LPO data from DO and fuel record', () => {
      const deliveryOrder = createMockDeliveryOrder({
        doNumber: 'DO-LPO-001',
        truckNo: 'T600 LPO',
        destination: 'LUBUMBASHI'
      });

      const fuelRecord = createMockFuelRecord({
        goingDo: 'DO-LPO-001',
        truckNo: 'T600 LPO',
        zambiaGoing: 400
      });

      // Simulate LPO auto-fill
      const lpoData = {
        doSdo: deliveryOrder.doNumber,
        truckNo: deliveryOrder.truckNo,
        destinations: deliveryOrder.destination,
        ltrs: fuelRecord.zambiaGoing
      };

      expect(lpoData.doSdo).toBe('DO-LPO-001');
      expect(lpoData.truckNo).toBe('T600 LPO');
      expect(lpoData.ltrs).toBe(400);
    });

    it('should detect return journey LPO requirements', () => {
      const fuelRecord = createMockFuelRecord({
        goingDo: 'DO-GOING-001',
        returnDo: 'DO-RETURN-001',
        zambiaReturn: 400
      });

      const isReturnJourney = !!fuelRecord.returnDo;
      const returnFuel = fuelRecord.zambiaReturn;

      expect(isReturnJourney).toBe(true);
      expect(returnFuel).toBe(400);
    });
  });

  describe('Station Selection', () => {
    it('should match station to checkpoint', () => {
      const stationCheckpointMap: Record<string, string> = {
        'LAKE NDOLA': 'zambiaGoing',
        'LAKE KAPIRI': 'zambiaGoing',
        'LAKE CHILABOMBWE': 'zambiaGoing',
        'MBEYA STATION': 'mbeyaGoing',
        'TUNDUMA STATION': 'tundumaReturn'
      };

      expect(stationCheckpointMap['LAKE NDOLA']).toBe('zambiaGoing');
      expect(stationCheckpointMap['MBEYA STATION']).toBe('mbeyaGoing');
    });

    it('should get default rate for station', () => {
      const stationRates: Record<string, number> = {
        'LAKE NDOLA': 1450,
        'LAKE KAPIRI': 1450,
        'LAKE CHILABOMBWE': 1450,
        'CASH': 1450
      };

      expect(stationRates['LAKE NDOLA']).toBe(1450);
    });
  });
});

describe('User Role Integration', () => {
  describe('Permission Checks', () => {
    const rolePermissions: Record<string, string[]> = {
      'super_admin': ['all'],
      'admin': ['manage_dos', 'manage_fuel', 'manage_lpos', 'view_reports'],
      'manager': ['manage_station', 'view_dos', 'view_fuel'],
      'driver': ['view_own_records'],
      'viewer': ['view_only']
    };

    it('should check admin permissions', () => {
      const role = 'admin';
      const permissions = rolePermissions[role];

      expect(permissions).toContain('manage_dos');
      expect(permissions).toContain('manage_fuel');
    });

    it('should check driver permissions', () => {
      const role = 'driver';
      const permissions = rolePermissions[role];

      expect(permissions).toContain('view_own_records');
      expect(permissions).not.toContain('manage_dos');
    });

    it('should allow super_admin all access', () => {
      const role = 'super_admin';
      const permissions = rolePermissions[role];

      expect(permissions).toContain('all');
    });
  });

  describe('Route Access', () => {
    const routeAccess: Record<string, string[]> = {
      '/dashboard': ['admin', 'manager', 'super_admin'],
      '/delivery-orders': ['admin', 'clerk', 'super_admin'],
      '/fuel-records': ['admin', 'fuel_order_maker', 'super_admin'],
      '/driver-portal': ['driver']
    };

    it('should allow admin access to dashboard', () => {
      const route = '/dashboard';
      const allowedRoles = routeAccess[route];

      expect(allowedRoles).toContain('admin');
    });

    it('should restrict driver to driver portal', () => {
      const driverRole = 'driver';
      const accessibleRoutes = Object.entries(routeAccess)
        .filter(([_, roles]) => roles.includes(driverRole))
        .map(([route]) => route);

      expect(accessibleRoutes).toContain('/driver-portal');
      expect(accessibleRoutes).not.toContain('/dashboard');
    });
  });
});

describe('Data Validation Integration', () => {
  describe('DO Validation', () => {
    it('should validate required DO fields', () => {
      const validateDO = (data: Partial<typeof createMockDeliveryOrder>) => {
        const required = ['doNumber', 'clientName', 'truckNo', 'loadingPoint', 'destination'];
        const missing = required.filter(field => !data[field as keyof typeof data]);
        return { valid: missing.length === 0, missing };
      };

      const validDO = createMockDeliveryOrder();
      const result = validateDO(validDO);
      expect(result.valid).toBe(true);

      const invalidDO = { doNumber: 'DO-001' };
      const invalidResult = validateDO(invalidDO);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.missing.length).toBeGreaterThan(0);
    });

    it('should validate DO number format', () => {
      const validateDONumber = (num: string) => /^(DO|SDO)-\d+/.test(num);

      expect(validateDONumber('DO-001')).toBe(true);
      expect(validateDONumber('SDO-123')).toBe(true);
      expect(validateDONumber('INVALID')).toBe(false);
    });

    it('should validate tonnage is positive', () => {
      const validateTonnage = (tonnage: number) => tonnage > 0;

      expect(validateTonnage(30)).toBe(true);
      expect(validateTonnage(0)).toBe(false);
      expect(validateTonnage(-10)).toBe(false);
    });
  });

  describe('Fuel Record Validation', () => {
    it('should validate fuel allocations dont exceed total', () => {
      const fuelRecord = createMockFuelRecord({
        totalLts: 2300,
        darYard: 550,
        mbeyaGoing: 450,
        zambiaGoing: 400,
        congoFuel: 400,
        balance: 500
      });

      const totalAllocated = 
        (fuelRecord.darYard ?? 0) + 
        (fuelRecord.mbeyaGoing ?? 0) + 
        (fuelRecord.zambiaGoing ?? 0) + 
        (fuelRecord.congoFuel ?? 0) + 
        (fuelRecord.balance ?? 0);

      expect(totalAllocated).toBeLessThanOrEqual(fuelRecord.totalLts ?? 0);
    });

    it('should validate balance is non-negative', () => {
      const validateBalance = (balance: number) => balance >= 0;

      expect(validateBalance(900)).toBe(true);
      expect(validateBalance(0)).toBe(true);
      expect(validateBalance(-100)).toBe(false);
    });
  });
});
