import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AmendedDOsProvider } from './contexts/AmendedDOsContext';
import Login from './components/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ForcePasswordChange from './pages/ForcePasswordChange';
import ProtectedRoute, { UnauthorizedPage } from './components/ProtectedRoute';
import EnhancedDashboard from './components/EnhancedDashboard';
import { systemAdminAPI } from './services/api';
import { initializeWebSocket, subscribeToMaintenanceEvents, unsubscribeFromMaintenanceEvents, subscribeToSettingsEvents, unsubscribeFromSettingsEvents } from './services/websocket';
import { setSystemName, setSystemTimezone, setSystemDateFormat } from './utils/timezone';
import tahmeedLogo from './assets/logo.png';
import tahmeedLogoDark from './assets/Dec 2, 2025, 06_08_52 PM.png';
import { LogOut, RefreshCw, Wrench, Clock, Shield } from 'lucide-react';

// Shown to non-allowed users when the system is in maintenance mode
function MaintenancePage({ message, onLogout }: { message: string; onLogout: () => void }) {
  const [countdown, setCountdown] = useState(15);
  const [checking, setChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-retry countdown — every 15 s silently re-check maintenance status
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRetry();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleRetry = async () => {
    setChecking(true);
    try {
      const status = await systemAdminAPI.getMaintenanceStatus();
      if (!status?.enabled) {
        // Maintenance is over — reload to restore full access
        window.location.reload();
      }
    } catch {
      // Stay on maintenance page if check fails
    } finally {
      setChecking(false);
      setCountdown(15);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-4 sm:p-6 transition-all duration-500">
      {/* Card */}
      <div className="w-full max-w-lg bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        {/* Top accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />

        <div className="p-8 sm:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-36 h-20">
              <img src={tahmeedLogo} alt="Logo" className="w-full h-full object-contain dark:hidden" />
              <img src={tahmeedLogoDark} alt="Logo" className="w-full h-full object-contain hidden dark:block" />
            </div>
          </div>

          {/* Animated icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Wrench className="w-9 h-9 text-amber-500 dark:text-amber-400" />
              </div>
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full ring-4 ring-amber-300/60 dark:ring-amber-600/40 animate-ping" style={{ animationDuration: '2s' }} />
            </div>
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
            System Under Maintenance
          </h1>
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-6">
            Fuel Order Management System
          </p>

          {/* Message box */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
            <p className="text-amber-800 dark:text-amber-300 text-sm text-center leading-relaxed">
              {message}
            </p>
          </div>

          {/* Info rows */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <Shield className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span>Only administrators can access the system during maintenance.</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span>
                Automatically checking again in{' '}
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">{countdown}s</span>
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleRetry}
              disabled={checking}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check Now'}
            </button>
            <button
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-semibold transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Bottom stripe */}
        <div className="px-8 sm:px-10 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/50 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Contact your system administrator for more information.
          </p>
        </div>
      </div>
    </div>
  );
}

// App content with authentication
function AppContent() {
  const { isAuthenticated, isLoading, user, logout, clearMustChangePassword } = useAuth();

  const [maintenanceMode, setMaintenanceMode] = useState<{
    enabled: boolean;
    message: string;
    allowedRoles: string[];
  } | null>(null);
  // True from the start so the dashboard NEVER renders before we know the
  // maintenance status. Unauthenticated users are unaffected because the guard
  // is `isAuthenticated && maintenanceChecking`, which stays false when logged out.
  const [maintenanceChecking, setMaintenanceChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      // Logged out — clear state and stop checking.
      setMaintenanceMode(null);
      setMaintenanceChecking(false);
      return;
    }
    if (!user) {
      // isAuthenticated is true but the user object isn't populated yet.
      // Stay in the checking state; the effect will re-run when user?.role changes.
      return;
    }

    // Fetch current maintenance status. maintenanceChecking is already true
    // (initial state), so the dashboard stays hidden until we have the answer.
    setMaintenanceChecking(true);
    systemAdminAPI
      .getMaintenanceStatus()
      .then((status) => setMaintenanceMode(status))
      .catch(() => {
        // On failure, treat as not in maintenance so we don't permanently block users.
        setMaintenanceMode({ enabled: false, message: '', allowedRoles: ['super_admin'] });
      })
      .finally(() => setMaintenanceChecking(false));

    // Set the module-level maintenance callback on the websocket service.
    // The socket listener was already registered in initializeWebSocket, so even
    // if the socket was created before this effect ran the callback will fire.
    const token = sessionStorage.getItem('fuel_order_token');
    if (token) {
      try {
        initializeWebSocket(token);
      } catch (e) {
        console.error('[App] WebSocket init error:', e);
      }
    }
    subscribeToMaintenanceEvents((event) => {
      const userRole = user?.role ?? '';
      const isAllowed = (event.allowedRoles ?? ['super_admin']).includes(userRole);
      // When maintenance is lifted and this user was a blocked role, do a clean
      // page reload so the dashboard loads with fresh data immediately.
      if (!event.enabled && !isAllowed) {
        window.location.reload();
        return;
      }
      // For all other cases (maintenance ON, or allowed role): update state.
      // React will immediately switch to <MaintenancePage> or back to the dashboard.
      setMaintenanceMode({
        enabled: event.enabled,
        message: event.message,
        allowedRoles: event.allowedRoles ?? ['super_admin'],
      });
    });

    // When a super_admin saves General Settings, every open tab (all users, all
    // roles) receives the broadcast immediately and applies it — no refresh needed.
    subscribeToSettingsEvents((event) => {
      if (event.systemName) setSystemName(event.systemName);
      if (event.timezone) setSystemTimezone(event.timezone);
      if (event.dateFormat) setSystemDateFormat(event.dateFormat);
    });

    return () => {
      unsubscribeFromMaintenanceEvents();
      unsubscribeFromSettingsEvents();
    };
  }, [isAuthenticated, user?.role]);

  // Show loading spinner while maintenance status is being fetched post-login.
  // This prevents the dashboard (and its data requests) from ever rendering if
  // the system is actually in maintenance mode.
  if (isAuthenticated && maintenanceChecking) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="text-gray-700 dark:text-gray-200 font-medium">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show loading spinner during authentication check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center transition-colors">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            <span className="text-gray-700 dark:text-gray-200 font-medium">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Show enhanced dashboard for authenticated users
  // Note: We don't require DASHBOARD permission here because import/export officers
  // don't have that permission but should still access the system

  // Block non-allowed roles when maintenance mode is active
  if (
    isAuthenticated &&
    maintenanceMode?.enabled &&
    !maintenanceMode.allowedRoles?.includes(user?.role ?? '')
  ) {
    return <MaintenancePage message={maintenanceMode.message} onLogout={logout} />;
  }

  // Force password change for new users before accessing any other page
  if (isAuthenticated && user?.mustChangePassword) {
    return <ForcePasswordChange onSuccess={clearMustChangePassword} />;
  }

  return (
    <Routes>
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <EnhancedDashboard user={user} onLogout={logout} />
          </ProtectedRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AmendedDOsProvider>
        <Router>
          <AppContent />
        </Router>
      </AmendedDOsProvider>
    </AuthProvider>
  );
}

export default App;
