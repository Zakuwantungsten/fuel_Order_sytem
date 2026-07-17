import axios, {
  AxiosError,
  AxiosInstance,
  InternalAxiosRequestConfig,
} from 'axios';
import { API_BASE_URL } from '../config';
import {
  getAccessToken,
  getRefreshToken,
  saveTokens,
  clearTokens,
} from '../auth/secureStore';

/**
 * Shared axios client for the FuelOrder mobile app.
 *
 * Auth model: pure Bearer tokens (no cookies/CSRF on mobile). The backend
 * returns tokens in the response body, so we attach the access token on every
 * request and transparently refresh it on a 401.
 *
 * The backend ROTATES refresh tokens on every /auth/refresh call (it flags
 * token reuse), so we must persist BOTH new tokens after a refresh.
 */
/**
 * Identify the app with a proper product user-agent.
 *
 * On native (React Native) axios otherwise sends `User-Agent: axios/<ver>`,
 * which the backend firewall treats as a scanning tool and blocks with 403
 * (see backend uaBlockingMiddleware BLOCKED_UA_PATTERNS `/axios\/\d/`). A real
 * app UA avoids that and is also clearer in server logs.
 */
export const APP_USER_AGENT = 'FuelOrderMobile/1.0 (Expo)';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': APP_USER_AGENT,
  },
});

// Attach the access token to every outgoing request.
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Called when the session can no longer be refreshed (forces re-login). */
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(fn: (() => void) | null): void {
  onAuthFailure = fn;
}

// Refresh outcome: a token (ok), a definitive auth rejection, or a transient
// network error. We only force logout on a definitive rejection — never on a
// network blip — so the session persists until the user explicitly logs out.
type RefreshResult =
  | { status: 'ok'; token: string }
  | { status: 'auth_failed' }
  | { status: 'network' };

// Single-flight refresh so concurrent 401s don't trigger multiple refreshes.
let refreshPromise: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return { status: 'auth_failed' };

  try {
    // Bare axios (not apiClient) to avoid the interceptor recursion.
    const res = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      {
        headers: { 'Content-Type': 'application/json', 'User-Agent': APP_USER_AGENT },
        timeout: 20000,
      }
    );
    const data = res.data?.data ?? res.data;
    const newAccess: string | undefined = data?.accessToken;
    const newRefresh: string | undefined = data?.refreshToken;
    if (!newAccess) return { status: 'auth_failed' };

    await saveTokens({ accessToken: newAccess, refreshToken: newRefresh ?? refreshToken });
    return { status: 'ok', token: newAccess };
  } catch (e) {
    // Server explicitly rejected the refresh token → real logout.
    if (axios.isAxiosError(e) && e.response && (e.response.status === 401 || e.response.status === 403)) {
      return { status: 'auth_failed' };
    }
    // No response (offline, server down, timeout) → keep the session.
    return { status: 'network' };
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;

    const status = error.response?.status;
    const isAuthEndpoint = original?.url?.includes('/auth/');

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const result = await refreshPromise;

      if (result.status === 'ok') {
        original.headers.Authorization = `Bearer ${result.token}`;
        return apiClient(original);
      }

      // Only force re-login when the server definitively rejected the session.
      // On a network failure we keep tokens so the user stays logged in.
      if (result.status === 'auth_failed') {
        await clearTokens();
        onAuthFailure?.();
      }
    }

    return Promise.reject(error);
  }
);

/** Pull a human-friendly message out of an axios error. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const QUIET = new Set([429, 503, 530, 502, 504]);
  const SECURITY = ['access denied', 'ip blocked', 'too many', 'blocked', 'attack', 'forbidden'];

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status && QUIET.has(status)) {
      return 'Service temporarily unavailable. Please try again in a moment.';
    }
    const msg = (error.response?.data as { message?: string } | undefined)?.message || error.message || '';
    const lower = msg.toLowerCase();
    if (SECURITY.some((p) => lower.includes(p))) {
      return 'Service temporarily unavailable. Please try again in a moment.';
    }
    return msg || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
