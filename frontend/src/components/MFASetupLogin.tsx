import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

// Use the same base URL as api.ts so fetch() calls reach the backend in
// both development (Vite proxy) and production (cross-origin Railway).
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** Read the XSRF-TOKEN from sessionStorage (cross-origin safe) or cookie */
const getCsrfToken = (): string | undefined => {
  // Primary: sessionStorage (written by api.ts fetchCsrfToken — works cross-origin)
  const stored = sessionStorage.getItem('xsrf_token');
  if (stored && stored !== '[REDACTED]') return stored;
  // Fallback: cookie (works only when frontend and backend share the same domain)
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

interface MFASetupLoginProps {
  userId: string;
  tempSessionToken: string;
  allowedMethods?: string[];  // admin-controlled: e.g. ['totp'], ['email'], or ['totp', 'email']
  onSuccess: (tokens: { accessToken: string; refreshToken: string; user: any }) => void;
  onCancel: () => void;
}

type Step = 'method' | 'scan' | 'totp-verify' | 'email-verify' | 'backup-codes';

export const MFASetupLogin: React.FC<MFASetupLoginProps> = ({
  userId,
  tempSessionToken,
  allowedMethods = ['totp', 'email'],
  onSuccess,
  onCancel,
}) => {
  const totpAllowed = allowedMethods.includes('totp');
  const emailAllowed = allowedMethods.includes('email');
  // If only one method is allowed, skip the method selection step
  const singleMethod = allowedMethods.length === 1;
  const [step, setStep] = useState<Step>('method');
  const [totpData, setTotpData] = useState<{ secret: string; qrCodeUrl: string; manualEntryKey: string } | null>(null);
  const [alreadyConfigured, setAlreadyConfigured] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [pendingTokens, setPendingTokens] = useState<{ accessToken: string; refreshToken: string; user: any } | null>(null);
  const [trustDevice, setTrustDevice] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  // Auto-trigger when only one method is allowed (skipping method selection)
  useEffect(() => {
    if (singleMethod && totpAllowed) {
      handleSelectTOTP();
    } else if (singleMethod && emailAllowed) {
      handleSelectEmail();
    }
    // Generate device name
    const browser = /Firefox/.test(navigator.userAgent) ? 'Firefox' : /Chrome/.test(navigator.userAgent) ? 'Chrome' : /Safari/.test(navigator.userAgent) ? 'Safari' : 'Browser';
    const os = /Windows/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Linux/.test(navigator.userAgent) ? 'Linux' : 'Device';
    setDeviceName(`${browser} on ${os}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── TOTP flow ──
  const handleSelectTOTP = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/setup-mfa/generate`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({ userId, tempSessionToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate MFA secret');
      }
      if (data.data.alreadyConfigured) {
        setAlreadyConfigured(true);
        setStep('totp-verify');
      } else {
        setTotpData(data.data);
        setStep('scan');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTOTP = async () => {
    if (!alreadyConfigured && !totpData) {
      setError('Please generate a TOTP secret first');
      return;
    }
    if (!verificationCode) {
      setError('Please enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);

      const response = await fetch(`${API_BASE}/auth/setup-mfa/verify`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          userId,
          tempSessionToken,
          secret: alreadyConfigured ? undefined : totpData!.secret,
          code: verificationCode,
          trustDevice,
          deviceId,
          deviceName: trustDevice ? deviceName : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }
      setPendingTokens({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        user: data.data.user,
      });
      setBackupCodes(data.data.backupCodes || []);
      setStep('backup-codes');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Email flow ──
  const handleSelectEmail = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/setup-mfa/email/send`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({ userId, tempSessionToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to send email code');
      }
      setStep('email-verify');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verificationCode) {
      setError('Please enter the 6-digit code from your email');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);

      const response = await fetch(`${API_BASE}/auth/setup-mfa/email/verify`, {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          userId,
          tempSessionToken,
          code: verificationCode,
          trustDevice,
          deviceId,
          deviceName: trustDevice ? deviceName : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }
      // Email MFA setup complete — go straight to dashboard
      onSuccess({
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        user: data.data.user,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Shared helpers ──
  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  const handleDownloadBackupCodes = () => {
    const blob = new Blob([backupCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mfa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleComplete = () => {
    if (pendingTokens) {
      onSuccess(pendingTokens);
    }
  };

  const handleCodeChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    setVerificationCode(cleaned.slice(0, 6));
  };

  const handleKeyPressTOTP = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && verificationCode.length === 6) {
      handleVerifyTOTP();
    }
  };

  const handleKeyPressEmail = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && verificationCode.length === 6) {
      handleVerifyEmail();
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          MFA Setup Required
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Your administrator requires two-factor authentication for your account.{!singleMethod ? ' Choose a verification method to continue.' : ''}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded text-sm">
          {error}
        </div>
      )}

      {/* Step: Choose method */}
      {step === 'method' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Choose your preferred verification method:
          </p>

          {totpAllowed && (
            <button
              onClick={handleSelectTOTP}
              disabled={loading}
              className="w-full p-4 text-left border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Authenticator App {emailAllowed ? '(Recommended)' : ''}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Use Google Authenticator, Authy, or similar apps
              </p>
            </button>
          )}

          {emailAllowed && (
            <button
              onClick={handleSelectEmail}
              disabled={loading}
              className="w-full p-4 text-left border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Email Verification
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Receive a verification code via email
              </p>
            </button>
          )}

          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}

          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step: Scan QR code (TOTP) */}
      {step === 'scan' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : totpData ? (
            <>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div className="inline-block p-4 bg-white rounded-lg">
                  <QRCode value={totpData.qrCodeUrl} size={200} />
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Can't scan? Enter this key manually:</p>
                <code className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all select-all">
                  {totpData.manualEntryKey}
                </code>
              </div>
              <button
                onClick={() => { setVerificationCode(''); setStep('totp-verify'); }}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                I've scanned the code - Next
              </button>
            </>
          ) : (
            <button onClick={handleSelectTOTP} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Retry
            </button>
          )}
          <button
            onClick={() => { singleMethod ? onCancel() : (setStep('method'), setError('')); }}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {singleMethod ? 'Cancel' : 'Back'}
          </button>
        </div>
      )}

      {/* Step: Verify TOTP code */}
      {step === 'totp-verify' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Enter the 6-digit code shown in your authenticator app:
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={verificationCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyPress={handleKeyPressTOTP}
            placeholder="000000"
            className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleVerifyTOTP}
            disabled={loading || verificationCode.length < 6}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify MFA'}
          </button>

          {/* Trust Device */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Trust this device for 30 days
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                You won't need to enter a code on this device for 30 days
              </p>
            </div>
          </label>

          <button
            onClick={() => { setVerificationCode(''); setStep(alreadyConfigured ? (singleMethod ? 'scan' : 'method') : 'scan'); setError(''); }}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Back
          </button>
        </div>
      )}

      {/* Step: Verify email code */}
      {step === 'email-verify' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              A 6-digit verification code has been sent to your email. Check your inbox.
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyPress={handleKeyPressEmail}
            placeholder="000000"
            className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleVerifyEmail}
            disabled={loading || verificationCode.length < 6}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify Email MFA'}
          </button>

          {/* Trust Device */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trustDevice}
              onChange={(e) => setTrustDevice(e.target.checked)}
              className="mt-1"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Trust this device for 30 days
              </span>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                You won't need to enter a code on this device for 30 days
              </p>
            </div>
          </label>

          <button
            onClick={handleSelectEmail}
            disabled={loading}
            className="w-full px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Resend code
          </button>
          <button
            onClick={() => { setVerificationCode(''); singleMethod ? onCancel() : (setStep('method'), setError('')); }}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {singleMethod ? 'Cancel' : 'Back'}
          </button>
        </div>
      )}

      {/* Step: Backup codes (after TOTP setup) */}
      {step === 'backup-codes' && (
        <div className="space-y-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              MFA enabled successfully!
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
              Save your backup codes
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
              If you lose access to your authenticator app, use these one-time codes to log in. Store them somewhere safe.
            </p>
            <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg font-mono text-sm">
              {backupCodes.map((code, i) => (
                <span key={i} className="text-gray-800 dark:text-gray-200">{code}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyBackupCodes}
              className="flex-1 px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            >
              {copiedBackupCodes ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={handleDownloadBackupCodes}
              className="flex-1 px-3 py-2 text-sm bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            >
              Download
            </button>
          </div>
          <button
            onClick={handleComplete}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Continue to Dashboard
          </button>
        </div>
      )}
    </div>
  );
};

export default MFASetupLogin;
