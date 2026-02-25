import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload } from '../types';

/**
 * Generate access token.
 * @param expiresIn - Optional override (e.g. '2h'). Falls back to JWT_EXPIRE env var.
 */
export const generateAccessToken = (payload: JWTPayload, expiresIn?: string): string => {
  const options: SignOptions = {
    expiresIn: (expiresIn ?? config.jwtExpire) as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
};

/**
 * Generate refresh token.
 * @param expiresIn - Optional override (e.g. '7d'). Falls back to JWT_REFRESH_EXPIRE env var.
 */
export const generateRefreshToken = (payload: JWTPayload, expiresIn?: string): string => {
  const options: SignOptions = {
    expiresIn: (expiresIn ?? config.jwtRefreshExpire) as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtRefreshSecret, options);
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, config.jwtRefreshSecret) as JWTPayload;
};

/**
 * Generate both access and refresh tokens.
 * @param accessExpiry  - Optional access token TTL override from SystemConfig (e.g. '2h').
 * @param refreshExpiry - Optional refresh token TTL override from SystemConfig (e.g. '7d').
 */
export const generateTokens = (payload: JWTPayload, accessExpiry?: string, refreshExpiry?: string) => {
  return {
    accessToken: generateAccessToken(payload, accessExpiry),
    refreshToken: generateRefreshToken(payload, refreshExpiry),
  };
};
