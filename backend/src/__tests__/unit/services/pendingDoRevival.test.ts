// Unit tests for restoring PG/PR placeholders when a DO's direction is switched.

const mockFuelFindOne = jest.fn();
const mockFuelExists = jest.fn();
const mockFuelUpdateOne = jest.fn();
const mockFuelFindById = jest.fn();
const mockLpoUpdateMany = jest.fn();
const mockDarUpdateMany = jest.fn();
const mockTangaUpdateMany = jest.fn();
const mockHistoryUpdateOne = jest.fn();
const mockDoUpdateOne = jest.fn();
const mockRouteFind = jest.fn();

jest.mock('../../../models', () => ({
  FuelRecord: {
    findOne: (...a: any[]) => mockFuelFindOne(...a),
    exists: (...a: any[]) => mockFuelExists(...a),
    updateOne: (...a: any[]) => mockFuelUpdateOne(...a),
    findById: (...a: any[]) => mockFuelFindById(...a),
  },
  LPOSummary: { updateMany: (...a: any[]) => mockLpoUpdateMany(...a) },
  DarLPODocument: { updateMany: (...a: any[]) => mockDarUpdateMany(...a) },
  TangaLPODocument: { updateMany: (...a: any[]) => mockTangaUpdateMany(...a) },
  PendingDoHistory: { updateOne: (...a: any[]) => mockHistoryUpdateOne(...a) },
  DeliveryOrder: { updateOne: (...a: any[]) => mockDoUpdateOne(...a) },
}));

jest.mock('../../../models/RouteConfig', () => ({
  RouteConfig: { find: (...a: any[]) => mockRouteFind(...a) },
}));

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { revivePendingOnDirectionFlip } from '../../../services/pendingDoRevival';

const session = {} as any;
const withSession = (value: any) => ({ session: jest.fn().mockResolvedValue(value) });
const asDoc = (data: Record<string, any>) => ({ ...data, toObject: () => ({ ...data }) });

function setup(opts: { record: any; numberInUse?: boolean; lpoModified?: [number, number, number] }) {
  const [lpo, dar, tanga] = opts.lpoModified || [0, 0, 0];
  mockFuelFindOne.mockReturnValue(withSession(opts.record));
  mockFuelExists.mockReturnValue(withSession(opts.numberInUse ? { _id: 'other' } : null));
  mockFuelUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockFuelFindById.mockReturnValue(withSession(opts.record));
  mockLpoUpdateMany.mockResolvedValue({ modifiedCount: lpo });
  mockDarUpdateMany.mockResolvedValue({ modifiedCount: dar });
  mockTangaUpdateMany.mockResolvedValue({ modifiedCount: tanga });
  mockHistoryUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockDoUpdateOne.mockResolvedValue({ modifiedCount: 1 });
}

beforeEach(() => jest.clearAllMocks());

