import { useState, useEffect, useCallback } from 'react';
import { Shield, Key, Lock, AlertTriangle, Mail, Send, CheckCircle, XCircle, Loader, Save } from 'lucide-react';
import { systemAdminAPI } from '../../services/api';
import { subscribeToSecurityEvents, unsubscribeFromSecurityEvents } from '../../services/websocket';

interface SecurityTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

const DEFAULT_SESSION = {
  sessionTimeout: 30,
  jwtExpiry: 24,
  refreshTokenExpiry: 7,
  maxLoginAttempts: 5,
  lockoutDuration: 15,
  allowMultipleSessions: true,
};

const DEFAULT_PASSWORD = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  historyCount: 5,
};

export default function SecurityTab({ onMessage }: SecurityTabProps) {
  const [loading, setLoading] = useState(true);
  const [savingSession, setSavingSession] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [emailStatus, setEmailStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [testingEmail, setTestingEmail] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sessionSettings, setSessionSettings] = useState(DEFAULT_SESSION);
  const [passwordPolicy, setPasswordPolicy] = useState(DEFAULT_PASSWORD);

  const applySettings = useCallback((data: { session?: any; password?: any }) => {
    if (data.session) setSessionSettings((prev) => ({ ...prev, ...data.session }));
    if (data.password) setPasswordPolicy((prev) => ({ ...prev, ...data.password }));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await systemAdminAPI.getSecuritySettings();
        applySettings(data);
      } catch (err: any) {
        onMessage('error', err.response?.data?.message || 'Failed to load security settings');
      } finally {
        setLoading(false);
      }
    };
    load();

    // Real-time: update this tab instantly when any other super_admin tab saves
    subscribeToSecurityEvents((event) => applySettings(event));
    return () => unsubscribeFromSecurityEvents();
  }, []);

  const saveSessionSettings = async () => {
    setSavingSession(true);
    try {
      await systemAdminAPI.updateSecuritySettings('session', sessionSettings);
      onMessage('success', 'Session settings saved. Changes apply to new sessions.');
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to save session settings');
    } finally {
      setSavingSession(false);
    }
  };

  const savePasswordPolicy = async () => {
    setSavingPassword(true);
    try {
      await systemAdminAPI.updateSecuritySettings('password', passwordPolicy);
      onMessage('success', 'Password policy saved successfully');
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to save password policy');
    } finally {
      setSavingPassword(false);
    }
  };

  const testEmailConnection = async () => {
    setTestingEmail(true);
    try {
      const result = await systemAdminAPI.testEmailConfig();
      if (result.success) {
        setEmailStatus('connected');
        onMessage('success', 'Email service is connected and working');
      } else {
        setEmailStatus('disconnected');
        onMessage('error', 'Email service is not configured or reachable');
      }
    } catch (err: any) {
      setEmailStatus('disconnected');
      onMessage('error', err.response?.data?.message || 'Failed to test email connection');
    } finally {
      setTestingEmail(false);
    }
  };

  const sendTestEmailFn = async () => {
    setSendingTest(true);
    try {
      await systemAdminAPI.sendTestEmail();
      onMessage('success', 'Test email sent! Check your inbox.');
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const inputNum = 'w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader className="w-7 h-7 animate-spin text-purple-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading security settings…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-red-600 dark:text-red-400" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Security Settings</h2>
      </div>

      {/* ---- Session & Security ---- */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Session &amp; Security
        </h3>
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-3 mb-5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-orange-800 dark:text-orange-200">
            Changes affect <strong>all users</strong>. Existing sessions remain valid until their current token expires.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Session Timeout (minutes)</label>
            <input type="number" min={1} value={sessionSettings.sessionTimeout}
              onChange={(e) => setSessionSettings({ ...sessionSettings, sessionTimeout: parseInt(e.target.value) || 30 })}
              className={inputNum} />
            <p className="text-xs text-gray-500 mt-1">Idle time before auto-logout</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">JWT Expiry (hours)</label>
            <input type="number" min={1} value={sessionSettings.jwtExpiry}
              onChange={(e) => setSessionSettings({ ...sessionSettings, jwtExpiry: parseInt(e.target.value) || 24 })}
              className={inputNum} />
            <p className="text-xs text-gray-500 mt-1">Token lifetime before re-login required</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Login Attempts</label>
            <input type="number" min={1} max={20} value={sessionSettings.maxLoginAttempts}
              onChange={(e) => setSessionSettings({ ...sessionSettings, maxLoginAttempts: parseInt(e.target.value) || 5 })}
              className={inputNum} />
            <p className="text-xs text-gray-500 mt-1">Failed logins before account lockout</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lockout Duration (minutes)</label>
            <input type="number" min={1} value={sessionSettings.lockoutDuration}
              onChange={(e) => setSessionSettings({ ...sessionSettings, lockoutDuration: parseInt(e.target.value) || 15 })}
              className={inputNum} />
            <p className="text-xs text-gray-500 mt-1">How long the account stays locked after max attempts</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Refresh Token Expiry (days)</label>
            <input type="number" min={1} value={sessionSettings.refreshTokenExpiry}
              onChange={(e) => setSessionSettings({ ...sessionSettings, refreshTokenExpiry: parseInt(e.target.value) || 7 })}
              className={inputNum} />
            <p className="text-xs text-gray-500 mt-1">How long “stay logged in” sessions last</p>
          </div>
          <div className="flex items-center pt-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={sessionSettings.allowMultipleSessions}
                onChange={(e) => setSessionSettings({ ...sessionSettings, allowMultipleSessions: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded mt-0.5" />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Allow multiple concurrent sessions</span>
                <span className="text-xs text-gray-500">Users can be logged in from multiple browsers or devices simultaneously</span>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={saveSessionSettings} disabled={savingSession}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50 transition-colors">
            {savingSession ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Session Settings
          </button>
        </div>
      </div>

      {/* ---- Password Policy ---- */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Password Policy
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Length</label>
            <input type="number" min={6} max={64} value={passwordPolicy.minLength}
              onChange={(e) => setPasswordPolicy({ ...passwordPolicy, minLength: parseInt(e.target.value) || 12 })}
              className={inputNum} />
          </div>
          <div className="space-y-2">
            {[
              { key: 'requireUppercase', label: 'Require Uppercase Letters (A–Z)' },
              { key: 'requireLowercase', label: 'Require Lowercase Letters (a–z)' },
              { key: 'requireNumbers', label: 'Require Numbers (0–9)' },
              { key: 'requireSpecialChars', label: 'Require Special Characters (!@#$…)' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={(passwordPolicy as any)[key]}
                  onChange={(e) => setPasswordPolicy({ ...passwordPolicy, [key]: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password History (count)</label>
            <input type="number" min={0} max={24} value={passwordPolicy.historyCount}
              onChange={(e) => setPasswordPolicy({ ...passwordPolicy, historyCount: parseInt(e.target.value) || 5 })}
              className={inputNum} />
            <p className="text-xs text-gray-500 mt-1">Prevent reuse of the last N passwords (0 = disabled)</p>
          </div>
          <div className="flex justify-end">
            <button onClick={savePasswordPolicy} disabled={savingPassword}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors">
              {savingPassword ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Password Policy
            </button>
          </div>
        </div>
      </div>

      {/* ---- Email Status ---- */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Email Notifications
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              {emailStatus === 'connected' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {emailStatus === 'disconnected' && <XCircle className="w-5 h-5 text-red-500" />}
              {emailStatus === 'unknown' && <Mail className="w-5 h-5 text-gray-400" />}
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">Email Service Status</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {emailStatus === 'connected' && 'Connected and operational'}
                  {emailStatus === 'disconnected' && 'Not configured or connection failed'}
                  {emailStatus === 'unknown' && 'Click Test to check status'}
                </p>
              </div>
            </div>
            <button onClick={testEmailConnection} disabled={testingEmail}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {testingEmail ? 'Testing…' : 'Test Connection'}
            </button>
          </div>

          {emailStatus === 'connected' && (
            <button onClick={sendTestEmailFn} disabled={sendingTest}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
              <Send className="w-4 h-4" />
              {sendingTest ? 'Sending…' : 'Send Test Email'}
            </button>
          )}

          {emailStatus === 'disconnected' && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">⚠️ Email not configured</p>
              <p className="text-sm text-red-700 dark:text-red-300 mb-2">
                Configure SMTP credentials in the <strong>Integrations</strong> tab, or add these to your .env file:
              </p>
              <code className="block text-xs bg-red-100 dark:bg-red-900/40 p-2 rounded leading-relaxed">
                EMAIL_HOST=smtp.gmail.com<br />
                EMAIL_PORT=587<br />
                EMAIL_USER=your@email.com<br />
                EMAIL_PASSWORD=your-app-password
              </code>
            </div>
          )}
        </div>
      </div>

      {/* ---- Security Notice ---- */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Security Notice</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              Changes to security settings will affect all users. Ensure proper communication before implementing strict policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
