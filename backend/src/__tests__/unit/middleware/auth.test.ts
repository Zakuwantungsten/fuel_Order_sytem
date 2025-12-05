// Mock config FIRST before any imports
jest.mock('../../../config', () => ({
  config: {
    jwtSecret: 'test-jwt-secret-key-for-testing',
    jwtRefreshSecret: 'test-jwt-refresh-secret-key-for-testing',
    jwtExpire: '15m',
    jwtRefreshExpire: '7d',
    logFile: '/tmp/test.log',
    logLevel: 'error'
  }
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { Response, NextFunction } from 'express';
import { authenticate, authorize, AuthRequest } from '../../../middleware/auth';
import { createTestUser, generateTestToken, generateExpiredToken, mockResponse } from '../../helpers/testUtils';
import { User } from '../../../models';

describe('Auth Middleware', () => {
  describe('authenticate', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Response;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        headers: {},
        user: undefined
      };
      mockRes = mockResponse();
      mockNext = jest.fn();
    });

    it('should reject request without authorization header', async () => {
      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('No token provided')
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request without Bearer prefix', async () => {
      mockReq.headers = { authorization: 'InvalidToken123' };

      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid token', async () => {
      mockReq.headers = { authorization: 'Bearer invalid.token.here' };

      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Invalid token.'
        })
      );
    });

    it('should reject expired token', async () => {
      const user = await createTestUser({
        username: 'expireduser',
        email: 'expired@test.com'
      });
      
      const expiredToken = generateExpiredToken(
        user._id.toString(),
        user.username,
        user.role
      );
      mockReq.headers = { authorization: `Bearer ${expiredToken}` };

      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Token expired.'
        })
      );
    });

    it('should authenticate valid token and attach user to request', async () => {
      const user = await createTestUser({
        username: 'validuser',
        email: 'valid@test.com'
      });
      
      const token = generateTestToken(
        user._id.toString(),
        user.username,
        user.role
      );
      mockReq.headers = { authorization: `Bearer ${token}` };

      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(user._id.toString());
      expect(mockReq.user!.username).toBe(user.username);
      expect(mockReq.user!.role).toBe(user.role);
    });

    it('should reject token for inactive user', async () => {
      const user = await createTestUser({
        username: 'inactiveuser',
        email: 'inactive@test.com',
        isActive: false
      });
      
      const token = generateTestToken(
        user._id.toString(),
        user.username,
        user.role
      );
      mockReq.headers = { authorization: `Bearer ${token}` };

      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('no longer exists or is inactive')
        })
      );
    });

    it('should reject token for deleted user', async () => {
      const user = await createTestUser({
        username: 'deleteduser',
        email: 'deleted@test.com',
        isDeleted: true
      });
      
      const token = generateTestToken(
        user._id.toString(),
        user.username,
        user.role
      );
      mockReq.headers = { authorization: `Bearer ${token}` };

      await authenticate(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('authorize', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Response;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {};
      mockRes = mockResponse();
      mockNext = jest.fn();
    });

    it('should reject request without authenticated user', () => {
      const middleware = authorize('admin');
      
      middleware(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Authentication required.'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject user without required role', () => {
      mockReq.user = {
        userId: 'user123',
        username: 'testuser',
        role: 'viewer'
      };

      const middleware = authorize('admin', 'super_admin');
      
      middleware(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('not authorized')
        })
      );
    });

    it('should allow user with correct role', () => {
      mockReq.user = {
        userId: 'user123',
        username: 'adminuser',
        role: 'admin'
      };

      const middleware = authorize('admin');
      
      middleware(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow user with any of multiple roles', () => {
      mockReq.user = {
        userId: 'user123',
        username: 'manageruser',
        role: 'manager'
      };

      const middleware = authorize('admin', 'manager', 'supervisor');
      
      middleware(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow super_admin access to any role requirement', () => {
      mockReq.user = {
        userId: 'user123',
        username: 'superadmin',
        role: 'super_admin'
      };

      const middleware = authorize('super_admin');
      
      middleware(mockReq as AuthRequest, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
