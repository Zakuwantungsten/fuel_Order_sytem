import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../server';
import { FuelRecord } from '../../models/FuelRecord';
import { YardFuelDispense } from '../../models/YardFuelDispense';
import { User } from '../../models/User';
import { generateToken } from '../../utils/jwt';

describe('Yard Fuel Auto-Linking with Cancelled Records', () => {
  let authToken: string;
  let yardUserId: string;
  let activeFuelRecordId: string;
  let cancelledFuelRecordId: string;

  beforeAll(async () => {
    // Create test yard user
    const yardUser = await User.create({
      username: 'test_dar_yard',
      email: 'test_dar_yard@test.com',
      password: 'TestPassword123!',
      role: 'dar_yard',
      fullName: 'Test DAR Yard User',
      isActive: true,
    });
    yardUserId = yardUser._id.toString();
    authToken = generateToken(yardUserId, 'test_dar_yard', 'dar_yard');
  });

  afterAll(async () => {
    // Cleanup
    await User.deleteMany({ username: /^test_/ });
    await FuelRecord.deleteMany({ truckNo: /^TEST/ });
    await YardFuelDispense.deleteMany({ truckNo: /^TEST/ });
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await FuelRecord.deleteMany({ truckNo: /^TEST/ });
    await YardFuelDispense.deleteMany({ truckNo: /^TEST/ });

    const testDate = new Date().toISOString().split('T')[0];

    // Create a cancelled fuel record
    const cancelledRecord = await FuelRecord.create({
      date: testDate,
      month: testDate.substring(0, 7),
      truckNo: 'TEST001ABC',
      goingDo: 'DO-CANCELLED-001',
      returnDo: '',
      start: 'DAR ES SALAAM',
      from: 'DAR ES SALAAM',
      to: 'ZAMBIA',
      totalLts: 1000,
      extra: 0,
      darYard: 550,
      tangaYard: 0,
      mmsaYard: 0,
      darGoing: 0,
      moroGoing: 0,
      mbeyaGoing: 450,
      tdmGoing: 0,
      zambiaGoing: 0,
      congoFuel: 0,
      zambiaReturn: 0,
      tundumaReturn: 0,
      mbeyaReturn: 0,
      moroReturn: 0,
      darReturn: 0,
      tangaReturn: 0,
      balance: 0,
      isDeleted: false,
      isCancelled: true,
      cancelledAt: new Date(),
      cancellationReason: 'Test cancelled DO',
      cancelledBy: 'test_admin',
    });
    cancelledFuelRecordId = cancelledRecord._id.toString();

    // Create an active fuel record (should be the one that gets linked)
    const activeRecord = await FuelRecord.create({
      date: testDate,
      month: testDate.substring(0, 7),
      truckNo: 'TEST001ABC',
      goingDo: 'DO-ACTIVE-001',
      returnDo: '',
      start: 'DAR ES SALAAM',
      from: 'DAR ES SALAAM',
      to: 'ZAMBIA',
      totalLts: 1000,
      extra: 0,
      darYard: 550,
      tangaYard: 0,
      mmsaYard: 0,
      darGoing: 0,
      moroGoing: 0,
      mbeyaGoing: 450,
      tdmGoing: 0,
      zambiaGoing: 0,
      congoFuel: 0,
      zambiaReturn: 0,
      tundumaReturn: 0,
      mbeyaReturn: 0,
      moroReturn: 0,
      darReturn: 0,
      tangaReturn: 0,
      balance: 0,
      isDeleted: false,
      isCancelled: false,
    });
    activeFuelRecordId = activeRecord._id.toString();
  });

  describe('POST /api/yard-fuel - Auto-linking with cancelled records', () => {
    it('should link to active DO and ignore cancelled DO', async () => {
      const testDate = new Date().toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/yard-fuel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          truckNo: 'TEST001ABC',
          liters: 44,
          date: testDate,
          notes: 'Test yard fuel entry',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('linked');
      expect(response.body.data.linkedDONumber).toBe('DO-ACTIVE-001');
      expect(response.body.data.linkedFuelRecordId).toBe(activeFuelRecordId);
      expect(response.body.data.autoLinked).toBe(true);

      // Verify fuel record was updated correctly
      const updatedRecord = await FuelRecord.findById(activeFuelRecordId);
      expect(updatedRecord?.darYard).toBe(550 - 44); // 506

      // Verify cancelled record was NOT modified
      const cancelledRecord = await FuelRecord.findById(cancelledFuelRecordId);
      expect(cancelledRecord?.darYard).toBe(550); // Unchanged
    });

    it('should remain pending when only cancelled DO exists', async () => {
      // Delete the active record, leaving only cancelled
      await FuelRecord.findByIdAndDelete(activeFuelRecordId);

      const testDate = new Date().toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/yard-fuel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          truckNo: 'TEST001ABC',
          liters: 44,
          date: testDate,
          notes: 'Test with only cancelled DO',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.linkedDONumber).toBeUndefined();
      expect(response.body.message).toContain('Will be linked when fuel record is created');
    });

    it('should link to active DO even when cancelled DO has more recent date', async () => {
      // Update cancelled record to have a more recent date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      await FuelRecord.findByIdAndUpdate(cancelledFuelRecordId, {
        date: tomorrowStr,
      });

      const testDate = new Date().toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/yard-fuel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          truckNo: 'TEST001ABC',
          liters: 44,
          date: testDate,
          notes: 'Test with cancelled DO having newer date',
        })
        .expect(201);

      // Should still link to active DO, not cancelled one (most recent active)
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('linked');
      expect(response.body.data.linkedDONumber).toBe('DO-ACTIVE-001');
    });

    it('should link to fuel record regardless of date difference', async () => {
      // Create yard fuel entry many days after the fuel record date
      const testDate = new Date();
      testDate.setDate(testDate.getDate() + 10); // 10 days in the future
      const futureDateStr = testDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/yard-fuel')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          truckNo: 'TEST001ABC',
          liters: 44,
          date: futureDateStr,
          notes: 'Test with large date difference',
        })
        .expect(201);

      // Should link to active DO regardless of date difference
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('linked');
      expect(response.body.data.linkedDONumber).toBe('DO-ACTIVE-001');
      expect(response.body.data.linkedFuelRecordId).toBe(activeFuelRecordId);
    });
  });

  describe('POST /api/yard-fuel/link-pending - Manual linking validation', () => {
    it('should reject linking to cancelled fuel record', async () => {
      // Create a pending yard fuel entry
      const testDate = new Date().toISOString().split('T')[0];
      await YardFuelDispense.create({
        date: testDate,
        truckNo: 'TEST001ABC',
        liters: 44,
        yard: 'DAR YARD',
        enteredBy: 'test_dar_yard',
        timestamp: new Date(),
        status: 'pending',
        isDeleted: false,
      });

      // Try to link to cancelled fuel record (should fail)
      const response = await request(app)
        .post('/api/yard-fuel/link-pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fuelRecordId: cancelledFuelRecordId,
          truckNo: 'TEST001ABC',
          doNumber: 'DO-CANCELLED-001',
          date: testDate,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('cancelled');
    });

    it('should successfully link to active fuel record', async () => {
      // Create a pending yard fuel entry
      const testDate = new Date().toISOString().split('T')[0];
      await YardFuelDispense.create({
        date: testDate,
        truckNo: 'TEST001ABC',
        liters: 44,
        yard: 'DAR YARD',
        enteredBy: 'test_dar_yard',
        timestamp: new Date(),
        status: 'pending',
        isDeleted: false,
      });

      // Link to active fuel record (should succeed)
      const response = await request(app)
        .post('/api/yard-fuel/link-pending')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          fuelRecordId: activeFuelRecordId,
          truckNo: 'TEST001ABC',
          doNumber: 'DO-ACTIVE-001',
          date: testDate,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.linkedCount).toBe(1);
    });
  });
});
