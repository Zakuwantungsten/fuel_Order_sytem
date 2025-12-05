import { FuelRecord } from '../../../models';
import { createTestFuelRecord } from '../../helpers/testUtils';

describe('FuelRecord Model', () => {
  describe('Validation', () => {
    it('should create a valid fuel record', async () => {
      const record = await createTestFuelRecord();
      
      expect(record._id).toBeDefined();
      expect(record.truckNo).toBe('T123 ABC');
      expect(record.totalLts).toBe(2300);
      expect(record.balance).toBe(900);
    });

    it('should fail without required fields', async () => {
      const record = new FuelRecord({});
      
      await expect(record.save()).rejects.toThrow();
    });

    it('should require date', async () => {
      await expect(createTestFuelRecord({ date: undefined })).rejects.toThrow();
    });

    it('should require truck number', async () => {
      await expect(createTestFuelRecord({ truckNo: undefined })).rejects.toThrow();
    });

    it('should require going DO', async () => {
      await expect(createTestFuelRecord({ goingDo: undefined })).rejects.toThrow();
    });

    it('should require start location', async () => {
      await expect(createTestFuelRecord({ start: undefined })).rejects.toThrow();
    });

    it('should require from location', async () => {
      await expect(createTestFuelRecord({ from: undefined })).rejects.toThrow();
    });

    it('should require to location', async () => {
      await expect(createTestFuelRecord({ to: undefined })).rejects.toThrow();
    });

    it('should require balance', async () => {
      await expect(createTestFuelRecord({ balance: undefined })).rejects.toThrow();
    });
  });

  describe('Fuel Allocations', () => {
    it('should default yard allocations to 0', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-YARD-001',
        tangaYard: undefined,
        darYard: undefined,
        mmsaYard: undefined
      });
      
      expect(record.tangaYard).toBe(0);
      expect(record.darYard).toBe(0);
      expect(record.mmsaYard).toBe(0);
    });

    it('should default going fuel allocations to 0', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-GOING-001',
        darGoing: undefined,
        moroGoing: undefined,
        mbeyaGoing: undefined,
        tdmGoing: undefined,
        zambiaGoing: undefined,
        congoFuel: undefined
      });
      
      expect(record.darGoing).toBe(0);
      expect(record.moroGoing).toBe(0);
      expect(record.mbeyaGoing).toBe(0);
      expect(record.tdmGoing).toBe(0);
      expect(record.zambiaGoing).toBe(0);
      expect(record.congoFuel).toBe(0);
    });

    it('should default return fuel allocations to 0', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-RETURN-001',
        zambiaReturn: undefined,
        tundumaReturn: undefined,
        mbeyaReturn: undefined,
        moroReturn: undefined,
        darReturn: undefined,
        tangaReturn: undefined
      });
      
      expect(record.zambiaReturn).toBe(0);
      expect(record.tundumaReturn).toBe(0);
      expect(record.mbeyaReturn).toBe(0);
      expect(record.moroReturn).toBe(0);
      expect(record.darReturn).toBe(0);
      expect(record.tangaReturn).toBe(0);
    });

    it('should accept custom fuel allocations', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-CUSTOM-001',
        darYard: 550,
        mbeyaGoing: 450,
        zambiaGoing: 400,
        congoFuel: 400
      });
      
      expect(record.darYard).toBe(550);
      expect(record.mbeyaGoing).toBe(450);
      expect(record.zambiaGoing).toBe(400);
      expect(record.congoFuel).toBe(400);
    });
  });

  describe('Return Journey', () => {
    it('should allow optional return DO', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-NORETURN-001' 
      });
      expect(record.returnDo).toBeUndefined();
    });

    it('should accept return DO', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-WITHRETURN-001',
        returnDo: 'DO-RETURN-EXP-001'
      });
      expect(record.returnDo).toBe('DO-RETURN-EXP-001');
    });

    it('should store original going journey locations', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-ORIGINAL-001',
        originalGoingFrom: 'DAR ES SALAAM',
        originalGoingTo: 'LUBUMBASHI'
      });
      
      expect(record.originalGoingFrom).toBe('DAR ES SALAAM');
      expect(record.originalGoingTo).toBe('LUBUMBASHI');
    });
  });

  describe('Lock Status', () => {
    it('should default to unlocked', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-LOCK-001' 
      });
      expect(record.isLocked).toBe(false);
    });

    it('should support locking for pending configuration', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-PENDING-001',
        isLocked: true,
        pendingConfigReason: 'missing_total_liters'
      });
      
      expect(record.isLocked).toBe(true);
      expect(record.pendingConfigReason).toBe('missing_total_liters');
    });

    it('should accept valid pending config reasons', async () => {
      const validReasons = ['missing_total_liters', 'missing_extra_fuel', 'both', null];
      
      for (let i = 0; i < validReasons.length; i++) {
        const record = await createTestFuelRecord({
          goingDo: `DO-REASON-${i}`,
          pendingConfigReason: validReasons[i] as any
        });
        expect(record.pendingConfigReason).toBe(validReasons[i]);
      }
    });
  });

  describe('Numeric Validations', () => {
    it('should reject negative total liters', async () => {
      await expect(createTestFuelRecord({ 
        goingDo: 'DO-NEGLTS-001',
        totalLts: -100 
      })).rejects.toThrow();
    });

    it('should allow null total liters for pending config', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-NULLLTS-001',
        totalLts: null as any,
        isLocked: true,
        pendingConfigReason: 'missing_total_liters'
      });
      
      expect(record.totalLts).toBeNull();
    });
  });

  describe('Cancellation', () => {
    it('should default to not cancelled', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-NOTCAN-001' 
      });
      expect(record.isCancelled).toBe(false);
    });

    it('should support cancellation', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-CANTEST-001' 
      });
      
      record.isCancelled = true;
      record.cancelledAt = new Date();
      record.cancellationReason = 'Test cancellation';
      record.cancelledBy = 'admin';
      await record.save();

      const cancelledRecord = await FuelRecord.findById(record._id);
      expect(cancelledRecord!.isCancelled).toBe(true);
      expect(cancelledRecord!.cancellationReason).toBe('Test cancellation');
    });
  });

  describe('Soft Delete', () => {
    it('should default to not deleted', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-NOTDEL-001' 
      });
      expect(record.isDeleted).toBe(false);
    });

    it('should support soft delete', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-SOFTDEL-001' 
      });
      
      record.isDeleted = true;
      record.deletedAt = new Date();
      await record.save();

      const deletedRecord = await FuelRecord.findById(record._id);
      expect(deletedRecord!.isDeleted).toBe(true);
      expect(deletedRecord!.deletedAt).toBeDefined();
    });
  });

  describe('Month Field', () => {
    it('should accept month string', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-MONTH-001',
        month: 'December 2025'
      });
      
      expect(record.month).toBe('December 2025');
    });

    it('should trim month string', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-MONTHTRIM-001',
        month: '  January 2025  '
      });
      
      expect(record.month).toBe('January 2025');
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-TIMESTAMP-001' 
      });
      
      expect(record.createdAt).toBeDefined();
      expect(record.updatedAt).toBeDefined();
    });
  });

  describe('Fuel Calculation Scenarios', () => {
    it('should handle standard DAR to Congo journey', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-DARCON-001',
        start: 'DAR',
        from: 'DAR ES SALAAM',
        to: 'LUBUMBASHI',
        totalLts: 2300,
        extra: 60,
        darYard: 550,
        mbeyaGoing: 450,
        zambiaGoing: 400,
        congoFuel: 400,
        balance: 500
      });
      
      const totalUsed = (record.darYard || 0) + (record.mbeyaGoing || 0) + 
                        (record.zambiaGoing || 0) + (record.congoFuel || 0) + (record.balance || 0);
      expect(totalUsed).toBeLessThanOrEqual(record.totalLts!);
    });

    it('should handle Tanga start journey', async () => {
      const record = await createTestFuelRecord({
        goingDo: 'DO-TANGA-001',
        start: 'TANGA',
        from: 'TANGA',
        to: 'LUBUMBASHI',
        totalLts: 2300,
        tangaYard: 100,
        darYard: 450,
        mbeyaGoing: 450,
        zambiaGoing: 400,
        congoFuel: 400,
        balance: 500
      });
      
      expect(record.tangaYard).toBe(100);
    });
  });
});
