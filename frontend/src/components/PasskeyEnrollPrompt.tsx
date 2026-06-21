import React, { useEffect, useState } from 'react';
import { Fingerprint, X, ShieldCheck, Zap } from 'lucide-react';
import { toast } from 'react-toastify';
import { passkeyAPI } from '../services/api';
import {
  enrollPasskey,
  isPasskeySupported,
  hasPlatformAuthenticator,
  describePasskeyError,
} from '../services/passkeyService';

/**
 * One-time, professional nudge shown after login to users who have NO passkey yet
 * (and whose device can actually create one). Mirrors the prompts on Google /
 * GitHub / Microsoft. Self-gating: renders nothing unless every condition holds.
 *
 *  - browser supports WebAuthn + a platform authenticator (Face/Touch/Hello) exists
 *  - the user currently has zero registered passkeys
 *  - they haven't snoozed/dismissed it within the snooze window
 *
 * Dismissal is remembered per-user in localStorage so we never nag on every login.
 */

const DISMISS_KEY = 'fuel_order_passkey_prompt';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const NEVER_MS = 3650 * 24 * 60 * 60 * 1000; // ~10 years ("don't ask again")

interface Props {
  userId?: string;
}

export const PasskeyEnrollPrompt: React.FC<Props> = ({ userId }) => {
  const [show, setShow] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const maybeShow = async () => {
      if (!userId || !isPasskeySupported()) return;

      // Respect a prior snooze / dismissal.
      const until = Number(localStorage.getItem(`${DISMISS_KEY}:${userId}`) || 0);
      if (until && Date.now() < until) return;

      // Only nudge devices that can actually make a passkey locally.
      if (!(await hasPlatformAuthenticator())) return;

      try {
        const list = await passkeyAPI.list();
        if (!cancelled && Array.isArray(list) && list.length === 0) {
          setShow(true);
        }
      } catch {
        /* list failed — stay silent, never block the app */
      }
    };

    // Small delay so the dashboard paints first; the prompt feels like a follow-up,
    // not a gate.
    const t = setTimeout(maybeShow, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [userId]);

  const snooze = (ms: number) => {
    if (userId) localStorage.setItem(`${DISMISS_KEY}:${userId}`, String(Date.now() + ms));
    setShow(false);
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enrollPasskey(defaultDeviceLabel());
      toast.success('Passkey added — next time just tap and use your fingerprint or face.');
      snooze(NEVER_MS); // they have one now; never nudge again on this account
    } catch (err) {
      toast.error(describePasskeyError(err));
    } finally {
      setEnrolling(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkey-prompt-title"
    >
      <div className="relative w-full sm:max-w-md bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden border border-white/20 dark:border-gray-700/50">
        {/* Accent stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />

        <div className="p-6 sm:p-8">
          {/* Close */}
          <button
            onClick={() => snooze(SNOOZE_MS)}
            disabled={enrolling}
            className="absolute right-4 top-4 sm:right-6 sm:top-6 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
            aria-label="Dismiss"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <Fingerprint className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>

          <h2
            id="passkey-prompt-title"
            className="text-xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2"
          >
            Sign in faster with a passkey
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6 leading-relaxed">
            Use your fingerprint, face, or device PIN instead of typing a password —
            and it doubles as your two-factor authentication.
          </p>

          {/* Benefits */}
          <div className="space-y-3 mb-7">
            <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <Zap className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>One tap to sign in — no password to remember.</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
              <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span>Phishing-proof and unique to this device.</span>
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className="w-full flex items-center justify-center gap-2 py-3 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Fingerprint className="w-4 h-4" />
            {enrolling ? 'Waiting for your device…' : 'Set up a passkey'}
          </button>
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={() => snooze(SNOOZE_MS)}
              disabled={enrolling}
              className="text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 disabled:opacity-50"
            >
              Maybe later
            </button>
            <button
              onClick={() => snooze(NEVER_MS)}
              disabled={enrolling}
              className="text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-1 disabled:opacity-50"
            >
              Don&apos;t ask again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Best-effort friendly default label from the platform. */
function defaultDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows device';
  return 'Passkey';
}

export default PasskeyEnrollPrompt;
