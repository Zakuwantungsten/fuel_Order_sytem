/**
 * SSRF (Server-Side Request Forgery) Protection Utility
 * 
 * Prevents malicious users from manipulating your backend to make requests to:
 * - AWS metadata endpoints (169.254.169.254) — would leak IAM credentials
 * - Internal network resources (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 * - Localhost services (127.0.0.1, ::1)
 * 
 * Use this utility BEFORE making any HTTP request with user-controlled URLs.
 * 
 * @example
 * const isSafe = await isSafeUrl(userProvidedUrl);
 * if (!isSafe) {
 *   return res.status(400).json({ success: false, message: 'Invalid URL' });
 * }
 * const response = await axios.get(userProvidedUrl);
 */

import { URL } from 'url';
import dns from 'dns/promises';
import logger from './logger';

/**
 * Regular expressions for detecting private IP ranges
 * Covers IPv4 private ranges and IPv6 private/loopback addresses
 */
const PRIVATE_IP_RANGES = [
  /^10\./,                          // 10.0.0.0/8
  /^192\.168\./,                    // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./,    // 172.16.0.0/12 (class B private)
  /^127\./,                         // 127.0.0.0/8 (loopback)
  /^169\.254\./,                    // 169.254.0.0/16 (AWS metadata, link-local)
  /^::1$/,                          // IPv6 loopback
  /^fe80:/i,                        // IPv6 link-local
  /^fc00:/i,                        // IPv6 private
  /^fd00:/i,                        // IPv6 private
];

/**
 * Whitelist of allowed external domains (customize for your system)
 * Only used if you enable the stricter `isWhitelistDomain()` check
 */
const WHITELIST_DOMAINS = new Set<string>([
  // Add trusted external domains here as needed:
  // 'api.github.com',
  // 'api.stripe.com',
  // 'maps.googleapis.com',
]);

/**
 * Check if an IP address falls within private/internal ranges
 * @param ip IP address to validate (IPv4 or IPv6)
 * @returns true if IP is private, false if public
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(pattern => pattern.test(ip.trim()));
}

/**
 * Validates a URL for SSRF vulnerabilities
 * 
 * **Critical for security:** Call this BEFORE making any HTTP request
 * with user-controlled URLs.
 * 
 * Checks:
 * 1. URL is valid
 * 2. Protocol is HTTPS (in production) or HTTPS/HTTP (in dev)
 * 3. Hostname resolves to public IP addresses only
 * 
 * @param urlString - User-provided URL to validate
 * @returns Promise<boolean> - true if URL is safe, false if blocked
 * 
 * @example
 * const isSafe = await isSafeUrl('https://api.example.com/data');
 * if (!isSafe) {
 *   throw new Error('URL blocked for security reasons');
 * }
 * 
 * @example
 * // These return false (blocked):
 * await isSafeUrl('http://169.254.169.254/latest/meta-data/');  // AWS metadata
 * await isSafeUrl('http://192.168.0.1/admin');                   // Private network
 * await isSafeUrl('http://localhost:5000/api');                  // Loopback
 */
