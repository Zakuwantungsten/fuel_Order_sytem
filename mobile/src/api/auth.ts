import { apiClient } from './client';
import { AuthUser } from '../types';

export interface LoginResult {
  status: 'success' | 'mfa_required' | 'password_change_required';
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
}

/**
 * Log in either a staff user (username/email + password) or a driver
 * (truck number + PIN). The backend's /auth/login detects driver logins,
 * so the request body is the same shape for both.
 *
 * MFA is out of scope for v1 — if the backend asks for MFA, we surface a
 * status so the UI can tell the user to finish setup on the web portal.
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const res = await apiClient.post('/auth/login', { username, password });
  const body = res.data ?? {};

  if (body.requiresMFA || body.requiresMFASetup) {
    return {
      status: 'mfa_required',
      message:
        'This account requires multi-factor authentication. Please complete it on the web portal, then sign in here.',
    };
  }

  const data = body.data ?? body;
  return {
    status: 'success',
    user: data.user as AuthUser,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

/** Fetch the authenticated user's profile. */
export async function getMe(): Promise<AuthUser> {
  const res = await apiClient.get('/auth/me');
  const data = res.data?.data ?? res.data;
  // Some endpoints wrap the user under `user`, others return it directly.
  return (data?.user ?? data) as AuthUser;
}

/** Best-effort server-side logout (ignore failures — local tokens are cleared anyway). */
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout', {});
  } catch {
    /* ignore */
  }
}