describe('revivePendingOnDirectionFlip', () => {
  it('restores the pending going DO when an IMPORT DO that replaced PG#### is switched away', async () => {
    const pgAt = new Date('2026-10-01T00:00:00Z');
    setup({
      record: asDoc({
        _id: 'fr1',
        truckNo: 'T100 AAA',
        goingDo: 'DO1',
        returnDo: '',
        from: 'DAR',
        to: 'LUSAKA',
        totalLts: 2000,
        previousPendingGoingDo: 'PG0007',
        previousPendingGoingAt: pgAt,
        darGoing: -300,
      }),
      lpoModified: [1, 1, 0],
    });

    const result = await revivePendingOnDirectionFlip(
      { _id: 'do1', doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' },
      session
    );

    expect(result).toMatchObject({
      revived: true,
      kind: 'going',
      pendingDo: 'PG0007',
      realDoNumber: 'DO1',
      fuelRecordId: 'fr1',
      lpoRefsReverted: 2,
    });

    const [filter, update] = mockFuelUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: 'fr1' });
    expect(update.$set).toMatchObject({
      goingDo: 'PG0007',
      isPendingGoing: true,
      pendingGoingAt: pgAt,
      start: 'TBA',
      from: 'TBA',
      to: 'TBA',
      totalLts: null,
      balance: 0,
      isLocked: true,
      pendingConfigReason: 'both',
    });
    expect(update.$set).not.toHaveProperty('darGoing');
    expect(update.$unset).toHaveProperty('previousPendingGoingDo');

    const [lpoFilter, lpoUpdate, lpoOptions] = mockLpoUpdateMany.mock.calls[0];
    expect(lpoFilter).toMatchObject({ 'entries.doNo': 'DO1', 'entries.previousPendingDo': 'PG0007' });
    expect(lpoUpdate.$set).toEqual({ 'entries.$[e].doNo': 'PG0007' });
    expect(lpoOptions.arrayFilters).toEqual([{ 'e.doNo': 'DO1', 'e.previousPendingDo': 'PG0007' }]);
    expect(mockDarUpdateMany).toHaveBeenCalled();
    expect(mockTangaUpdateMany).toHaveBeenCalled();

    expect(mockHistoryUpdateOne.mock.calls[0][0]).toEqual({
      kind: 'going',
      pendingDo: 'PG0007',
      fuelRecordId: 'fr1',
      status: 'assigned',
    });
    expect(mockHistoryUpdateOne.mock.calls[0][1].$set.status).toBe('pending');
    expect(mockDoUpdateOne.mock.calls[0][0]).toEqual({ _id: 'do1' });
    expect(mockDoUpdateOne.mock.calls[0][1].$unset).toHaveProperty('promotedFromPendingDo');
  });

  it('does nothing when the IMPORT journey never came from a pending DO', async () => {
    setup({ record: asDoc({ _id: 'fr1', goingDo: 'DO1', previousPendingGoingDo: null }) });

    const result = await revivePendingOnDirectionFlip(
      { doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' },
      session
    );

    expect(result).toEqual({ revived: false });
    expect(mockFuelUpdateOne).not.toHaveBeenCalled();
    expect(mockLpoUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses when the journey already carries a real return DO', async () => {
    setup({
      record: asDoc({ _id: 'fr1', goingDo: 'DO1', returnDo: 'DO9', previousPendingGoingDo: 'PG0007' }),
    });

    const result = await revivePendingOnDirectionFlip(
      { doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' },
      session
    );

    expect(result).toMatchObject({ revived: false, reason: expect.stringContaining('DO9') });
    expect(mockFuelUpdateOne).not.toHaveBeenCalled();
  });

  it('refuses when the PG number is already used by another live journey', async () => {
    setup({
      record: asDoc({ _id: 'fr1', goingDo: 'DO1', previousPendingGoingDo: 'PG0007' }),
      numberInUse: true,
    });

    const result = await revivePendingOnDirectionFlip(
      { doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT' },
      session
    );

    expect(result).toMatchObject({ revived: false, reason: expect.stringContaining('PG0007') });
    expect(mockFuelUpdateOne).not.toHaveBeenCalled();
  });

  it('restores PR#### on EXPORT → IMPORT, removing export liters but keeping return dispenses', async () => {
    setup({
      record: asDoc({
        _id: 'fr2',
        truckNo: 'T200 BBB',
        goingDo: 'DO5',
        returnDo: 'DO8',
        from: 'LUSAKA',
        to: 'DAR',
        originalGoingFrom: 'DAR',
        originalGoingTo: 'LUSAKA',
        totalLts: 2400,
        extra: 0,
        outboundLiters: 400,
        darGoing: -1000,
        tundumaReturn: -150,
        previousPendingReturnDo: 'PR0003',
        previousPendingReturnAt: new Date('2026-10-02T00:00:00Z'),
      }),
      lpoModified: [1, 0, 0],
    });

    const result = await revivePendingOnDirectionFlip(
      { _id: 'do8', doNumber: 'DO8', doType: 'DO', importOrExport: 'EXPORT' },
      session
    );

    expect(result).toMatchObject({ revived: true, kind: 'return', pendingDo: 'PR0003', lpoRefsReverted: 1 });
    expect(mockRouteFind).not.toHaveBeenCalled();

    const { $set, $unset } = mockFuelUpdateOne.mock.calls[0][1];
    expect($set).toMatchObject({
      returnDo: 'PR0003',
      isPendingReturn: true,
      from: 'TBA',
      to: 'TBA',
      originalGoingFrom: 'DAR',
      originalGoingTo: 'LUSAKA',
      outboundLiters: 0,
      totalLts: 2000,
      balance: 2000 - 1000 - 150,
    });
    expect($set).not.toHaveProperty('tundumaReturn');
    expect($unset).toHaveProperty('previousPendingReturnDo');
    expect(mockHistoryUpdateOne.mock.calls[0][0]).toMatchObject({ kind: 'return', pendingDo: 'PR0003' });
  });

  it('skips SDOs without touching the database', async () => {
    const result = await revivePendingOnDirectionFlip(
      { doNumber: 'SDO1', doType: 'SDO', importOrExport: 'IMPORT' },
      session
    );

    expect(result).toEqual({ revived: false });
    expect(mockFuelFindOne).not.toHaveBeenCalled();
  });
});
