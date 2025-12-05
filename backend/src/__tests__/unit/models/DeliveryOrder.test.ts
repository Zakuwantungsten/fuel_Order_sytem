import { DeliveryOrder } from '../../../models';
import { createTestDeliveryOrder } from '../../helpers/testUtils';

describe('DeliveryOrder Model', () => {
  describe('Validation', () => {
    it('should create a valid delivery order', async () => {
      const order = await createTestDeliveryOrder();
      
      expect(order._id).toBeDefined();
      expect(order.doNumber).toBeDefined();
      expect(order.importOrExport).toBe('IMPORT');
      expect(order.doType).toBe('DO');
      expect(order.status).toBe('active');
    });

    it('should fail without required fields', async () => {
      const order = new DeliveryOrder({});
      
      await expect(order.save()).rejects.toThrow();
    });

    it('should require serial number', async () => {
      await expect(createTestDeliveryOrder({ sn: undefined })).rejects.toThrow();
    });

    it('should require date', async () => {
      await expect(createTestDeliveryOrder({ date: undefined })).rejects.toThrow();
    });

    it('should require DO number', async () => {
      await expect(createTestDeliveryOrder({ doNumber: undefined })).rejects.toThrow();
    });

    it('should require client name', async () => {
      await expect(createTestDeliveryOrder({ clientName: undefined })).rejects.toThrow();
    });

    it('should require truck number', async () => {
      await expect(createTestDeliveryOrder({ truckNo: undefined })).rejects.toThrow();
    });

    it('should require loading point', async () => {
      await expect(createTestDeliveryOrder({ loadingPoint: undefined })).rejects.toThrow();
    });

    it('should require destination', async () => {
      await expect(createTestDeliveryOrder({ destination: undefined })).rejects.toThrow();
    });

    it('should require tonnages', async () => {
      await expect(createTestDeliveryOrder({ tonnages: undefined })).rejects.toThrow();
    });

    it('should require rate per ton', async () => {
      await expect(createTestDeliveryOrder({ ratePerTon: undefined })).rejects.toThrow();
    });
  });

  describe('Import/Export Types', () => {
    it('should accept IMPORT type', async () => {
      const order = await createTestDeliveryOrder({ 
        importOrExport: 'IMPORT',
        doNumber: 'DO-IMPORT-001'
      });
      expect(order.importOrExport).toBe('IMPORT');
    });

    it('should accept EXPORT type', async () => {
      const order = await createTestDeliveryOrder({ 
        importOrExport: 'EXPORT',
        doNumber: 'DO-EXPORT-001'
      });
      expect(order.importOrExport).toBe('EXPORT');
    });

    it('should reject invalid import/export type', async () => {
      await expect(createTestDeliveryOrder({ 
        importOrExport: 'INVALID' as any,
        doNumber: 'DO-INVALID-001'
      })).rejects.toThrow();
    });
  });

  describe('DO Types', () => {
    it('should accept DO type', async () => {
      const order = await createTestDeliveryOrder({ 
        doType: 'DO',
        doNumber: 'DO-TYPE-001'
      });
      expect(order.doType).toBe('DO');
    });

    it('should accept SDO type', async () => {
      const order = await createTestDeliveryOrder({ 
        doType: 'SDO',
        doNumber: 'SDO-TYPE-001'
      });
      expect(order.doType).toBe('SDO');
    });

    it('should reject invalid DO type', async () => {
      await expect(createTestDeliveryOrder({ 
        doType: 'INVALID' as any,
        doNumber: 'DO-INVALID-TYPE-001'
      })).rejects.toThrow();
    });
  });

  describe('Cargo Types', () => {
    it('should default to loosecargo', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-CARGO-001' 
      });
      expect(order.cargoType).toBe('loosecargo');
    });

    it('should accept container cargo type', async () => {
      const order = await createTestDeliveryOrder({ 
        cargoType: 'container',
        doNumber: 'DO-CONTAINER-001'
      });
      expect(order.cargoType).toBe('container');
    });
  });

  describe('Rate Types', () => {
    it('should default to per_ton rate type', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-RATE-001' 
      });
      expect(order.rateType).toBe('per_ton');
    });

    it('should accept fixed_total rate type', async () => {
      const order = await createTestDeliveryOrder({ 
        rateType: 'fixed_total',
        doNumber: 'DO-FIXED-001'
      });
      expect(order.rateType).toBe('fixed_total');
    });
  });

  describe('Numeric Validations', () => {
    it('should reject negative tonnages', async () => {
      await expect(createTestDeliveryOrder({ 
        tonnages: -10,
        doNumber: 'DO-NEG-TON-001'
      })).rejects.toThrow();
    });

    it('should reject negative rate per ton', async () => {
      await expect(createTestDeliveryOrder({ 
        ratePerTon: -50,
        doNumber: 'DO-NEG-RATE-001'
      })).rejects.toThrow();
    });

    it('should accept zero tonnages', async () => {
      const order = await createTestDeliveryOrder({ 
        tonnages: 0,
        doNumber: 'DO-ZERO-TON-001'
      });
      expect(order.tonnages).toBe(0);
    });
  });

  describe('Status Management', () => {
    it('should default to active status', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-STATUS-001' 
      });
      expect(order.status).toBe('active');
      expect(order.isCancelled).toBe(false);
    });

    it('should support cancellation', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-CANCEL-001' 
      });
      
      order.status = 'cancelled';
      order.isCancelled = true;
      order.cancelledAt = new Date();
      order.cancellationReason = 'Test cancellation';
      order.cancelledBy = 'admin';
      await order.save();

      const cancelledOrder = await DeliveryOrder.findById(order._id);
      expect(cancelledOrder!.status).toBe('cancelled');
      expect(cancelledOrder!.isCancelled).toBe(true);
      expect(cancelledOrder!.cancellationReason).toBe('Test cancellation');
    });
  });

  describe('Soft Delete', () => {
    it('should default to not deleted', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-DELETE-001' 
      });
      expect(order.isDeleted).toBe(false);
    });

    it('should support soft delete', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-SOFTDEL-001' 
      });
      
      order.isDeleted = true;
      order.deletedAt = new Date();
      await order.save();

      const deletedOrder = await DeliveryOrder.findById(order._id);
      expect(deletedOrder!.isDeleted).toBe(true);
      expect(deletedOrder!.deletedAt).toBeDefined();
    });
  });

  describe('Edit History', () => {
    it('should track edit history', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-HISTORY-001' 
      });
      
      order.editHistory = [{
        editedAt: new Date(),
        editedBy: 'admin',
        changes: [{
          field: 'destination',
          oldValue: 'OLD DEST',
          newValue: 'NEW DEST'
        }],
        reason: 'Destination change'
      }];
      order.lastEditedAt = new Date();
      order.lastEditedBy = 'admin';
      await order.save();

      const editedOrder = await DeliveryOrder.findById(order._id);
      expect(editedOrder!.editHistory).toHaveLength(1);
      expect(editedOrder!.editHistory![0].editedBy).toBe('admin');
    });
  });

  describe('Unique DO Number', () => {
    it('should enforce unique DO numbers', async () => {
      const doNumber = 'DO-UNIQUE-001';
      await createTestDeliveryOrder({ doNumber });
      
      await expect(createTestDeliveryOrder({ 
        doNumber,
        sn: 2
      })).rejects.toThrow();
    });
  });

  describe('Timestamps', () => {
    it('should have createdAt and updatedAt timestamps', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-TIMESTAMP-001' 
      });
      
      expect(order.createdAt).toBeDefined();
      expect(order.updatedAt).toBeDefined();
    });
  });
});
