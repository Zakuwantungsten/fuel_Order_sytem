import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader, ShieldCheck, LogOut, XCircle } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoDark from '../assets/Dec 2, 2025, 06_08_52 PM.png';

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

interface RuleCheck {
  label: string;
  met: boolean;
}

function buildRules(password: string, policy: PasswordPolicy): RuleCheck[] {
  return [
    { label: `At least ${policy.minLength} characters`,   met: password.length >= policy.minLength },
    ...(policy.requireUppercase  ? [{ label: 'One uppercase letter',   met: /[A-Z]/.test(password) }] : []),
    ...(policy.requireLowercase  ? [{ label: 'One lowercase letter',   met: /[a-z]/.test(password) }] : []),
    ...(policy.requireNumbers    ? [{ label: 'One number',             met: /[0-9]/.test(password) }] : []),
    ...(policy.requireSpecialChars ? [{ label: 'One special character (@, #, $, !, …)', met: /[^A-Za-z0-9]/.test(password) }] : []),
  ];
}

interface Props {
  onSuccess: () => void;
}

const ForcePasswordChange: React.FC<Props> = ({ onSuccess }) => {
  const { user, logout, completeLogin } = useAuth();

  const [policy, setPolicy]                   = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [success, setSuccess]                 = useState(false);

  // Fetch the live password policy from the server on mount
  useEffect(() => {
    authAPI.getPasswordPolicy?.()
      .then((p: PasswordPolicy) => setPolicy({ ...DEFAULT_POLICY, ...p }))
      .catch(() => { /* silently use defaults */ });
  }, []);

  const rules       = buildRules(newPassword, policy);
  const allRulesMet = rules.every(r => r.met);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newPassword || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (!allRulesMet) {
      setError('Password does not meet all the requirements below.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      // Carry the Remember Me intent through first-login setup. The backend only
      // establishes the persistent cookie here (after activation), so this flag is
      // what makes Remember Me actually stick for newly-created users.
      const rememberMe = localStorage.getItem('fuel_order_remember_me') === '1';
      const response = await authAPI.firstLoginPassword({ newPassword, rememberMe });

      // Use completeLogin to fully sync auth state (tokens + user object) so
      // the next Remember Me restore gets a clean session with mustChangePassword=false.
      if (response) {
        await completeLogin(response, rememberMe);
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message || '';

      // If the backend says password change is not required (flag already cleared),
      // treat it as success — clear the local flag and proceed to dashboard.
      if (status === 403 && message.toLowerCase().includes('not required')) {
        const authData = JSON.parse(sessionStorage.getItem('fuel_order_auth') || '{}');
        authData.mustChangePassword = false;
        sessionStorage.setItem('fuel_order_auth', JSON.stringify(authData));
        onSuccess();
        return;
      }

      // If the session/token is invalid (expired, revoked, etc.), log out
      // so the user gets a fresh login with up-to-date DB state.
      if (status === 401) {
        logout();
        return;
      }

      setError(message || 'Failed to update password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-4 sm:p-6 transition-all duration-500">
      <div className="w-full max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        {/* Top accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500" />

        <div className="p-8 sm:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-36 h-20">
              <img src={tahmeedLogo} alt="Logo" className="w-full h-full object-contain dark:hidden" />
              <img src={tahmeedLogoDark} alt="Logo" className="w-full h-full object-contain hidden dark:block" />
            </div>
          </div>

          {/* Icon + heading */}
          <div className="flex justify-center mb-5">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="absolute inset-0 rounded-full ring-4 ring-indigo-300/50 dark:ring-indigo-600/30 animate-ping" style={{ animationDuration: '2.5s' }} />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-1">
            Set Your Password
          </h1>
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm mb-1">
            Welcome, <span className="font-semibold text-gray-700 dark:text-gray-200">{user?.firstName} {user?.lastName}</span>
          </p>
          <p className="text-center text-gray-500 dark:text-gray-400 text-xs mb-6">
            Your account was created with a temporary password. Please set a personal password to continue.
          </p>

          {/* Success */}
          {success && (
            <div className="mb-5 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Password set successfully!</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">Taking you to the dashboard…</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-5 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Form */}
          {!success && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* New password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                    placeholder={`Minimum ${policy.minLength} characters`}
                    className="block w-full pl-9 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-xl
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                               placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent
                               transition-colors duration-200 text-sm"
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    {showNew
                      ? <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      : <Eye    className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />}
                  </button>
                </div>
              </div>

              {/* Password rules — always visible, turn green as requirements are met */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Password must include:</p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-4">
                  {rules.map((rule, i) => (
                    <li key={i} className={`text-xs flex items-center gap-2 transition-colors duration-200 ${
                      rule.met ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {rule.met
                        ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                        : <XCircle    className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />}
                      {rule.label}
                    </li>
                  ))}
                  <li className={`text-xs flex items-center gap-2 transition-colors duration-200 ${
                    passwordsMatch ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {passwordsMatch
                      ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                      : <XCircle    className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />}
                    Passwords match
                  </li>
                </ul>
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    placeholder="Repeat your new password"
                    className="block w-full pl-9 pr-10 py-3 border border-gray-300 dark:border-gray-600 rounded-xl
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                               placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent
                               transition-colors duration-200 text-sm"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    {showConfirm
                      ? <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      : <Eye    className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoading || !allRulesMet || !passwordsMatch}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl
                           text-sm font-semibold text-white
                           bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {isLoading ? (
                  <><Loader className="animate-spin h-4 w-4" /> Saving…</>
                ) : (
                  <><ShieldCheck className="h-4 w-4" /> Set Password & Continue</>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 sm:px-10 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Logged in as <span className="font-medium">{user?.username}</span>
          </p>
          <button
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;
