// Unit tests for the DO bulk-update controller. The single-DO update handler is
// mocked: bulk edit must delegate every item to it (so edit history, audit and
// cascades match a manual edit), skip what can't be edited, and write one
// BULK_OPERATION audit summary for the whole action.

const mockDeliveryOrder = { find: jest.fn() };
const mockEditLock = { exists: jest.fn() };

jest.mock('../../../models', () => ({
  DeliveryOrder: mockDeliveryOrder,
  EditLock: mockEditLock,
}));

const mockAcquireLock = jest.fn();
const mockReleaseLock = jest.fn();
jest.mock('../../../services/lockService', () => ({
  acquireLock: (...args: any[]) => mockAcquireLock(...args),
  releaseLock: (...args: any[]) => mockReleaseLock(...args),
  getDisplayName: jest.fn().mockResolvedValue('Alice A'),
}));

jest.mock('../../../services/websocket', () => ({
  emitLockChange: jest.fn(),
}));

const mockAuditLog = jest.fn();
jest.mock('../../../utils/auditService', () => ({
  AuditService: { log: (...args: any[]) => mockAuditLog(...args) },
}));

jest.mock('../../../utils', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const mockUpdateDeliveryOrder = jest.fn();
jest.mock('../../../controllers/deliveryOrderController', () => ({
  updateDeliveryOrder: (...args: any[]) => mockUpdateDeliveryOrder(...args),
}));

const mockInspectFlip = jest.fn();
jest.mock('../../../services/doDirectionFlipImpact', () => ({
  inspectDirectionFlipImpacts: (...args: any[]) => mockInspectFlip(...args),
}));

const mockInspectRoutes = jest.fn();
jest.mock('../../../services/doRouteConfigCheck', () => ({
  inspectRouteConfig: (...args: any[]) => mockInspectRoutes(...args),
}));

import {
  bulkUpdateDeliveryOrders,
  previewBulkUpdateDeliveryOrders,
} from '../../../controllers/deliveryOrderBulkUpdateController';
import { ApiError } from '../../../middleware/errorHandler';

const ID_A = '64b000000000000000000001';
const ID_B = '64b000000000000000000002';
const ID_C = '64b000000000000000000003';
const ID_D = '64b000000000000000000004';

function mockOrders(orders: any[]) {
  mockDeliveryOrder.find.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(orders) }),
  });
}

function makeReq(body: any): any {
  return {
    body,
    user: { userId: 'u1', username: 'alice', role: 'admin' },
    ip: '127.0.0.1',
    headers: {},
    get: () => undefined,
  };
}

function makeRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEditLock.exists.mockResolvedValue(null);
  mockAcquireLock.mockResolvedValue({ lockedBy: 'alice', lockedByName: 'Alice A', lockedUntil: new Date() });
  mockReleaseLock.mockResolvedValue(true);
  mockInspectFlip.mockResolvedValue(new Map());
  mockInspectRoutes.mockResolvedValue(new Map());
  mockUpdateDeliveryOrder.mockImplementation(async (req: any, res: any) => {
    res.status(200).json({
      success: true,
      message: 'Delivery order updated successfully',
      data: { _id: req.params.id, ...req.body },
      cascadeResults: {},
    });
  });
});

