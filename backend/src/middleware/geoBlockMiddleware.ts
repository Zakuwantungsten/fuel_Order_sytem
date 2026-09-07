/**
 * Geo-block middleware
 *
 * Optional country allow/deny list from FirewallConfig key `geo_block`.
 * Disabled by default. Uses geolocationService (fail-open on lookup errors).
 *
 * Config shape:
 *   {
 *     enabled: false,
 *     mode: 'deny' | 'allow',   // deny = block listed countries; allow = only listed
 *     countries: ['CN', 'RU'],  // ISO 3166-1 alpha-2
 *     autoBlock: false,         // if true, also permanent-ban the IP
 *   }
 */

import { Request, Response, NextFunction } from 'express';
import { FirewallConfig } from '../models/FirewallConfig';
import { getClientIP } from '../utils/getClientIP';
import geolocationService from '../utils/geolocationService';
import BlocklistService from '../services/blocklistService';
import { securityLogService } from '../services/securityLogService';
import logger from '../utils/logger';
import {
  hasValidAccessToken,
  SERVICE_UNAVAILABLE_MESSAGE,
} from '../utils/requestSecurityContext';

interface GeoBlockConfig {
  enabled: boolean;
  mode: 'deny' | 'allow';
  countries: string[];
  autoBlock: boolean;
}

let _geoConfig: GeoBlockConfig = {
  enabled: false,
  mode: 'deny',
  countries: [],
  autoBlock: false,
};

const refreshGeoConfig = async (): Promise<void> => {
  try {
    const doc = await FirewallConfig.findOne({ key: 'geo_block' }).lean();
    if (!doc?.value || typeof doc.value !== 'object') return;
    const v = doc.value as Record<string, unknown>;
    const countries = Array.isArray(v.countries)
      ? v.countries.map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c))
      : [];
    _geoConfig = {
      enabled: v.enabled === true,
      mode: v.mode === 'allow' ? 'allow' : 'deny',
      countries,
      autoBlock: v.autoBlock === true,
    };
  } catch {
    // keep cached
  }
};

refreshGeoConfig().catch(() => {});
setInterval(refreshGeoConfig, 60_000);

export function reloadGeoBlockConfig(): Promise<void> {
  return refreshGeoConfig();
}

export async function geoBlockMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!_geoConfig.enabled || _geoConfig.countries.length === 0) {
    return next();
  }

  const ip = getClientIP(req);
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return next();
  }

  if (hasValidAccessToken(req) || BlocklistService.isConfiguredTrustedAdmin(ip)) {
    return next();
  }

  try {
    const geo = await geolocationService.getIPGeolocation(ip);
    const cc = (geo?.countryCode || '').toUpperCase();
    if (!cc || cc === 'LO' || cc === 'XX') {
      // Unknown / local — fail open
      return next();
    }

    const listed = _geoConfig.countries.includes(cc);
    const blocked =
      (_geoConfig.mode === 'deny' && listed) ||
      (_geoConfig.mode === 'allow' && !listed);

    if (!blocked) {
      return next();
    }

    logger.warn(`[GeoBlock] Denied ${ip} from ${cc} (mode=${_geoConfig.mode})`);

    if (_geoConfig.autoBlock) {
      BlocklistService.block(
        ip,
        null,
        'manual',
        `Geo-blocked country ${cc} (mode=${_geoConfig.mode})`,
        'system:geo-block',
      ).catch(() => {});
    }

    securityLogService.logEvent({
      ip,
      method: req.method,
      url: req.path,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
      eventType: 'path_blocked',
      severity: 'medium',
      metadata: {
        geoBlocked: true,
        countryCode: cc,
        mode: _geoConfig.mode,
        autoBlock: _geoConfig.autoBlock,
      },
      blocked: true,
    }).catch(() => {});

    res.status(403).json({ success: false, message: SERVICE_UNAVAILABLE_MESSAGE });
  } catch (err) {
    logger.debug('[GeoBlock] Lookup failed — failing open', err);
    next();
  }
}
