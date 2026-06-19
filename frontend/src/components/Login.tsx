import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, User, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MFAVerification } from './MFAVerification';
import { MFASetupLogin } from './MFASetupLogin';
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
    mfaMethods?: { totp: boolean; sms: boolean; email: boolean };
    rememberMe?: boolean;
  } | null>(null);

  // MFA Setup State (when admin requires MFA but user hasn't set it up)
  const [mfaSetupChallenge, setMfaSetupChallenge] = useState<{
    userId: string;
    tempSessionToken: string;
    allowedMethods?: string[];
    rememberMe?: boolean;
  } | null>(null);

  const { login, isLoading, error, clearError, completeLogin } = useAuth();
  const location = useLocation();

  // Load saved username and remember-me preference when component mounts
  useEffect(() => {
    const savedUsername = localStorage.getItem('fuel_order_last_username') || '';
    const wasRemembered = localStorage.getItem('fuel_order_remember_me') === '1';
    setCredentials({ username: savedUsername, password: '' });
    setShowPassword(false);
    setRememberMe(wasRemembered && !!savedUsername);
  }, []);

  // Check for session expiration or inactivity message
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('reason');

    if (reason === 'expired') {
      setSessionMessageTitle('Session Expired');
      setSessionMessage('Your session has expired. Please log in again.');
    } else if (reason === 'inactivity') {
      const timeout = params.get('timeout') || '30';
      setSessionMessageTitle('Session Expired');
      setSessionMessage(`You were logged out due to ${timeout} minutes of inactivity. Please log in again.`);
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
    
    try {
      // Get device ID for trusted device feature
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);
      
      // Store deviceId in sessionStorage to pass to backend after login response
      sessionStorage.setItem('deviceId', deviceId);

      // Persist username when remember-me is checked so it pre-fills next time.
      // Clear it when unchecked so there is no stale hint after the user opts out.
      if (rememberMe) {
        localStorage.setItem('fuel_order_last_username', credentials.username);
      } else {
        localStorage.removeItem('fuel_order_last_username');
      }
      
      // Include rememberMe so AuthContext → backend can set the HttpOnly cookie
      const result = await login({ ...credentials, rememberMe });
      
      // Check if MFA is required (result is only returned for MFA cases)
      if (result && result.requiresMFA) {
        setMfaChallenge({
          userId: result.data.userId,
          tempSessionToken: result.data.tempSessionToken,
          preferredMethod: result.data.preferredMethod || 'totp',
          mfaMethods: result.data.mfaMethods,
          rememberMe,
        });
        return;
      }
      if (result && result.requiresMFASetup) {
        setMfaSetupChallenge({
          userId: result.data.userId,
          tempSessionToken: result.data.tempSessionToken,
          allowedMethods: result.data.allowedMethods,
          rememberMe,
        });
        return;
      }
      // If no MFA required, login success was handled by the auth context
    } catch (error) {
      // Error will be handled by the auth context
      console.error('Login failed:', error);
    }
  };
  
  const handleMFASuccess = async (tokens: { accessToken: string; refreshToken: string; user: any }) => {
    // Propagate rememberMe so AuthContext stores the flag in localStorage
    const rm = mfaChallenge?.rememberMe ?? mfaSetupChallenge?.rememberMe ?? false;
    await completeLogin({
      user: {
        ...tokens.user,
        id: tokens.user._id || tokens.user.id,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    } as any, rm);
  };
  
  const handleMFACancel = () => {
    setMfaChallenge(null);
    setCredentials({ ...credentials, password: '' });
  };

  const handleMFASetupCancel = () => {
    setMfaSetupChallenge(null);
    setCredentials({ ...credentials, password: '' });
  };

  // If MFA setup is required, show the setup flow
  if (mfaSetupChallenge) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-3 sm:p-6 transition-all duration-500">
        <MFASetupLogin
          userId={mfaSetupChallenge.userId}
          tempSessionToken={mfaSetupChallenge.tempSessionToken}
          allowedMethods={mfaSetupChallenge.allowedMethods}
          rememberMe={mfaSetupChallenge.rememberMe}
          onSuccess={handleMFASuccess}
          onCancel={handleMFASetupCancel}
        />
      </div>
    );
  }

  // If MFA challenge is active, show MFA verification component
  if (mfaChallenge) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-3 sm:p-6 transition-all duration-500">
        <MFAVerification
          userId={mfaChallenge.userId}
          tempSessionToken={mfaChallenge.tempSessionToken}
          preferredMethod={mfaChallenge.preferredMethod}
          mfaMethods={mfaChallenge.mfaMethods}
          rememberMe={mfaChallenge.rememberMe}
          onSuccess={handleMFASuccess}
          onCancel={handleMFACancel}
        />
      </div>
    );
  }

  const canSubmit = !isLoading && !!credentials.username && !!credentials.password;

  return (
    <>
      {/* ===== MOBILE LAYOUT (hidden on sm+) ===== */}
      <div
        className="sm:hidden min-h-screen flex flex-col"
        style={{ background: '#0f1722', fontFamily: 'inherit', overflowY: 'auto' }}
      >
        {/* Brand Hero */}
        <div style={{ position: 'relative', background: 'linear-gradient(168deg, #1f2a3b 0%, #0f1722 100%)', padding: '64px 28px 48px', flexShrink: 0, overflow: 'hidden' }}>
          {/* Ambient glows */}
          <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.22), transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -40, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.12), transparent 70%)' }} />

          {/* Logo + Welcome text */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <img src={tahmeedLogoDark} alt="Tahmeed" style={{ height: 56, width: 'auto', objectFit: 'contain', marginBottom: 28 }} />
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.1 }}>Welcome back</h1>
            <p style={{ margin: '9px 0 0', fontSize: 14, fontWeight: 500, color: '#94a1b6', lineHeight: 1.5 }}>
              Sign in to manage your fuel orders<br />and delivery sheets.
            </p>
          </div>
        </div>

        {/* Form Sheet */}
        <div style={{ flex: 1, background: '#f4f6f9', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -26, padding: '30px 24px 32px' }}>

          {/* Session banner */}
          {sessionMessage && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, padding: '12px 14px', background: '#fff7ec', border: '1px solid #fbe2bd', borderRadius: 14 }}>
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1, color: '#c0820f' }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9a6608' }}>{sessionMessageTitle}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#b07a17', marginTop: 1 }}>{sessionMessage}</div>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fbd0d0', borderRadius: 14 }}>
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1, color: '#dc2626' }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>Login Failed</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#dc2626', marginTop: 1 }}>{error}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4a5568', marginBottom: 8, letterSpacing: '0.01em' }}>Username</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                  <User size={18} color="#97a3b6" />
                </div>
                <input
                  name="username"
                  type="text"
                  required
                  value={credentials.username}
                  onChange={handleInputChange}
                  placeholder="Enter your username"
                  style={{ width: '100%', boxSizing: 'border-box', height: 54, padding: '0 16px 0 50px', border: '1.5px solid #e3e8f0', borderRadius: 15, background: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, outline: 'none', color: '#1f2937', transition: 'border-color 0.15s' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e3e8f0'; }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4a5568', marginBottom: 8, letterSpacing: '0.01em' }}>Password</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center' }}>
                  <Lock size={18} color="#97a3b6" />
                </div>
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={credentials.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  style={{ width: '100%', boxSizing: 'border-box', height: 54, padding: '0 50px 0 50px', border: '1.5px solid #e3e8f0', borderRadius: 15, background: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, outline: 'none', color: '#1f2937', transition: 'border-color 0.15s' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e3e8f0'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 6, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  {showPassword
                    ? <EyeOff size={19} style={{ color: '#8893a6' }} />
                    : <Eye size={19} style={{ color: '#8893a6' }} />}
                </button>
              </div>
            </div>

            {/* Remember me + Forgot password */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <button
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{ width: 21, height: 21, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${rememberMe ? '#2563eb' : '#cbd3e0'}`, background: rememberMe ? '#2563eb' : '#fff', transition: 'all 0.15s', flexShrink: 0 }}>
                  {rememberMe && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#4a5568' }}>Remember me</span>
              </button>
              <Link to="/forgot-password" style={{ fontSize: 13.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                border: 'none', borderRadius: 15,
                background: canSubmit ? 'linear-gradient(150deg, #3b82f6, #2563eb)' : '#aebfd6',
                color: '#fff', fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit ? '0 10px 20px -8px rgba(37,99,235,0.6)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {isLoading ? (
                <>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" className="animate-spin">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                  <span>Signing in…</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>Sign in</span>
                </>
              )}
            </button>
          </form>

          {/* Trust line */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 22 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aa4b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9aa4b6' }}>Protected with two-factor authentication</span>
          </div>
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT (hidden on mobile) ===== */}
      <div className="hidden sm:flex min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 items-center justify-center p-6 transition-all duration-500">
        <div className="w-full max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
          <div className="w-full p-8 lg:p-12">
            <div className="max-w-md mx-auto">
              {/* Logo and Title */}
              <div className="text-center mb-8">
                <div className="w-40 h-24 mx-auto mb-4">
                  <img src={tahmeedLogo} alt="Tahmeed Logo" className="w-full h-full object-contain dark:hidden" />
                  <img src={tahmeedLogoDark} alt="Tahmeed Logo" className="w-full h-full object-contain hidden dark:block" />
                </div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome Back</h1>
                <p className="text-base text-gray-600 dark:text-gray-400">Sign in to Fuel Order Management System</p>
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
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="username-desktop" className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">Username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-400 dark:text-gray-500" />
                    </div>
                    <input
                      id="username-desktop"
                      name="username"
                      type="text"
                      required
                      value={credentials.username}
                      onChange={handleInputChange}
                      className="block w-full pl-12 pr-4 py-4 text-base border-2 border-slate-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 backdrop-blur transition-all duration-200"
                      placeholder="Enter your username"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password-desktop" className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">Password</label>
                  <div className="relative">
                    <input
                      id="password-desktop"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={credentials.password}
                      onChange={handleInputChange}
                      className="block w-full pl-4 pr-14 py-4 text-base border-2 border-slate-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 backdrop-blur transition-all duration-200"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                    >
                      {showPassword
                        ? <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" />
                        : <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me-desktop"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                    />
                    <label htmlFor="remember-me-desktop" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">Remember me</label>
                  </div>
                  <Link to="/forgot-password" className="text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 transition-colors">
                    Forgot password?
                  </Link>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full btn btn-primary py-4 px-6 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
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
    </>
  );
};

export default Login;