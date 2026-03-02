import React, { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

interface MFASetupLoginProps {
  userId: string;
  tempSessionToken: string;
  onSuccess: (tokens: { accessToken: string; refreshToken: string; user: any }) => void;
  onCancel: () => void;
}

export const MFASetupLogin: React.FC<MFASetupLoginProps> = ({
  userId,
  tempSessionToken,
  onSuccess,
  onCancel,
}) => {
  const [step, setStep] = useState<'scan' | 'verify' | 'backup-codes'>('scan');
  const [totpData, setTotpData] = useState<{ secret: string; qrCodeUrl: string; manualEntryKey: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [pendingTokens, setPendingTokens] = useState<{ accessToken: string; refreshToken: string; user: any } | null>(null);

  useEffect(() => {
    generateSecret();
  }, []);

  const generateSecret = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/setup-mfa/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tempSessionToken }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate MFA secret');
      }
      setTotpData(data.data);
      setStep('scan');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!totpData || !verificationCode) {
      setError('Please enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/setup-mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          tempSessionToken,
          secret: totpData.secret,
          code: verificationCode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }
      // Save tokens for after backup codes are acknowledged
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && verificationCode.length === 6) {
      handleVerify();
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          MFA Setup Required
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Your administrator requires two-factor authentication for your account. Set up an authenticator app to continue.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Scan QR code */}
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
                onClick={() => setStep('verify')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                I've scanned the code → Next
              </button>
            </>
          ) : (
            <button onClick={generateSecret} className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Retry
            </button>
          )}
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step 2: Verify code */}
      {step === 'verify' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Enter the 6-digit code shown in your authenticator app:
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={verificationCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="000000"
            className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleVerify}
            disabled={loading || verificationCode.length < 6}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify & Enable MFA'}
          </button>
          <button
            onClick={() => setStep('scan')}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            ← Back to QR Code
          </button>
        </div>
      )}

      {/* Step 3: Backup codes */}
      {step === 'backup-codes' && (
        <div className="space-y-4">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              ✅ MFA enabled successfully!
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
              {copiedBackupCodes ? '✓ Copied!' : 'Copy'}
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
