import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, AlertCircle, Loader } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import tahmeedLogo from '../assets/logo.png';
import tahmeedLogoDark from '../assets/Dec 2, 2025, 06_08_52 PM.png';

/**
 * Landing page for magic-link account activation.
 * The user arrives here from the email link: /activate?token=xxx
 *
 * Flow:
 *  1. Read token from URL
 *  2. POST /api/auth/activate-account
 *  3. On success: call completeLogin — this sets mustChangePassword=true in auth state
 *  4. App.tsx detects mustChangePassword=true → shows ForcePasswordChange automatically
 */
const ActivateAccount: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { completeLogin } = useAuth();

  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setErrorMsg('No activation token found in the link. Please use the link provided in your email.');
      setStatus('error');
      return;
    }

    const activate = async () => {
      try {
        // rememberMe defaults to false; the user will get the option inside
        // ForcePasswordChange (it reads localStorage fuel_order_remember_me).
        const response = await authAPI.activateAccount(token, false);
        if (!response?.accessToken) throw new Error('Invalid response from server');
        // completeLogin persists the session and dispatches AUTH_SUCCESS.
        // Because mustChangePassword is still true, App.tsx will immediately
        // show the ForcePasswordChange page without any extra redirect logic.
        await completeLogin(response, false);
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to activate account. The link may have expired.';
        setErrorMsg(msg);
        setStatus('error');
      }
    };

    activate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500" />

        <div className="p-8 sm:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-36 h-20">
              <img src={tahmeedLogo} alt="Logo" className="w-full h-full object-contain dark:hidden" />
              <img src={tahmeedLogoDark} alt="Logo" className="w-full h-full object-contain hidden dark:block" />
            </div>
          </div>

          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Loader className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center">
                Activating your account…
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Please wait while we verify your activation link.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center">
                Activation Failed
              </h1>
              <p className="text-sm text-red-600 dark:text-red-400 text-center leading-relaxed">
                {errorMsg}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                Contact your administrator to have a new activation link sent.
              </p>
              <a
                href="/login"
                className="mt-2 inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                <ShieldCheck className="w-4 h-4" />
                Back to login
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivateAccount;
