import React, { useState } from 'react';
import QRCode from 'react-qr-code';

interface MFASetupProps {
  onComplete: () => void;
  onCancel: () => void;
}

interface TOTPSetupData {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

export const MFASetup: React.FC<MFASetupProps> = ({ onComplete, onCancel }) => {
  const [step, setStep] = useState<'method' | 'totp-scan' | 'totp-verify' | 'backup-codes'>('method');
  const [totpData, setTotpData] = useState<TOTPSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  const handleMethodSelection = async (method: 'totp' | 'sms' | 'email') => {
    if (method === 'totp') {
      await generateTOTPSecret();
    }
    // SMS and Email can be implemented later
  };

  const generateTOTPSecret = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/mfa/setup/totp/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to generate TOTP secret');
      }

      setTotpData(data.data);
      setStep('totp-scan');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTOTP = async () => {
    if (!totpData || !verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/setup/totp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
        body: JSON.stringify({
          secret: totpData.secret,
          code: verificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }

      setBackupCodes(data.data.backupCodes);
      setStep('backup-codes');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  const handleDownloadBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mfa-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
        Enable Two-Factor Authentication
      </h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Step 1: Choose Method */}
      {step === 'method' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Choose your preferred MFA method to secure your account:
          </p>

          <button
            onClick={() => handleMethodSelection('totp')}
            disabled={loading}
            className="w-full p-4 text-left border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">
              📱 Authenticator App (Recommended)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Use Google Authenticator, Authy, or similar apps
            </p>
          </button>

          <button
            disabled
            className="w-full p-4 text-left border-2 border-gray-300 dark:border-gray-600 rounded-lg opacity-50 cursor-not-allowed"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">
              📧 Email (Coming Soon)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Receive codes via email
            </p>
          </button>

          <button
            disabled
            className="w-full p-4 text-left border-2 border-gray-300 dark:border-gray-600 rounded-lg opacity-50 cursor-not-allowed"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">
              📱 SMS (Coming Soon)
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Receive codes via text message
            </p>
          </button>

          <button
            onClick={onCancel}
            className="w-full mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step 2: Scan QR Code */}
      {step === 'totp-scan' && totpData && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Scan this QR code with your authenticator app:
          </p>

          <div className="flex justify-center p-4 bg-white rounded">
            <QRCode value={totpData.qrCodeUrl} size={200} />
          </div>

          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Can't scan? Enter this code manually:
            </p>
            <code className="block p-2 bg-white dark:bg-gray-800 rounded text-sm font-mono break-all">
              {totpData.manualEntryKey}
            </code>
          </div>

          <button
            onClick={() => setStep('totp-verify')}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Continue to Verification
          </button>

          <button
            onClick={() => setStep('method')}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      )}

      {/* Step 3: Verify Code */}
      {step === 'totp-verify' && (
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Enter the 6-digit code from your authenticator app:
          </p>

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            autoFocus
          />

          <button
            onClick={handleVerifyTOTP}
            disabled={loading || verificationCode.length !== 6}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Verify and Enable MFA'}
          </button>

          <button
            onClick={() => setStep('totp-scan')}
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Back
          </button>
        </div>
      )}

      {/* Step 4: Backup Codes */}
      {step === 'backup-codes' && (
        <div className="space-y-4">
          <div className="p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
            <p className="font-semibold">⚠️ Important: Save Your Backup Codes</p>
            <p className="text-sm mt-1">
              Store these codes in a safe place. You can use them to access your account if you lose your authenticator device.
            </p>
          </div>

          <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((code, index) => (
                <div key={index} className="p-2 bg-white dark:bg-gray-800 rounded">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopyBackupCodes}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              {copiedBackupCodes ? '✓ Copied!' : 'Copy Codes'}
            </button>
            <button
              onClick={handleDownloadBackupCodes}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Download Codes
            </button>
          </div>

          <button
            onClick={onComplete}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            I've Saved My Backup Codes
          </button>
        </div>
      )}
    </div>
  );
};

export default MFASetup;
