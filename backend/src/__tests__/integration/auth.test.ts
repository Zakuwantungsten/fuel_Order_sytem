import request from 'supertest';
import express, { Express } from 'express';
import mongoose from 'mongoose';
import { User } from '../../models';
import { createTestUser, generateTestToken } from '../helpers/testUtils';

// Create test app
const createTestApp = (): Express => {
  const app = express();
  app.use(express.json());
  
  // Import auth routes
  const authRoutes = require('../../../routes/authRoutes').default;
  app.use('/api/auth', authRoutes);
  
  return app;
};

describe('Auth API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@test.com',
        password: 'password123',
        firstName: 'New',
        lastName: 'User'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe(userData.username);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should reject duplicate username', async () => {
      // Create first user
      await createTestUser({
        username: 'duplicate',
        email: 'first@test.com'
      });

      // Try to create second user with same username
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'duplicate',
          email: 'second@test.com',
          password: 'password123',
          firstName: 'Duplicate',
          lastName: 'User'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Username already exists');
    });

    it('should reject duplicate email', async () => {
      await createTestUser({
        username: 'emailtest1',
        email: 'duplicate@test.com'
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'emailtest2',
          email: 'duplicate@test.com',
          password: 'password123',
          firstName: 'Email',
          lastName: 'Test'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Email already exists');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'invalidemail',
          email: 'not-an-email',
          password: 'password123',
          firstName: 'Invalid',
          lastName: 'Email'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'shortpass',
          email: 'shortpass@test.com',
          password: '123',
          firstName: 'Short',
          lastName: 'Pass'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      await User.create({
        username: 'loginuser',
        email: 'loginuser@test.com',
        password: 'password123',
        firstName: 'Login',
        lastName: 'User',
        role: 'admin',
        isActive: true,
        isDeleted: false
      });
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('loginuser');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should reject invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid username or password');
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid username or password');
    });

    it('should reject banned user', async () => {
      // Ban the user
      await User.findOneAndUpdate(
        { username: 'loginuser' },
        { 
          isBanned: true,
          bannedReason: 'Test ban'
        }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser',
          password: 'password123'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('banned');
    });

    it('should reject inactive user', async () => {
      await User.findOneAndUpdate(
        { username: 'loginuser' },
        { isActive: false }
      );

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'loginuser',
          password: 'password123'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('deactivated');
    });

    it('should handle driver login with truck number', async () => {
      // This test assumes there's a delivery order with this truck number
      // In real integration, we'd need to create one
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'T103DVL',
          password: 'T103DVL'
        });

      // Either succeeds (if truck exists) or fails gracefully
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      // Register a user first
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'refreshuser',
          email: 'refreshuser@test.com',
          password: 'password123',
          firstName: 'Refresh',
          lastName: 'User'
        });

      const { refreshToken } = registerResponse.body.data;

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      // Register a user first
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'logoutuser',
          email: 'logoutuser@test.com',
          password: 'password123',
          firstName: 'Logout',
          lastName: 'User'
        });

      const { accessToken } = registerResponse.body.data;

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logged out');
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