export async function isSafeUrl(urlString: string): Promise<boolean> {
  try {
    // Parse URL
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (error) {
      logger.warn(`[SSRF] Invalid URL provided: ${urlString}`, { error });
      return false; // Invalid URL — fail closed
    }

    // Check protocol
    const protocol = url.protocol.toLowerCase();
    
    // In production: only HTTPS allowed
    if (process.env.NODE_ENV === 'production') {
      if (protocol !== 'https:') {
        logger.warn(`[SSRF] HTTP not allowed in production: ${urlString}`);
        return false;
      }
    } 
    // In development: allow HTTP for localhost testing
    else {
      if (!['http:', 'https:'].includes(protocol)) {
        logger.warn(`[SSRF] Invalid protocol: ${protocol}`);
        return false;
      }
    }

    // Get hostname from URL
    const hostname = url.hostname;
    if (!hostname) {
      logger.warn(`[SSRF] No hostname in URL: ${urlString}`);
      return false;
    }

    // If it's already an IP address, check directly
    if (/^(\d+\.\d+\.\d+\.\d+|[a-f0-9:]+)$/i.test(hostname)) {
      if (isPrivateIP(hostname)) {
        logger.warn(`[SSRF] Private IP blocked: ${hostname}`);
        return false;
      }
      return true; // Public IP is allowed
    }

    // Resolve hostname to IP address(es)
    let addresses: string[];
    try {
      addresses = await dns.resolve(hostname, 'A');
      // Also check AAAA for IPv6
      try {
        const ipv6Addresses = await dns.resolve(hostname, 'AAAA');
        addresses = [...addresses, ...ipv6Addresses];
      } catch {
        // AAAA might not exist, that's okay
      }
    } catch (error: any) {
      // DNS resolution failed
      logger.warn(`[SSRF] DNS resolution failed for ${hostname}:`, error.message);
      return false; // Fail closed
    }

    if (addresses.length === 0) {
      logger.warn(`[SSRF] No IP addresses resolved for: ${hostname}`);
      return false;
    }

    // Check each resolved IP against private ranges
    const hasPrivateIP = addresses.some(ip => {
      const isPrivate = isPrivateIP(ip);
      if (isPrivate) {
        logger.warn(`[SSRF] Hostname ${hostname} resolved to private IP: ${ip}`);
      }
      return isPrivate;
    });

    if (hasPrivateIP) {
      return false; // At least one resolved IP is private
    }

    logger.info(`[SSRF] URL validated as safe: ${urlString}`);
    return true;

  } catch (error: any) {
    // Any unexpected error — fail closed for security
    logger.error(`[SSRF] Unexpected error validating URL: ${error.message}`);
    return false;
  }
}

/**
 * Optional stricter validation: checks against domain whitelist
 * 
 * Use if you want to restrict to only pre-approved external APIs.
 * 
 * @param urlString - URL to validate
 * @returns boolean - true if domain is whitelisted
 * 
 * @example
 * export const updateConfig = async (req, res) => {
 *   if (!isWhitelistDomain(req.body.webhookUrl)) {
 *     return res.status(400).json({ message: 'Domain not whitelisted' });
 *   }
 * };
 */
export function isWhitelistDomain(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    
    const isWhitelisted = WHITELIST_DOMAINS.has(hostname);
    
    if (!isWhitelisted) {
      logger.warn(`[SSRF Whitelist] Domain not whitelisted: ${hostname}`);
    }
    
    return isWhitelisted;
  } catch (error) {
    logger.warn(`[SSRF Whitelist] Invalid URL: ${urlString}`);
    return false;
  }
}

/**
 * Add a domain to the whitelist (useful for configuration)
 * Only use for trusted, verified domains
 * 
 * @example
 * addWhitelistDomain('api.trusted-partner.com');
 */
export function addWhitelistDomain(domain: string): void {
  WHITELIST_DOMAINS.add(domain.toLowerCase());
  logger.info(`[SSRF] Domain added to whitelist: ${domain}`);
}

/**
 * Get current whitelist (for debugging/verification)
 */
export function getWhitelist(): string[] {
  return Array.from(WHITELIST_DOMAINS);
}

/**
 * Middleware factory for protecting endpoints that accept URLs
 * 
 * Use this to validate URL parameters automatically on specific routes.
 * 
 * @example
 * import { validateExternalUrl } from '../utils/ssrfGuard';
 * router.post('/api/fetch-data', 
 *   validateExternalUrl('url'),  // Validates 'url' in req.body
 *   myController.fetchData
 * );
 */
export function validateExternalUrl(urlParamName: string = 'url', paramLocation: 'body' | 'query' = 'body') {
  return async (req: any, res: any, next: any) => {
    try {
      const urlString = paramLocation === 'body' 
        ? req.body[urlParamName] 
        : req.query[urlParamName];

      if (!urlString) {
        // No URL provided — skip validation
        return next();
      }

      const isSafe = await isSafeUrl(urlString);
      if (!isSafe) {
        return res.status(400).json({
          success: false,
          message: `URL is not allowed for security reasons (SSRF protection). URL must be publicly accessible.`,
          code: 'SSRF_BLOCKED',
        });
      }

      next();
    } catch (error: any) {
      logger.error(`[SSRF Middleware] Error validating URL:`, error);
      res.status(500).json({
        success: false,
        message: 'URL validation error',
        code: 'SSRF_VALIDATION_ERROR',
      });
    }
  };
}
