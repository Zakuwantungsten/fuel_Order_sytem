import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, User, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getRoleInfo } from '../utils/permissions';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoDark from '../assets/Dec 2, 2025, 06_08_52 PM.png';
import { useLocation } from 'react-router-dom';

const Login: React.FC = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const { login, isLoading, error, clearError } = useAuth();
  const location = useLocation();

  // Check for session expiration or inactivity message
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('reason');
    
    if (reason === 'expired') {
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'inactivity') {
      setSessionMessage('You were logged out due to 30 minutes of inactivity. Please log in again.');
    } else if (reason === 'unauthorized') {
      setSessionMessage('Your session is no longer valid. Please log in again.');
    }

    // Clear the message after 8 seconds
    if (reason) {
      const timer = setTimeout(() => {
        setSessionMessage(null);
        // Clean up URL
        window.history.replaceState({}, '', '/login');
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [location.search]);

  // Clear error when component unmounts or credentials change
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        clearError();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value,
    }));
    
    // Clear error when user starts typing
    if (error) {
      clearError();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!credentials.username || !credentials.password) {
      return;
    }

    try {
      await login(credentials);
      // Login success will be handled by the auth context
    } catch (error) {
      // Error will be handled by the auth context
      console.error('Login failed:', error);
    }
  };

  // Demo accounts for easy testing
  const demoAccounts = [
    { username: 'superadmin', role: 'super_admin', password: 'admin123' },
    { username: 'admin', role: 'admin', password: 'admin123' },
    { username: 'supermanager', role: 'super_manager', password: 'manager123' },
    { username: 'mgr_infinity', role: 'manager', password: 'manager123', station: 'INFINITY' },
    { username: 'mgr_ndola', role: 'manager', password: 'manager123', station: 'LAKE NDOLA' },
    { username: 'supervisor', role: 'supervisor', password: 'super123' },
    { username: 'clerk', role: 'clerk', password: 'clerk123' },
    { username: 'driver1', role: 'driver', password: 'driver123' },
    { username: 'viewer', role: 'viewer', password: 'viewer123' },
    // New enhanced roles
    { username: 'fuelorder', role: 'fuel_order_maker', password: 'fuel123' },
    { username: 'boss', role: 'boss', password: 'boss123' },
    { username: 'yardman', role: 'yard_personnel', password: 'yard123' },
    { username: 'attendant', role: 'fuel_attendant', password: 'fuel123' },
    { username: 'stationmgr', role: 'station_manager', password: 'station123' },
    { username: 'truck_driver', role: 'driver', password: 'drive123' },
    { username: 'paymentmgr', role: 'payment_manager', password: 'payment123' },
  ];

  const fillDemo = (username: string, password: string) => {
    setCredentials({ username, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6 transition-all duration-500">
      <div className="w-full max-w-6xl flex bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        {/* Left side - Login Form */}
        <div className="w-full lg:w-1/2 p-8 lg:p-12">
          <div className="max-w-md mx-auto">
            {/* Logo and Title */}
            <div className="text-center mb-8">
              <div className="w-40 h-24 mx-auto mb-4">
                <img src={tahmeedLogo} alt="Tahmeed Logo" className="w-full h-full object-contain dark:hidden" />
                <img src={tahmeedLogoDark} alt="Tahmeed Logo" className="w-full h-full object-contain hidden dark:block" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Welcome Back
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Sign in to Fuel Order Management System
              </p>
            </div>

            {/* Session Message */}
            {sessionMessage && (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">Session Expired</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">{sessionMessage}</p>
                </div>
              </div>
            )}

            {/* Error Alert */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Login Failed</h4>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={credentials.username}
                    onChange={handleInputChange}
                    className="block w-full pl-12 pr-4 py-4 border-2 border-slate-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 backdrop-blur transition-all duration-200"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={credentials.password}
                    onChange={handleInputChange}
                    className="block w-full pl-12 pr-14 py-4 border-2 border-slate-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 backdrop-blur transition-all duration-200"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" />
                    ) : (
                      <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Remember me
                  </label>
                </div>
                <div className="text-sm">
                  <a href="#" className="font-medium text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300">
                    Forgot password?
                  </a>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading || !credentials.username || !credentials.password}
                className="w-full btn btn-primary py-4 px-6 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <LogIn className="w-5 h-5 mr-2" />
                    Sign in
                  </div>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right side - Demo Accounts */}
        <div className="hidden lg:block lg:w-1/2 bg-gradient-to-br from-orange-500 to-orange-600 p-8 lg:p-12">
          <div className="h-full flex flex-col justify-center">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-4">
                Role-Based Access Control
              </h2>
              <p className="text-orange-100 text-lg leading-relaxed">
                Our system supports 7 distinct user roles, each with carefully designed permissions 
                to ensure secure and efficient operations.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-white mb-4">Demo Accounts:</h3>
              <div className="grid gap-3 max-h-80 overflow-y-auto">
                {demoAccounts.map((account) => {
                  const roleInfo = getRoleInfo(account.role as any);
                  return (
                    <div
                      key={account.username}
                      onClick={() => fillDemo(account.username, account.password)}
                      className="bg-black/20 backdrop-blur-sm rounded-lg p-4 cursor-pointer hover:bg-black/30 transition-all group border border-white/10"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white group-hover:text-orange-100">
                            {account.username}
                          </div>
                          <div className="text-sm text-orange-200">
                            {roleInfo.name}
                          </div>
                        </div>
                        <div className="text-xs text-orange-200 font-mono">
                          {account.password}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-orange-200 text-sm mt-4">
                Click on any account above to auto-fill credentials
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;