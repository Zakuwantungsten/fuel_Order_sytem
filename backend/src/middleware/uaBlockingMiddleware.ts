/**
 * User-Agent Blocking Middleware
 *
 * Blocks requests from known malicious or scanning user-agents.
 * Phase 2: 1st blocked-UA hit → temporary ban (24h); 2nd+ → permanent.
 *
 * Configuration: reads bot_protection FirewallConfig from DB (refreshed every 60 s).
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getClientIP } from '../utils/getClientIP';
import logger from '../utils/logger';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import { securityAlertService } from '../services/securityAlertService';
import { FirewallConfig } from '../models/FirewallConfig';

export const BLOCKED_UA_PATTERNS: RegExp[] = [
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
  new RegExp('vega[\\s/]'),
  /webscarab/,
  /havij/,
  /metasploit/,
  /commix/,
  /hydra/,
  new RegExp('medusa[\\s/]'),
  /slowloris/,
  /slowhttptest/,
  /hping/,
  /loic/,
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
  /python-requests/,
  /python-urllib/,
  /go-http-client/,
  /ruby/,
  /perl/,
  /libwww-perl/,
  /wget/,
  /curl\/\d/,
  /httpie/,
  /axios\/\d/,
  /node-fetch/,
  /java\//,
  /zgrab/,
  /censys/,
  /shodan/,
  /internet[\s-]*measurement/,
  /netcraft/,
  /thesis[\s-]*research/,
  /scrapy/,
  /phantomjs/,
  /headlesschrome(?!.*puppeteer)/,
  /wp[\s_-]*scan/,
];

const _hitCounts = new Map<string, number>();

interface BotConfig {
  enabled: boolean;
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
      const v = doc.value as Record<string, unknown>;
      _botConfig = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
        action: ['block', 'challenge', 'log'].includes(v.action as string)
          ? (v.action as BotConfig['action'])
          : 'block',
        blockEmptyUA: typeof v.blockEmptyUA === 'boolean' ? v.blockEmptyUA : false,
        userAgentBlocklist: Array.isArray(v.userAgentBlocklist) ? v.userAgentBlocklist.map(String) : [],
        userAgentAllowlist: Array.isArray(v.userAgentAllowlist) ? v.userAgentAllowlist.map(String) : [],
      };
    }
  } catch {
    // keep cached
  }
};

refreshBotConfig().catch(() => {});
setInterval(refreshBotConfig, 60_000);

export function isMaliciousUA(ua: string): boolean {
  const lower = ua.toLowerCase();
  return BLOCKED_UA_PATTERNS.some(re => re.test(lower));
}

export function uaBlockingMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!_botConfig.enabled) {
    return next();
  }

  const clientIP = getClientIP(req);
  if (clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === 'unknown') {
    return next();
  }

  const ua = req.headers['user-agent'] || '';

  if (!ua) {
    if (_botConfig.blockEmptyUA) {
      logger.warn(`[UA-Block] Blocked empty user-agent from ${clientIP}`);
      return res.status(403).json({ success: false, message: 'Forbidden' }) as unknown as void;
    }
    return next();
  }

  const uaLower = ua.toLowerCase();
  if (_botConfig.userAgentAllowlist.some(a => a && uaLower.includes(a.toLowerCase()))) {
    return next();
  }

  const isBlockedByDB = _botConfig.userAgentBlocklist.some(p => p && uaLower.includes(p.toLowerCase()));
  if (!isMaliciousUA(ua) && !isBlockedByDB) {
    return next();
  }

  const ip = clientIP;
  const hits = (_hitCounts.get(ip) || 0) + 1;
  _hitCounts.set(ip, hits);

  const effectiveAction = _botConfig.action === 'challenge' ? 'block' : _botConfig.action;

  logger.warn(
    `[UA-Block] ${effectiveAction === 'log' ? 'Logged' : 'Blocked'} malicious user-agent from ${ip} (hit #${hits}): ${ua.slice(0, 120)}`,
  );

  (async () => {
    try {
      let didBlock = false;
      let banDurationMs: number | null = null;

      if (effectiveAction !== 'log') {
        const tempMs = config.securityScannerTempBanMs > 0
          ? config.securityScannerTempBanMs
          : 24 * 60 * 60 * 1000;
        banDurationMs = hits === 1 ? tempMs : null; // 2nd+ → permanent
        const ban = await BlocklistService.blockScanner(
          ip,
          'ua_blocked',
          `Malicious UA (hit #${hits}): ${ua.slice(0, 100)}`,
          banDurationMs,
        );
        didBlock = ban.blocked;
      }

      await securityLogService.logEvent({
        ip,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: ua.slice(0, 500),
        eventType: 'ua_blocked',
        severity: hits >= 2 ? 'high' : 'medium',
        metadata: {
          matchedUA: ua.slice(0, 200),
          hitCount: hits,
          action: effectiveAction,
          blocked: didBlock,
          banDurationMs: banDurationMs ?? 0,
        },
        blocked: didBlock || effectiveAction !== 'log',
      });

      if (hits === 1 || hits === 2 || hits === 10 || hits % 25 === 0) {
        await securityAlertService.send({
          eventType: 'ua_blocked',
          severity: hits >= 2 ? 'high' : 'medium',
          ip,
          title: `Malicious User-Agent Detected: ${ip}`,
          description: didBlock
            ? `IP ${ip} blocked-UA hit #${hits} — ${banDurationMs ? 'temporary' : 'permanent'} ban. Latest: ${ua.slice(0, 120)}`
            : `IP ${ip} has sent ${hits} request(s) with blocked user-agent(s). Latest: ${ua.slice(0, 120)}`,
          details: {
            latestUA: ua.slice(0, 200),
            totalHits: hits,
            blocked: didBlock,
            banDurationMs: banDurationMs ?? 0,
          },
          url: req.originalUrl || req.url,
          method: req.method,
        });
      }
    } catch (err) {
      logger.error('[UA-Block] Async logging failed:', err);
    }
  })();

  if (effectiveAction === 'log') {
    return next();
  }

  res.status(403).json({ success: false, message: 'Forbidden' });
}
