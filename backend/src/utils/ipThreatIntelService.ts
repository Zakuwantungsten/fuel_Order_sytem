/**
 * IP Threat Intelligence Service — AbuseIPDB integration
 *
 * check()  — query reputation (used at login risk scoring)
 * report() — submit confirmed scanner IPs (honeypot / path / 404 bans)
 *
 * Free tier: 1,000 checks / day; reports also count against quota.
 * Opt-in reporting: ABUSEIPDB_AUTO_REPORT=true (default off to conserve quota).
 */

import axios from 'axios';
import logger from './logger';

export interface ThreatIntelResult {
  isKnownBad: boolean;
  confidenceScore: number;
  totalReports: number;
  isTor: boolean;
}

interface CacheEntry {
  result: ThreatIntelResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ABUSEIPDB_CHECK_URL = 'https://api.abuseipdb.com/api/v2/check';
const ABUSEIPDB_REPORT_URL = 'https://api.abuseipdb.com/api/v2/report';
const DEFAULT_THRESHOLD = 25;

/** AbuseIPDB category IDs — https://www.abuseipdb.com/categories */
const CATEGORY = {
  DDoS: 4,
  PortScan: 14,
  Hacking: 15,
  BadWebBot: 19,
  WebAppAttack: 21,
} as const;

const _cache = new Map<string, CacheEntry>();
/** Dedupe reports per IP for 24h so we don't spam the API. */
const _reportedAt = new Map<string, number>();
const REPORT_DEDUP_MS = 24 * 60 * 60 * 1000;

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateIP(ip: string): boolean {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return PRIVATE_IP_PATTERNS.some((re) => re.test(normalized));
}

function categoriesForReason(reason: string): number[] {
  switch (reason) {
    case 'honeypot':
    case 'path_probe':
      return [CATEGORY.WebAppAttack, CATEGORY.Hacking];
    case 'suspicious_404':
      return [CATEGORY.PortScan, CATEGORY.BadWebBot];
    case 'ua_blocked':
      return [CATEGORY.BadWebBot, CATEGORY.WebAppAttack];
    case 'rate_limit':
      return [CATEGORY.DDoS, CATEGORY.BadWebBot];
    case 'brute_force':
    case 'auth_failure':
      return [CATEGORY.Hacking];
    default:
      return [CATEGORY.WebAppAttack];
  }
}

const ipThreatIntelService = {
  async check(ip: string): Promise<ThreatIntelResult> {
    const apiKey = process.env.ABUSEIPDB_API_KEY;
    const safe: ThreatIntelResult = {
      isKnownBad: false,
      confidenceScore: 0,
      totalReports: 0,
      isTor: false,
    };

    if (!apiKey) return safe;
    if (isPrivateIP(ip)) return safe;

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
      }>(ABUSEIPDB_CHECK_URL, {
        headers: {
          Key: apiKey,
          Accept: 'application/json',
        },
        params: {
          ipAddress: ip,
          maxAgeInDays: 90,
        },
        timeout: 3_000,
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
      logger.debug('[ThreatIntel] AbuseIPDB check failed (failing open)', {
        ip,
        error: err?.message,
      });
      return safe;
    }
  },

  /**
   * Report a confirmed malicious IP to AbuseIPDB (opt-in).
   * Requires ABUSEIPDB_API_KEY and ABUSEIPDB_AUTO_REPORT=true.
   * Fail-open: never throws; dedupes per IP for 24h.
   */
  async report(
    ip: string,
    reason: string,
    comment?: string,
  ): Promise<{ reported: boolean }> {
    const apiKey = process.env.ABUSEIPDB_API_KEY;
    if (!apiKey || process.env.ABUSEIPDB_AUTO_REPORT !== 'true') {
      return { reported: false };
    }
    if (isPrivateIP(ip)) return { reported: false };

    const last = _reportedAt.get(ip);
    if (last && Date.now() - last < REPORT_DEDUP_MS) {
      return { reported: false };
    }

    try {
      const categories = categoriesForReason(reason).join(',');
      await axios.post(
        ABUSEIPDB_REPORT_URL,
        new URLSearchParams({
          ip,
          categories,
          comment: (comment || `Fuel Order auto-report: ${reason}`).slice(0, 1024),
        }).toString(),
        {
          headers: {
            Key: apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5_000,
        },
      );
      _reportedAt.set(ip, Date.now());
      logger.info('[ThreatIntel] Reported IP to AbuseIPDB', { ip, reason, categories });
      return { reported: true };
    } catch (err: any) {
      logger.debug('[ThreatIntel] AbuseIPDB report failed (ignored)', {
        ip,
        error: err?.message,
        status: err?.response?.status,
      });
      return { reported: false };
    }
  },

  evict(ip: string): void {
    _cache.delete(ip);
  },

  cacheSize(): number {
    return _cache.size;
  },
};

export default ipThreatIntelService;
