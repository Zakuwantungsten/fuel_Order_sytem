import React, { useState, useEffect } from 'react';

interface MFAVerificationProps {
  userId: string;
  tempSessionToken: string;
  preferredMethod: 'totp' | 'sms' | 'email';
  onSuccess: (tokens: { accessToken: string; refreshToken: string; user: any }) => void;
  onCancel: () => void;
}

export const MFAVerification: React.FC<MFAVerificationProps> = ({
  userId,
  tempSessionToken,
  preferredMethod,
  onSuccess,
  onCancel,
}) => {
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'totp' | 'backup' | 'sms' | 'email'>(preferredMethod);
  const [trustDevice, setTrustDevice] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Auto-generate device name
    const browser = getBrowserName();
    const os = getOSName();
    setDeviceName(`${browser} on ${os}`);
  }, []);

  const getBrowserName = (): string => {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    return 'Browser';
  };

  const getOSName = (): string => {
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Device';
  };

  const handleVerify = async () => {
    if (!code) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const deviceId = localStorage.getItem('device_id') || crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);

      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          tempSessionToken,
          code,
          method,
          trustDevice,
          deviceId,
          deviceName: trustDevice ? deviceName : undefined,
          deviceInfo: {
            userAgent: navigator.userAgent,
            ipAddress: '', // Will be captured server-side
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid verification code');
      }

      // MFA verification successful
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

  const handleCodeChange = (value: string) => {
    // Only allow digits and limit to 6-8 characters
    const cleaned = value.replace(/\D/g, '');
    setCode(cleaned.slice(0, 8));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && code.length >= 6) {
      handleVerify();
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
        Two-Factor Authentication
      </h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Enter your verification code to continue
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Method Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Verification Method
        </label>
        <div className="space-y-2">
          <button
            onClick={() => setMethod('totp')}
            className={`w-full p-3 text-left border-2 rounded transition-colors ${
              method === 'totp'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <span className="font-semibold">📱 Authenticator App</span>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              6-digit code from your app
            </p>
          </button>

          <button
            onClick={() => setMethod('backup')}
            className={`w-full p-3 text-left border-2 rounded transition-colors ${
              method === 'backup'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            <span className="font-semibold">🔑 Backup Code</span>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Use one of your backup codes
            </p>
          </button>
        </div>
      </div>

      {/* Code Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {method === 'backup' ? 'Backup Code' : 'Verification Code'}
        </label>
        <input
          type="text"
          inputMode={method === 'backup' ? 'text' : 'numeric'}
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={method === 'backup' ? 'XXXX-XXXX' : '000000'}
          className="w-full px-4 py-3 text-center text-2xl font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>

      {/* Trust Device Option */}
      <div className="mb-6">
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
      </div>

      {/* Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleVerify}
          disabled={loading || code.length < 6}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>

        <button
          onClick={onCancel}
          disabled={loading}
          className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>

      {/* Help Text */}
      <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-sm text-gray-600 dark:text-gray-400">
        <p className="font-semibold mb-1">Lost your device?</p>
        <p>
          Use one of your backup codes to access your account, then you can reconfigure MFA.
        </p>
      </div>
    </div>
  );
};

export default MFAVerification;
