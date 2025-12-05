import { User, DeliveryOrder, FuelRecord, LPOEntry } from '../../models';
import jwt from 'jsonwebtoken';

/**
 * Test data factories and utilities
 */

// User test data factory
export const createTestUser = async (overrides = {}) => {
  const defaultUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User',
    role: 'admin',
    isActive: true,
    isDeleted: false,
    ...overrides
  };
  
  return await User.create(defaultUser);
};

// Create multiple users for testing
export const createTestUsers = async (count: number, roleOverride?: string) => {
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push(await createTestUser({
      username: `testuser${i}`,
      email: `test${i}@example.com`,
      role: roleOverride || 'viewer'
    }));
  }
  return users;
};

// Delivery Order test data factory
export const createTestDeliveryOrder = async (overrides = {}) => {
  const defaultDO = {
    sn: 1,
    date: '2025-12-05',
    importOrExport: 'IMPORT',
    doType: 'DO',
    doNumber: `DO-${Date.now()}`,
    clientName: 'Test Client',
    truckNo: 'T123 ABC',
    trailerNo: 'TR001',
    loadingPoint: 'DAR ES SALAAM',
    destination: 'LUBUMBASHI',
    haulier: 'Test Haulier',
    tonnages: 30,
    ratePerTon: 100,
    status: 'active',
    isCancelled: false,
    isDeleted: false,
    ...overrides
  };
  
  return await DeliveryOrder.create(defaultDO);
};

// Fuel Record test data factory
export const createTestFuelRecord = async (overrides = {}) => {
  const defaultFuelRecord = {
    date: '2025-12-05',
    month: 'December 2025',
    truckNo: 'T123 ABC',
    goingDo: `DO-${Date.now()}`,
    start: 'DAR',
    from: 'DAR ES SALAAM',
    to: 'LUBUMBASHI',
    totalLts: 2300,
    extra: 60,
    balance: 900,
    darYard: 550,
    mbeyaGoing: 450,
    zambiaGoing: 400,
    congoFuel: 400,
    isDeleted: false,
    ...overrides
  };
  
  return await FuelRecord.create(defaultFuelRecord);
};

// LPO Entry test data factory
export const createTestLPOEntry = async (overrides = {}) => {
  const defaultLPO = {
    sn: 1,
    date: '2025-12-05',
    lpoNo: `LPO-${Date.now()}`,
    dieselAt: 'LAKE CHILABOMBWE',
    doSdo: 'DO-001',
    truckNo: 'T123 ABC',
    ltrs: 400,
    pricePerLtr: 1.5,
    destinations: 'LUBUMBASHI',
    isDeleted: false,
    ...overrides
  };
  
  return await LPOEntry.create(defaultLPO);
};

// Generate test JWT token
export const generateTestToken = (userId: string, username: string, role: string) => {
  const payload = {
    userId,
    username,
    role
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing', {
    expiresIn: '15m'
  });
};

// Generate expired token for testing
export const generateExpiredToken = (userId: string, username: string, role: string) => {
  const payload = {
    userId,
    username,
    role
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing', {
    expiresIn: '-1s' // Already expired
  });
};

// Clean up all test data
export const cleanupTestData = async () => {
  await User.deleteMany({});
  await DeliveryOrder.deleteMany({});
  await FuelRecord.deleteMany({});
  await LPOEntry.deleteMany({});
};

// Mock Express request object
export const mockRequest = (options = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ...options
});

// Mock Express response object
export const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

// Mock Express next function
export const mockNext = jest.fn();
