import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload } from '../types';

/**
 * Generate access token
 */
export const generateAccessToken = (payload: JWTPayload): string => {
  const options: SignOptions = {
    expiresIn: config.jwtExpire as unknown as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (payload: JWTPayload): string => {
  const options: SignOptions = {
    expiresIn: config.jwtRefreshExpire as unknown as SignOptions['expiresIn'],
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
 * Generate both access and refresh tokens
 */
export const generateTokens = (payload: JWTPayload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};
