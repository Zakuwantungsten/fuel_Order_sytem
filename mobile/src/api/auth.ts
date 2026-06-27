import { apiClient } from './client';
import { AuthUser } from '../types';

export interface LoginResult {
  status: 'success' | 'mfa_required' | 'password_change_required';
  user?: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
}

export interface FirstLoginResult {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
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

  // mustChangePassword may come back as true or as the truthy string "[REDACTED]"
  // if the response sanitizer is active on this endpoint. Either way it signals
  // that the user must set a new password before accessing the app.
  if (data.user?.mustChangePassword) {
    return {
      status: 'password_change_required',
      user: data.user as AuthUser,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
  }

  return {
    status: 'success',
    user: data.user as AuthUser,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

/**
 * Set a permanent password for a first-login / temporary-password account.
 * Does not require the current password — the mustChangePassword flag acts as
 * the gate. Returns fresh tokens so the caller can update SecureStore.
 */
export async function firstLoginPassword(newPassword: string): Promise<FirstLoginResult> {
  const res = await apiClient.post('/auth/first-login-password', { newPassword });
  const data = res.data?.data ?? res.data;
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user as AuthUser,
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