describe('bulkUpdateDeliveryOrders', () => {
  it('rejects requests with no ids or no fields', async () => {
    await expect(bulkUpdateDeliveryOrders(makeReq({ ids: [], fields: { haulier: 'X' } }), makeRes()))
      .rejects.toBeInstanceOf(ApiError);
    await expect(bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A], fields: {} }), makeRes()))
      .rejects.toThrow('Choose at least one field');
  });

  it('rejects invalid field values up front', async () => {
    await expect(
      bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A], fields: { ratePerTon: -5 } }), makeRes())
    ).rejects.toThrow('Rate must be a non-negative number');
    await expect(
      bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A], fields: { importOrExport: 'SIDEWAYS' } }), makeRes())
    ).rejects.toThrow('Direction must be IMPORT or EXPORT');
    expect(mockUpdateDeliveryOrder).not.toHaveBeenCalled();
  });

  it('delegates each changed DO to the single update with only the differing fields', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', destination: 'NDOLA', clientName: 'ACME', updatedAt: new Date('2026-01-01T00:00:00Z') },
      { _id: ID_B, doNumber: 'DO2', doType: 'SDO', destination: 'LUBUMBASHI', clientName: 'OLD', updatedAt: new Date('2026-01-02T00:00:00Z') },
    ]);
    const res = makeRes();

    await bulkUpdateDeliveryOrders(
      makeReq({ ids: [ID_A, ID_B], fields: { destination: 'LUBUMBASHI', clientName: 'ACME' }, editReason: 'route change' }),
      res
    );

    expect(mockUpdateDeliveryOrder).toHaveBeenCalledTimes(2);
    const firstBody = mockUpdateDeliveryOrder.mock.calls[0][0].body;
    expect(firstBody).toMatchObject({
      destination: 'LUBUMBASHI',
      editReason: 'Bulk edit: route change',
      clientUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(firstBody.clientName).toBeUndefined();
    const secondBody = mockUpdateDeliveryOrder.mock.calls[1][0].body;
    expect(secondBody).toMatchObject({ clientName: 'ACME' });
    expect(secondBody.destination).toBeUndefined();

    const { data } = res.json.mock.calls[0][0];
    expect(data.summary).toMatchObject({ requested: 2, updated: 2, failed: 0 });
    expect(mockUpdateDeliveryOrder.mock.calls[0][0].bulkOperationId).toBe(data.bulkId);
    expect(mockUpdateDeliveryOrder.mock.calls[1][0].bulkOperationId).toBe(data.bulkId);
    expect(mockAuditLog.mock.calls[0][0].correlationId).toBe(data.bulkId);
    expect(mockReleaseLock).toHaveBeenCalledTimes(2);
  });

  it('skips cancelled, missing, locked and already-matching DOs', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', isCancelled: true, haulier: 'A' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', haulier: 'NEW' },
      { _id: ID_C, doNumber: 'DO3', doType: 'DO', haulier: 'OLD' },
    ]);
    mockAcquireLock.mockRejectedValueOnce(new ApiError(423, 'Record is being edited by Bob'));
    const res = makeRes();

    await bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A, ID_B, ID_C, ID_D], fields: { haulier: 'NEW' } }), res);

    const { results, summary } = res.json.mock.calls[0][0].data;
    const byId = Object.fromEntries(results.map((r: any) => [r.id, r]));
    expect(byId[ID_A].status).toBe('skipped');
    expect(byId[ID_B].status).toBe('unchanged');
    expect(byId[ID_C]).toMatchObject({ status: 'skipped', message: 'Record is being edited by Bob' });
    expect(byId[ID_D]).toMatchObject({ status: 'skipped', message: 'Delivery order not found' });
    expect(summary).toMatchObject({ updated: 0, unchanged: 1, skipped: 3 });
    expect(mockUpdateDeliveryOrder).not.toHaveBeenCalled();
  });

  it('records a failed item without stopping the rest', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', importOrExport: 'IMPORT' },
    ]);
    mockUpdateDeliveryOrder.mockImplementationOnce(async () => {
      throw new ApiError(422, 'Cannot change DO DO1 to EXPORT: no matching active going fuel record');
    });
    const res = makeRes();

    await bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A, ID_B], fields: { importOrExport: 'export' } }), res);

    const { results } = res.json.mock.calls[0][0].data;
    expect(results[0]).toMatchObject({ status: 'failed', doNumber: 'DO1' });
    expect(results[1]).toMatchObject({ status: 'updated', doNumber: 'DO2' });
    expect(mockUpdateDeliveryOrder.mock.calls[1][0].body.importOrExport).toBe('EXPORT');
  });

  it('keeps a lock the user already held before the bulk edit', async () => {
    mockOrders([{ _id: ID_A, doNumber: 'DO1', doType: 'DO', haulier: 'OLD' }]);
    mockEditLock.exists.mockResolvedValue({ _id: 'lock' });

    await bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A], fields: { haulier: 'NEW' } }), makeRes());

    expect(mockUpdateDeliveryOrder).toHaveBeenCalledTimes(1);
    expect(mockReleaseLock).not.toHaveBeenCalled();
  });

  it('writes one BULK_OPERATION audit entry listing every DO', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', haulier: 'OLD' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', haulier: 'NEW' },
    ]);

    await bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A, ID_B], fields: { haulier: 'NEW' } }), makeRes());

    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    const entry = mockAuditLog.mock.calls[0][0];
    expect(entry).toMatchObject({
      username: 'alice',
      action: 'BULK_OPERATION',
      resourceType: 'DeliveryOrder',
      outcome: 'SUCCESS',
    });
    expect(entry.details).toContain('Updated DOs: DO1');
    expect(entry.newValue.items.map((i: any) => [i.doNumber, i.status])).toEqual([
      ['DO1', 'updated'],
      ['DO2', 'unchanged'],
    ]);
    expect(entry.newValue.items[0].changes).toEqual([{ field: 'haulier', oldValue: 'OLD', newValue: 'NEW' }]);
  });

  it('marks updated DOs whose fuel record was not adjusted', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', destination: 'OLD' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', destination: 'OLD' },
      { _id: ID_C, doNumber: 'DO3', doType: 'DO', destination: 'OLD' },
    ]);
    const cascadeById: Record<string, any> = {
      [ID_A]: { fuelAutomationSkipped: true },
      [ID_B]: { noLinkedFuelRecord: true },
      [ID_C]: { fuelRecordUpdated: true },
    };
    mockUpdateDeliveryOrder.mockImplementation(async (req: any, res: any) => {
      res.status(200).json({ success: true, data: { _id: req.params.id, ...req.body }, cascadeResults: cascadeById[req.params.id] });
    });
    const res = makeRes();

    await bulkUpdateDeliveryOrders(makeReq({ ids: [ID_A, ID_B, ID_C], fields: { destination: 'NEW' } }), res);

    const { results, summary } = res.json.mock.calls[0][0].data;
    expect(results.map((r: any) => [r.status, r.notice?.kind])).toEqual([
      ['updated', 'automation_off'],
      ['updated', 'no_fuel_record'],
      ['updated', undefined],
    ]);
    expect(summary).toMatchObject({ updated: 3, fuelAutomationOff: 1, noFuelRecord: 1 });
    expect(mockAuditLog.mock.calls[0][0].newValue.items.map((i: any) => i.notice)).toEqual([
      'automation_off',
      'no_fuel_record',
      undefined,
    ]);
  });

  const flaggedImpact = {
    doNumber: 'DO1',
    requiresConfirmation: true,
    lpoLines: [{ source: 'LPO', lpoNo: '5001', liters: 150 }],
    lpoLiters: 150,
    fuelIssuedLiters: 350,
  };

  it('refuses a direction switch on DOs with LPO lines / issued fuel until confirmed', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', importOrExport: 'IMPORT' },
    ]);
    mockInspectFlip.mockResolvedValue(
      new Map<string, any>([
        ['DO1', flaggedImpact],
        ['DO2', { doNumber: 'DO2', requiresConfirmation: false }],
      ])
    );

    const err = await bulkUpdateDeliveryOrders(
      makeReq({ ids: [ID_A, ID_B], fields: { importOrExport: 'EXPORT' } }),
      makeRes()
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(409);
    expect(err.data.code).toBe('FLIP_FUEL_IMPACT_CONFIRMATION_REQUIRED');
    expect(err.data.flagged.map((i: any) => i.doNumber)).toEqual(['DO1']);
    expect(mockAcquireLock).not.toHaveBeenCalled();
    expect(mockUpdateDeliveryOrder).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('proceeds when confirmFuelImpact is true and records the acknowledgement in the audit', async () => {
    mockOrders([{ _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' }]);
    mockInspectFlip.mockResolvedValue(new Map<string, any>([['DO1', flaggedImpact]]));

    await bulkUpdateDeliveryOrders(
      makeReq({ ids: [ID_A], fields: { importOrExport: 'EXPORT' }, confirmFuelImpact: true }),
      makeRes()
    );

    expect(mockUpdateDeliveryOrder).toHaveBeenCalledTimes(1);
    const entry = mockAuditLog.mock.calls[0][0];
    expect(entry.newValue.fuelImpactConfirmed).toBe(true);
    expect(entry.newValue.fuelImpactDOs).toEqual([
      { doNumber: 'DO1', lpoLines: 1, lpoLiters: 150, fuelIssuedLiters: 350 },
    ]);
  });

  const routeIssue = {
    doNumber: 'DO1',
    direction: 'IMPORT',
    loadingPoint: 'DAR',
    destination: 'NOWHERE',
    effect: 'fuel_record_locked',
  };

  it('refuses a move onto an unconfigured route until confirmed', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', destination: 'NDOLA' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', importOrExport: 'IMPORT', destination: 'NOWHERE', isCancelled: true },
    ]);
    mockInspectRoutes.mockResolvedValue(new Map([['DO1', routeIssue]]));

    const err = await bulkUpdateDeliveryOrders(
      makeReq({ ids: [ID_A, ID_B], fields: { destination: 'NOWHERE' } }),
      makeRes()
    ).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(409);
    expect(err.data.code).toBe('ROUTE_NOT_CONFIGURED_CONFIRMATION_REQUIRED');
    expect(err.data.flagged).toEqual([routeIssue]);
    const checked = mockInspectRoutes.mock.calls[0][0];
    expect(checked).toEqual([
      { order: expect.objectContaining({ doNumber: 'DO1' }), changes: { destination: 'NOWHERE' } },
    ]);
    expect(mockAcquireLock).not.toHaveBeenCalled();
    expect(mockUpdateDeliveryOrder).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('proceeds when confirmMissingRoutes is true and records the routes in the audit', async () => {
    mockOrders([{ _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', destination: 'NDOLA' }]);
    mockInspectRoutes.mockResolvedValue(new Map([['DO1', routeIssue]]));

    await bulkUpdateDeliveryOrders(
      makeReq({ ids: [ID_A], fields: { destination: 'NOWHERE' }, confirmMissingRoutes: true }),
      makeRes()
    );

    expect(mockUpdateDeliveryOrder).toHaveBeenCalledTimes(1);
    const entry = mockAuditLog.mock.calls[0][0];
    expect(entry.newValue.missingRoutesConfirmed).toBe(true);
    expect(entry.newValue.missingRouteDOs).toEqual([
      { doNumber: 'DO1', direction: 'IMPORT', loadingPoint: 'DAR', destination: 'NOWHERE' },
    ]);
  });
});

describe('previewBulkUpdateDeliveryOrders', () => {
  it('reports per-DO changes and attaches flip impact only to DOs whose direction changes', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', truckNo: 'T1', importOrExport: 'IMPORT', haulier: 'X' },
      { _id: ID_B, doNumber: 'DO2', doType: 'DO', truckNo: 'T2', importOrExport: 'EXPORT', haulier: 'X' },
      { _id: ID_C, doNumber: 'DO3', doType: 'DO', importOrExport: 'IMPORT', isCancelled: true },
    ]);
    const impact = {
      doNumber: 'DO1',
      requiresConfirmation: true,
      pendingToRevive: { kind: 'going', pendingDo: 'PG0001' },
    };
    mockInspectFlip.mockResolvedValue(new Map([['DO1', impact]]));
    const res = makeRes();

    await previewBulkUpdateDeliveryOrders(
      makeReq({ ids: [ID_A, ID_B, ID_C], fields: { importOrExport: 'EXPORT' } }),
      res
    );

    const flipped = mockInspectFlip.mock.calls[0][0].map((o: any) => o.doNumber);
    expect(flipped).toEqual(['DO1']);
    expect(mockInspectFlip.mock.calls[0][1]).toBe('EXPORT');

    const { summary, items } = res.json.mock.calls[0][0].data;
    expect(items[0]).toMatchObject({ doNumber: 'DO1', status: 'will_change', flipImpact: impact });
    expect(items[1]).toMatchObject({ doNumber: 'DO2', status: 'unchanged' });
    expect(items[2]).toMatchObject({ doNumber: 'DO3', status: 'skipped' });
    expect(summary).toMatchObject({ willChange: 1, unchanged: 1, skipped: 1, needsConfirmation: 1, revivesPending: 1 });
    expect(mockUpdateDeliveryOrder).not.toHaveBeenCalled();
    expect(mockAcquireLock).not.toHaveBeenCalled();
  });

  it('skips the flip inspection when direction is not being changed', async () => {
    mockOrders([{ _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', haulier: 'OLD' }]);
    const res = makeRes();

    await previewBulkUpdateDeliveryOrders(makeReq({ ids: [ID_A], fields: { haulier: 'NEW' } }), res);

    expect(mockInspectFlip).not.toHaveBeenCalled();
    const { items } = res.json.mock.calls[0][0].data;
    expect(items[0].changes).toEqual([{ field: 'haulier', oldValue: 'OLD', newValue: 'NEW' }]);
    expect(items[0].flipImpact).toBeUndefined();
  });

  it('attaches the route issue to DOs whose new route is not configured', async () => {
    mockOrders([
      { _id: ID_A, doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', destination: 'NDOLA' },
      { _id: ID_B, doNumber: 'DO2', doType: 'SDO', importOrExport: 'IMPORT', destination: 'NDOLA' },
    ]);
    const issue = { doNumber: 'DO1', direction: 'IMPORT', loadingPoint: 'DAR', destination: 'NOWHERE', effect: 'fuel_record_locked' };
    mockInspectRoutes.mockResolvedValue(new Map([['DO1', issue]]));
    const res = makeRes();

    await previewBulkUpdateDeliveryOrders(makeReq({ ids: [ID_A, ID_B], fields: { destination: 'NOWHERE' } }), res);

    const { summary, items } = res.json.mock.calls[0][0].data;
    expect(items[0].routeIssue).toEqual(issue);
    expect(items[1].routeIssue).toBeUndefined();
    expect(summary.routeNotConfigured).toBe(1);
  });
});
