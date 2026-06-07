/**
 * Tests for DO and LPO number year-reset behaviour.
 *
 * Pure-function tests run with no DB.
 * DB-query tests use the in-memory MongoDB wired up by setup.ts.
 */

import { DeliveryOrder, LPOSummary } from '../../../models';
import {
  formatDONumber,
  parseDONumber,
  getNextDONumber,
} from '../../../utils/doNumberFormatter';

// ---------------------------------------------------------------------------
// 1. Pure formatter functions
// ---------------------------------------------------------------------------

describe('doNumberFormatter — pure functions', () => {
  describe('formatDONumber', () => {
    it('pads sequential number to 4 digits with year suffix', () => {
      expect(formatDONumber(1, 2026)).toBe('0001/26');
      expect(formatDONumber(50, 2026)).toBe('0050/26');
      expect(formatDONumber(9999, 2026)).toBe('9999/26');
    });

    it('uses current year when year is omitted', () => {
      const yy = new Date().getFullYear().toString().slice(-2);
      expect(formatDONumber(1)).toBe(`0001/${yy}`);
    });
  });

  describe('parseDONumber', () => {
    it('parses a valid XXXX/YY number', () => {
      const result = parseDONumber('0001/26');
      expect(result).toEqual({ sequentialNumber: 1, year: 2026 });
    });

    it('parses year 27 as 2027', () => {
      const result = parseDONumber('0050/27');
      expect(result).toEqual({ sequentialNumber: 50, year: 2027 });
    });

    it('returns null for legacy plain-integer format', () => {
      expect(parseDONumber('6433')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseDONumber('')).toBeNull();
    });
  });

  describe('getNextDONumber (utility)', () => {
    it('starts at 0001/YY when there is no previous number', () => {
      const yy = new Date().getFullYear().toString().slice(-2);
      expect(getNextDONumber(null)).toBe(`0001/${yy}`);
      expect(getNextDONumber(undefined)).toBe(`0001/${yy}`);
    });

    it('increments within the same year', () => {
      expect(getNextDONumber('0001/26', 2026)).toBe('0002/26');
      expect(getNextDONumber('0050/26', 2026)).toBe('0051/26');
    });

    it('resets to 0001/newYear when the year rolls over', () => {
      expect(getNextDONumber('0050/26', 2027)).toBe('0001/27');
      expect(getNextDONumber('0999/26', 2027)).toBe('0001/27');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. DB-layer: getNextDONumber controller query logic
//    Simulates the query used in the controller without hitting HTTP.
// ---------------------------------------------------------------------------

describe('DO number year-reset — DB query logic', () => {
  const PREV_YEAR = 2026;
  const NEW_YEAR  = 2027;
  const prevSuffix = PREV_YEAR.toString().slice(-2); // "26"
  const newSuffix  = NEW_YEAR.toString().slice(-2);  // "27"

  /** Replicate the controller's year-scoped findOne + sort({ sn: -1 }) */
  async function queryNextDO(doType: string, year: number) {
    const ys = year.toString().slice(-2);
    const lastDO = await DeliveryOrder.findOne({
      doType,
      isDeleted: false,
      doNumber: { $regex: `/${ys}$` },
    })
      .sort({ sn: -1 })
      .select('doNumber sn')
      .lean();

    if (!lastDO || !lastDO.doNumber) {
      return { nextSN: 1, nextDONumber: formatDONumber(1, year) };
    }
    const parsed = parseDONumber(lastDO.doNumber);
    const nextSN = lastDO.sn + 1;
    return {
      nextSN,
      nextDONumber: formatDONumber((parsed?.sequentialNumber ?? 0) + 1, year),
    };
  }

  it('returns 0001/27 and sn=1 when only previous-year DOs exist', async () => {
    // Seed 50 DOs from 2026
    const dos = Array.from({ length: 50 }, (_, i) => ({
      sn: i + 1,
      date: '2026-06-01',
      importOrExport: 'IMPORT',
      doType: 'DO',
      doNumber: formatDONumber(i + 1, PREV_YEAR),
      clientName: 'Client',
      truckNo: `T00${i} ABC`,
      trailerNo: 'TR001',
      loadingPoint: 'DAR ES SALAAM',
      destination: 'LUBUMBASHI',
      haulier: 'Haulier',
      tonnages: 30,
      ratePerTon: 100,
      status: 'active',
      isCancelled: false,
      isDeleted: false,
    }));
    await DeliveryOrder.insertMany(dos);

    const result = await queryNextDO('DO', NEW_YEAR);

    expect(result.nextDONumber).toBe(`0001/${newSuffix}`);
    expect(result.nextSN).toBe(1);
  });

  it('increments correctly within the new year', async () => {
    // Seed 3 DOs in new year
    const newYearDos = [1, 2, 3].map(i => ({
      sn: i,
      date: '2027-01-10',
      importOrExport: 'IMPORT',
      doType: 'DO',
      doNumber: formatDONumber(i, NEW_YEAR),
      clientName: 'Client',
      truckNo: `T00${i} XYZ`,
      trailerNo: 'TR002',
      loadingPoint: 'DAR ES SALAAM',
      destination: 'LUSAKA',
      haulier: 'Haulier',
      tonnages: 30,
      ratePerTon: 100,
      status: 'active',
      isCancelled: false,
      isDeleted: false,
    }));
    // Also seed previous-year DOs with higher sn to confirm they are ignored
    const prevYearDos = [1, 2, 50].map(i => ({
      sn: i,
      date: '2026-12-31',
      importOrExport: 'IMPORT',
      doType: 'DO',
      doNumber: formatDONumber(i, PREV_YEAR),
      clientName: 'Client',
      truckNo: `T10${i} AAA`,
      trailerNo: 'TR003',
      loadingPoint: 'MOMBASA',
      destination: 'HARARE',
      haulier: 'Haulier',
      tonnages: 20,
      ratePerTon: 80,
      status: 'active',
      isCancelled: false,
      isDeleted: false,
    }));
    await DeliveryOrder.insertMany([...newYearDos, ...prevYearDos]);

    const result = await queryNextDO('DO', NEW_YEAR);

    expect(result.nextDONumber).toBe(`0004/${newSuffix}`);
    expect(result.nextSN).toBe(4);
  });

  it('returns 0001/YY when database is empty', async () => {
    const yy = new Date().getFullYear().toString().slice(-2);
    const result = await queryNextDO('DO', new Date().getFullYear());
    expect(result.nextDONumber).toBe(`0001/${yy}`);
    expect(result.nextSN).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. DB-layer: getNextLPONumber controller query logic
// ---------------------------------------------------------------------------

describe('LPO number year-reset — DB query logic', () => {
  const PREV_YEAR = 2026;
  const NEW_YEAR  = 2027;
  const newSuffix = NEW_YEAR.toString().slice(-2); // "27"

  /** Replicate the new getNextLPONumber aggregation logic */
  async function queryNextLPO(year: number): Promise<string> {
    const ys = year.toString().slice(-2);

    const newFmtResult = await LPOSummary.aggregate([
      { $match: { isDeleted: false, year, lpoNo: { $regex: `/${ys}$` } } },
      { $project: { seq: { $toInt: { $arrayElemAt: [{ $split: ['$lpoNo', '/'] }, 0] } } } },
      { $group: { _id: null, maxSeq: { $max: '$seq' } } },
    ]);

    if (newFmtResult.length > 0 && newFmtResult[0].maxSeq != null) {
      return formatDONumber(newFmtResult[0].maxSeq + 1, year);
    }

    // Fallback: legacy plain-int format
    const legacyResult = await LPOSummary.aggregate([
      { $match: { isDeleted: false, year } },
      { $project: { lpoNoInt: { $toInt: '$lpoNo' } } },
      { $group: { _id: null, maxLpoNo: { $max: '$lpoNoInt' } } },
    ]);
    const legacyMax = legacyResult[0]?.maxLpoNo ?? 0;
    return formatDONumber(legacyMax + 1, year);
  }

  const lpoBase = {
    date: '2026-06-01',
    station: 'PUMA DAR',
    orderOf: 'Test Company',
    entries: [{
      doNo: '0001/26',
      truckNo: 'T001 ABC',
      liters: 500,
      rate: 3200,
      amount: 1600000,
      dest: 'LUBUMBASHI',
      isCancelled: false,
      isDriverAccount: false,
    }],
    total: 1600000,
    isDeleted: false,
  };

  it('returns 0001/27 when only previous-year LPOs exist (legacy format)', async () => {
    // Seed legacy-format LPOs from 2026 (plain int lpoNo)
    const lpos = [1, 2, 100].map(n => ({
      ...lpoBase,
      lpoNo: String(n),
      year: PREV_YEAR,
    }));
    await LPOSummary.insertMany(lpos);

    const result = await queryNextLPO(NEW_YEAR);
    expect(result).toBe(`0001/${newSuffix}`);
  });

  it('returns 0001/27 when only previous-year LPOs exist (new XXXX/YY format)', async () => {
    const lpos = [1, 2, 50].map(n => ({
      ...lpoBase,
      lpoNo: formatDONumber(n, PREV_YEAR),
      year: PREV_YEAR,
    }));
    await LPOSummary.insertMany(lpos);

    const result = await queryNextLPO(NEW_YEAR);
    expect(result).toBe(`0001/${newSuffix}`);
  });

  it('increments correctly within the new year (new format LPOs)', async () => {
    const prevLpos = [1, 50].map(n => ({
      ...lpoBase,
      lpoNo: formatDONumber(n, PREV_YEAR),
      year: PREV_YEAR,
    }));
    const newLpos = [1, 2, 3].map(n => ({
      ...lpoBase,
      date: '2027-01-05',
      lpoNo: formatDONumber(n, NEW_YEAR),
      year: NEW_YEAR,
    }));
    await LPOSummary.insertMany([...prevLpos, ...newLpos]);

    const result = await queryNextLPO(NEW_YEAR);
    expect(result).toBe(`0004/${newSuffix}`);
  });

  it('continues from legacy max mid-year during transition (mixed format)', async () => {
    // 2026 LPOs 1-100 in legacy format — transition: next one gets new format
    const lpos = Array.from({ length: 5 }, (_, i) => ({
      ...lpoBase,
      lpoNo: String(i + 1),
      year: PREV_YEAR,
    }));
    await LPOSummary.insertMany(lpos);

    // For the SAME year (2026) with no new-format LPOs yet, falls back to legacy max
    const result = await queryNextLPO(PREV_YEAR);
    const prevSuffix = PREV_YEAR.toString().slice(-2);
    expect(result).toBe(`0006/${prevSuffix}`);
  });

  it('returns 0001/YY when database is empty', async () => {
    const year = new Date().getFullYear();
    const yy = year.toString().slice(-2);
    const result = await queryNextLPO(year);
    expect(result).toBe(`0001/${yy}`);
  });
});
