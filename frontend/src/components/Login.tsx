import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, User, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MFAVerification } from './MFAVerification';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoDark from '../assets/Dec 2, 2025, 06_08_52 PM.png';
import { useLocation, Link } from 'react-router-dom';

const Login: React.FC = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionMessageTitle, setSessionMessageTitle] = useState<string>('Session Expired');
  
  // MFA Challenge State
  const [mfaChallenge, setMfaChallenge] = useState<{
    userId: string;
    tempSessionToken: string;
    preferredMethod: 'totp' | 'sms' | 'email';
  } | null>(null);

  const { login, isLoading, error, clearError } = useAuth();
  const location = useLocation();

  // Load saved username but clear password when component mounts
  useEffect(() => {
    const savedUsername = localStorage.getItem('fuel_order_last_username') || '';
    setCredentials({ username: savedUsername, password: '' });
    setShowPassword(false);
    setRememberMe(false);
  }, []);

  // Check for session expiration or inactivity message
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('reason');
    
    if (reason === 'expired') {
      setSessionMessageTitle('Session Expired');
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'inactivity') {
      setSessionMessageTitle('Session Expired');
      setSessionMessage('You were logged out due to 30 minutes of inactivity. Please log in again.');
    } else if (reason === 'unauthorized') {
      setSessionMessageTitle('Session Expired');
      setSessionMessage('Your session is no longer valid. Please log in again.');
    } else if (reason === 'force_logout') {
      setSessionMessageTitle('Logged Out');
      setSessionMessage('You have been logged out by an administrator.');
    } else if (reason === 'account_deactivated') {
      setSessionMessageTitle('Account Deactivated');
      setSessionMessage('Your account has been deactivated. Please contact your administrator.');
    } else if (reason === 'account_banned') {
      setSessionMessageTitle('Account Banned');
      setSessionMessage('Your account has been banned. Please contact your administrator.');
    } else if (reason === 'account_deleted') {
      setSessionMessageTitle('Account Removed');
      setSessionMessage('Your account has been removed. Please contact your administrator.');
    } else if (reason === 'password_reset') {
      setSessionMessageTitle('Password Reset');
      setSessionMessage('Your password was reset by an administrator. Please log in with your new credentials.');
    } else if (reason === 'account_updated') {
      setSessionMessageTitle('Account Updated');
      setSessionMessage('Your account was updated by an administrator. Please log in again to apply the changes.');
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
    
    // Clear any lingering session messages so they don't overlap with login errors
    if (sessionMessage) {
      setSessionMessage(null);
      window.history.replaceState({}, '', '/login');
    }
    
    try {
      // Get device ID for trusted device feature
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);
      
      // Store deviceId in sessionStorage to pass to backend after login response
      sessionStorage.setItem('deviceId', deviceId);
      
      // Send only username and password to login endpoint
      const result = await login(credentials);
      
      // Check if MFA is required
      if (result && (result as any).requiresMFA) {
        setMfaChallenge({
          userId: (result as any).data.userId,
          tempSessionToken: (result as any).data.tempSessionToken,
          preferredMethod: (result as any).data.preferredMethod || 'totp',
        });
      }
      // If no MFA required, login success will be handled by the auth context
    } catch (error) {
      // Error will be handled by the auth context
      console.error('Login failed:', error);
    }
  };
  
  const handleMFASuccess = async (tokens: { accessToken: string; refreshToken: string; user: any }) => {
    // Store tokens and user data
    sessionStorage.setItem('fuel_order_token', tokens.accessToken);
    sessionStorage.setItem('fuel_order_auth', JSON.stringify({
      id: tokens.user._id || tokens.user.id,
      username: tokens.user.username,
      email: tokens.user.email,
      firstName: tokens.user.firstName,
      lastName: tokens.user.lastName,
      role: tokens.user.role,
      department: tokens.user.department,
      station: (tokens.user as any).station,
      truckNo: (tokens.user as any).truckNo,
      currentDO: (tokens.user as any).currentDO,
      isActive: tokens.user.isActive,
      mustChangePassword: tokens.user.mustChangePassword ?? false, // Ensure this is set
      token: tokens.accessToken,
      lastLogin: tokens.user.lastLogin,
      createdAt: tokens.user.createdAt,
      updatedAt: tokens.user.updatedAt,
      theme: tokens.user.theme || 'light',
    }));
    
    // Reload to trigger auth context update
    window.location.href = '/';
  };
  
  const handleMFACancel = () => {
    setMfaChallenge(null);
    setCredentials({ ...credentials, password: '' });
  };

  // If MFA challenge is active, show MFA verification component
  if (mfaChallenge) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-3 sm:p-6 transition-all duration-500">
        <MFAVerification
          userId={mfaChallenge.userId}
          tempSessionToken={mfaChallenge.tempSessionToken}
          preferredMethod={mfaChallenge.preferredMethod}
          onSuccess={handleMFASuccess}
          onCancel={handleMFACancel}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-3 sm:p-6 transition-all duration-500">
      <div className="w-full max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        {/* Login Form */}
        <div className="w-full p-4 sm:p-8 lg:p-12">
          <div className="max-w-md mx-auto">
            {/* Logo and Title */}
            <div className="text-center mb-6 sm:mb-8">
              <div className="w-32 h-20 sm:w-40 sm:h-24 mx-auto mb-3 sm:mb-4">
                <img src={tahmeedLogo} alt="Tahmeed Logo" className="w-full h-full object-contain dark:hidden" />
                <img src={tahmeedLogoDark} alt="Tahmeed Logo" className="w-full h-full object-contain hidden dark:block" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Welcome Back
              </h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Sign in to Fuel Order Management System
              </p>
            </div>

            {/* Session Message */}
            {sessionMessage && (
              <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">{sessionMessageTitle}</h4>
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
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              {/* Username Field */}
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2 sm:mb-3">
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                    <User className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 dark:text-gray-500" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={credentials.username}
                    onChange={handleInputChange}
                    className="block w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 text-base border-2 border-slate-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 backdrop-blur transition-all duration-200"
                    placeholder="Enter your username"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-2 sm:mb-3">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={credentials.password}
                    onChange={handleInputChange}
                    className="block w-full pl-3 sm:pl-4 pr-12 sm:pr-14 py-3 sm:py-4 text-base border-2 border-slate-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 backdrop-blur transition-all duration-200"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 sm:pr-4 flex items-center transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" />
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
                  <Link 
                    to="/forgot-password" 
                    className="font-medium text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 transition-colors"
                  >
                    Forgot password?
                  </Link>
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
      </div>
    </div>
  );
};

export default Login;