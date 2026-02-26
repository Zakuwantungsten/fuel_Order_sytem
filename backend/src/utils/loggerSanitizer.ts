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
 * Check if a key contains sensitive information
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
  return SENSITIVE_KEYS.some(
    (sensitiveKey) => lowerKey.includes(sensitiveKey.replace(/[_\s-]/g, ''))
  );
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
