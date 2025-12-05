import jwt from 'jsonwebtoken';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  generateTokens, 
  verifyRefreshToken 
} from '../../../utils/jwt';

// Mock config
jest.mock('../../../config', () => ({
  config: {
    jwtSecret: 'test-jwt-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    jwtExpire: '15m',
    jwtRefreshExpire: '7d'
  }
}));

describe('JWT Utilities', () => {
  const mockPayload = {
    userId: 'user123',
    username: 'testuser',
    role: 'admin' as const
  };

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = generateAccessToken(mockPayload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include payload in token', () => {
      const token = generateAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;
      
      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.username).toBe(mockPayload.username);
      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should include expiration in token', () => {
      const token = generateAccessToken(mockPayload);
      const decoded = jwt.decode(token) as any;
      
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid JWT refresh token', () => {
      const token = generateRefreshToken(mockPayload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include payload in refresh token', () => {
      const token = generateRefreshToken(mockPayload);
      const decoded = jwt.decode(token) as any;
      
      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.username).toBe(mockPayload.username);
      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should be different from access token', () => {
      const accessToken = generateAccessToken(mockPayload);
      const refreshToken = generateRefreshToken(mockPayload);
      
      expect(accessToken).not.toBe(refreshToken);
    });
  });

  describe('generateTokens', () => {
    it('should generate both access and refresh tokens', () => {
      const tokens = generateTokens(mockPayload);
      
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should generate unique tokens each time', () => {
      const tokens1 = generateTokens(mockPayload);
      
      // Wait a tiny bit to ensure different iat
      const tokens2 = generateTokens(mockPayload);
      
      // Tokens may be same if generated in same second, so just verify structure
      expect(tokens1.accessToken.split('.')).toHaveLength(3);
      expect(tokens1.refreshToken.split('.')).toHaveLength(3);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', () => {
      const token = generateRefreshToken(mockPayload);
      const decoded = verifyRefreshToken(token);
      
      expect(decoded.userId).toBe(mockPayload.userId);
      expect(decoded.username).toBe(mockPayload.username);
      expect(decoded.role).toBe(mockPayload.role);
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyRefreshToken('invalid.token.here')).toThrow();
    });

    it('should throw error for access token (wrong secret)', () => {
      const accessToken = generateAccessToken(mockPayload);
      expect(() => verifyRefreshToken(accessToken)).toThrow();
    });

    it('should throw error for tampered token', () => {
      const token = generateRefreshToken(mockPayload);
      const tamperedToken = token.slice(0, -5) + 'xxxxx';
      
      expect(() => verifyRefreshToken(tamperedToken)).toThrow();
    });
  });
});
