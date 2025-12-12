import { useState } from 'react';
import { Shield, Key, Lock, AlertTriangle, Mail, Send, CheckCircle, XCircle } from 'lucide-react';
import { systemAdminAPI } from '../../services/api';

interface SecurityTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function SecurityTab({ onMessage }: SecurityTabProps) {
  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    historyCount: 5,
  });

  const [sessionSettings, setSessionSettings] = useState({
    timeoutMinutes: 30,
    singleSession: false,
  });

  const [emailStatus, setEmailStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [testingEmail, setTestingEmail] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const testEmailConnection = async () => {
    setTestingEmail(true);
    try {
      const result = await systemAdminAPI.testEmailConfig();
      if (result.success) {
        setEmailStatus('connected');
        onMessage('success', 'Email service is connected and working');
      } else {
        setEmailStatus('disconnected');
        onMessage('error', 'Email service is not configured');
      }
    } catch (error: any) {
      setEmailStatus('disconnected');
      onMessage('error', error.response?.data?.message || 'Failed to test email connection');
    } finally {
      setTestingEmail(false);
    }
  };

  const sendTestEmail = async () => {
    setSendingTest(true);
    try {
      await systemAdminAPI.sendTestEmail();
      onMessage('success', 'Test email sent successfully! Check your inbox.');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const savePasswordPolicy = async () => {
    try {
      await systemAdminAPI.updateSecuritySettings('password', passwordPolicy);
      onMessage('success', 'Password policy saved successfully');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to save password policy');
    }
  };

  const saveSessionSettings = async () => {
    try {
      await systemAdminAPI.updateSecuritySettings('session', sessionSettings);
      onMessage('success', 'Session settings saved successfully');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to save session settings');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-red-600 dark:text-red-400" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Security Settings
        </h2>
      </div>

      {/* Password Policy */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Key className="w-5 h-5" />
          Password Policy
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Minimum Length
            </label>
            <input
              type="number"
              value={passwordPolicy.minLength}
              onChange={(e) => setPasswordPolicy({ ...passwordPolicy, minLength: parseInt(e.target.value) })}
              className="w-full max-w-xs px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="space-y-2">
            {[
              { key: 'requireUppercase', label: 'Require Uppercase Letters' },
              { key: 'requireLowercase', label: 'Require Lowercase Letters' },
              { key: 'requireNumbers', label: 'Require Numbers' },
              { key: 'requireSpecialChars', label: 'Require Special Characters' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(passwordPolicy as any)[key]}
                  onChange={(e) => setPasswordPolicy({ ...passwordPolicy, [key]: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
              </label>
            ))}
          </div>
          <button 
            onClick={savePasswordPolicy}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Save Password Policy
          </button>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5" />
          Session Management
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Session Timeout (minutes)
            </label>
            <input
              type="number"
              value={sessionSettings.timeoutMinutes}
              onChange={(e) => setSessionSettings({ ...sessionSettings, timeoutMinutes: parseInt(e.target.value) })}
              className="w-full max-w-xs px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sessionSettings.singleSession}
              onChange={(e) => setSessionSettings({ ...sessionSettings, singleSession: e.target.checked })}
              className="rounded text-indigo-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Allow only one active session per user
            </span>
          </label>
          <button 
            onClick={saveSessionSettings}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Save Session Settings
          </button>
        </div>
      </div>

      {/* Email Notification Settings */}
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
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  Email Service Status
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {emailStatus === 'connected' && 'Connected and operational'}
                  {emailStatus === 'disconnected' && 'Not configured or connection failed'}
                  {emailStatus === 'unknown' && 'Click test to check status'}
                </p>
              </div>
            </div>
            <button
              onClick={testEmailConnection}
              disabled={testingEmail}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {testingEmail ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {emailStatus === 'connected' && (
            <div className="space-y-3">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-200">
                  ✅ Email service is configured. Critical alerts will be sent automatically.
                </p>
              </div>
              
              <button
                onClick={sendTestEmail}
                disabled={sendingTest}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
                {sendingTest ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          )}

          {emailStatus === 'disconnected' && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                ⚠️ Email notifications are not configured
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                Set SMTP credentials in your backend .env file:
              </p>
              <code className="block mt-2 text-xs bg-red-100 dark:bg-red-900/40 p-2 rounded">
                SMTP_HOST=smtp.gmail.com<br/>
                SMTP_PORT=587<br/>
                SMTP_USER=your-email@gmail.com<br/>
                SMTP_PASS=your-app-password<br/>
                SMTP_SECURE=false
              </code>
            </div>
          )}
        </div>
      </div>

      {/* Warning */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Security Notice
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              Changes to security settings will affect all users. Ensure proper communication before implementing strict policies.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
