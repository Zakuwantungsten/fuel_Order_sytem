import { FuelRecord, LPOSummary } from '../../../models';
import { ApiError } from '../../../middleware/errorHandler';
import { normalizeYardEntriesForSummary } from '../../../services/yardUnifiedLpoService';
import {
  applyYardBulkLinksToLpo,
  createYardLpoWithOptionalLinks,
  mapIndexLinkSelections,
  yardKindFromStation,
} from '../../../services/yardBulkLinkService';
import { createTestFuelRecord } from '../../helpers/testUtils';

jest.mock('../../../services/websocket', () => ({
  emitDataChange: jest.fn(),
}));

describe('yardBulkLinkService', () => {
  describe('yardKindFromStation', () => {
    it('recognises Dar and Tanga yard station names', () => {
      expect(yardKindFromStation('Dar Yard')).toBe('dar');
      expect(yardKindFromStation('DAR YARD')).toBe('dar');
      expect(yardKindFromStation('Tanga Yard')).toBe('tanga');
      expect(yardKindFromStation('LAKE CHILABOMBWE')).toBeNull();
    });
  });

  describe('normalizeYardEntriesForSummary', () => {
    it('formats truck numbers to T### XXX before persist', () => {
      const [entry] = normalizeYardEntriesForSummary([
        { truckNo: 't777xyz', liters: 100, rate: 1, amount: 100, doNo: 'DO-1', dest: 'X' },
      ]);
      expect(entry.truckNo).toBe('T777 XYZ');
    });
  });

  describe('mapIndexLinkSelections', () => {
    it('maps create-time index selections to entry ids', () => {
      const lpo = {
        entries: [{ _id: 'entry-a' }, { _id: 'entry-b' }],
      };
      const mapped = mapIndexLinkSelections(lpo, [
        { index: 1, fuelRecordId: 'fuel-99', topUp: false, dispenseLiters: 50 },
      ]);
      expect(mapped).toEqual([
        { entryId: 'entry-b', fuelRecordId: 'fuel-99', topUp: false, dispenseLiters: 50 },
      ]);
    });
  });

  describe('createYardLpoWithOptionalLinks', () => {
    const baseEntry = {
      doNo: 'DO-ATOMIC-001',
      truckNo: 'T777XYZ',
      liters: 100,
      rate: 1.2,
      amount: 120,
      dest: 'TEST DEST',
    };

    it('creates an unlinked yard LPO when no link selections are sent', async () => {
      const { lpo, linkResults } = await createYardLpoWithOptionalLinks('dar', {
        date: '2025-12-05',
        entries: [baseEntry],
        createdBy: 'tester',
      });

      expect(lpo.isDeleted).not.toBe(true);
      expect(lpo.entries[0].linkedFuelRecordId).toBeFalsy();
      expect(lpo.entries[0].truckNo).toBe('T777 XYZ');
      expect(linkResults).toHaveLength(0);
    });

    it('atomically links fuel on create and writes darYard liters', async () => {
      const fuelRecord = await createTestFuelRecord({
        truckNo: 'T777 XYZ',
        goingDo: 'DO-ATOMIC-001',
        darYard: 0,
        journeyStatus: 'queued',
        queueOrder: 1,
      });

      const { lpo, linkResults } = await createYardLpoWithOptionalLinks(
        'dar',
        {
          date: '2025-12-05',
          entries: [baseEntry],
          createdBy: 'tester',
        },
        [{ index: 0, fuelRecordId: fuelRecord._id.toString(), dispenseLiters: 100 }],
        'tester',
      );

      expect(linkResults).toHaveLength(1);
      expect(linkResults[0].status).toBe('linked');

      const persisted = await LPOSummary.findById(lpo._id);
      expect(persisted?.isDeleted).not.toBe(true);
      expect(persisted?.entries[0].linkedFuelRecordId).toBe(fuelRecord._id.toString());

      const refreshedFuel = await FuelRecord.findById(fuelRecord._id);
      expect(refreshedFuel?.darYard).toBe(100);
    });

    it('soft-deletes the LPO when link validation fails (invalid fuel record)', async () => {
      const fakeFuelId = '507f1f77bcf86cd799439011';

      await expect(
        createYardLpoWithOptionalLinks(
          'dar',
          {
            date: '2025-12-05',
            entries: [baseEntry],
            createdBy: 'tester',
          },
          [{ index: 0, fuelRecordId: fakeFuelId, dispenseLiters: 100 }],
          'tester',
        ),
      ).rejects.toBeInstanceOf(ApiError);

      const deleted = await LPOSummary.find({ isDeleted: true, 'entries.truckNo': 'T777 XYZ' });
      expect(deleted.length).toBe(1);

      const active = await LPOSummary.find({ isDeleted: false, 'entries.truckNo': 'T777 XYZ' });
      expect(active.length).toBe(0);
    });

    it('soft-deletes the LPO when yard column conflict occurs without top-up', async () => {
      const fuelRecord = await createTestFuelRecord({
        truckNo: 'T888 ABC',
        goingDo: 'DO-CONFLICT-001',
        darYard: 40,
        journeyStatus: 'active',
      });

      await expect(
        createYardLpoWithOptionalLinks(
          'dar',
          {
            date: '2025-12-05',
            entries: [{
              ...baseEntry,
              truckNo: 'T888ABC',
              doNo: 'DO-CONFLICT-001',
            }],
            createdBy: 'tester',
          },
          [{ index: 0, fuelRecordId: fuelRecord._id.toString(), dispenseLiters: 100, topUp: false }],
          'tester',
        ),
      ).rejects.toThrow(/yard column already has/i);

      const deleted = await LPOSummary.find({ isDeleted: true, 'entries.truckNo': 'T888 ABC' });
      expect(deleted.length).toBe(1);

      const refreshedFuel = await FuelRecord.findById(fuelRecord._id);
      expect(refreshedFuel?.darYard).toBe(40);
    });

    it('allows top-up when yard column already has liters', async () => {
      const fuelRecord = await createTestFuelRecord({
        truckNo: 'T889 ABC',
        goingDo: 'DO-TOPUP-001',
        darYard: 40,
        journeyStatus: 'active',
      });

      const { linkResults } = await createYardLpoWithOptionalLinks(
        'dar',
        {
          date: '2025-12-05',
          entries: [{
            ...baseEntry,
            truckNo: 'T889ABC',
            doNo: 'DO-TOPUP-001',
            liters: 60,
            amount: 72,
          }],
          createdBy: 'tester',
        },
        [{ index: 0, fuelRecordId: fuelRecord._id.toString(), dispenseLiters: 60, topUp: true }],
        'tester',
      );

      expect(linkResults[0].status).toBe('topped_up');

      const refreshedFuel = await FuelRecord.findById(fuelRecord._id);
      expect(refreshedFuel?.darYard).toBe(100);
    });
  });

  describe('applyYardBulkLinksToLpo', () => {
    it('links tanga yard entries via bulk-link path without requireAll partial failure', async () => {
      const fuelRecord = await createTestFuelRecord({
        truckNo: 'T990 TNG',
        goingDo: 'DO-TANGA-001',
        tangaYard: 0,
        darYard: 0,
        journeyStatus: 'queued',
        queueOrder: 1,
      });

      const lpo = await LPOSummary.create({
        lpoNo: `TEST-TANGA-${Date.now()}`,
        date: '2025-12-05',
        year: 2025,
        station: 'Tanga Yard',
        orderOf: 'TAHMEED',
        entries: [{
          doNo: 'DO-TANGA-001',
          truckNo: 'T990 TNG',
          liters: 80,
          rate: 1.1,
          amount: 88,
          dest: 'DEST',
        }],
        total: 88,
        createdBy: 'tester',
      });

      const entryId = (lpo.entries[0] as any)._id.toString();
      const { results, didApply } = await applyYardBulkLinksToLpo(
        lpo,
        'tanga',
        [{ entryId, fuelRecordId: fuelRecord._id.toString(), dispenseLiters: 80 }],
        { username: 'tester', requireAll: true },
      );

      expect(didApply).toBe(true);
      expect(results[0].status).toBe('linked');

      const refreshedFuel = await FuelRecord.findById(fuelRecord._id);
      expect(refreshedFuel?.tangaYard).toBe(80);
    });
  });
});
