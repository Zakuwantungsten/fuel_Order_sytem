import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { config } from '../config';
import BlocklistService from '../services/blocklistService';
import { getClientIP } from './getClientIP';

/** Calm copy for end users — never mention attacks, blocks, or security events. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  'Service temporarily unavailable. Please try again in a moment.';

export function isTrustedAdminIp(ip: string): boolean {
  return BlocklistService.isConfiguredTrustedAdmin(ip);
}

/** True when the request carries a valid (non-expired) access JWT. */
export function hasValidAccessToken(req: Request): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return false;
  try {
    jwt.verify(auth.slice(7), config.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

/**
 * Legitimate traffic should not be rate-limited: active sessions, recently
 * authenticated IPs, and configured admin egress.
 */
export function shouldSkipRateLimit(req: Request): boolean {
  if (hasValidAccessToken(req)) return true;

  const ip = getClientIP(req);
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return true;
  if (BlocklistService.isTrusted(ip)) return true;
  if (isTrustedAdminIp(ip)) return true;

  return false;
}

/**
 * Auth endpoints: only throttle IPs we have already flagged or blocked.
 * Good-faith first-time login attempts from clean IPs are not capped.
 */
export function shouldApplyAuthRateLimit(req: Request): boolean {
  if (shouldSkipRateLimit(req)) return false;

  const ip = getClientIP(req);
  if (ip === 'unknown') return false;

  const blocked = BlocklistService.isBlockedSync(ip);
  if (blocked.blocked) return true;

  return BlocklistService.getSuspiciousStrikeCount(ip) > 0;
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
