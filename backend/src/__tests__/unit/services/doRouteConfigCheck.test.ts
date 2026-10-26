// Unit tests for the bulk-edit route configuration check. Uses the real route
// matchers so the check agrees with what the save path does.

const mockRouteFind = jest.fn();
jest.mock('../../../models/RouteConfig', () => ({
  RouteConfig: { find: (...a: any[]) => mockRouteFind(...a) },
}));

import { findUnconfiguredRoute, inspectRouteConfig } from '../../../services/doRouteConfigCheck';

const ROUTES: any[] = [
  { origin: 'DAR', destination: 'NDOLA', destinationAliases: ['NDOLA TOWN'], defaultTotalLiters: 2000, isActive: true, routeType: 'IMPORT' },
  { origin: 'KOLWEZI', destination: 'DAR', defaultTotalLiters: 400, isActive: true, routeType: 'EXPORT' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteFind.mockReturnValue({ lean: jest.fn().mockResolvedValue(ROUTES) });
});

describe('findUnconfiguredRoute', () => {
  const importDo = { doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', loadingPoint: 'DAR', destination: 'LUSAKA' };

  it('passes a configured IMPORT route, including destination aliases', () => {
    expect(findUnconfiguredRoute(importDo, { destination: 'NDOLA' }, ROUTES)).toBeNull();
    expect(findUnconfiguredRoute(importDo, { destination: 'ndola town' }, ROUTES)).toBeNull();
  });

  it('flags an IMPORT route missing from the configuration as locking the fuel record', () => {
    expect(findUnconfiguredRoute(importDo, { destination: 'NOWHERE' }, ROUTES)).toEqual({
      doNumber: 'DO1',
      direction: 'IMPORT',
      loadingPoint: 'DAR',
      destination: 'NOWHERE',
      effect: 'fuel_record_locked',
    });
  });

  it('checks the route for the direction the DO will have after the edit', () => {
    const exportDo = { doNumber: 'DO2', doType: 'DO', importOrExport: 'EXPORT', loadingPoint: 'DAR', destination: 'NDOLA' };
    // EXPORT -> IMPORT on a configured IMPORT route
    expect(findUnconfiguredRoute(exportDo, { importOrExport: 'IMPORT' }, ROUTES)).toBeNull();
    // IMPORT -> EXPORT where only an IMPORT route exists
    expect(findUnconfiguredRoute({ ...importDo, destination: 'NDOLA' }, { importOrExport: 'EXPORT' }, ROUTES)).toMatchObject({
      direction: 'EXPORT',
      effect: 'no_outbound_liters',
    });
    // EXPORT route change onto a configured EXPORT route
    expect(findUnconfiguredRoute(exportDo, { loadingPoint: 'KOLWEZI', destination: 'DAR' }, ROUTES)).toBeNull();
  });

  it('ignores SDOs and edits that do not touch the route', () => {
    expect(findUnconfiguredRoute({ ...importDo, doType: 'SDO' }, { destination: 'NOWHERE' }, ROUTES)).toBeNull();
    expect(findUnconfiguredRoute(importDo, {}, ROUTES)).toBeNull();
  });
});

describe('inspectRouteConfig', () => {
  it('does not load routes when no DO needs checking', async () => {
    const issues = await inspectRouteConfig([
      { order: { doNumber: 'DO1', doType: 'SDO' }, changes: { destination: 'X' } },
      { order: { doNumber: 'DO2', doType: 'DO' }, changes: {} },
    ]);
    expect(issues.size).toBe(0);
    expect(mockRouteFind).not.toHaveBeenCalled();
  });

  it('returns issues keyed by DO number from active routes', async () => {
    const issues = await inspectRouteConfig([
      { order: { doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', loadingPoint: 'DAR' }, changes: { destination: 'NDOLA' } },
      { order: { doNumber: 'DO2', doType: 'DO', importOrExport: 'IMPORT', loadingPoint: 'DAR' }, changes: { destination: 'NOWHERE' } },
    ]);
    expect(mockRouteFind).toHaveBeenCalledWith({ isActive: true });
    expect([...issues.keys()]).toEqual(['DO2']);
  });
});
