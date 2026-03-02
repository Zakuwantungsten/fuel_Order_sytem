import crypto from 'crypto';
import https from 'https';
import logger from './logger';

/**
 * HaveIBeenPwned k-Anonymity Breached Password Check
 * Uses SHA-1 prefix (first 5 chars) to query the HIBP API.
 * Only the prefix is sent — the full hash never leaves the server.
 * See: https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */

const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range/';
const REQUEST_TIMEOUT_MS = 5000;

interface BreachCheckResult {
  breached: boolean;
  count: number; // Number of times the password appeared in breaches
}

/**
 * Fetch HIBP range data over HTTPS (no external dependency needed).
 */
function fetchRange(prefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `${HIBP_API_BASE}${prefix}`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'FuelOrderSystem-PasswordCheck' },
      timeout: REQUEST_TIMEOUT_MS,
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HIBP API returned status ${res.statusCode}`));
        return;
      }
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HIBP API request timed out'));
    });
  });
}

/**
 * Check if a password has been found in known data breaches.
 * Uses k-anonymity: only sends first 5 chars of SHA-1 hash to HIBP.
 *
 * @param password - Plaintext password to check
 * @returns BreachCheckResult with breached flag and occurrence count
 */
export async function checkBreachedPassword(password: string): Promise<BreachCheckResult> {
  try {
    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.substring(0, 5);
    const suffix = sha1.substring(5);

    const responseBody = await fetchRange(prefix);

    // Response format: "SUFFIX:COUNT\r\n" per line
    const lines = responseBody.split('\r\n');
    for (const line of lines) {
      const [hashSuffix, countStr] = line.split(':');
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10) || 0;
        logger.warn(`Breached password detected: appeared in ${count} breaches`);
        return { breached: true, count };
      }
    }

    return { breached: false, count: 0 };
  } catch (error: any) {
    // On API failure, allow the password (fail-open) but log the error.
    // Don't block registration if HIBP is unreachable.
    logger.error('HIBP breached password check failed (fail-open):', error.message);
    return { breached: false, count: 0 };
  }
}
