/**
 * User-Agent Blocking Middleware
 *
 * Blocks requests from known malicious or scanning user-agents.
 * Fires early (before body parsing) to drop bot traffic cheaply.
 *
 * Toggle: SECURITY_UA_BLOCKING (default: enabled)
 * Logs: SecurityEvent (ua_blocked), alerts via SecurityAlertService.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';

// ─── Blocked UA patterns ─────────────────────────────────────────────────────
// Each regex is tested against the lowercased User-Agent string.
// Categories: vulnerability scanners, exploitation tools, aggressive bots,
//             script-kiddie shells, and raw HTTP libraries used for recon.

export const BLOCKED_UA_PATTERNS: RegExp[] = [
  // ── Vulnerability scanners ──
  /nikto/,
  /sqlmap/,
  /nmap/,
  /masscan/,
  /zmap/,
  /dirbuster/,
  /gobuster/,
  /dirb/,
  /wfuzz/,
  /ffuf/,
  /nuclei/,
  /acunetix/,
  /nessus/,
  /openvas/,
  /qualys/,
  /burpsuite|burp\s*suite/,
  /owasp[\s_-]*zap/,
  /arachni/,
  /w3af/,
  /skipfish/,
  /vega[\s/]/,
  /webscarab/,
  /havij/,

  // ── Exploitation tools ──
  /metasploit/,
  /commix/,
  /hydra/,
  /medusa[\s/]/,
  /slowloris/,
  /slowhttptest/,
  /hping/,
  /loic/, // Low Orbit Ion Cannon

  // ── Aggressive crawlers / spam bots ──
  /semrush/,
  /ahrefsbot/,
  /mj12bot/,
  /dotbot/,
  /blexbot/,
  /petalbot/,
  /megaindex/,
  /bytespider/,
  /sogou/,
  /yandexbot/,

  // ── Raw HTTP libraries used for automated scanning ──
  /python-requests/,
  /python-urllib/,
  /go-http-client/,
  /ruby/,
  /perl/,
  /libwww-perl/,
  /wget/,
  /curl\/\d/,       // curl/7.x, curl/8.x  (with version → automated)
  /httpie/,
  /axios\/\d/,
  /node-fetch/,
  /java\//,

  // ── Misc known bad ──
  /zgrab/,
  /censys/,
  /shodan/,
  /internet[\s-]*measurement/,
  /netcraft/,
  /thesis[\s-]*research/,
  /scrapy/,
  /phantomjs/,
  /headlesschrome(?!.*puppeteer)/,  // headless chrome (non-Puppeteer)
  /wp[\s_-]*scan/,
];

// ─── In-memory hit counter (per IP) ──────────────────────────────────────────
// Tracks how many times a given IP sent a blocked UA so we can escalate alerts.
const _hitCounts = new Map<string, number>();

// ─── Helper ──────────────────────────────────────────────────────────────────

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket.remoteAddress || '0.0.0.0';
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

/**
 * Returns `true` if the user-agent matches any blocked pattern.
 */
export function isMaliciousUA(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BLOCKED_UA_PATTERNS.some(re => re.test(lower));
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function uaBlockingMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.securityUaBlocking) {
    return next();
  }

  const ua = req.headers['user-agent'] || '';

  // Allow requests with no UA (some internal health checks)
  if (!ua) {
    return next();
  }

  if (!isMaliciousUA(ua)) {
    return next();
  }

  const ip = getClientIP(req);

  // Increment hit counter
  const hits = (_hitCounts.get(ip) || 0) + 1;
  _hitCounts.set(ip, hits);

  logger.warn(`[UA-Block] Blocked malicious user-agent from ${ip}: ${ua.slice(0, 120)}`);

  // Fire-and-forget: log + record suspicious + alert
  (async () => {
    try {
      // Persist security event
      await securityLogService.logEvent({
        ip,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: ua.slice(0, 500),
        eventType: 'ua_blocked',
        severity: hits >= 5 ? 'high' : 'medium',
        metadata: { matchedUA: ua.slice(0, 200), hitCount: hits },
        blocked: true,
      });

      // Record as suspicious for potential auto-block
      await BlocklistService.recordSuspiciousEvent(ip, 'ua_blocked', `Malicious UA: ${ua.slice(0, 100)}`);

      // Alert on repeated offenders
      if (hits === 3 || hits === 10 || hits % 25 === 0) {
        await securityAlertService.send({
          eventType: 'ua_blocked',
          severity: hits >= 10 ? 'high' : 'medium',
          ip,
          title: `Malicious User-Agent Detected: ${ip}`,
          description: `IP ${ip} has sent ${hits} request(s) with blocked user-agent(s). Latest: ${ua.slice(0, 120)}`,
          details: { latestUA: ua.slice(0, 200), totalHits: hits },
          url: req.originalUrl || req.url,
          method: req.method,
        });
      }
    } catch (err) {
      logger.error('[UA-Block] Async logging failed:', err);
    }
  })();

  res.status(403).json({ success: false, message: 'Forbidden' });
}
