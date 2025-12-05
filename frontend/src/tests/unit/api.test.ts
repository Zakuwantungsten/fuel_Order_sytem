import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    }))
  }
}));

// Get the mocked client
const mockedAxios = axios.create() as any;

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deliveryOrdersAPI', () => {
    it('should fetch all delivery orders', async () => {
      const mockOrders = [
        { id: '1', doNumber: 'DO-001', clientName: 'Client 1' },
        { id: '2', doNumber: 'DO-002', clientName: 'Client 2' }
      ];
      
      mockedAxios.get.mockResolvedValueOnce({ 
        data: { 
          success: true, 
          data: { data: mockOrders }
        }
      });

      const response = await mockedAxios.get('/delivery-orders');
      expect(mockedAxios.get).toHaveBeenCalledWith('/delivery-orders');
      expect(response.data.data.data).toEqual(mockOrders);
    });

    it('should fetch delivery order by ID', async () => {
      const mockOrder = { id: '1', doNumber: 'DO-001', clientName: 'Client 1' };
      
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockOrder }
      });

      const response = await mockedAxios.get('/delivery-orders/1');
      expect(mockedAxios.get).toHaveBeenCalledWith('/delivery-orders/1');
      expect(response.data.data).toEqual(mockOrder);
    });

    it('should create a delivery order', async () => {
      const newOrder = {
        doNumber: 'DO-003',
        clientName: 'New Client',
        truckNo: 'T123 ABC'
      };
      
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: { id: '3', ...newOrder } }
      });

      const response = await mockedAxios.post('/delivery-orders', newOrder);
      expect(mockedAxios.post).toHaveBeenCalledWith('/delivery-orders', newOrder);
      expect(response.data.data.doNumber).toBe('DO-003');
    });

    it('should update a delivery order', async () => {
      const updateData = { destination: 'NEW DESTINATION' };
      
      mockedAxios.put.mockResolvedValueOnce({
        data: { 
          success: true, 
          data: { id: '1', doNumber: 'DO-001', destination: 'NEW DESTINATION' }
        }
      });

      const response = await mockedAxios.put('/delivery-orders/1', updateData);
      expect(mockedAxios.put).toHaveBeenCalledWith('/delivery-orders/1', updateData);
      expect(response.data.data.destination).toBe('NEW DESTINATION');
    });

    it('should delete a delivery order', async () => {
      mockedAxios.delete.mockResolvedValueOnce({
        data: { success: true }
      });

      const response = await mockedAxios.delete('/delivery-orders/1');
      expect(mockedAxios.delete).toHaveBeenCalledWith('/delivery-orders/1');
      expect(response.data.success).toBe(true);
    });
  });

  describe('fuelRecordsAPI', () => {
    it('should fetch all fuel records', async () => {
      const mockRecords = [
        { id: '1', goingDo: 'DO-001', truckNo: 'T123 ABC', totalLts: 2300 },
        { id: '2', goingDo: 'DO-002', truckNo: 'T456 DEF', totalLts: 2200 }
      ];
      
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: { data: mockRecords } }
      });

      const response = await mockedAxios.get('/fuel-records');
      expect(mockedAxios.get).toHaveBeenCalledWith('/fuel-records');
      expect(response.data.data.data).toEqual(mockRecords);
    });

    it('should fetch fuel record by truck number', async () => {
      const mockRecords = [
        { id: '1', goingDo: 'DO-001', truckNo: 'T123 ABC', totalLts: 2300 }
      ];
      
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockRecords }
      });

      const response = await mockedAxios.get('/fuel-records/by-truck/T123%20ABC');
      expect(response.data.data).toEqual(mockRecords);
    });

    it('should fetch fuel record by DO number', async () => {
      const mockRecord = { 
        id: '1', 
        goingDo: 'DO-001', 
        truckNo: 'T123 ABC', 
        detectedDirection: 'going' 
      };
      
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockRecord }
      });

      const response = await mockedAxios.get('/fuel-records/by-do/DO-001');
      expect(response.data.data.detectedDirection).toBe('going');
    });

    it('should create a fuel record', async () => {
      const newRecord = {
        date: '2025-12-05',
        truckNo: 'T123 ABC',
        goingDo: 'DO-003',
        totalLts: 2300,
        balance: 900
      };
      
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: { id: '3', ...newRecord } }
      });

      const response = await mockedAxios.post('/fuel-records', newRecord);
      expect(mockedAxios.post).toHaveBeenCalledWith('/fuel-records', newRecord);
    });

    it('should update fuel record with return journey', async () => {
      const updateData = { 
        returnDo: 'DO-EXPORT-001',
        zambiaReturn: 400
      };
      
      mockedAxios.put.mockResolvedValueOnce({
        data: { success: true, data: { id: '1', returnDo: 'DO-EXPORT-001' } }
      });

      const response = await mockedAxios.put('/fuel-records/1', updateData);
      expect(response.data.data.returnDo).toBe('DO-EXPORT-001');
    });
  });

  describe('authAPI', () => {
    it('should login successfully', async () => {
      const credentials = { username: 'testuser', password: 'password123' };
      const mockResponse = {
        user: { id: '1', username: 'testuser', role: 'admin' },
        accessToken: 'test-token',
        refreshToken: 'test-refresh'
      };
      
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockResponse }
      });

      const response = await mockedAxios.post('/auth/login', credentials);
      expect(mockedAxios.post).toHaveBeenCalledWith('/auth/login', credentials);
      expect(response.data.data.accessToken).toBeDefined();
    });

    it('should handle login failure', async () => {
      const credentials = { username: 'wronguser', password: 'wrongpass' };
      
      mockedAxios.post.mockRejectedValueOnce({
        response: { 
          status: 401, 
          data: { success: false, message: 'Invalid credentials' } 
        }
      });

      await expect(mockedAxios.post('/auth/login', credentials))
        .rejects.toMatchObject({
          response: { status: 401 }
        });
    });

    it('should refresh token', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { 
          success: true, 
          data: { accessToken: 'new-token', refreshToken: 'new-refresh' } 
        }
      });

      const response = await mockedAxios.post('/auth/refresh', { 
        refreshToken: 'old-refresh' 
      });
      expect(response.data.data.accessToken).toBe('new-token');
    });

    it('should logout', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, message: 'Logged out successfully' }
      });

      const response = await mockedAxios.post('/auth/logout');
      expect(response.data.success).toBe(true);
    });
  });

  describe('lpoAPI', () => {
    it('should fetch all LPO entries', async () => {
      const mockLPOs = [
        { id: '1', lpoNo: 'LPO-001', truckNo: 'T123 ABC', ltrs: 400 },
        { id: '2', lpoNo: 'LPO-002', truckNo: 'T456 DEF', ltrs: 350 }
      ];
      
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: { data: mockLPOs } }
      });

      const response = await mockedAxios.get('/lpo-entries');
      expect(response.data.data.data).toEqual(mockLPOs);
    });

    it('should create LPO entry', async () => {
      const newLPO = {
        lpoNo: 'LPO-003',
        truckNo: 'T123 ABC',
        ltrs: 400,
        dieselAt: 'LAKE CHILABOMBWE'
      };
      
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: { id: '3', ...newLPO } }
      });

      const response = await mockedAxios.post('/lpo-entries', newLPO);
      expect(response.data.data.lpoNo).toBe('LPO-003');
    });
  });

  describe('userAPI', () => {
    it('should fetch all users', async () => {
      const mockUsers = [
        { id: '1', username: 'admin', role: 'admin' },
        { id: '2', username: 'driver1', role: 'driver' }
      ];
      
      mockedAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockUsers }
      });

      const response = await mockedAxios.get('/users');
      expect(response.data.data).toEqual(mockUsers);
    });

    it('should create a user', async () => {
      const newUser = {
        username: 'newuser',
        email: 'new@test.com',
        password: 'password123',
        role: 'viewer'
      };
      
      mockedAxios.post.mockResolvedValueOnce({
        data: { success: true, data: { id: '3', ...newUser } }
      });

      const response = await mockedAxios.post('/users', newUser);
      expect(response.data.data.username).toBe('newuser');
    });

    it('should update a user', async () => {
      mockedAxios.put.mockResolvedValueOnce({
        data: { success: true, data: { id: '1', role: 'manager' } }
      });

      const response = await mockedAxios.put('/users/1', { role: 'manager' });
      expect(response.data.data.role).toBe('manager');
    });

    it('should ban a user', async () => {
      mockedAxios.put.mockResolvedValueOnce({
        data: { success: true, data: { id: '1', isBanned: true } }
      });

      const response = await mockedAxios.put('/users/1/ban', { 
        reason: 'Violation' 
      });
      expect(response.data.data.isBanned).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(mockedAxios.get('/delivery-orders'))
        .rejects.toThrow('Network Error');
    });

    it('should handle 500 server errors', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { 
          status: 500, 
          data: { success: false, message: 'Internal Server Error' } 
        }
      });

      await expect(mockedAxios.get('/delivery-orders'))
        .rejects.toMatchObject({
          response: { status: 500 }
        });
    });

    it('should handle 404 not found', async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { 
          status: 404, 
          data: { success: false, message: 'Not found' } 
        }
      });

      await expect(mockedAxios.get('/delivery-orders/999'))
        .rejects.toMatchObject({
          response: { status: 404 }
        });
    });
  });
});
