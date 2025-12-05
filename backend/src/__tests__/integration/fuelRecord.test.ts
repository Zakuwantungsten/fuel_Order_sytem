import request from 'supertest';
import express, { Express } from 'express';
import { FuelRecord } from '../../models';
import { 
  createTestUser, 
  createTestFuelRecord,
  createTestDeliveryOrder,
  generateTestToken 
} from '../helpers/testUtils';

// Create test app
const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  
  // Import fuel record routes
  const fuelRecordRoutes = require('../../../routes/fuelRecordRoutes').default;
  app.use('/api/fuel-records', fuelRecordRoutes);
  
  return app;
};

describe('Fuel Record API Integration Tests', () => {
  let app: Express;
  let adminToken: string;
  let driverToken: string;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    // Create admin user
    const adminUser = await createTestUser({
      username: 'fradmin',
      email: 'fradmin@test.com',
      role: 'admin'
    });
    adminToken = generateTestToken(
      adminUser._id.toString(),
      adminUser.username,
      adminUser.role
    );

    // Create driver user
    const driverUser = await createTestUser({
      username: 'frdriver',
      email: 'frdriver@test.com',
      role: 'driver'
    });
    driverToken = generateTestToken(
      driverUser._id.toString(),
      driverUser.username,
      driverUser.role
    );
  });

  describe('GET /api/fuel-records', () => {
    it('should get all fuel records with pagination', async () => {
      await createTestFuelRecord({ goingDo: 'DO-FR-001' });
      await createTestFuelRecord({ goingDo: 'DO-FR-002' });
      await createTestFuelRecord({ goingDo: 'DO-FR-003' });

      const response = await request(app)
        .get('/api/fuel-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(3);
      expect(response.body.data.pagination).toBeDefined();
    });

    it('should filter by truck number', async () => {
      await createTestFuelRecord({ 
        goingDo: 'DO-FRTRUCK-001',
        truckNo: 'T100 ABC'
      });
      await createTestFuelRecord({ 
        goingDo: 'DO-FRTRUCK-002',
        truckNo: 'T200 XYZ'
      });

      const response = await request(app)
        .get('/api/fuel-records')
        .query({ truckNo: 'ABC' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by month', async () => {
      await createTestFuelRecord({ 
        goingDo: 'DO-FRMONTH-001',
        month: 'December 2025'
      });
      await createTestFuelRecord({ 
        goingDo: 'DO-FRMONTH-002',
        month: 'January 2026'
      });

      const response = await request(app)
        .get('/api/fuel-records')
        .query({ month: 'December' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by from location', async () => {
      await createTestFuelRecord({ 
        goingDo: 'DO-FRFROM-001',
        from: 'DAR ES SALAAM'
      });
      await createTestFuelRecord({ 
        goingDo: 'DO-FRFROM-002',
        from: 'TANGA'
      });

      const response = await request(app)
        .get('/api/fuel-records')
        .query({ from: 'DAR' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data.every((r: any) => 
        r.from.includes('DAR')
      )).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      await request(app)
        .get('/api/fuel-records')
        .expect(401);
    });
  });

  describe('GET /api/fuel-records/:id', () => {
    it('should get a single fuel record', async () => {
      const record = await createTestFuelRecord({ goingDo: 'DO-FRSINGLE-001' });

      const response = await request(app)
        .get(`/api/fuel-records/${record._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.goingDo).toBe('DO-FRSINGLE-001');
    });

    it('should return 404 for non-existent record', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/fuel-records/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/fuel-records/by-truck/:truckNo', () => {
    it('should get fuel records by truck number', async () => {
      const truckNo = 'T555 TEST';
      await createTestFuelRecord({ 
        goingDo: 'DO-FRBYTRUCK-001',
        truckNo
      });
      await createTestFuelRecord({ 
        goingDo: 'DO-FRBYTRUCK-002',
        truckNo
      });

      const response = await request(app)
        .get(`/api/fuel-records/by-truck/${truckNo}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/fuel-records/by-do/:doNumber', () => {
    it('should find fuel record by going DO', async () => {
      await createTestFuelRecord({ goingDo: 'DO-FRBYDO-001' });

      const response = await request(app)
        .get('/api/fuel-records/by-do/DO-FRBYDO-001')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.goingDo).toBe('DO-FRBYDO-001');
      expect(response.body.data.detectedDirection).toBe('going');
    });

    it('should find fuel record by return DO', async () => {
      await createTestFuelRecord({ 
        goingDo: 'DO-FRBYDORET-001',
        returnDo: 'DO-FRBYDORET-RET'
      });

      const response = await request(app)
        .get('/api/fuel-records/by-do/DO-FRBYDORET-RET')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.returnDo).toBe('DO-FRBYDORET-RET');
      expect(response.body.data.detectedDirection).toBe('returning');
    });
  });

  describe('POST /api/fuel-records', () => {
    it('should create a new fuel record', async () => {
      const recordData = {
        date: '2025-12-05',
        month: 'December 2025',
        truckNo: 'T999 NEW',
        goingDo: 'DO-FRCREATE-001',
        start: 'DAR',
        from: 'DAR ES SALAAM',
        to: 'LUBUMBASHI',
        totalLts: 2300,
        extra: 60,
        balance: 900,
        darYard: 550,
        mbeyaGoing: 450
      };

      const response = await request(app)
        .post('/api/fuel-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(recordData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.goingDo).toBe('DO-FRCREATE-001');
      expect(response.body.data.truckNo).toBe('T999 NEW');
    });

    it('should reject if truck has open fuel record', async () => {
      // Create an open fuel record
      await createTestFuelRecord({ 
        goingDo: 'DO-FROPEN-001',
        truckNo: 'T777 OPEN',
        returnDo: undefined
      });

      // Try to create another
      const response = await request(app)
        .post('/api/fuel-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2025-12-05',
          truckNo: 'T777 OPEN',
          goingDo: 'DO-FROPEN-002',
          start: 'DAR',
          from: 'DAR ES SALAAM',
          to: 'LUBUMBASHI',
          balance: 900
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already has an open fuel record');
    });

    it('should auto-populate month from date', async () => {
      const response = await request(app)
        .post('/api/fuel-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2025-12-05',
          truckNo: 'T888 MONTH',
          goingDo: 'DO-FRAUTOMONTH-001',
          start: 'DAR',
          from: 'DAR ES SALAAM',
          to: 'LUBUMBASHI',
          balance: 900
        })
        .expect(201);

      expect(response.body.data.month).toBe('December 2025');
    });
  });

  describe('PUT /api/fuel-records/:id', () => {
    it('should update a fuel record', async () => {
      const record = await createTestFuelRecord({ goingDo: 'DO-FRUPDATE-001' });

      const response = await request(app)
        .put(`/api/fuel-records/${record._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          darYard: 600,
          mbeyaGoing: 500
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.darYard).toBe(600);
      expect(response.body.data.mbeyaGoing).toBe(500);
    });

    it('should add return DO to fuel record', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-FRRETURN-001' 
      });

      const response = await request(app)
        .put(`/api/fuel-records/${record._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          returnDo: 'DO-FRRETURN-EXP'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.returnDo).toBe('DO-FRRETURN-EXP');
    });
  });

  describe('PUT /api/fuel-records/:id/dispense', () => {
    it('should update fuel dispensing at a checkpoint', async () => {
      const record = await createTestFuelRecord({ 
        goingDo: 'DO-FRDISPENSE-001',
        darYard: 0
      });

      const response = await request(app)
        .put(`/api/fuel-records/${record._id}/dispense`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          checkpoint: 'darYard',
          liters: 550
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.darYard).toBe(550);
    });
  });

  describe('DELETE /api/fuel-records/:id', () => {
    it('should soft delete a fuel record', async () => {
      const record = await createTestFuelRecord({ goingDo: 'DO-FRDELETE-001' });

      const response = await request(app)
        .delete(`/api/fuel-records/${record._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const deletedRecord = await FuelRecord.findById(record._id);
      expect(deletedRecord!.isDeleted).toBe(true);
    });
  });

  describe('Fuel Calculation Scenarios', () => {
    it('should handle standard DAR to Congo journey', async () => {
      const response = await request(app)
        .post('/api/fuel-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2025-12-05',
          truckNo: 'T001 DARCON',
          goingDo: 'DO-DARCON-INTEG',
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
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      
      // Verify fuel distribution
      const record = response.body.data;
      const allocated = record.darYard + record.mbeyaGoing + 
                        record.zambiaGoing + record.congoFuel;
      expect(allocated).toBe(1800);
    });

    it('should handle Tanga start journey', async () => {
      const response = await request(app)
        .post('/api/fuel-records')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2025-12-05',
          truckNo: 'T002 TANGA',
          goingDo: 'DO-TANGA-INTEG',
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
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tangaYard).toBe(100);
    });

    it('should handle return journey fuel allocation', async () => {
      // First create going journey
      const goingRecord = await createTestFuelRecord({
        goingDo: 'DO-RETURN-GOING',
        truckNo: 'T003 RETURN',
        from: 'DAR ES SALAAM',
        to: 'LUBUMBASHI'
      });

      // Update with return journey
      const response = await request(app)
        .put(`/api/fuel-records/${goingRecord._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          returnDo: 'DO-RETURN-EXP',
          zambiaReturn: 400,
          tundumaReturn: 100,
          mbeyaReturn: 450,
          moroReturn: 0,
          darReturn: 0
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.returnDo).toBe('DO-RETURN-EXP');
      expect(response.body.data.zambiaReturn).toBe(400);
    });
  });
});
