import {
  snapshotFuelRecord,
  diffFuelRecordSnapshots,
  formatFuelRecordAuditDetails,
  formatFuelAuditValue,
  fuelFieldLabel,
  buildLpoCheckpointAudit,
} from '../../../utils/fuelRecordAudit';

describe('fuelRecordAudit', () => {
  const record = {
    truckNo: 'T103 DVL',
    goingDo: '12345',
    returnDo: '67890',
    from: 'Dar',
    to: 'Lusaka',
    start: 'Dar',
    totalLts: 1200,
    extra: 0,
    darGoing: 400,
    balance: 800,
    tangaGoing: 0,
  };

  it('snapshots audit fields and ignores unknown keys', () => {
    const snap = snapshotFuelRecord({ ...record, __v: 3, password: 'nope' });
    expect(snap.truckNo).toBe('T103 DVL');
    expect(snap.darGoing).toBe(400);
    expect(snap.from).toBe('Dar');
    expect(snap.to).toBe('Lusaka');
    expect((snap as any).password).toBeUndefined();
    expect((snap as any).__v).toBeUndefined();
  });

  it('diffs only changed fields including from/to/total/checkpoints', () => {
    const prev = snapshotFuelRecord(record);
    const next = snapshotFuelRecord({
      ...record,
      darGoing: 550,
      totalLts: 1500,
      extra: 80,
      to: 'Ndola',
      truckNo: 'T250 ABC',
      balance: 1030,
    });
    const { changes, previous, next: nextSnap } = diffFuelRecordSnapshots(prev, next);
    const fields = changes.map((c) => c.field).sort();
    expect(fields).toEqual(['balance', 'darGoing', 'extra', 'to', 'totalLts', 'truckNo'].sort());
    expect(previous.darGoing).toBe(400);
    expect(nextSnap.darGoing).toBe(550);
    expect(previous.totalLts).toBe(1200);
    expect(nextSnap.totalLts).toBe(1500);
  });

  it('formats human-readable details with truck, DO, and liter units', () => {
    const details = formatFuelRecordAuditDetails(
      [
        { field: 'darGoing', oldValue: 400, newValue: 550 },
        { field: 'totalLts', oldValue: 1200, newValue: 1500 },
      ],
      { truckNo: 'T103 DVL', goingDo: '12345' },
      'manual edit'
    );
    expect(details).toContain('Truck T103 DVL');
    expect(details).toContain('DO 12345');
    expect(details).toContain('Dar Going 400L → 550L');
    expect(details).toContain('Total liters 1200L → 1500L');
    expect(details).toContain('manual edit');
  });

  it('labels checkpoint fields for operators', () => {
    expect(fuelFieldLabel('darGoing')).toBe('Dar Going');
    expect(formatFuelAuditValue('extra', 80)).toBe('80L');
    expect(formatFuelAuditValue('from', 'Dar')).toBe('Dar');
  });

  it('builds an LPO checkpoint audit payload with old → new liters', () => {
    const payload = buildLpoCheckpointAudit({
      resourceId: 'abc123',
      record,
      field: 'darGoing',
      previousLiters: 0,
      nextLiters: 400,
      previousBalance: 1200,
      nextBalance: 800,
      litersChange: 400,
      audit: { username: 'alice', lpoNo: '001/26', station: 'DAR' },
      station: 'DAR',
    });
    expect(payload.resourceId).toBe('abc123');
    expect(payload.username).toBe('alice');
    expect(payload.previous?.darGoing).toBe(0);
    expect(payload.next?.darGoing).toBe(400);
    expect(payload.details).toContain('Dar Going 0L → 400L');
    expect(payload.details).toContain('LPO 001/26');
    expect(payload.details).toContain('deducted 400L');
    expect(payload.source).toBe('lpo');
  });
});
