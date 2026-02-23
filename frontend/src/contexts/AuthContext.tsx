import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { AuthState, AuthUser, AuthResponse, LoginCredentials } from '../types';
import { getRolePermissions } from '../utils/permissions';
import { authAPI } from '../services/api';
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
  | { type: 'SET_THEME'; payload: 'light' | 'dark' };

// Helper function to get user-specific theme key
const getUserThemeKey = (userId?: string | number): string => {
  return userId ? `fuel_order_theme_user_${userId}` : 'fuel_order_theme_default';
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

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
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
        isAuthenticated: true,
        user: action.payload,
        error: null,
      };
    case 'AUTH_ERROR':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: false,
        user: null,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      return {
        ...initialState,
        // Theme will be set separately after logout
      };
    case 'AUTH_CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    case 'SET_THEME':
      return {
        ...state,
        theme: action.payload,
      };
    default:
      return state;
  }
}

// Auth context type
interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  clearError: () => void;
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

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = () => {
      try {
        const stored = sessionStorage.getItem('fuel_order_auth');
        if (stored) {
          const authData = JSON.parse(stored);
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
        }
      } catch (error) {
        console.error('Error checking existing session:', error);
        sessionStorage.removeItem('fuel_order_auth');
      }
    };

    checkExistingSession();

    // Load system settings to apply timezone, date format, and system name (super_admin only)
    const loadSystemSettings = async () => {
      try {
        // Check if user is authenticated first
        const authData = sessionStorage.getItem('fuel_order_auth');
        if (!authData) return;

        const parsed = JSON.parse(authData);
        if (parsed.role !== 'super_admin') return;

        const settings = await systemConfigAPI.getSystemSettings();
        if (settings?.general) {
          if (settings.general.timezone)   setSystemTimezone(settings.general.timezone);
          if (settings.general.dateFormat) setSystemDateFormat(settings.general.dateFormat);
          if (settings.general.systemName) setSystemName(settings.general.systemName);
        }
      } catch (error) {
        // Silently fail - keep defaults
        console.log('Could not load system settings, using defaults');
      }
    };

    loadSystemSettings();
  }, []);

  // Login function
  const login = async (credentials: LoginCredentials): Promise<void> => {
    dispatch({ type: 'AUTH_START' });

    try {
      // Call real backend API
      const authResponse: AuthResponse = await authAPI.login(credentials);
      const { user, accessToken } = authResponse;

      // Save token to sessionStorage (cleared when tab/browser is closed)
      sessionStorage.setItem('fuel_order_token', accessToken);

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
        truckNo: (user as any).truckNo,
        currentDO: (user as any).currentDO,
        isActive: user.isActive,
        token: accessToken,
        lastLogin: authUser.lastLogin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        theme: userTheme,
      }));

      // Clear active tab on login to force role default tab
      sessionStorage.removeItem('fuel_order_active_tab');

      dispatch({ type: 'AUTH_SUCCESS', payload: authUser });
      
      // Apply the user's theme immediately after login
      dispatch({ type: 'SET_THEME', payload: userTheme });

      // Load system settings (super_admin only - endpoint is restricted)
      try {
        if (user.role !== 'super_admin') throw new Error('not super_admin');
        const settings = await systemConfigAPI.getSystemSettings();
        if (settings?.general) {
          if (settings.general.timezone)   setSystemTimezone(settings.general.timezone);
          if (settings.general.dateFormat) setSystemDateFormat(settings.general.dateFormat);
          if (settings.general.systemName) setSystemName(settings.general.systemName);
        }
      } catch (error) {
        // Silently fail - timezone already set to default
        console.log('Could not load system settings after login');
      }
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
    if (state.isAuthenticated && state.user) {
      // Start tracking activity when user is authenticated
      activityTracker.start(() => {
        console.log('User inactive for 30 minutes, logging out...');
        logout();
        // Redirect to login with a message
        window.location.href = '/login?reason=inactivity';
      });
    } else {
      // Stop tracking when user is not authenticated
      activityTracker.stop();
    }

    // Cleanup on unmount
    return () => {
      activityTracker.stop();
    };
  }, [state.isAuthenticated, state.user]);

  const contextValue: AuthContextType = {
    ...state,
    login,
    logout,
    clearError,
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