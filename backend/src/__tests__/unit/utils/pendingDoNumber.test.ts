import {
  formatPendingDoNumber,
  parsePendingDoNumber,
  isPendingGoingDo,
  isPendingReturnDo,
  isPendingDo,
  isReturnDoOpen,
  pendingDoCounterKey,
  pickBestExportFuelMatch,
  pickBestPendingReturnTarget,
  compareExportFuelCandidates,
} from '../../../utils/pendingDoNumber';

describe('pendingDoNumber', () => {
  it('formats going and return with 4-digit padding', () => {
    expect(formatPendingDoNumber('going', 1)).toBe('PG0001');
    expect(formatPendingDoNumber('return', 12)).toBe('PR0012');
    expect(formatPendingDoNumber('going', 9999)).toBe('PG9999');
  });

  it('parses PG/PR ids case-insensitively', () => {
    expect(parsePendingDoNumber('PG0001')).toEqual({ kind: 'going', sequentialNumber: 1 });
    expect(parsePendingDoNumber('pr42')).toEqual({ kind: 'return', sequentialNumber: 42 });
    expect(parsePendingDoNumber('0001/26')).toBeNull();
    expect(parsePendingDoNumber('NIL')).toBeNull();
  });

  it('detects pending kinds', () => {
    expect(isPendingGoingDo('PG0001')).toBe(true);
    expect(isPendingReturnDo('PR0001')).toBe(true);
    expect(isPendingDo('PG0001')).toBe(true);
    expect(isPendingDo('0001/26')).toBe(false);
  });

  it('treats pending return as open for linking', () => {
    expect(isReturnDoOpen(null)).toBe(true);
    expect(isReturnDoOpen('')).toBe(true);
    expect(isReturnDoOpen('PR0001')).toBe(true);
    expect(isReturnDoOpen('0001/26')).toBe(false);
    expect(isReturnDoOpen('PR0001', true)).toBe(true);
  });

  it('builds yearly counter keys', () => {
    expect(pendingDoCounterKey('going', 2026)).toBe('pendingGoingDo_2026');
    expect(pendingDoCounterKey('return', 2027)).toBe('pendingReturnDo_2027');
  });

  it('EXPORT match prefers PR among active open-return rows', () => {
    const activeEmpty = {
      _id: 'active-empty',
      date: '2026-07-13',
      journeyStatus: 'active',
      returnDo: '',
      isPendingReturn: false,
    };
    const activePr = {
      _id: 'active-pr',
      date: '2026-07-11',
      journeyStatus: 'active',
      returnDo: 'PR0003',
      isPendingReturn: true,
    };
    expect(pickBestExportFuelMatch([activeEmpty, activePr])?._id).toBe('active-pr');
    expect(compareExportFuelCandidates(activePr, activeEmpty)).toBeLessThan(0);
  });

  it('EXPORT match among empty actives prefers newer date', () => {
    const older = { _id: 'a', date: '2026-07-01', journeyStatus: 'active', returnDo: '' };
    const newer = { _id: 'b', date: '2026-07-13', journeyStatus: 'active', returnDo: '' };
    expect(pickBestExportFuelMatch([older, newer])?._id).toBe('b');
  });

  it('pending return target prefers active then queued by queueOrder', () => {
    const queued2 = { _id: 'q2', date: '2026-07-10', journeyStatus: 'queued', queueOrder: 2, returnDo: '' };
    const queued1 = { _id: 'q1', date: '2026-07-12', journeyStatus: 'queued', queueOrder: 1, returnDo: '' };
    const active = { _id: 'act', date: '2026-07-13', journeyStatus: 'active', returnDo: '' };
    expect(pickBestPendingReturnTarget([queued2, queued1, active])?._id).toBe('act');
    expect(pickBestPendingReturnTarget([queued2, queued1])?._id).toBe('q1');
  });

  it('pending return target picks queued when no active in month set', () => {
    const queued = { _id: 'q', date: '2026-06-15', journeyStatus: 'queued', queueOrder: 1, returnDo: '' };
    expect(pickBestPendingReturnTarget([queued])?._id).toBe('q');
  });
});
