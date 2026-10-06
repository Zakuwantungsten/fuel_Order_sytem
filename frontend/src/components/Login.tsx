import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, User, Lock, AlertCircle, Fingerprint } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MFAVerification } from './MFAVerification';
import { MFASetupLogin } from './MFASetupLogin';
import { loginWithPasskey, isPasskeySupported, describePasskeyError } from '../services/passkeyService';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoOnDark from '../assets/tahmeed-logo-on-dark.png';
// Pexels / Harrison Fitts — truck on a desert mountain highway under a blue sky.
import loginFleetRoad from '../assets/login-fleet-road.jpg';
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

  // Passkey (WebAuthn) state
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

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
    setPasskeySupported(isPasskeySupported());
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
  
  const handlePasskeyLogin = async () => {
    setPasskeyError(null);
    if (error) clearError();

    setPasskeyBusy(true);
    try {
      // Usernameless: the authenticator picks the discoverable passkey. We pass the
      // typed username only as an optional narrowing hint if one was entered.
      const resp = await loginWithPasskey(rememberMe, credentials.username || undefined);
      const authData = resp.data;
      // Persist the resolved username for next time, mirroring the password flow.
      if (rememberMe && authData?.user?.username) {
        localStorage.setItem('fuel_order_last_username', authData.user.username);
      }
      // Normalize the user id (toJSON exposes `id`, but guard for `_id`) like the MFA path.
      await completeLogin(
        { ...authData, user: { ...authData.user, id: authData.user._id || authData.user.id } } as any,
        rememberMe
      );
    } catch (err: any) {
      console.error('Passkey login failed:', err);
      setPasskeyError(describePasskeyError(err));
    } finally {
      setPasskeyBusy(false);
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
        <div style={{ position: 'relative', background: 'linear-gradient(168deg, #1f2a3b 0%, #0f1722 100%)', padding: '36px 28px 100px', flexShrink: 0, overflow: 'hidden' }}>
          {/* Ambient glows */}
          <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.22), transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -40, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.12), transparent 70%)' }} />

          {/* Logo + Welcome text */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <img src={tahmeedLogoOnDark} alt="Tahmeed" style={{ height: 112, width: 'auto', objectFit: 'contain', marginBottom: 14 }} />
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.1 }}>Welcome back</h1>
            <p style={{ margin: '9px 0 0', fontSize: 14, fontWeight: 500, color: '#94a1b6', lineHeight: 1.5 }}>
              Sign in to manage your fuel orders<br />and delivery sheets.
            </p>
          </div>
          <svg
            viewBox="0 0 390 86"
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ position: 'absolute', left: 0, bottom: -1, width: '100%', height: 86, display: 'block' }}
          >
            <path fill="#9a3412" d="M0,34 C46,4 98,70 158,28 C214,0 252,62 318,26 C354,8 374,40 390,22 L390,86 L0,86 Z" />
            <path fill="#ea580c" d="M0,46 C58,78 112,10 176,42 C232,70 286,14 390,36 L390,86 L0,86 Z" />
            <path fill="#f4f6f9" d="M0,58 C64,84 118,30 184,56 C244,80 304,28 390,52 L390,86 L0,86 Z" />
          </svg>
        </div>

        {/* Form Sheet */}
        <div style={{ flex: 1, background: '#f4f6f9', marginTop: -1, padding: '18px 24px 32px' }}>

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
          {(error || passkeyError) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 18, padding: '12px 14px', background: '#fef2f2', border: '1px solid #fbd0d0', borderRadius: 14 }}>
              <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1, color: '#dc2626' }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>Login Failed</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#dc2626', marginTop: 1 }}>{error || passkeyError}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Username */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4a5568', marginBottom: 8, letterSpacing: '0.01em' }}>Username</label>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 54, paddingLeft: 15, paddingRight: 16, border: '1.5px solid #e3e8f0', borderRadius: 15, background: '#fff', transition: 'border-color 0.15s' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e3e8f0'; }}
              >
                <User size={18} color="#97a3b6" style={{ flexShrink: 0 }} />
                <input
                  name="username"
                  type="text"
                  required
                  value={credentials.username}
                  onChange={handleInputChange}
                  placeholder="Enter your username"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 600, color: '#1f2937', fontFamily: 'inherit', minWidth: 0 }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#4a5568', marginBottom: 8, letterSpacing: '0.01em' }}>Password</label>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, height: 54, paddingLeft: 15, paddingRight: 6, border: '1.5px solid #e3e8f0', borderRadius: 15, background: '#fff', transition: 'border-color 0.15s' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e3e8f0'; }}
              >
                <Lock size={18} color="#97a3b6" style={{ flexShrink: 0 }} />
                <input
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={credentials.password}
                  onChange={handleInputChange}
                  placeholder="Enter your password"
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontWeight: 600, color: '#1f2937', fontFamily: 'inherit', minWidth: 0 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', flexShrink: 0 }}
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

          {/* Passkey sign-in (only when the browser supports WebAuthn) */}
          {passkeySupported && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
                <div style={{ flex: 1, height: 1, background: '#e3e8f0' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#9aa4b6' }}>or</span>
                <div style={{ flex: 1, height: 1, background: '#e3e8f0' }} />
              </div>
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={passkeyBusy || isLoading}
                style={{
                  width: '100%', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                  border: '1.5px solid #d4dbe6', borderRadius: 15, background: '#fff', color: '#1f2937',
                  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
                  cursor: (passkeyBusy || isLoading) ? 'not-allowed' : 'pointer',
                  opacity: (passkeyBusy || isLoading) ? 0.6 : 1,
                }}
              >
                <Fingerprint size={18} />
                <span>{passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}</span>
              </button>
            </>
          )}

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
      <div className="hidden sm:grid h-screen min-h-0 overflow-hidden bg-white dark:bg-[#0f1722] md:grid-cols-[minmax(400px,44%)_1fr]">
        <div className="flex items-center justify-center overflow-y-auto px-8 py-10 lg:px-14">
          <div className="w-full max-w-[400px]">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-6 h-32 w-[22rem] max-w-full">
                <img src={tahmeedLogo} alt="Tahmeed Logo" className="h-full w-full object-contain dark:hidden" />
                <img src={tahmeedLogoOnDark} alt="Tahmeed Logo" className="hidden h-full w-full object-contain dark:block" />
              </div>
              <h1 className="mb-1.5 text-3xl font-bold tracking-tight text-slate-900 dark:text-gray-100">Welcome Back</h1>
              <p className="text-sm text-slate-500 dark:text-gray-400">Sign in to Fuel Order Management System</p>
            </div>

            {sessionMessage && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500 dark:text-amber-400" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300">{sessionMessageTitle}</h4>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">{sessionMessage}</p>
                </div>
              </div>
            )}

            {(error || passkeyError) && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Login Failed</h4>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error || passkeyError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="username-desktop" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-gray-300">
                  Username <span className="text-red-500">*</span>
                </label>
                <input
                  id="username-desktop"
                  name="username"
                  type="text"
                  required
                  value={credentials.username}
                  onChange={handleInputChange}
                  className="block w-full rounded-full border border-slate-200 bg-slate-50 px-5 py-3.5 text-base text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 dark:border-[#2a3548] dark:bg-[#151c28] dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:bg-[#151c28]"
                  placeholder="Enter your username"
                />
              </div>

              <div>
                <label htmlFor="password-desktop" className="mb-2 block text-sm font-semibold text-slate-700 dark:text-gray-300">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password-desktop"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={credentials.password}
                    onChange={handleInputChange}
                    className="block w-full rounded-full border border-slate-200 bg-slate-50 py-3.5 pl-5 pr-40 text-base text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25 dark:border-[#2a3548] dark:bg-[#151c28] dark:text-gray-100 dark:placeholder-gray-500 dark:focus:border-blue-400 dark:focus:bg-[#151c28]"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-1 right-1 flex items-center gap-1.5 rounded-full px-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <span>{showPassword ? 'Hide' : 'Show password'}</span>
                    {showPassword
                      ? <EyeOff className="h-4 w-4" />
                      : <Eye className="h-4 w-4" />}
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
                    className="h-4 w-4 rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
                  />
                  <label htmlFor="remember-me-desktop" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">Remember me</label>
                </div>
                <Link to="/forgot-password" className="text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="btn btn-primary w-full !rounded-full py-3.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg className="mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  <span>Sign in</span>
                )}
              </button>
            </form>

            {passkeySupported && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-gray-700" />
                  <span className="text-xs font-medium text-slate-400 dark:text-gray-500">Or continue with</span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-gray-700" />
                </div>
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyBusy || isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  <Fingerprint className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  {passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="relative hidden md:block">
          <img
            src={loginFleetRoad}
            alt="Truck driving a desert highway through rocky mountains"
            className="absolute inset-0 h-full w-full object-cover object-[72%_center]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/45 to-transparent px-8 pb-8 pt-28">
            <p className="mx-auto max-w-lg rounded-2xl border border-white/30 bg-white/25 px-6 py-4 text-center text-xl font-semibold text-white shadow-lg backdrop-blur-md">
              Fuel orders for the fleet, at your fingertips
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;