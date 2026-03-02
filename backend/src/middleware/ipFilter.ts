import { Request, Response, NextFunction } from 'express';
import { IPRule } from '../models/IPRule';
import logger from '../utils/logger';

// ─── IP / CIDR Helpers ────────────────────────────────────────────────────────

/** Validate IPv4 address (optionally with /prefix) */
export function isValidIPv4(value: string): boolean {
  const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}(\/(\d|[12]\d|3[012]))?$/;
  if (!cidrPattern.test(value)) return false;
  const [addr] = value.split('/');
  return addr.split('.').every((part) => parseInt(part, 10) <= 255);
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0) >>> 0;
}

/** Check if `ip` matches a rule entry (exact IP or CIDR) */
export function matchesRule(ip: string, ruleIP: string): boolean {
  try {
    if (!ruleIP.includes('/')) {
      return ip === ruleIP;
    }
    const [network, prefixStr] = ruleIP.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    const networkInt = ipToInt(network) & mask;
    const ipInt = ipToInt(ip) & mask;
    return networkInt === ipInt;
  } catch {
    return false;
  }
}

// ─── In-Memory Rule Cache ─────────────────────────────────────────────────────

interface CachedRules {
  allowRules: string[];
  blockRules: string[];
  loadedAt: number;
}

let _cache: CachedRules | null = null;
const CACHE_TTL_MS = 60_000; // refresh every 60 seconds

async function loadRules(): Promise<CachedRules> {
  const rules = await IPRule.find({ isActive: true }).lean();
  return {
    allowRules: rules.filter((r) => r.type === 'allow').map((r) => r.ip),
    blockRules: rules.filter((r) => r.type === 'block').map((r) => r.ip),
    loadedAt: Date.now(),
  };
}

/** Force-refresh the cache after rule changes */
export async function refreshIPRuleCache(): Promise<void> {
  _cache = await loadRules();
}

async function getCache(): Promise<CachedRules> {
  if (!_cache || Date.now() - _cache.loadedAt > CACHE_TTL_MS) {
    _cache = await loadRules();
  }
  return _cache;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Evaluates an IP against the cached allow/block rules.
 * Returns 'allow' | 'block' | 'none' (no matching rule).
 */
export async function evaluateIP(ip: string): Promise<{ verdict: 'allow' | 'block' | 'none'; matchedRule?: string }> {
  const cache = await getCache();

  // Check block rules first
  for (const ruleIP of cache.blockRules) {
    if (matchesRule(ip, ruleIP)) {
      return { verdict: 'block', matchedRule: ruleIP };
    }
  }

  // If there are active allow rules, only explicitly allowed IPs pass
  if (cache.allowRules.length > 0) {
    for (const ruleIP of cache.allowRules) {
      if (matchesRule(ip, ruleIP)) {
        return { verdict: 'allow', matchedRule: ruleIP };
      }
    }
    // IP not on allowlist → block
    return { verdict: 'block', matchedRule: undefined };
  }

  return { verdict: 'none' };
}

export const ipFilterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const ip = req.ip || req.socket.remoteAddress || '';

    // Always allow loopback
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return next();
    }

    // Normalize ::ffff: prefix for IPv4-mapped IPv6 addresses
    const normalizedIP = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

    const { verdict } = await evaluateIP(normalizedIP);

    if (verdict === 'block') {
      logger.warn(`IP blocked by IP filter rule: ${normalizedIP}`);
      res.status(403).json({
        success: false,
        message: 'Access denied: your IP address is not permitted.',
      });
      return;
    }

    next();
  } catch (err) {
    // On error, fail-open (do not block legitimate traffic due to DB issues)
    logger.error('IP filter middleware error — failing open:', err);
    next();
  }
};
