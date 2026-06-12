import { Request, Response, NextFunction } from 'express';
import * as net from 'net';
import { IPRule } from '../models/IPRule';
import { getClientIP } from '../utils/getClientIP';
import logger from '../utils/logger';

// ─── IP / CIDR Helpers ────────────────────────────────────────────────────────

/** Validate IPv4 address (optionally with /prefix) */
export function isValidIPv4(value: string): boolean {
  const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}(\/(\d|[12]\d|3[012]))?$/;
  if (!cidrPattern.test(value)) return false;
  const [addr] = value.split('/');
  return addr.split('.').every((part) => parseInt(part, 10) <= 255);
}

/** Validate IPv6 address (optionally with /prefix) */
export function isValidIPv6(value: string): boolean {
  const parts = value.split('/');
  if (parts.length > 2) return false;
  if (!net.isIPv6(parts[0])) return false;
  if (parts.length === 2) {
    const prefix = parseInt(parts[1], 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;
  }
  return true;
}

/** Validate IPv4 or IPv6 address (optionally with CIDR prefix) */
export function isValidIP(value: string): boolean {
  return isValidIPv4(value) || isValidIPv6(value);
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0) >>> 0;
}

/** Expand :: shorthand and zero-pad all groups to produce a full 8-group IPv6 string */
function expandIPv6(ip: string): string {
  if (ip.includes('::')) {
    const [left, right] = ip.split('::');
    const leftGroups = left ? left.split(':') : [];
    const rightGroups = right ? right.split(':') : [];
    const missing = 8 - leftGroups.length - rightGroups.length;
    return [...leftGroups, ...Array(missing).fill('0'), ...rightGroups]
      .map((g) => g.padStart(4, '0'))
      .join(':');
  }
  return ip.split(':').map((g) => g.padStart(4, '0')).join(':');
}

function ipv6ToBigInt(ip: string): bigint {
  return expandIPv6(ip)
    .split(':')
    .reduce((acc, group) => (acc << 16n) + BigInt(parseInt(group, 16)), 0n);
}

function matchesIPv6Rule(ip: string, ruleIP: string): boolean {
  try {
    if (!ruleIP.includes('/')) {
      // Compare as BigInt so different shorthand forms of the same address match
      return ipv6ToBigInt(ip) === ipv6ToBigInt(ruleIP);
    }
    const [network, prefixStr] = ruleIP.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 128) return false;
    const mask = prefix === 0 ? 0n : ((2n ** 128n - 1n) << BigInt(128 - prefix));
    return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(network) & mask);
  } catch {
    return false;
  }
}

/** Check if `ip` matches a rule entry (exact IP or CIDR, IPv4 or IPv6) */
export function matchesRule(ip: string, ruleIP: string): boolean {
  try {
    const isIPv6Address = ip.includes(':');
    const isIPv6Rule = ruleIP.includes(':');

    // Address family mismatch — never a match
    if (isIPv6Address !== isIPv6Rule) return false;

    if (isIPv6Rule) return matchesIPv6Rule(ip, ruleIP);

    // IPv4 path (unchanged)
    if (!ruleIP.includes('/')) return ip === ruleIP;
    const [network, prefixStr] = ruleIP.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
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
    const normalizedIP = getClientIP(req);

    // Always allow loopback
    if (normalizedIP === '127.0.0.1' || normalizedIP === '::1') {
      return next();
    }

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
