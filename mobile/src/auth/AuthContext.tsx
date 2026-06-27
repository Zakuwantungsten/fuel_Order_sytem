import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import axios from 'axios';
import { AuthUser } from '../types';
import * as authApi from '../api/auth';
import { setAuthFailureHandler } from '../api/client';
import { registerForPush, unregisterPush } from '../push/registerPush';
import {
  clearCachedUser,
  clearTokens,
  getAccessToken,
  getCachedUser,
  saveCachedUser,
  saveTokens,
} from './secureStore';

/** A definitive auth rejection from the server (vs. a transient network error). */
function isDefinitiveAuthError(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403);
}

interface AuthState {
  user: AuthUser | null;
  /** True until we've finished checking SecureStore on app start. */
  initializing: boolean;
  signIn: (username: string, password: string) => Promise<authApi.LoginResult>;
  signOut: () => Promise<void>;
  /** Update the in-memory user and cached profile after a first-login password change. */
  updateUser: (user: AuthUser) => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  const signOut = useCallback(async () => {
    await unregisterPush(); // remove device token while we still have a valid session
    await authApi.logout();
    await clearTokens();
    await clearCachedUser();
    setUser(null);
  }, []);

  // When a token refresh definitively fails mid-session, drop back to login.
  useEffect(() => {
    setAuthFailureHandler(() => {
      clearCachedUser();
      setUser(null);
    });
    return () => setAuthFailureHandler(null);
  }, []);

  // On app start: restore the session and keep it until the user logs out.
  // 1) If we have a cached profile + token, log in instantly (works offline).
  // 2) Validate in the background; only log out on a definitive auth rejection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [token, cached] = await Promise.all([getAccessToken(), getCachedUser<AuthUser>()]);
        if (!token) return; // never logged in (or logged out) → show login

        if (cached && !cancelled) setUser(cached); // instant restore

        try {
          const me = await authApi.getMe(); // auto-refreshes the access token if needed
          if (!cancelled) {
            setUser(me);
            await saveCachedUser(me);
          }
          registerForPush();
        } catch (e) {
          if (isDefinitiveAuthError(e)) {
            // Session truly invalid/revoked → clear it.
            await clearTokens();
            await clearCachedUser();
            if (!cancelled) setUser(null);
          }
          // Network/offline error with a cached user → stay logged in.
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (username: string, password: string): Promise<authApi.LoginResult> => {
      const result = await authApi.login(username, password);
      if (
        (result.status === 'success' || result.status === 'password_change_required') &&
        result.accessToken
      ) {
        await saveTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken ?? null,
        });
        // Prefer the user from login; fall back to /auth/me if absent.
        const me = result.user ?? (await authApi.getMe());
        setUser(me);
        await saveCachedUser(me);
        // Only register for push once the account is fully activated.
        if (result.status === 'success') {
          registerForPush();
        }
      }
      return result;
    },
    []
  );

  const updateUser = useCallback(async (updatedUser: AuthUser) => {
    setUser(updatedUser);
    await saveCachedUser(updatedUser);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, initializing, signIn, signOut, updateUser }),
    [user, initializing, signIn, signOut, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
