import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { AuthState, AuthUser, AuthResponse, LoginCredentials } from '../types';
import { getRolePermissions } from '../utils/permissions';
import apiClient, { authAPI } from '../services/api';
import { activityTracker } from '../utils/activityTracker';
import { setSystemTimezone, setSystemDateFormat, setSystemName } from '../utils/timezone';
import systemConfigAPI from '../services/systemConfigService';

// Auth Actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: AuthUser }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_CLEAR_ERROR' }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'CLEAR_MUST_CHANGE_PASSWORD' }
  // Fired once the initial async session-restore on page load finishes
  // (regardless of success/failure) so the UI can stop showing the splash spinner.
  | { type: 'SESSION_RESTORE_DONE' };

// Helper function to get user-specific theme key
const getUserThemeKey = (userId?: string | number): string => {
  return userId ? `fuel_order_theme_user_${userId}` : 'fuel_order_theme_default';
};

// Wipe all persisted filter/UI state (namespaced with "fuel-order:") so a fresh
// login or logout starts from default tabs/filters instead of restoring the
// previous session's sub-tab and filters. Session-restore paths (page reload /
// remember-me refresh) intentionally do NOT call this, so persistence still
// survives reloads within an active session.
const clearPersistedUIState = (): void => {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fuel-order:'))
      .forEach(k => localStorage.removeItem(k));
  } catch {
    // Storage access blocked (private mode / quota) — nothing to clear
  }
};

// Initial state
const getInitialTheme = (userId?: string | number): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  
  try {
    const themeKey = getUserThemeKey(userId);
    const stored = localStorage.getItem(themeKey);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

// If there is an existing session OR a remember-me cookie flag, start in a
// loading state so ProtectedRoute shows a spinner instead of flashing the
// login page while the async session check (or cookie-based refresh) runs.
const hasStoredSession =
  typeof window !== 'undefined' &&
  (!!sessionStorage.getItem('fuel_order_auth') ||
   localStorage.getItem('fuel_order_remember_me') === '1');

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: hasStoredSession,
  // True only while the async session-restore on page load is running.
  // Lets AppContent show a splash spinner instead of flashing the login page.
  isRestoringSession: hasStoredSession,
  error: null,
  theme: getInitialTheme(),
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: true,
        user: action.payload,
        error: null,
      };
    case 'AUTH_ERROR':
      return {
        ...state,
        isLoading: false,
        isRestoringSession: false,
        isAuthenticated: false,
        user: null,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      return {
        ...initialState,
        isRestoringSession: false,
        // Theme will be set separately after logout
      };
    case 'AUTH_CLEAR_ERROR':
      return {
        ...state,
        isLoading: false,
        error: null,
      };
    case 'SESSION_RESTORE_DONE':
      return {
        ...state,
        isRestoringSession: false,
      };
    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
      };
    case 'CLEAR_MUST_CHANGE_PASSWORD':
      return {
        ...state,
        user: state.user ? { ...state.user, mustChangePassword: false } : null,
      };
    default:
      return state;
  }
}

