import express, { Express } from 'express';
import request from 'supertest';
import { LPOSummary } from '../../models';
import {
  createTestLPOEntry,
  createTestUser,
  generateTestToken,
} from '../helpers/testUtils';

jest.mock('expo-server-sdk', () => ({
  Expo: class MockExpo {
    static isExpoPushToken() { return true; }
    chunkPushNotifications(messages: unknown[]) { return [messages]; }
    async sendPushNotificationsAsync() { return []; }
  },
}));

const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  const routes = require('../../routes/lpoSummaryRoutes').default;
  app.use('/api/lpo-documents', routes);
  return app;
};

describe('LPO flat-list filter composition', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(async () => {
    const user = await createTestUser({
      username: 'lpo-filter-admin',
      email: 'lpo-filter-admin@test.com',
      role: 'admin',
    });
    token = generateTestToken(user._id.toString(), user.username, user.role);

    await createTestLPOEntry({
      lpoNo: 'LPO-1001',
      date: '2025-01-05',
      dieselAt: 'STATION A',
      truckNo: 'TRUCK MATCH',
    });
    await createTestLPOEntry({
      lpoNo: 'LPO-1002',
      date: '2025-01-06',
      dieselAt: 'STATION B',
      truckNo: 'TRUCK MATCH',
    });
    await createTestLPOEntry({
      lpoNo: 'LPO-1003',
      date: '2025-01-07',
      dieselAt: 'STATION A',
      pickedAtStation: 'STATION B',
      truckNo: 'TRUCK MATCH',
    });
    await createTestLPOEntry({
      lpoNo: 'LPO-1004',
      date: '2025-02-05',
      dieselAt: 'STATION A',
      truckNo: 'TRUCK MATCH',
    });
    await createTestLPOEntry({
      lpoNo: 'LPO-1005',
      date: '2025-03-05',
      dieselAt: 'STATION A',
      truckNo: 'TRUCK MATCH',
    });
  });

  it('ANDs search, effective station, and non-contiguous periods before pagination', async () => {
    const response = await request(app)
      .get('/api/lpo-documents/entries')
      .query({
        search: 'TRUCK MATCH',
        stations: 'STATION A',
        periods: '2025-01,2025-03',
        page: 1,
        limit: 1,
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.pagination.total).toBe(2);
    expect(response.body.data.pagination.totalPages).toBe(2);
    expect(response.body.data.data[0].dieselAt).toBe('STATION A');
  });

  it('filters multiple stations by effective picked-at station', async () => {
    const response = await request(app)
      .get('/api/lpo-documents/entries')
      .query({
        search: 'TRUCK MATCH',
        stations: 'STATION A,STATION B',
        periods: '2025-01',
        limit: 25,
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.pagination.total).toBe(3);
    expect(response.body.data.data.map((entry: any) => entry.dieselAt).sort()).toEqual([
      'STATION A',
      'STATION B',
      'STATION B',
    ]);
  });

  it('returns effective stations scoped to the selected periods', async () => {
    const response = await request(app)
      .get('/api/lpo-documents/entries/filters')
      .query({ periods: '2025-01' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.stations).toEqual(['STATION A', 'STATION B']);
  });

  it('intersects an exact date with the other active filters', async () => {
    const response = await request(app)
      .get('/api/lpo-documents/entries')
      .query({
        search: 'TRUCK MATCH',
        stations: 'STATION B',
        periods: '2025-01',
        dateFrom: '2025-01-06',
        dateTo: '2025-01-06',
      })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.pagination.total).toBe(1);
    expect(response.body.data.data[0].lpoNo).toBe('LPO-1002');
  });

  it('intersects requested stations with a manager station scope', async () => {
    const manager = await createTestUser({
      username: 'manager-station-a',
      email: 'manager-station-a@test.com',
      role: 'manager',
      station: 'STATION A',
    });
    const managerToken = generateTestToken(
      manager._id.toString(),
      manager.username,
      manager.role,
    );

    const response = await request(app)
      .get('/api/lpo-documents/entries')
      .query({
        search: 'TRUCK MATCH',
        stations: 'STATION B',
        periods: '2025-01',
      })
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    expect(response.body.data.pagination.total).toBe(0);
  });

  afterEach(async () => {
    await LPOSummary.deleteMany({});
  });
});
