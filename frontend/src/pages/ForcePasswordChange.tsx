import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader, ShieldCheck, LogOut } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoDark from '../assets/Dec 2, 2025, 06_08_52 PM.png';

interface StrengthInfo {
  score: number; // 0-4
  label: string;
  color: string;
}

function getStrength(password: string): StrengthInfo {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const capped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const map: Record<0 | 1 | 2 | 3 | 4, { label: string; color: string }> = {
    0: { label: 'Too short',  color: 'bg-red-500'    },
    1: { label: 'Weak',       color: 'bg-red-400'    },
    2: { label: 'Fair',       color: 'bg-amber-400'  },
    3: { label: 'Good',       color: 'bg-blue-500'   },
    4: { label: 'Strong',     color: 'bg-green-500'  },
  };
  return { score: capped, ...map[capped] };
}

interface Props {
  onSuccess: () => void;
}

const ForcePasswordChange: React.FC<Props> = ({ onSuccess }) => {
  const { user, logout } = useAuth();

  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [isLoading, setIsLoading]             = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [success, setSuccess]                 = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const strength = getStrength(newPassword);

  // Live validation
  useEffect(() => {
    if (!newPassword) { setValidationErrors([]); return; }
    const errs: string[] = [];
    if (newPassword.length < 8)                              errs.push('At least 8 characters');
    if (confirmPassword && newPassword !== confirmPassword)  errs.push('Passwords do not match');
    setValidationErrors(errs);
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError('Please fill in both fields.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await authAPI.firstLoginPassword({ newPassword });
      setSuccess(true);
      // Give the user a moment to read the success message, then continue
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update password. Please try again.');
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

          {/* Validation hints */}
          {validationErrors.length > 0 && !error && (
            <div className="mb-5 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <ul className="space-y-1">
                {validationErrors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                    {e}
                  </li>
                ))}
              </ul>
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
                    onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                    disabled={isLoading}
                    placeholder="Minimum 8 characters"
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

                {/* Strength bar */}
                {newPassword && (
                  <div className="mt-2">
                    <div className="flex gap-1 h-1.5">
                      {[1, 2, 3, 4].map((n) => (
                        <div
                          key={n}
                          className={`flex-1 rounded-full transition-all duration-300 ${
                            n <= strength.score ? strength.color : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs mt-1 font-medium ${
                      strength.score <= 1 ? 'text-red-500'
                      : strength.score === 2 ? 'text-amber-500'
                      : strength.score === 3 ? 'text-blue-500'
                      : 'text-green-500'
                    }`}>{strength.label}</p>
                  </div>
                )}
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
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
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
                disabled={isLoading || validationErrors.length > 0 || !newPassword || !confirmPassword}
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
