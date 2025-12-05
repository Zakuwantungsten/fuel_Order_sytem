import mongoose from 'mongoose';
import { User } from '../../../models';
import { createTestUser } from '../../helpers/testUtils';

describe('User Model', () => {
  describe('Validation', () => {
    it('should create a valid user', async () => {
      const user = await createTestUser();
      expect(user._id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admin');
    });

    it('should fail without required fields', async () => {
      const user = new User({});
      
      await expect(user.save()).rejects.toThrow();
    });

    it('should fail with invalid email format', async () => {
      await expect(createTestUser({ email: 'invalid-email' })).rejects.toThrow();
    });

    it('should fail with short password', async () => {
      await expect(createTestUser({ password: '123' })).rejects.toThrow();
    });

    it('should fail with short username', async () => {
      await expect(createTestUser({ 
        username: 'ab',
        email: 'unique@test.com'
      })).rejects.toThrow();
    });

    it('should convert email to lowercase', async () => {
      const user = await createTestUser({ 
        email: 'TEST@EXAMPLE.COM',
        username: 'lowercasetest'
      });
      expect(user.email).toBe('test@example.com');
    });

    it('should enforce unique username', async () => {
      await createTestUser({ username: 'unique1', email: 'unique1@test.com' });
      
      await expect(createTestUser({ 
        username: 'unique1', 
        email: 'unique2@test.com' 
      })).rejects.toThrow();
    });

    it('should enforce unique email', async () => {
      await createTestUser({ username: 'unique2', email: 'same@test.com' });
      
      await expect(createTestUser({ 
        username: 'unique3', 
        email: 'same@test.com' 
      })).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const plainPassword = 'password123';
      const user = await createTestUser({ password: plainPassword });
      
      // Password should be hashed, not plain text
      expect(user.password).not.toBe(plainPassword);
      expect(user.password).toMatch(/^\$2[ayb]\$.{56}$/); // bcrypt hash pattern
    });

    it('should correctly compare passwords', async () => {
      const plainPassword = 'password123';
      const user = await User.create({
        username: 'passwordtest',
        email: 'passwordtest@example.com',
        password: plainPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'viewer',
        isActive: true,
        isDeleted: false
      });

      // Need to fetch with password included
      const userWithPassword = await User.findById(user._id).select('+password');
      
      const isMatch = await userWithPassword!.comparePassword(plainPassword);
      expect(isMatch).toBe(true);
      
      const isNotMatch = await userWithPassword!.comparePassword('wrongpassword');
      expect(isNotMatch).toBe(false);
    });
  });

  describe('Role Validation', () => {
    it('should accept valid roles', async () => {
      const validRoles = [
        'super_admin', 'system_admin', 'admin', 'manager', 
        'supervisor', 'clerk', 'driver', 'viewer'
      ];

      for (let i = 0; i < validRoles.length; i++) {
        const user = await createTestUser({ 
          username: `roletest${i}`,
          email: `roletest${i}@test.com`,
          role: validRoles[i]
        });
        expect(user.role).toBe(validRoles[i]);
      }
    });

    it('should reject invalid roles', async () => {
      await expect(createTestUser({ 
        username: 'invalidrole',
        email: 'invalidrole@test.com',
        role: 'invalid_role' as any
      })).rejects.toThrow();
    });

    it('should default to viewer role', async () => {
      const user = await User.create({
        username: 'defaultrole',
        email: 'defaultrole@test.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        isDeleted: false
      });
      
      expect(user.role).toBe('viewer');
    });
  });

  describe('Soft Delete', () => {
    it('should support soft delete', async () => {
      const user = await createTestUser({ 
        username: 'softdelete',
        email: 'softdelete@test.com'
      });
      
      user.isDeleted = true;
      user.deletedAt = new Date();
      await user.save();

      const deletedUser = await User.findById(user._id);
      expect(deletedUser!.isDeleted).toBe(true);
      expect(deletedUser!.deletedAt).toBeDefined();
    });
  });

  describe('Ban Functionality', () => {
    it('should support banning users', async () => {
      const user = await createTestUser({ 
        username: 'bantest',
        email: 'bantest@test.com'
      });
      
      user.isBanned = true;
      user.bannedAt = new Date();
      user.bannedBy = 'admin';
      user.bannedReason = 'Violation of terms';
      await user.save();

      const bannedUser = await User.findById(user._id);
      expect(bannedUser!.isBanned).toBe(true);
      expect(bannedUser!.bannedReason).toBe('Violation of terms');
    });
  });

  describe('Yard Assignment', () => {
    it('should accept valid yard values', async () => {
      const validYards = ['DAR YARD', 'TANGA YARD', 'MMSA YARD'];
      
      for (let i = 0; i < validYards.length; i++) {
        const user = await createTestUser({ 
          username: `yardtest${i}`,
          email: `yardtest${i}@test.com`,
          yard: validYards[i] as any
        });
        expect(user.yard).toBe(validYards[i]);
      }
    });
  });
});
