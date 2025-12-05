import request from 'supertest';
import express, { Express } from 'express';
import { DeliveryOrder } from '../../models';
import { 
  createTestUser, 
  createTestDeliveryOrder, 
  generateTestToken 
} from '../helpers/testUtils';

// Create test app
const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  
  // Import delivery order routes
  const deliveryOrderRoutes = require('../../../routes/deliveryOrderRoutes').default;
  app.use('/api/delivery-orders', deliveryOrderRoutes);
  
  return app;
};

describe('Delivery Order API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    // Create admin user
    const adminUser = await createTestUser({
      username: 'doadmin',
      email: 'doadmin@test.com',
      role: 'admin'
    });
    adminToken = generateTestToken(
      adminUser._id.toString(),
      adminUser.username,
      adminUser.role
    );

    // Create viewer user
    const viewerUser = await createTestUser({
      username: 'doviewer',
      email: 'doviewer@test.com',
      role: 'viewer'
    });
    viewerToken = generateTestToken(
      viewerUser._id.toString(),
      viewerUser.username,
      viewerUser.role
    );
  });

  describe('GET /api/delivery-orders', () => {
    it('should get all delivery orders with pagination', async () => {
      // Create some test orders
      await createTestDeliveryOrder({ doNumber: 'DO-GET-001' });
      await createTestDeliveryOrder({ doNumber: 'DO-GET-002', sn: 2 });
      await createTestDeliveryOrder({ doNumber: 'DO-GET-003', sn: 3 });

      const response = await request(app)
        .get('/api/delivery-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(3);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter by date range', async () => {
      await createTestDeliveryOrder({ 
        doNumber: 'DO-DATE-001',
        date: '2025-12-01'
      });
      await createTestDeliveryOrder({ 
        doNumber: 'DO-DATE-002',
        sn: 2,
        date: '2025-12-05'
      });
      await createTestDeliveryOrder({ 
        doNumber: 'DO-DATE-003',
        sn: 3,
        date: '2025-12-10'
      });

      const response = await request(app)
        .get('/api/delivery-orders')
        .query({ dateFrom: '2025-12-04', dateTo: '2025-12-06' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by truck number', async () => {
      await createTestDeliveryOrder({ 
        doNumber: 'DO-TRUCK-001',
        truckNo: 'T100 ABC'
      });
      await createTestDeliveryOrder({ 
        doNumber: 'DO-TRUCK-002',
        sn: 2,
        truckNo: 'T200 XYZ'
      });

      const response = await request(app)
        .get('/api/delivery-orders')
        .query({ truckNo: 'ABC' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].truckNo).toContain('ABC');
    });

    it('should filter by import/export type', async () => {
      await createTestDeliveryOrder({ 
        doNumber: 'DO-IMP-001',
        importOrExport: 'IMPORT'
      });
      await createTestDeliveryOrder({ 
        doNumber: 'DO-EXP-001',
        sn: 2,
        importOrExport: 'EXPORT'
      });

      const response = await request(app)
        .get('/api/delivery-orders')
        .query({ importOrExport: 'EXPORT' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].importOrExport).toBe('EXPORT');
    });

    it('should reject unauthenticated requests', async () => {
      const response = await request(app)
        .get('/api/delivery-orders')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/delivery-orders/:id', () => {
    it('should get a single delivery order', async () => {
      const order = await createTestDeliveryOrder({ doNumber: 'DO-SINGLE-001' });

      const response = await request(app)
        .get(`/api/delivery-orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.doNumber).toBe('DO-SINGLE-001');
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/delivery-orders/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/delivery-orders', () => {
    it('should create a new delivery order', async () => {
      const orderData = {
        sn: 100,
        date: '2025-12-05',
        importOrExport: 'IMPORT',
        doType: 'DO',
        doNumber: 'DO-CREATE-001',
        clientName: 'Test Client',
        truckNo: 'T123 ABC',
        trailerNo: 'TR001',
        loadingPoint: 'DAR ES SALAAM',
        destination: 'LUBUMBASHI',
        haulier: 'Test Haulier',
        tonnages: 30,
        ratePerTon: 100
      };

      const response = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.doNumber).toBe('DO-CREATE-001');
    });

    it('should reject duplicate DO number', async () => {
      await createTestDeliveryOrder({ doNumber: 'DO-DUP-001' });

      const response = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sn: 101,
          date: '2025-12-05',
          importOrExport: 'IMPORT',
          doType: 'DO',
          doNumber: 'DO-DUP-001',
          clientName: 'Test Client',
          truckNo: 'T123 ABC',
          trailerNo: 'TR001',
          loadingPoint: 'DAR ES SALAAM',
          destination: 'LUBUMBASHI',
          haulier: 'Test Haulier',
          tonnages: 30,
          ratePerTon: 100
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/delivery-orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          doNumber: 'DO-MISSING-001'
          // Missing required fields
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/delivery-orders/:id', () => {
    it('should update a delivery order', async () => {
      const order = await createTestDeliveryOrder({ doNumber: 'DO-UPDATE-001' });

      const response = await request(app)
        .put(`/api/delivery-orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destination: 'LUSAKA',
          editReason: 'Destination changed'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.destination).toBe('LUSAKA');
    });

    it('should track edit history', async () => {
      const order = await createTestDeliveryOrder({ 
        doNumber: 'DO-HISTORY-001',
        destination: 'OLD DEST'
      });

      await request(app)
        .put(`/api/delivery-orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          destination: 'NEW DEST',
          editReason: 'Testing edit history'
        })
        .expect(200);

      const updatedOrder = await DeliveryOrder.findById(order._id);
      expect(updatedOrder!.editHistory).toBeDefined();
      expect(updatedOrder!.editHistory!.length).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .put(`/api/delivery-orders/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ destination: 'SOMEWHERE' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/delivery-orders/:id/cancel', () => {
    it('should cancel a delivery order', async () => {
      const order = await createTestDeliveryOrder({ doNumber: 'DO-CANCEL-001' });

      const response = await request(app)
        .put(`/api/delivery-orders/${order._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Test cancellation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isCancelled).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
    });

    it('should require cancellation reason', async () => {
      const order = await createTestDeliveryOrder({ doNumber: 'DO-NOREASON-001' });

      const response = await request(app)
        .put(`/api/delivery-orders/${order._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/delivery-orders/:id', () => {
    it('should soft delete a delivery order', async () => {
      const order = await createTestDeliveryOrder({ doNumber: 'DO-DELETE-001' });

      const response = await request(app)
        .delete(`/api/delivery-orders/${order._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify soft delete
      const deletedOrder = await DeliveryOrder.findById(order._id);
      expect(deletedOrder!.isDeleted).toBe(true);
    });
  });

  describe('GET /api/delivery-orders/by-do/:doNumber', () => {
    it('should find delivery order by DO number', async () => {
      await createTestDeliveryOrder({ doNumber: 'DO-BYNUM-001' });

      const response = await request(app)
        .get('/api/delivery-orders/by-do/DO-BYNUM-001')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.doNumber).toBe('DO-BYNUM-001');
    });

    it('should return 404 for non-existent DO number', async () => {
      const response = await request(app)
        .get('/api/delivery-orders/by-do/NONEXISTENT')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
