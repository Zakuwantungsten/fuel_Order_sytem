/**
 * User-Agent Blocking Middleware
 *
 * Blocks requests from known malicious or scanning user-agents.
 * Fires early (before body parsing) to drop bot traffic cheaply.
 *
 * Configuration: reads bot_protection FirewallConfig from DB (refreshed every 60 s).
 * Toggle: SECURITY_UA_BLOCKING env var (default: enabled) — overridden if DB config is loaded.
 * Logs: SecurityEvent (ua_blocked), alerts via SecurityAlertService.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getClientIP } from '../utils/getClientIP';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';
import { FirewallConfig } from '../models/FirewallConfig';

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

// ─── Bot protection config cache ─────────────────────────────────────────────
// Loaded from FirewallConfig (key: 'bot_protection') and refreshed every 60 s.
// Falls back to env-var-based defaults until the first successful DB load.
interface BotConfig {
  enabled: boolean;
  /** 'challenge' is treated as 'block' — no CAPTCHA service is currently integrated */
  action: 'block' | 'challenge' | 'log';
  blockEmptyUA: boolean;
  userAgentBlocklist: string[];
  userAgentAllowlist: string[];
}

let _botConfig: BotConfig = {
  enabled: config.securityUaBlocking,
  action: 'block',
  blockEmptyUA: false,
  userAgentBlocklist: [],
  userAgentAllowlist: [],
};

const refreshBotConfig = async (): Promise<void> => {
  try {
    const doc = await FirewallConfig.findOne({ key: 'bot_protection' }).lean();
    if (doc?.value && typeof doc.value === 'object') {
      const v = doc.value as any;
      _botConfig = {
        enabled:            typeof v.enabled === 'boolean' ? v.enabled : true,
        action:             ['block', 'challenge', 'log'].includes(v.action) ? v.action : 'block',
        blockEmptyUA:       typeof v.blockEmptyUA === 'boolean' ? v.blockEmptyUA : false,
        userAgentBlocklist: Array.isArray(v.userAgentBlocklist) ? v.userAgentBlocklist.map(String) : [],
        userAgentAllowlist: Array.isArray(v.userAgentAllowlist) ? v.userAgentAllowlist.map(String) : [],
      };
    }
  } catch {
    // Non-fatal — keep current cached config
  }
};

// Initial load then periodic refresh every 60 seconds
refreshBotConfig().catch(() => {});
setInterval(refreshBotConfig, 60_000);

/**
 * Returns `true` if the user-agent matches any blocked pattern.
 */
export function isMaliciousUA(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BLOCKED_UA_PATTERNS.some(re => re.test(lower));
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export function uaBlockingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Respect stored config; fall back to env-var flag if config not yet loaded
  if (!_botConfig.enabled) {
    return next();
  }

  const ua = req.headers['user-agent'] || '';

  // Empty UA handling
  if (!ua) {
    if (_botConfig.blockEmptyUA) {
      const ip = getClientIP(req);
      logger.warn(`[UA-Block] Blocked empty user-agent from ${ip}`);
      return res.status(403).json({ success: false, message: 'Forbidden' }) as unknown as void;
    }
    return next();
  }

  // Check allowlist — always pass through allowed UAs
  const uaLower = ua.toLowerCase();
  if (_botConfig.userAgentAllowlist.some(a => a && uaLower.includes(a.toLowerCase()))) {
    return next();
  }

  // Check combined blocklist: hardcoded patterns + DB custom patterns
  const isBlockedByDB = _botConfig.userAgentBlocklist.some(p => p && uaLower.includes(p.toLowerCase()));
  if (!isMaliciousUA(ua) && !isBlockedByDB) {
    return next();
  }

  const ip = getClientIP(req);

  // Increment hit counter
  const hits = (_hitCounts.get(ip) || 0) + 1;
  _hitCounts.set(ip, hits);

  // Resolve effective action: 'challenge' falls back to 'block' (no CAPTCHA service)
  const effectiveAction = _botConfig.action === 'challenge' ? 'block' : _botConfig.action;

  logger.warn(`[UA-Block] ${effectiveAction === 'log' ? 'Logged' : 'Blocked'} malicious user-agent from ${ip} (action=${_botConfig.action}): ${ua.slice(0, 120)}`);

  // Fire-and-forget: log + record suspicious + alert
  (async () => {
    try {
      await securityLogService.logEvent({
        ip,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: ua.slice(0, 500),
        eventType: 'ua_blocked',
        severity: hits >= 5 ? 'high' : 'medium',
        metadata: { matchedUA: ua.slice(0, 200), hitCount: hits, action: effectiveAction },
        blocked: effectiveAction !== 'log',
      });

      await BlocklistService.recordSuspiciousEvent(ip, 'ua_blocked', `Malicious UA: ${ua.slice(0, 100)}`);

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

  if (effectiveAction === 'log') {
    // Log-only mode: record but let the request through
    return next();
  }

  res.status(403).json({ success: false, message: 'Forbidden' });
}
