/**
 * Logger Sanitization Utility
 * Prevents sensitive data (passwords, tokens, credentials) from being logged
 * Recursively scans objects for sensitive keys and redacts their values
 */

const SENSITIVE_KEYS = [
  'password',
  'passcode',
  'pin',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'secretkey',
  'apikey',
  'authorization',
  'bearer',
  'cookie',
  'securetoken',
  'resettoken',
  'resetpasswordtoken',
  'credentials',
  'smtp_pass',
  'smtppass',
  'emailpassword',
  'email_password',
  'secretaccesskey',
  'accesskeyid',
  'r2secretaccesskey',
  'jwtSecret',
  'jwtsecret',
  'jwtrefreshsecret',
];

/**
 * Allowlist of keys that END WITH a sensitive word but are NOT secrets — they are
 * boolean flags or metadata that must pass through unredacted.
 *
 * Critical case: `mustChangePassword` ends with "password", so the endsWith() match
 * below would redact it to the string "[REDACTED]". That string is TRUTHY, which
 * silently flips the frontend's first-login gate ON for every user whose profile is
 * serialized through this sanitizer (e.g. GET /auth/me, GET /users) — forcing the
 * "Set Your Password" screen on every remember-me session restore. (Auth routes that
 * return tokens are exempt from sanitization, which is why fresh login looked fine.)
 *
 * Compared with normalization applied in isSensitiveKey (lowercased, separators stripped).
 */
const NON_SENSITIVE_KEYS = [
  'mustchangepassword',
];

/**
 * Check if a key IS or ENDS WITH a sensitive pattern.
 * Using endsWith (not includes) prevents false positives such as
 * "refreshTokenExpiry" being redacted just because it contains "token".
 * Real credential fields ("accessToken", "refreshToken") end with the pattern.
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
  // Never redact known non-secret flags/metadata, even if they end with a
  // sensitive word (e.g. "mustChangePassword" ends with "password").
  if (NON_SENSITIVE_KEYS.includes(lowerKey)) {
    return false;
  }
  return SENSITIVE_KEYS.some((sensitiveKey) => {
    const normalized = sensitiveKey.toLowerCase().replace(/[_\s-]/g, '');
    return lowerKey === normalized || lowerKey.endsWith(normalized);
  });
}

/**
 * Recursively sanitize an object by redacting sensitive values.
 * Uses a WeakSet to detect circular references and handles special
 * object types (Date, RegExp, Buffer, ObjectId) without iterating them.
 */
export function sanitizeObject(obj: any, depth: number = 0, seen?: WeakSet<object>): any {
  // Prevent infinite recursion
  if (depth > 10 || obj === null || obj === undefined) {
    return obj;
  }

  // Handle primitives
  if (typeof obj !== 'object') {
    return obj;
  }

  // Skip special object types that should be passed through as-is
  if (obj instanceof Date || obj instanceof RegExp || Buffer.isBuffer(obj)) {
    return obj;
  }

  // Handle MongoDB/BSON types (ObjectId, Decimal128, etc.) — pass through
  // so that JSON.stringify can call their toJSON() method correctly
  if (obj._bsontype) {
    return obj;
  }

  // Detect circular references
  if (!seen) seen = new WeakSet();
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1, seen));
  }

  // Handle objects
  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (isSensitiveKey(key)) {
        // Redact sensitive values
        sanitized[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeObject(obj[key], depth + 1, seen);
      } else {
        sanitized[key] = obj[key];
      }
    }
  }

  return sanitized;
}

/**
 * Sanitize a string that might contain JSON
 */
export function sanitizeString(str: any): any {
  if (typeof str !== 'string') {
    return str;
  }

  try {
    const parsed = JSON.parse(str);
    if (typeof parsed === 'object') {
      return JSON.stringify(sanitizeObject(parsed));
    }
  } catch {
    // Not JSON, return as is
  }

  return str;
}

/**
 * Create a Winston format function for sanitizing log info
 */
export function createSanitizeFormat() {
  return {
    transform: (info: any) => {
      const sanitized = { ...info };

      // Sanitize message if it's a string
      if (typeof sanitized.message === 'string') {
        sanitized.message = sanitizeString(sanitized.message);
      }

      // Sanitize all metadata
      for (const key in sanitized) {
        if (key !== 'timestamp' && key !== 'level' && key !== 'message') {
          if (typeof sanitized[key] === 'object') {
            sanitized[key] = sanitizeObject(sanitized[key]);
          } else if (typeof sanitized[key] === 'string') {
            sanitized[key] = sanitizeString(sanitized[key]);
          }
        }
      }

      return sanitized;
    },
  };
}
