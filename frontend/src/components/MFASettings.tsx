import React, { useState, useEffect } from 'react';
import { MFASetup } from './MFASetup';

interface MFAStatus {
  isEnabled: boolean;
  isRequired: boolean;
  totpEnabled: boolean;
  totpVerified: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  preferredMethod: string;
  backupCodesRemaining: number;
  backupCodesUsed: number;
  trustedDevicesCount: number;
}

interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  addedAt: string;
  expiresAt: string;
}

export const MFASettings: React.FC = () => {
  const [status, setStatus] = useState<MFAStatus | null>(null);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMFAStatus();
    fetchTrustedDevices();
  }, []);

  const fetchMFAStatus = async () => {
    try {
      const response = await fetch('/api/mfa/status', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus(data.data);
      }
    } catch (err: any) {
      setError('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrustedDevices = async () => {
    try {
      const response = await fetch('/api/mfa/trusted-devices', {
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTrustedDevices(data.data.devices);
      }
    } catch (err: any) {
      console.error('Failed to load trusted devices:', err);
    }
  };

  const handleDisableMFA = async () => {
    if (!disablePassword) {
      setError('Please enter your password to disable MFA');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
        body: JSON.stringify({ password: disablePassword }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to disable MFA');
      }

      setSuccess('MFA disabled successfully');
      setShowDisableConfirm(false);
      setDisablePassword('');
      await fetchMFAStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!confirm('This will invalidate all your current backup codes. Continue?')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/mfa/backup-codes/regenerate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to regenerate backup codes');
      }

      // Download the new backup codes
      const codesText = data.data.backupCodes.join('\n');
      const blob = new Blob([codesText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mfa-backup-codes-new.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess('Backup codes regenerated and downloaded');
      await fetchMFAStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTrustedDevice = async (deviceId: string) => {
    if (!confirm('Remove this trusted device?')) {
      return;
    }

    try {
      const response = await fetch(`/api/mfa/trusted-devices/${deviceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess('Trusted device removed');
        await fetchTrustedDevices();
      } else {
        throw new Error(data.message || 'Failed to remove device');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading && !status) {
    return <div className="text-center py-8">Loading MFA settings...</div>;
  }

  if (showSetup) {
    return (
      <MFASetup
        onComplete={() => {
          setShowSetup(false);
          setSuccess('MFA enabled successfully');
          fetchMFAStatus();
        }}
        onCancel={() => setShowSetup(false)}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
        Two-Factor Authentication
      </h1>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">×</button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          {success}
          <button onClick={() => setSuccess('')} className="float-right font-bold">×</button>
        </div>
      )}

      {/* MFA Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              MFA Status
            </h2>
            {status?.isRequired && (
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                ⚠️ MFA is required for your role
              </p>
            )}
          </div>
          <div>
            {status?.isEnabled ? (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                ✓ Enabled
              </span>
            ) : (
              <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-medium">
                Disabled
              </span>
            )}
          </div>
        </div>

        {!status?.isEnabled ? (
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Add an extra layer of security to your account with two-factor authentication.
            </p>
            <button
              onClick={() => setShowSetup(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Enable MFA
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {status.totpEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-gray-900 dark:text-white">📱 Authenticator App:</span>
                <span className="text-green-600">Active</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-gray-900 dark:text-white">🔑 Backup Codes:</span>
              <span className="text-gray-600 dark:text-gray-400">
                {status.backupCodesRemaining} remaining ({status.backupCodesUsed} used)
              </span>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRegenerateBackupCodes}
                disabled={loading}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Regenerate Backup Codes
              </button>

              {!status.isRequired && (
                <button
                  onClick={() => setShowDisableConfirm(true)}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Disable MFA
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Trusted Devices Card */}
      {status?.isEnabled && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Trusted Devices ({trustedDevices.length})
          </h2>

          {trustedDevices.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No trusted devices yet. Check "Trust this device" when logging in to skip MFA on known devices.
            </p>
          ) : (
            <div className="space-y-3">
              {trustedDevices.map((device) => (
                <div
                  key={device.deviceId}
                  className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {device.deviceName}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {device.ipAddress} • Added {new Date(device.addedAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Expires {new Date(device.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveTrustedDevice(device.deviceId)}
                    className="px-3 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Disable MFA Confirmation Modal */}
      {showDisableConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Disable Two-Factor Authentication
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Enter your password to confirm disabling MFA. This will make your account less secure.
            </p>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleDisableMFA}
                disabled={loading || !disablePassword}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Disabling...' : 'Disable MFA'}
              </button>
              <button
                onClick={() => {
                  setShowDisableConfirm(false);
                  setDisablePassword('');
                  setError('');
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MFASettings;
