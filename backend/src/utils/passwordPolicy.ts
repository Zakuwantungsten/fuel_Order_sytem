import { SystemConfig } from '../models';

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  historyCount: number;
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false,
  historyCount: 0,
};

/**
 * Load password policy from the system_settings SystemConfig document.
 * Falls back to safe defaults if the document is not found or the DB is unavailable.
 */
export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  try {
    const config = await SystemConfig.findOne({ configType: 'system_settings' });
    const p = config?.securitySettings?.password;
    if (!p) return DEFAULT_POLICY;
    return {
      minLength: p.minLength ?? DEFAULT_POLICY.minLength,
      requireUppercase: p.requireUppercase ?? DEFAULT_POLICY.requireUppercase,
      requireLowercase: p.requireLowercase ?? DEFAULT_POLICY.requireLowercase,
      requireNumbers: p.requireNumbers ?? DEFAULT_POLICY.requireNumbers,
      requireSpecialChars: p.requireSpecialChars ?? DEFAULT_POLICY.requireSpecialChars,
      historyCount: p.historyCount ?? DEFAULT_POLICY.historyCount,
    };
  } catch {
    return DEFAULT_POLICY;
  }
}

/**
 * Synchronously validate a plaintext password against a loaded policy.
 * Returns null if valid, or a human-readable error message if invalid.
 */
export function enforcePasswordPolicy(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters long`;
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (policy.requireSpecialChars && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character (@, #, $, !, %, *, etc.)';
  }
  return null;
}
