/** Calm user-facing copy — never expose security/attack details to staff. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  'Service temporarily unavailable. Please try again in a moment.';

const QUIET_STATUSES = new Set([429, 503, 530, 502, 504]);

const SECURITY_PHRASES = [
  'access denied',
  'ip blocked',
  'too many login',
  'too many requests',
  'blocked',
  'attack',
  'forbidden',
];

/**
 * Map API/network errors to calm copy for clerks, managers, and drivers.
 */
export function toUserFacingErrorMessage(
  error: unknown,
  fallback = 'Login failed. Please check your credentials and try again.'
): string {
  const axiosLike = error as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };

  const status = axiosLike?.response?.status;
  if (status && QUIET_STATUSES.has(status)) {
    return SERVICE_UNAVAILABLE_MESSAGE;
  }

  const raw =
    axiosLike?.response?.data?.message ||
    axiosLike?.message ||
    '';

  if (typeof raw === 'string') {
    const lower = raw.toLowerCase();
    if (SECURITY_PHRASES.some((p) => lower.includes(p))) {
      return SERVICE_UNAVAILABLE_MESSAGE;
    }
    if (raw.trim()) return raw;
  }

  return fallback;
}
