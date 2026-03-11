import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Smartphone, Mail, MessageSquare, KeyRound, AlertCircle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';

// Use the same base URL as api.ts so fetch() calls reach the backend in
// both development (Vite proxy) and production (cross-origin Railway).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** Read the XSRF-TOKEN from sessionStorage (cross-origin safe) or cookie */
const getCsrfToken = (): string | undefined => {
  const stored = sessionStorage.getItem('xsrf_token');
  if (stored && stored !== '[REDACTED]') return stored;
  const match = decodeURIComponent(document.cookie)
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('XSRF-TOKEN='));
  return match ? match.substring('XSRF-TOKEN='.length) : undefined;
};

const jsonHeaders = (): Record<string, string> => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const csrf = getCsrfToken();
  if (csrf) h['X-XSRF-TOKEN'] = csrf;
  return h;
};

const safeJson = async (response: Response): Promise<any> => {
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      response.ok
        ? 'Received an unexpected response from the server. Please try again.'
        : `Server error (${response.status}). Please check your connection or contact your administrator.`
    );
  }
  return response.json();
};

interface MFAVerificationProps {
  userId: string;
  tempSessionToken: string;
  preferredMethod: 'totp' | 'sms' | 'email';
  mfaMethods?: { totp: boolean; sms: boolean; email: boolean };
  onSuccess: (tokens: { accessToken: string; refreshToken: string; user: any }) => void;
  onCancel: () => void;
}

// How many individual digit boxes to show
const CODE_LENGTH = 6;

