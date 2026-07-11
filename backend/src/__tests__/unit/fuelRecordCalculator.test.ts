import {
  buildReturnUpdate,
  recalculateBalanceFromTotal,
  resolveStoredOutboundLiters,
  applyOutboundLitersToTotals,
} from '../../utils/fuelRecordCalculator';

describe('fuelRecordCalculator outbound / balance helpers', () => {
  const baseRecord = {
    from: 'DAR',
    to: 'KOLWEZI',
    totalLts: 2400,
    extra: 100,
    balance: 2500,
    darGoing: 0,
    congoFuel: 0,
  };

  it('recalculateBalanceFromTotal uses new total − checkpoints (not a separate outbound patch)', () => {
    expect(recalculateBalanceFromTotal(2900, 100, { ...baseRecord, darGoing: 200 })).toBe(2800);
    expect(recalculateBalanceFromTotal(null, 100, baseRecord)).toBe(0);
  });

  it('resolveStoredOutboundLiters prefers stored field, else fallback', () => {
    expect(resolveStoredOutboundLiters({ outboundLiters: 500 })).toBe(500);
    expect(resolveStoredOutboundLiters({}, 400)).toBe(400);
    expect(resolveStoredOutboundLiters({})).toBe(0);
  });

  it('applyOutboundLitersToTotals adds / subtracts / rolls back outbound on totalLts then recalculates balance', () => {
    const add = applyOutboundLitersToTotals(baseRecord, 0, 500);
    expect(add).toEqual({
      totalLts: 2900,
      outboundLiters: 500,
      balance: 3000,
      delta: 500,
    });

    const less = applyOutboundLitersToTotals(
      { ...baseRecord, totalLts: 2900, outboundLiters: 500 },
      500,
      300
    );
    expect(less.totalLts).toBe(2700);
    expect(less.outboundLiters).toBe(300);
    expect(less.delta).toBe(-200);
    expect(less.balance).toBe(2800);

    const rollback = applyOutboundLitersToTotals(
      { ...baseRecord, totalLts: 2900, outboundLiters: 500 },
      500,
      0
    );
    expect(rollback.totalLts).toBe(2400);
    expect(rollback.outboundLiters).toBe(0);
    expect(rollback.delta).toBe(-500);
    expect(rollback.balance).toBe(2500);
  });

  it('buildReturnUpdate adds outbound liters and recalculates balance; no match leaves totals alone', () => {
    const withMatch = buildReturnUpdate(
      baseRecord,
      {
        date: '2026-07-01',
        truckNo: 'T100ABC',
        doNumber: '9001',
        destination: 'DAR',
        loadingPoint: 'KOLWEZI',
        importOrExport: 'EXPORT',
      },
      500
    );
    expect(withMatch.update.outboundLiters).toBe(500);
    expect(withMatch.update.totalLts).toBe(2900);
    expect(withMatch.update.balance).toBe(3000);
    expect(withMatch.update.from).toBe('KOLWEZI');
    expect(withMatch.update.to).toBe('DAR');
    expect(withMatch.update.originalGoingFrom).toBe('DAR');
    expect(withMatch.update.originalGoingTo).toBe('KOLWEZI');

    const noMatch = buildReturnUpdate(
      baseRecord,
      {
        date: '2026-07-01',
        truckNo: 'T100ABC',
        doNumber: '9002',
        destination: 'DAR',
        loadingPoint: 'KOLWEZI',
        importOrExport: 'EXPORT',
      },
      0
    );
    expect(noMatch.update.outboundLiters).toBe(0);
    expect(noMatch.update.totalLts).toBeUndefined();
    expect(noMatch.update.balance).toBeUndefined();
    expect(noMatch.update.returnDo).toBe('9002');
  });

  it('going + remembered outbound = new total (math used by IMPORT amend with return)', () => {
    const newGoing = 2200;
    const outbound = 500;
    const newTotal = newGoing + outbound;
    expect(recalculateBalanceFromTotal(newTotal, 100, baseRecord)).toBe(2800);
  });
});
