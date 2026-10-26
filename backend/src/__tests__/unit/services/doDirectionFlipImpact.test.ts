// Unit tests for the read-only DO direction-flip impact inspector.

const mockFuelFind = jest.fn();
const mockLpoFind = jest.fn();
const mockDarFind = jest.fn();
const mockTangaFind = jest.fn();

jest.mock('../../../models', () => ({
  FuelRecord: { find: (...a: any[]) => mockFuelFind(...a) },
  LPOSummary: { find: (...a: any[]) => mockLpoFind(...a) },
  DarLPODocument: { find: (...a: any[]) => mockDarFind(...a) },
  TangaLPODocument: { find: (...a: any[]) => mockTangaFind(...a) },
}));

import { inspectDirectionFlipImpacts } from '../../../services/doDirectionFlipImpact';

const leanOf = (rows: any[]) => ({ lean: jest.fn().mockResolvedValue(rows) });
const selectLeanOf = (rows: any[]) => ({ select: jest.fn().mockReturnValue(leanOf(rows)) });

function mockData(opts: {
  going?: any[];
  returns?: any[];
  lpo?: any[];
  dar?: any[];
  tanga?: any[];
}) {
  mockFuelFind.mockImplementation((filter: any) =>
    leanOf(filter.goingDo ? opts.going || [] : opts.returns || [])
  );
  mockLpoFind.mockReturnValue(selectLeanOf(opts.lpo || []));
  mockDarFind.mockReturnValue(selectLeanOf(opts.dar || []));
  mockTangaFind.mockReturnValue(selectLeanOf(opts.tanga || []));
}

beforeEach(() => jest.clearAllMocks());

describe('inspectDirectionFlipImpacts', () => {
  it('reports the merged pending going DO, LPO lines and issued liters for IMPORT → EXPORT', async () => {
    mockData({
      going: [
        {
          _id: 'fr1',
          truckNo: 'T100 AAA',
          goingDo: 'DO1',
          journeyStatus: 'active',
          previousPendingGoingDo: 'PG0007',
          previousPendingGoingAt: new Date('2026-10-01T00:00:00Z'),
          darGoing: -200,
          mbeyaGoing: 150,
          zambiaReturn: 0,
        },
      ],
      lpo: [
        {
          lpoNo: '5001',
          station: 'MBEYA',
          date: new Date('2026-10-05T00:00:00Z'),
          entries: [
            { doNo: 'DO1', truckNo: 'T100 AAA', liters: 150 },
            { doNo: 'DO1', truckNo: 'T100 AAA', liters: 90, isCancelled: true },
            { doNo: 'OTHER', truckNo: 'T999 ZZZ', liters: 500 },
          ],
        },
      ],
      dar: [{ lpoNo: 'D12', date: '2026-10-02', entries: [{ doNo: 'DO1', truckNo: 'T100 AAA', liters: 210, dispenseLiters: 200 }] }],
    });

    const impacts = await inspectDirectionFlipImpacts(
      [{ _id: 'a', doNumber: 'DO1', doType: 'DO', importOrExport: 'IMPORT', truckNo: 'T100 AAA' }],
      'EXPORT'
    );
    const impact = impacts.get('DO1')!;

    expect(impact).toMatchObject({
      from: 'IMPORT',
      to: 'EXPORT',
      affectsFuel: true,
      fuelRecord: { id: 'fr1', journeyStatus: 'active' },
      pendingToRevive: { kind: 'going', pendingDo: 'PG0007' },
      lpoLiters: 350,
      fuelIssuedLiters: 350,
      requiresConfirmation: true,
    });
    expect(impact.lpoLines).toEqual([
      { source: 'LPO', lpoNo: '5001', station: 'MBEYA', date: '2026-10-05', truckNo: 'T100 AAA', liters: 150 },
      { source: 'DAR', lpoNo: 'D12', station: 'DAR YARD', date: '2026-10-02', truckNo: 'T100 AAA', liters: 200 },
    ]);
    expect(impact.fuelIssued).toEqual([
      { field: 'darGoing', liters: 200 },
      { field: 'mbeyaGoing', liters: 150 },
    ]);
  });

  it('counts only return-leg liters and the pending return for EXPORT → IMPORT', async () => {
    mockData({
      returns: [
        {
          _id: 'fr2',
          truckNo: 'T200 BBB',
          goingDo: 'DO9',
          returnDo: 'DO2',
          previousPendingReturnDo: 'PR0003',
          darGoing: 400,
          tundumaReturn: 120,
        },
      ],
    });

    const impact = (await inspectDirectionFlipImpacts(
      [{ doNumber: 'DO2', doType: 'DO', importOrExport: 'EXPORT' }],
      'IMPORT'
    )).get('DO2')!;

    expect(impact.pendingToRevive).toMatchObject({ kind: 'return', pendingDo: 'PR0003' });
    expect(impact.fuelIssued).toEqual([{ field: 'tundumaReturn', liters: 120 }]);
    expect(impact.requiresConfirmation).toBe(true);
  });

  it('treats SDOs as plain field changes and skips DOs already in the target direction', async () => {
    mockData({});

    const impacts = await inspectDirectionFlipImpacts(
      [
        { doNumber: 'S1', doType: 'SDO', importOrExport: 'IMPORT' },
        { doNumber: 'DO5', doType: 'DO', importOrExport: 'EXPORT' },
      ],
      'EXPORT'
    );

    expect(impacts.has('DO5')).toBe(false);
    expect(impacts.get('S1')).toMatchObject({
      affectsFuel: false,
      fuelRecord: null,
      pendingToRevive: null,
      lpoLines: [],
      requiresConfirmation: false,
    });
    expect(mockFuelFind).not.toHaveBeenCalled();
  });

  it('does not require confirmation when the journey has no LPO lines or issued fuel', async () => {
    mockData({ going: [{ _id: 'fr3', truckNo: 'T300 CCC', goingDo: 'DO3', journeyStatus: 'queued' }] });

    const impact = (await inspectDirectionFlipImpacts(
      [{ doNumber: 'DO3', doType: 'DO', importOrExport: 'IMPORT' }],
      'EXPORT'
    )).get('DO3')!;

    expect(impact.fuelRecord).toMatchObject({ id: 'fr3', journeyStatus: 'queued' });
    expect(impact.pendingToRevive).toBeNull();
    expect(impact.requiresConfirmation).toBe(false);
  });
});