export const MFAVerification: React.FC<MFAVerificationProps> = ({
  userId,
  tempSessionToken,
  preferredMethod,
  mfaMethods,
  onSuccess,
  onCancel,
}) => {
  const getInitialMethod = (): 'totp' | 'backup' | 'sms' | 'email' => {
    if (mfaMethods) {
      if (preferredMethod === 'totp' && mfaMethods.totp) return 'totp';
      if (preferredMethod === 'email' && mfaMethods.email) return 'email';
      if (preferredMethod === 'sms' && mfaMethods.sms) return 'sms';
      if (mfaMethods.totp) return 'totp';
      if (mfaMethods.email) return 'email';
      if (mfaMethods.sms) return 'sms';
    }
    return preferredMethod;
  };

  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'totp' | 'backup' | 'sms' | 'email'>(getInitialMethod());
  const [trustDevice, setTrustDevice] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const browser = getBrowserName();
    const os = getOSName();
    setDeviceName(`${browser} on ${os}`);
  }, []);

  // Auto-send OTP if initial method is email or sms
  useEffect(() => {
    const m = getInitialMethod();
    if (m === 'email' || m === 'sms') {
      sendOTP(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredMethod]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const sendOTP = async (otpMethod: 'email' | 'sms') => {
    setSendingOtp(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/mfa/send-otp`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({ userId, method: otpMethod }),
      });
      const data = await safeJson(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to send verification code');
      }
      setOtpSent(true);
      setResendCountdown(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleMethodSelect = (m: 'totp' | 'backup' | 'sms' | 'email') => {
    setMethod(m);
    setCode('');
    setError('');
    setShowMethodPicker(false);
    if (m === 'email' || m === 'sms') {
      sendOTP(m);
    } else {
      setOtpSent(false);
    }
  };

  const getBrowserName = (): string => {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg')) return 'Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'Browser';
  };

  const getOSName = (): string => {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Device';
  };

  const handleVerify = async () => {
    if (!code || code.length < 6) {
      setError('Please enter the verification code');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);

      const response = await fetch(`${API_BASE}/auth/verify-mfa`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          userId,
          tempSessionToken,
          code,
          method,
          trustDevice,
          deviceId,
          deviceName: trustDevice ? deviceName : undefined,
          deviceInfo: { userAgent: navigator.userAgent, ipAddress: '' },
        }),
      });
      const data = await safeJson(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }
      onSuccess({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        user: data.data.user,
      });
    } catch (err: any) {
      setError(err.message);
      setCode('');
      // Refocus first input on error
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  // ── Segmented code input handlers ──
  const handleDigitChange = (index: number, value: string) => {
    if (method === 'backup') return; // backup uses the single text input
    const digit = value.replace(/\D/g, '').slice(-1);
    const newCode = code.split('');
    newCode[index] = digit;
    const joined = newCode.join('').slice(0, CODE_LENGTH);
    setCode(joined);
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter' && code.length >= CODE_LENGTH) {
      handleVerify();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(pasted);
    const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
    setTimeout(() => inputRefs.current[focusIdx]?.focus(), 0);
  };

  const handleBackupCodeChange = (value: string) => {
    setCode(value.slice(0, 20));
  };

  // ── Label & description for current method ──
  const methodMeta: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
    totp: {
      icon: <Smartphone className="w-6 h-6" />,
      label: 'Authenticator App',
      description: 'Enter the 6-digit code from your authenticator app.',
    },
    email: {
      icon: <Mail className="w-6 h-6" />,
      label: 'Email Verification',
      description: 'We sent a 6-digit code to your registered email address.',
    },
    sms: {
      icon: <MessageSquare className="w-6 h-6" />,
      label: 'SMS Verification',
      description: 'We sent a 6-digit code to your registered phone number.',
    },
    backup: {
      icon: <KeyRound className="w-6 h-6" />,
      label: 'Backup Code',
      description: 'Enter one of the backup codes you saved during setup.',
    },
  };

  const current = methodMeta[method] || methodMeta.totp;

  // ── Method picker (Google-style "Try another way") ──
  if (showMethodPicker) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 sm:p-8">
            <button
              onClick={() => setShowMethodPicker(false)}
              className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
              Choose a verification method
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Select how you'd like to verify your identity.
            </p>

            <div className="space-y-2">
              {(!mfaMethods || mfaMethods.totp) && (
                <button
                  onClick={() => handleMethodSelect('totp')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    method === 'totp'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="block font-medium text-gray-900 dark:text-white text-sm">Authenticator App</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Use a code from Google Authenticator or similar</span>
                  </div>
                </button>
              )}

              {(!mfaMethods || mfaMethods.email) && (
                <button
                  onClick={() => handleMethodSelect('email')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    method === 'email'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="block font-medium text-gray-900 dark:text-white text-sm">Email Code</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Send a verification code to your email</span>
                  </div>
                </button>
              )}

              {(!mfaMethods || mfaMethods.sms) && (
                <button
                  onClick={() => handleMethodSelect('sms')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    method === 'sms'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="block font-medium text-gray-900 dark:text-white text-sm">Text Message</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Send a verification code via SMS</span>
                  </div>
                </button>
              )}

              {/* Backup codes only exist when TOTP was set up */}
              {mfaMethods?.totp && (
                <button
                  onClick={() => handleMethodSelect('backup')}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    method === 'backup'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <span className="block font-medium text-gray-900 dark:text-white text-sm">Backup Code</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">Use a one-time backup code</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main verification view ──
  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-8 pb-4 sm:px-8 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Verify your identity
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-xs mx-auto">
            {current.description}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 pb-8 sm:px-8">
          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 mb-5 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* OTP status banner (email/sms) */}
          {(method === 'email' || method === 'sms') && (
            <div className="mb-5">
              {sendingOtp ? (
                <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    Sending verification code{method === 'email' ? ' to your email' : ' via SMS'}…
                  </span>
                </div>
              ) : otpSent ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-300">
                      Code sent — check your {method === 'email' ? 'inbox' : 'phone'}
                    </span>
                  </div>
                  <button
                    onClick={() => sendOTP(method)}
                    disabled={sendingOtp || resendCountdown > 0}
                    className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50 disabled:no-underline whitespace-nowrap ml-2"
                  >
                    {resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend'}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Backup code mode notice */}
          {method === 'backup' && (
            <div className="flex items-start gap-2.5 mb-5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <KeyRound className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Using a backup code</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Each code can only be used once.</p>
              </div>
            </div>
          )}

          {/* Code input — segmented boxes for OTP, single input for backup */}
          <div className="mb-5">
            {method === 'backup' ? (
              <input
                type="text"
                value={code}
                onChange={(e) => handleBackupCodeChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 6) handleVerify(); }}
                placeholder="XXXX-XXXX"
                className="w-full px-4 py-3.5 text-center text-lg font-mono tracking-widest border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-shadow"
                autoFocus
              />
            ) : (
              <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleDigitPaste}>
                {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={code[i] || ''}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    className="w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-semibold font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                    autoFocus={i === 0}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Trust device */}
          <label className="flex items-center gap-3 mb-6 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 rounded-full peer-checked:bg-blue-600 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-4 transition-transform" />
            </div>
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Remember this device
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Skip verification for 30 days
              </p>
            </div>
          </label>

          {/* Actions */}
          <button
            onClick={handleVerify}
            disabled={loading || code.length < 6}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </>
            ) : (
              'Continue'
            )}
          </button>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
          </div>

          {/* Bottom links — Google-style */}
          {/* "Try another way" only makes sense when there are alternatives:
              - multiple primary methods, OR
              - TOTP is enabled (which means backup codes were generated) */}
          {(() => {
            const primaryCount = [mfaMethods?.totp, mfaMethods?.email, mfaMethods?.sms].filter(Boolean).length;
            const hasAlternatives = primaryCount > 1 || mfaMethods?.totp;
            return (
              <div className={`flex items-center text-sm ${ hasAlternatives ? 'justify-between' : 'justify-start'}`}>
                <button
                  onClick={onCancel}
                  disabled={loading}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                {hasAlternatives && (
                  <button
                    onClick={() => setShowMethodPicker(true)}
                    disabled={loading}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Try another way
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default MFAVerification;