// Auth context type
interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<any>;
  completeLogin: (authData: AuthResponse, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  clearMustChangePassword: () => void;
  hasPermission: (resource: string, action: string) => boolean;
  checkRouteAccess: (route: string) => boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  isDark: boolean;
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider Component
interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Apply initial theme immediately on mount (before React hydration)
  useEffect(() => {
    const userId = state.user?.id;
    const themeKey = getUserThemeKey(userId);
    const storedTheme = localStorage.getItem(themeKey);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      // Apply theme to DOM immediately
      if (storedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      // Update state if different from initial
      if (storedTheme !== state.theme) {
        dispatch({ type: 'SET_THEME', payload: storedTheme });
      }
    }
  }, [state.user?.id]);

  // Prevent React Strict Mode from running session restore twice. Unlike a
  // closure `let`, a ref persists across the effect's double-invocation so
  // only the first run proceeds and the second is a no-op.
  const sessionRestoreRef = useRef(false);

  // Check for existing session on mount
  useEffect(() => {
    if (sessionRestoreRef.current) return;
    sessionRestoreRef.current = true;

    const checkExistingSession = async () => {
      try {
        const stored = sessionStorage.getItem('fuel_order_auth');
        if (stored) {
          const authData = JSON.parse(stored);

          // If the stored session says the user must change their password,
          // fetch fresh data from the DB to confirm — the flag may have been
          // cleared already (password changed in another tab or session).
          // Also validates that the token is still alive.
          if (authData.mustChangePassword) {
            try {
              const freshUser = await authAPI.getCurrentUser();
              // Trust the authoritative DB value over the cached sessionStorage.
              authData.mustChangePassword = freshUser.mustChangePassword ?? false;
              if (!authData.mustChangePassword) {
                // Persist the corrected value so subsequent restores are clean.
                sessionStorage.setItem('fuel_order_auth', JSON.stringify(authData));
              }
            } catch {
              // Token is invalid/expired — clear everything and show login.
              sessionStorage.removeItem('fuel_order_auth');
              sessionStorage.removeItem('fuel_order_token');
              dispatch({ type: 'AUTH_ERROR', payload: '' });
              dispatch({ type: 'SESSION_RESTORE_DONE' });
              return;
            }
          }

          const permissions = getRolePermissions(authData.role);
          
          // Load user-specific theme preference
          const userId = authData.id;
          const userTheme = getInitialTheme(userId);
          
          const authUser: AuthUser = {
            ...authData,
            permissions,
          };
          dispatch({ type: 'AUTH_SUCCESS', payload: authUser });
          
          // Apply user-specific theme
          dispatch({ type: 'SET_THEME', payload: userTheme });
          dispatch({ type: 'SESSION_RESTORE_DONE' });
        } else {
          // No in-memory session. Check if the user enabled Remember Me.
          // If so, attempt a silent token refresh using the HttpOnly cookie
          // the backend set. The browser sends it automatically (withCredentials).
          const hasRememberMe = localStorage.getItem('fuel_order_remember_me') === '1';
          if (hasRememberMe) {
            try {
              // POST /auth/refresh — cookie is sent automatically, no body needed
              const refreshResult = await authAPI.refreshToken();
              const newAccessToken = (refreshResult as any).accessToken || (refreshResult as any).token;
              if (!newAccessToken) throw new Error('No access token in refresh response');
              sessionStorage.setItem('fuel_order_token', newAccessToken);

              // Fetch full user profile with the new access token
              const user = await authAPI.getCurrentUser();
              const permissions = getRolePermissions(user.role);
              const userTheme: 'light' | 'dark' = getInitialTheme(user.id);
              const authUser: AuthUser = {
                ...user,
                token: newAccessToken,
                permissions,
                lastLogin: new Date().toISOString(),
                theme: userTheme,
              };

              // Persist session data so next in-tab navigation doesn't re-refresh
              const restoredTimeout = (refreshResult as any).sessionTimeoutMinutes ?? 30;
              sessionStorage.setItem('fuel_order_auth', JSON.stringify({
                ...user,
                token: newAccessToken,
                permissions,
                lastLogin: authUser.lastLogin,
                theme: userTheme,
                sessionTimeoutMinutes: restoredTimeout,
              }));

              dispatch({ type: 'AUTH_SUCCESS', payload: authUser });
              dispatch({ type: 'SET_THEME', payload: userTheme });
            } catch {
              // Cookie is missing, expired, or revoked — clear the flag and show login
              localStorage.removeItem('fuel_order_remember_me');
              localStorage.removeItem('fuel_order_last_username');
              dispatch({ type: 'SESSION_RESTORE_DONE' });
              return;
            }
          }
          // No stored session and no remember-me flag — nothing to restore
          dispatch({ type: 'SESSION_RESTORE_DONE' });
        }
      } catch (error) {
        console.error('Error checking existing session:', error);
        sessionStorage.removeItem('fuel_order_auth');
        dispatch({ type: 'AUTH_ERROR', payload: '' });
        dispatch({ type: 'SESSION_RESTORE_DONE' });
      }
    };

    checkExistingSession();

    // Load system settings to apply timezone, date format, and system name
    const loadSystemSettings = async () => {
      try {
        const authData = sessionStorage.getItem('fuel_order_auth');
        if (!authData) return;

        const cachedName = localStorage.getItem('fuel_order_system_name');
        if (cachedName) setSystemName(cachedName);

        const parsed = JSON.parse(authData);

        if (parsed.role === 'super_admin') {
          const settings = await systemConfigAPI.getSystemSettings();
          if (settings?.general) {
            if (settings.general.timezone)   setSystemTimezone(settings.general.timezone);
            if (settings.general.dateFormat) setSystemDateFormat(settings.general.dateFormat);
            if (settings.general.systemName) {
              localStorage.setItem('fuel_order_system_name', settings.general.systemName);
              setSystemName(settings.general.systemName);
            }
          }
        } else {
          const res = await apiClient.get('/config/branding');
          const name = res.data?.data?.systemName;
          if (name) {
            localStorage.setItem('fuel_order_system_name', name);
            setSystemName(name);
          }
        }
      } catch {
        // Silently fail - keep defaults
      }
    };

    loadSystemSettings();
  }, []);

  // Complete login with already-fetched auth data (used after MFA verification/setup)
  const completeLogin = async (authData: AuthResponse, rememberMe?: boolean): Promise<void> => {
    const { user, accessToken, sessionTimeoutMinutes } = authData;

    sessionStorage.setItem('fuel_order_token', accessToken);

    // Persist the remember-me preference so session restore on next page load
    // knows whether to attempt cookie-based token refresh
    if (rememberMe) {
      localStorage.setItem('fuel_order_remember_me', '1');
    } else {
      localStorage.removeItem('fuel_order_remember_me');
    }

    const permissions = getRolePermissions(user.role);
    const serverTheme = user.theme;
    const userTheme: 'light' | 'dark' = serverTheme ?? getInitialTheme(user.id);

    const authUser: AuthUser = {
      ...user,
      token: accessToken,
      permissions,
      lastLogin: new Date().toISOString(),
      theme: userTheme,
    };

    sessionStorage.setItem('fuel_order_auth', JSON.stringify({
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      department: user.department,
      station: (user as any).station,
      yard: (user as any).yard,
      truckNo: (user as any).truckNo,
      currentDO: (user as any).currentDO,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword ?? false,
      token: accessToken,
      lastLogin: authUser.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      theme: userTheme,
      sessionTimeoutMinutes: sessionTimeoutMinutes ?? 30,
    }));

    sessionStorage.removeItem('fuel_order_active_tab');
    // Fresh login → reset persisted sub-tab/filter state to defaults
    clearPersistedUIState();
    dispatch({ type: 'AUTH_SUCCESS', payload: authUser });
    dispatch({ type: 'SET_THEME', payload: userTheme });
  };

  // Login function
  const login = async (credentials: LoginCredentials): Promise<any> => {
    dispatch({ type: 'AUTH_START' });

    try {
      // Call real backend API
      const rawResponse = await authAPI.login(credentials);
      
      // If MFA is required or MFA setup needed, return the raw response
      // so Login.tsx can handle it directly (no AuthContext state change)
      if (rawResponse.requiresMFA || rawResponse.requiresMFASetup) {
        dispatch({ type: 'AUTH_CLEAR_ERROR' });
        return rawResponse;
      }
      
      const authResponse = rawResponse.data as AuthResponse;
      const { user, accessToken, sessionTimeoutMinutes } = authResponse;

      // Save token to sessionStorage (cleared when tab/browser is closed)
      sessionStorage.setItem('fuel_order_token', accessToken);

      // Persist the remember-me preference. The backend already set the
      // HttpOnly cookie — this flag just tells the session-restore logic
      // on the next page load to attempt a silent cookie-based refresh.
      if (credentials.rememberMe) {
        localStorage.setItem('fuel_order_remember_me', '1');
      } else {
        localStorage.removeItem('fuel_order_remember_me');
      }

      // Get role permissions
      const permissions = getRolePermissions(user.role);

      // Use the server-stored theme as the authoritative source so the
      // preference follows the user across all devices and browsers.
      // Fall back to localStorage (same device, same user) if the server
      // doesn't have one yet (e.g. existing accounts before this feature).
      const serverTheme = user.theme;
      const userTheme: 'light' | 'dark' = serverTheme ?? getInitialTheme(user.id);

      // Create authenticated user object
      const authUser: AuthUser = {
        ...user,
        token: accessToken,
        permissions,
        lastLogin: new Date().toISOString(),
        theme: userTheme,
      };

      // Store user data in sessionStorage (cleared when tab/browser is closed)
      sessionStorage.setItem('fuel_order_auth', JSON.stringify({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        department: user.department,
        station: (user as any).station,
        yard: (user as any).yard,
        truckNo: (user as any).truckNo,
        currentDO: (user as any).currentDO,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword ?? false,
        token: accessToken,
        lastLogin: authUser.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        theme: userTheme,
        sessionTimeoutMinutes: sessionTimeoutMinutes ?? 30,
      }));

      // Clear active tab on login to force role default tab
      sessionStorage.removeItem('fuel_order_active_tab');
      // Fresh login → reset persisted sub-tab/filter state to defaults
      clearPersistedUIState();

      dispatch({ type: 'AUTH_SUCCESS', payload: authUser });
      
      // Apply the user's theme immediately after login
      dispatch({ type: 'SET_THEME', payload: userTheme });

      // Apply cached system name for all roles
      const cachedName = localStorage.getItem('fuel_order_system_name');
      if (cachedName) setSystemName(cachedName);

      if (user.role === 'super_admin') {
        try {
          const settings = await systemConfigAPI.getSystemSettings();
          if (settings?.general) {
            if (settings.general.timezone)   setSystemTimezone(settings.general.timezone);
            if (settings.general.dateFormat) setSystemDateFormat(settings.general.dateFormat);
            if (settings.general.systemName) {
              localStorage.setItem('fuel_order_system_name', settings.general.systemName);
              setSystemName(settings.general.systemName);
            }
          }
        } catch {
          // Silently fail
        }
      } else {
        try {
          const res = await apiClient.get('/config/branding');
          const name = res.data?.data?.systemName;
          if (name) {
            localStorage.setItem('fuel_order_system_name', name);
            setSystemName(name);
          }
        } catch {
          // Silently fail
        }
      }
      
      return authResponse;
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Login failed';
      dispatch({ type: 'AUTH_ERROR', payload: errorMessage });
      throw error;
    }
  };

  // Logout function
  const logout = () => {
    // Stop activity tracking
    activityTracker.stop();
    
    sessionStorage.removeItem('fuel_order_auth');
    sessionStorage.removeItem('fuel_order_token');
    sessionStorage.removeItem('fuel_order_active_tab'); // Clear active tab on logout
    sessionStorage.removeItem('fuel_order_active_role'); // Clear active role on logout
    sessionStorage.removeItem('dashboard_search_query'); // Clear dashboard search on logout
    sessionStorage.removeItem('dashboard_search_results'); // Clear dashboard search results on logout

    // Clear remember-me flag so the next visit shows the login page
    // (the backend clears the HttpOnly cookie via the /auth/logout endpoint)
    localStorage.removeItem('fuel_order_remember_me');

    // Clear all persisted filter/UI state so next login starts fresh
    clearPersistedUIState();

    // Reset to default theme for logged-out state
    const defaultTheme = getInitialTheme(); // No userId = uses default
    dispatch({ type: 'AUTH_LOGOUT' });
    dispatch({ type: 'SET_THEME', payload: defaultTheme });
    
    // Force reload the page to ensure login form is cleared
    window.location.href = '/login';
  };

  // Clear error function
  const clearError = () => {
    dispatch({ type: 'AUTH_CLEAR_ERROR' });
  };

  // Clear mustChangePassword flag after successful first-login password set
  const clearMustChangePassword = () => {
    dispatch({ type: 'CLEAR_MUST_CHANGE_PASSWORD' });
    try {
      const stored = sessionStorage.getItem('fuel_order_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.mustChangePassword = false;
        sessionStorage.setItem('fuel_order_auth', JSON.stringify(parsed));
      }
    } catch {
      // Ignore storage errors
    }
  };

  // Check permission function
  const hasPermission = (resource: string, action: string): boolean => {
    if (!state.user?.permissions) return false;
    return state.user.permissions.some(
      permission => 
        permission.resource === resource && 
        permission.actions.includes(action)
    );
  };

  // Check route access function
  const checkRouteAccess = (route: string): boolean => {
    if (!state.user?.permissions) return false;
    
    const routeResourceMap: Record<string, string> = {
      '/': 'dashboard',
      '/delivery-orders': 'delivery_orders',
      '/lpos': 'lpos',
      '/fuel-records': 'fuel_records',
      '/users': 'users',
      '/reports': 'reports',
      '/settings': 'system_config',
    };

    const resource = routeResourceMap[route];
    return resource ? hasPermission(resource, 'read') : false;
  };

  // Theme management functions
  const toggleTheme = () => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    dispatch({ type: 'SET_THEME', payload: newTheme });
    // Persist to server so the preference follows the user across devices
    if (state.isAuthenticated) {
      authAPI.updatePreferences({ theme: newTheme }).catch(() => {
        // Silently ignore – local theme still applied
      });
    }
  };

  const setTheme = (theme: 'light' | 'dark') => {
    dispatch({ type: 'SET_THEME', payload: theme });
    // Persist to server so the preference follows the user across devices
    if (state.isAuthenticated) {
      authAPI.updatePreferences({ theme }).catch(() => {
        // Silently ignore – local theme still applied
      });
    }
  };

  // Apply theme to DOM whenever theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const root = document.documentElement;
      
      // Remove dark class first
      root.classList.remove('dark');
      
      // Add dark class for dark mode
      if (state.theme === 'dark') {
        root.classList.add('dark');
      }
      
      // Persist theme preference with user-specific key
      const userId = state.user?.id;
      const themeKey = getUserThemeKey(userId);
      localStorage.setItem(themeKey, state.theme);
      
    } catch (error) {
      console.error('Error applying theme:', error);
    }
  }, [state.theme, state.user?.id]);

  // Activity tracking for auto-logout on inactivity
  useEffect(() => {
    const readTimeoutMs = (): number => {
      try {
        const stored = sessionStorage.getItem('fuel_order_auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (typeof parsed.sessionTimeoutMinutes === 'number' && parsed.sessionTimeoutMinutes > 0) {
            return parsed.sessionTimeoutMinutes * 60 * 1000;
          }
        }
      } catch {
        // fall through to default
      }
      return 30 * 60 * 1000;
    };

    const startTracker = () => {
      const sessionTimeoutMs = readTimeoutMs();
      activityTracker.start(() => {
        logout();
        window.location.href = `/login?reason=inactivity&timeout=${Math.round(sessionTimeoutMs / 60000)}`;
      }, sessionTimeoutMs);
    };

    if (state.isAuthenticated && state.user) {
      startTracker();

      // Re-start the tracker whenever the admin updates the session timeout setting
      // so the change takes effect for the current session without requiring a re-login.
      const handleTimeoutUpdate = () => startTracker();
      window.addEventListener('session-timeout-updated', handleTimeoutUpdate);
      return () => {
        window.removeEventListener('session-timeout-updated', handleTimeoutUpdate);
        activityTracker.stop();
      };
    } else {
      activityTracker.stop();
      return () => { activityTracker.stop(); };
    }
  }, [state.isAuthenticated, state.user]);

  const contextValue: AuthContextType = {
    ...state,
    login,
    completeLogin,
    logout,
    clearError,
    clearMustChangePassword,
    hasPermission,
    checkRouteAccess,
    toggleTheme,
    setTheme,
    isDark: state.theme === 'dark',
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;