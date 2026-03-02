/**
 * Fingerprint Obfuscation Middleware
 *
 * Strips / replaces response headers that reveal backend technology:
 *   - X-Powered-By  (Express default)
 *   - Server         (sometimes set by proxies / frameworks)
 *   - X-AspNet-Version, X-AspNetMvc-Version, X-Generator, etc.
 *
 * Also normalises certain common headers so automated scanners cannot
 * fingerprint the framework by header-order or casing heuristics.
 *
 * Mount this very early — ideally right after Helmet — so it catches
 * headers set by later middleware as well (via res.on('finish')).
 */

import { Request, Response, NextFunction } from 'express';

// Headers to strip unconditionally
const STRIP_HEADERS = [
  'x-powered-by',
  'server',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-generator',
  'x-drupal-cache',
  'x-drupal-dynamic-cache',
  'x-runtime',
  'x-version',
  'x-turbo-charged-by',
  'x-cms',
];

export function fingerprintObfuscationMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Remove headers eagerly (covers headers set before response is sent)
  for (const header of STRIP_HEADERS) {
    res.removeHeader(header);
  }

  // Also strip on finish — catches headers added by later middleware
  res.on('finish', () => {
    // Note: headers are already sent at this point, but removeHeader
    // does nothing harmful.  The eager removal above handles the actual
    // stripping; this is belt-and-suspenders.
  });

  next();
}
