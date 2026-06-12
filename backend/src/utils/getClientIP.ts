import { Request } from 'express';

/**
 * Extracts the real client IP from the request.
 *
 * Priority order (Cloudflare Tunnel setup):
 *   1. CF-Connecting-IP  — injected by Cloudflare edge; cannot be spoofed by the client
 *   2. X-Forwarded-For   — first (leftmost) IP; Cloudflare prepends the real client IP here
 *   3. req.ip            — Express trust-proxy resolved IP
 *   4. socket address    — raw TCP peer (last resort)
 *
 * Strips the ::ffff: IPv4-mapped IPv6 prefix so all callers receive a plain IP string.
 */
export function getClientIP(req: Request): string {
  const cfIP = req.headers['cf-connecting-ip'];
  if (typeof cfIP === 'string' && cfIP.trim()) {
    return normalize(cfIP.trim());
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return normalize(forwarded.split(',')[0].trim());
  }

  if (req.ip) return normalize(req.ip);

  return normalize(req.socket.remoteAddress || 'unknown');
}

function normalize(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}
