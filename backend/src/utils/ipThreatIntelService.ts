/**
 * IP Threat Intelligence Service — AbuseIPDB integration
 *
 * Queries AbuseIPDB (https://www.abuseipdb.com) to check whether a given IP
 * has been reported for malicious activity.
 *
 * Free tier: 1,000 checks / day.
 * Results are cached in-memory for 6 hours to conserve the daily quota.
 *
 * Configuration (environment variables):
 *   ABUSEIPDB_API_KEY   — API key from abuseipdb.com. If unset, all checks
 *                         return { isKnownBad: false } and the service is
 *                         effectively disabled without breaking anything.
 *   ABUSEIPDB_THRESHOLD — Abuse confidence score (0–100) at or above which
 *                         an IP is considered known-bad. Default: 25.
 */

import axios from 'axios';
import logger from './logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThreatIntelResult {
  isKnownBad: boolean;     // true if score ≥ threshold and not whitelisted
  confidenceScore: number; // 0–100 AbuseIPDB abuse confidence score
  totalReports: number;    // number of reports on this IP
  isTor: boolean;          // known Tor exit node
}

// ─── Private ─────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: ThreatIntelResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const ABUSEIPDB_URL = 'https://api.abuseipdb.com/api/v2/check';
const DEFAULT_THRESHOLD = 25;

const _cache = new Map<string, CacheEntry>();

// RFC 1918 private, loopback, link-local, and IPv6 special ranges
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                      // IPv4 loopback
  /^10\./,                       // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC 1918 Class B
  /^192\.168\./,                  // RFC 1918 Class C
  /^169\.254\./,                  // link-local
  /^::1$/,                        // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,             // IPv6 ULA (fc00::/7)
  /^fd[0-9a-f]{2}:/i,             // IPv6 ULA (fd00::/8 subset)
];

function isPrivateIP(ip: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return PRIVATE_IP_PATTERNS.some((re) => re.test(normalized));
}

// ─── Service ─────────────────────────────────────────────────────────────────

const ipThreatIntelService = {
  /**
   * Check whether an IP is listed as malicious on AbuseIPDB.
   *
   * Returns safe defaults (isKnownBad: false) when:
   *   - ABUSEIPDB_API_KEY is not set (service disabled)
   *   - The IP is a private / loopback address (internal traffic)
   *   - The API call fails or times out (fail-open: never block users due to API outage)
   */
  async check(ip: string): Promise<ThreatIntelResult> {
    const apiKey = process.env.ABUSEIPDB_API_KEY;
    const safe: ThreatIntelResult = {
      isKnownBad: false,
      confidenceScore: 0,
      totalReports: 0,
      isTor: false,
    };

    // Service disabled — no API key configured
    if (!apiKey) return safe;

    // Skip private / loopback IPs
    if (isPrivateIP(ip)) return safe;

    // Return cached result if still fresh
    const cached = _cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    try {
      const threshold = parseInt(
        process.env.ABUSEIPDB_THRESHOLD || String(DEFAULT_THRESHOLD),
        10,
      );

      const response = await axios.get<{
        data: {
          abuseConfidenceScore: number;
          totalReports: number;
          isTor: boolean;
          isWhitelisted: boolean;
        };
      }>(ABUSEIPDB_URL, {
        headers: {
          Key: apiKey,
          Accept: 'application/json',
        },
        params: {
          ipAddress: ip,
          maxAgeInDays: 90,
        },
        timeout: 3_000, // 3 s — must not slow down login
      });

      const d = response.data.data;
      const result: ThreatIntelResult = {
        isKnownBad: !d.isWhitelisted && d.abuseConfidenceScore >= threshold,
        confidenceScore: d.abuseConfidenceScore,
        totalReports: d.totalReports,
        isTor: d.isTor ?? false,
      };

      _cache.set(ip, { result, expiresAt: Date.now() + CACHE_TTL_MS });

      if (result.isKnownBad) {
        logger.warn('[ThreatIntel] Known-bad IP detected via AbuseIPDB', {
          ip,
          confidenceScore: result.confidenceScore,
          totalReports: result.totalReports,
          isTor: result.isTor,
        });
      }

      return result;
    } catch (err: any) {
      // Fail open — a timeout or API error must never block legitimate users
      logger.debug('[ThreatIntel] AbuseIPDB check failed (failing open)', {
        ip,
        error: err?.message,
      });
      return safe;
    }
  },

  /** Manually evict an IP from the local cache (e.g. after manual unblock). */
  evict(ip: string): void {
    _cache.delete(ip);
  },

  /** Current cache size — useful for metrics / health checks. */
  cacheSize(): number {
    return _cache.size;
  },
};

export default ipThreatIntelService;
