import { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Database,
  Bell,
  Power,
  Globe,
  Mail,
  HardDrive,
  Activity,
  Eye,
  Save,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader,
} from 'lucide-react';
import systemConfigAPI, { SystemSettings } from '../../services/systemConfigService';
import { subscribeToSecurityEvents, unsubscribeFromSecurityEvents } from '../../services/websocket';

interface SystemConfigDashboardProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function SystemConfigDashboard({ onMessage }: SystemConfigDashboardProps) {
  const [activeTab, setActiveTab] = useState<'settings' | 'integrations' | 'monitoring' | 'environment'>('settings');
  const [activeSection, setActiveSection] = useState<'general' | 'security' | 'data' | 'notifications' | 'maintenance'>('general');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Inline per-section feedback — shown directly inside the settings card so it's
  // always visible regardless of the user's scroll position.
  const [sectionFeedback, setSectionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // System Settings
  const [settings, setSettings] = useState<SystemSettings>({
    general: {
      systemName: 'Fuel Order Management System',
      timezone: 'Africa/Nairobi',
      dateFormat: 'DD/MM/YYYY',
      language: 'en',
    },
    session: {
      sessionTimeout: 30,
      jwtExpiry: 24,
      refreshTokenExpiry: 7,
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      allowMultipleSessions: true,
    },
    data: {
      archivalEnabled: true,
      archivalMonths: 6,
      auditLogRetention: 12,
      trashRetention: 90,
      autoCleanupEnabled: false,
      backupFrequency: 'daily',
      backupRetention: 30,
    },
    notifications: {
      emailNotifications: true,
      criticalAlerts: true,
      dailySummary: false,
      weeklyReport: true,
      slowQueryThreshold: 500,
      storageWarningThreshold: 80,
    },
    maintenance: {
      enabled: false,
      message: 'System is under maintenance. Please check back later.',
      allowedRoles: ['super_admin'],
    },
  });

  // Integration configurations
  const [r2Config, setR2Config] = useState<any>(null);
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [dbConfig, setDbConfig] = useState<any>(null);
  const [envVars, setEnvVars] = useState<any>(null);

  // Email testing state
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [emailTesting, setEmailTesting] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Profiling
  const [profiling, setProfiling] = useState({
    enabled: false,
    sampleRate: 0.1,
    slowQueryThreshold: 500,
  });

  useEffect(() => {
    loadSystemSettings();

    // When SecurityTab (sidebar) saves session settings, update our form too so
    // both places always show the same values without needing a page refresh.
    subscribeToSecurityEvents((event) => {
      if (event.session) {
        setSettings((prev) => ({
          ...prev,
          session: { ...prev.session, ...event.session },
        }));
      }
    });
    return () => unsubscribeFromSecurityEvents();
  }, []);

  const loadSystemSettings = async () => {
    setLoading(true);
    try {
      const data = await systemConfigAPI.getSystemSettings();
      setSettings(data);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const [r2, email, db] = await Promise.all([
        systemConfigAPI.getR2Configuration(),
        systemConfigAPI.getEmailConfiguration(),
        systemConfigAPI.getDatabaseConfiguration(),
      ]);
      setR2Config(r2);
      setEmailConfig(email);
      setDbConfig(db);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const loadMonitoring = async () => {
    setLoading(true);
    try {
      const profilingData = await systemConfigAPI.getProfilingSettings();
      setProfiling(profilingData);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load monitoring settings');
    } finally {
      setLoading(false);
    }
  };

  const loadEnvironment = async () => {
    setLoading(true);
    try {
      const env = await systemConfigAPI.getEnvironmentVariables();
      setEnvVars(env);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load environment variables');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (section: keyof SystemSettings) => {
    setSaving(true);
    setSectionFeedback(null);
    try {
      switch (section) {
        case 'general':
          await systemConfigAPI.updateGeneralSettings(settings.general);
          break;
        case 'session':
          await systemConfigAPI.updateSecuritySettings(settings.session);
          break;
        case 'data':
          await systemConfigAPI.updateDataRetentionSettings(settings.data);
          break;
        case 'notifications':
          await systemConfigAPI.updateNotificationSettings(settings.notifications);
          break;
        case 'maintenance':
          await systemConfigAPI.updateMaintenanceMode(settings.maintenance);
          break;
      }
      const msg = `${section.charAt(0).toUpperCase() + section.slice(1)} settings updated successfully`;
      // Bubble up to parent banner AND show inline so it's visible when scrolled down
      onMessage('success', msg);
      setSectionFeedback({ type: 'success', message: msg });
      setTimeout(() => setSectionFeedback(null), 4000);
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Failed to save settings';
      onMessage('error', msg);
      setSectionFeedback({ type: 'error', message: msg });
      setTimeout(() => setSectionFeedback(null), 6000);
    } finally {
      setSaving(false);
    }
  };

  const testR2Connection = async () => {
    try {
      const result = await systemConfigAPI.testR2Connection();
      onMessage('success', result.message);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'R2 connection test failed');
    }
  };

  const handleTestEmailConnection = async () => {
    setEmailTesting(true);
    setEmailTestResult(null);
    try {
      const result = await systemConfigAPI.testEmailConnection();
      setEmailTestResult(result);
    } catch (error: any) {
      setEmailTestResult({ success: false, message: error.response?.data?.message || 'SMTP connection failed' });
    } finally {
      setEmailTesting(false);
    }
  };

  const handleSendTestEmail = async () => {
    const recipient = testEmailRecipient.trim();
    if (!recipient) {
      onMessage('error', 'Enter a recipient email address');
      return;
    }
    setSendingTestEmail(true);
    try {
      const result = await systemConfigAPI.sendTestEmail(recipient);
      onMessage('success', result.message || `Test email sent to ${recipient}`);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to send test email');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const saveEmailConfiguration = async () => {
    setSaving(true);
    try {
      if (!emailConfig.host || !emailConfig.user || !emailConfig.from) {
        onMessage('error', 'Please fill in Host, Username, and From Email');
        return;
      }
      await systemConfigAPI.updateEmailConfiguration(emailConfig);
      onMessage('success', 'Email configuration updated successfully. Email service will be reinitialized.');
      // Reload email config to get updated masked values
      await loadIntegrations();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update email configuration');
    } finally {
      setSaving(false);
    }
  };

  const updateProfiling = async () => {
    setSaving(true);
    try {
      await systemConfigAPI.updateProfilingSettings(profiling);
      onMessage('success', 'Profiling settings updated successfully');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update profiling settings');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'settings', label: 'System Settings', icon: Settings },
    { id: 'integrations', label: 'Integrations', icon: Globe },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'environment', label: 'Environment', icon: Eye },
  ];

  const settingSections = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'data', label: 'Data Retention', icon: Database },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'maintenance', label: 'Maintenance', icon: Power },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            System Configuration
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Shield className="w-4 h-4" />
          <span>Super Admin Only</span>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  if (tab.id === 'integrations') loadIntegrations();
                  if (tab.id === 'monitoring') loadMonitoring();
                  if (tab.id === 'environment') loadEnvironment();
                }}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        {/* Inline feedback banner — visible at the top of the card regardless of scroll */}
        {sectionFeedback && (
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 mb-5 text-sm font-medium ${
            sectionFeedback.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300'
          }`}>
            {sectionFeedback.type === 'success'
              ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
              : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
            <span>{sectionFeedback.message}</span>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <>
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* Settings Sub-tabs */}
                <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                  {settingSections.map((section) => {
                    const Icon = section.icon;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id as any)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          activeSection === section.id
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {section.label}
                      </button>
                    );
                  })}
                </div>

                {/* General Settings */}
                {activeSection === 'general' && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      General Settings
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          System Name
                        </label>
                        <input
                          type="text"
                          value={settings.general.systemName}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              general: { ...settings.general, systemName: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Timezone
                        </label>
                        <select
                          value={settings.general.timezone}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              general: { ...settings.general, timezone: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <optgroup label="Africa">
                            <option value="Africa/Dar_es_Salaam">East Africa Time — Dar es Salaam (EAT, UTC+3)</option>
                            <option value="Africa/Nairobi">East Africa Time — Nairobi (EAT, UTC+3)</option>
                            <option value="Africa/Kampala">East Africa Time — Kampala (EAT, UTC+3)</option>
                            <option value="Africa/Lusaka">Central Africa Time — Lusaka (CAT, UTC+2)</option>
                            <option value="Africa/Harare">Central Africa Time — Harare (CAT, UTC+2)</option>
                            <option value="Africa/Johannesburg">South Africa Standard — Johannesburg (SAST, UTC+2)</option>
                            <option value="Africa/Lagos">West Africa Time — Lagos (WAT, UTC+1)</option>
                            <option value="Africa/Accra">Greenwich Mean Time — Accra (GMT, UTC+0)</option>
                            <option value="Africa/Cairo">Eastern European Time — Cairo (EET, UTC+2)</option>
                            <option value="Africa/Casablanca">Western European Time — Casablanca (WET, UTC+1)</option>
                          </optgroup>
                          <optgroup label="Europe">
                            <option value="Europe/London">Greenwich Mean Time — London (GMT/BST, UTC+0/+1)</option>
                            <option value="Europe/Paris">Central European Time — Paris (CET, UTC+1/+2)</option>
                            <option value="Europe/Berlin">Central European Time — Berlin (CET, UTC+1/+2)</option>
                            <option value="Europe/Moscow">Moscow Standard Time (MSK, UTC+3)</option>
                            <option value="Europe/Istanbul">Turkey Time (TRT, UTC+3)</option>
                            <option value="Europe/Dubai">Gulf Standard Time — Dubai (GST, UTC+4)</option>
                          </optgroup>
                          <optgroup label="Asia">
                            <option value="Asia/Riyadh">Arabia Standard Time — Riyadh (AST, UTC+3)</option>
                            <option value="Asia/Karachi">Pakistan Standard Time (PKT, UTC+5)</option>
                            <option value="Asia/Kolkata">India Standard Time (IST, UTC+5:30)</option>
                            <option value="Asia/Dhaka">Bangladesh Standard Time (BST, UTC+6)</option>
                            <option value="Asia/Bangkok">Indochina Time — Bangkok (ICT, UTC+7)</option>
                            <option value="Asia/Singapore">Singapore Standard Time (SGT, UTC+8)</option>
                            <option value="Asia/Shanghai">China Standard Time (CST, UTC+8)</option>
                            <option value="Asia/Tokyo">Japan Standard Time (JST, UTC+9)</option>
                          </optgroup>
                          <optgroup label="Americas">
                            <option value="America/New_York">Eastern Time — New York (ET, UTC-5/-4)</option>
                            <option value="America/Chicago">Central Time — Chicago (CT, UTC-6/-5)</option>
                            <option value="America/Denver">Mountain Time — Denver (MT, UTC-7/-6)</option>
                            <option value="America/Los_Angeles">Pacific Time — Los Angeles (PT, UTC-8/-7)</option>
                            <option value="America/Sao_Paulo">Brasilia Time (BRT, UTC-3)</option>
                          </optgroup>
                          <optgroup label="UTC">
                            <option value="UTC">Coordinated Universal Time (UTC+0)</option>
                          </optgroup>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Date Format
                        </label>
                        <select
                          value={settings.general.dateFormat}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              general: { ...settings.general, dateFormat: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Language
                        </label>
                        <select
                          value={settings.general.language}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              general: { ...settings.general, language: e.target.value },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <option value="en">English</option>
                          <option value="sw">Swahili</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => saveSettings('general')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save General Settings
                      </button>
                    </div>
                  </div>
                )}

                {/* Security Settings */}
                {activeSection === 'security' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Security & Session Settings
                      </h3>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        ⚠️ <strong>Warning:</strong> Changes to security settings will affect all users. Existing sessions remain valid until expiry.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Session Timeout (minutes)
                        </label>
                        <input
                          type="number"
                          value={settings.session.sessionTimeout}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              session: { ...settings.session, sessionTimeout: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          JWT Expiry (hours)
                        </label>
                        <input
                          type="number"
                          value={settings.session.jwtExpiry}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              session: { ...settings.session, jwtExpiry: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Max Login Attempts
                        </label>
                        <input
                          type="number"
                          value={settings.session.maxLoginAttempts}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              session: { ...settings.session, maxLoginAttempts: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Lockout Duration (minutes)
                        </label>
                        <input
                          type="number"
                          value={settings.session.lockoutDuration}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              session: { ...settings.session, lockoutDuration: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={settings.session.allowMultipleSessions}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                session: { ...settings.session, allowMultipleSessions: e.target.checked },
                              })
                            }
                            className="w-4 h-4 text-purple-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Allow multiple concurrent sessions per user
                          </span>
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => saveSettings('session')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Security Settings
                      </button>
                    </div>
                  </div>
                )}

                {/* Data Retention Settings */}
                {activeSection === 'data' && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Data Retention & Cleanup
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Trash Retention (days)
                        </label>
                        <input
                          type="number"
                          value={settings.data.trashRetention}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              data: { ...settings.data, trashRetention: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Backup Retention (days)
                        </label>
                        <input
                          type="number"
                          value={settings.data.backupRetention}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              data: { ...settings.data, backupRetention: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Audit Log Retention (months)
                        </label>
                        <input
                          type="number"
                          value={settings.data.auditLogRetention}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              data: { ...settings.data, auditLogRetention: parseInt(e.target.value) },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Backup Frequency
                        </label>
                        <select
                          value={settings.data.backupFrequency}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              data: { ...settings.data, backupFrequency: e.target.value as any },
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div className="col-span-2 space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={settings.data.autoCleanupEnabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                data: { ...settings.data, autoCleanupEnabled: e.target.checked },
                              })
                            }
                            className="w-4 h-4 text-purple-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Enable automatic cleanup of old trash items
                          </span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={settings.data.archivalEnabled}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                data: { ...settings.data, archivalEnabled: e.target.checked },
                              })
                            }
                            className="w-4 h-4 text-purple-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Enable automatic data archival
                          </span>
                        </label>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => saveSettings('data')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Data Settings
                      </button>
                    </div>
                  </div>
                )}

                {/* Notification Settings */}
                {activeSection === 'notifications' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Bell className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Notification Settings
                      </h3>
                    </div>
                    <div className="space-y-4">
                      {/* Email Notifications Toggle */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={settings.notifications.emailNotifications}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                notifications: { ...settings.notifications, emailNotifications: e.target.checked },
                              })
                            }
                            className="w-5 h-5 text-blue-600 rounded"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 block">
                              Enable Email Notifications
                            </span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              Send email notifications for important system events
                            </span>
                          </div>
                        </label>
                      </div>

                      {/* Alert Types */}
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Alert Types</h4>
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={settings.notifications.criticalAlerts}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                notifications: { ...settings.notifications, criticalAlerts: e.target.checked },
                              })
                            }
                            className="w-4 h-4 text-red-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Critical Alerts (high priority system issues)
                          </span>
                        </label>
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={settings.notifications.dailySummary}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                notifications: { ...settings.notifications, dailySummary: e.target.checked },
                              })
                            }
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Daily Summary (daily activity reports)
                          </span>
                        </label>
                        <label className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={settings.notifications.weeklyReport}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                notifications: { ...settings.notifications, weeklyReport: e.target.checked },
                              })
                            }
                            className="w-4 h-4 text-purple-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Weekly Report (comprehensive weekly statistics)
                          </span>
                        </label>
                      </div>

                      {/* Performance Thresholds */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Slow Query Threshold (ms)
                          </label>
                          <input
                            type="number"
                            value={settings.notifications.slowQueryThreshold}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                notifications: { ...settings.notifications, slowQueryThreshold: parseInt(e.target.value) },
                              })
                            }
                            min="100"
                            step="100"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Queries slower than this will trigger alerts
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Storage Warning Threshold (%)
                          </label>
                          <input
                            type="number"
                            value={settings.notifications.storageWarningThreshold}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                notifications: { ...settings.notifications, storageWarningThreshold: parseInt(e.target.value) },
                              })
                            }
                            min="50"
                            max="95"
                            step="5"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Alert when storage usage exceeds this percentage
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => saveSettings('notifications')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Notification Settings
                      </button>
                    </div>
                  </div>
                )}

                {/* Maintenance Mode */}
                {activeSection === 'maintenance' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Power className="w-5 h-5 text-red-600" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Maintenance Mode
                      </h3>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                      <p className="text-sm text-red-800 dark:text-red-200">
                        🚨 <strong>Critical:</strong> When enabled, only users with allowed roles can access the system. All other users will see the maintenance message.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={settings.maintenance.enabled}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              maintenance: { ...settings.maintenance, enabled: e.target.checked },
                            })
                          }
                          className="w-5 h-5 text-red-600 rounded"
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Enable Maintenance Mode
                        </span>
                      </label>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Maintenance Message
                        </label>
                        <textarea
                          value={settings.maintenance.message}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              maintenance: { ...settings.maintenance, message: e.target.value },
                            })
                          }
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => saveSettings('maintenance')}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                      >
                        {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {settings.maintenance.enabled ? 'Enable' : 'Disable'} Maintenance Mode
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'integrations' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  External Integrations
                </h3>

                {/* R2 Storage */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <HardDrive className="w-5 h-5 text-blue-600" />
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Cloudflare R2 Storage</h4>
                    </div>
                    {r2Config?.isConfigured ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  {r2Config && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Endpoint:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{r2Config.r2Endpoint}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Bucket:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{r2Config.r2BucketName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Access Key:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{r2Config.r2AccessKeyId}</span>
                      </div>
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={testR2Connection}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                        >
                          Test Connection
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Email */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Mail className="w-5 h-5 text-green-600" />
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Email Configuration (SMTP)</h4>
                    </div>
                    {emailConfig?.isConfigured ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({emailConfig.source === 'database' ? 'Database' : 'Environment'})
                        </span>
                      </div>
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  {emailConfig && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            SMTP Host
                          </label>
                          <input
                            type="text"
                            value={emailConfig.host || ''}
                            onChange={(e) => setEmailConfig({ ...emailConfig, host: e.target.value })}
                            placeholder="smtp.gmail.com"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Port
                          </label>
                          <input
                            type="number"
                            value={emailConfig.port || 587}
                            onChange={(e) => setEmailConfig({ ...emailConfig, port: parseInt(e.target.value) })}
                            placeholder="587"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Username
                          </label>
                          <input
                            type="text"
                            value={emailConfig.user || ''}
                            onChange={(e) => setEmailConfig({ ...emailConfig, user: e.target.value })}
                            placeholder="your-email@example.com"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Password
                          </label>
                          <input
                            type="password"
                            placeholder="Leave blank to keep current"
                            onChange={(e) => setEmailConfig({ ...emailConfig, password: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            From Email
                          </label>
                          <input
                            type="email"
                            value={emailConfig.from || ''}
                            onChange={(e) => setEmailConfig({ ...emailConfig, from: e.target.value })}
                            placeholder="noreply@example.com"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            From Name
                          </label>
                          <input
                            type="text"
                            value={emailConfig.fromName || ''}
                            onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
                            placeholder="Fuel Order System"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={emailConfig.secure || false}
                            onChange={(e) => setEmailConfig({ ...emailConfig, secure: e.target.checked })}
                            className="w-4 h-4 text-green-600 rounded"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Use SSL/TLS (Port 465)
                          </span>
                        </label>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                        <p className="text-xs text-blue-800 dark:text-blue-200">
                          💡 <strong>Tip:</strong> For Gmail, use smtp.gmail.com:587 with an App Password. For Office 365, use smtp.office365.com:587
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={saveEmailConfiguration}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                        >
                          {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Email Configuration
                        </button>
                      </div>

                      {/* Email Testing */}
                      <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Test Email Service</h5>

                        {/* Test Connection */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleTestEmailConnection}
                            disabled={emailTesting}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-sm disabled:opacity-50 border border-gray-300 dark:border-gray-600"
                          >
                            {emailTesting ? <Loader className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                            Test SMTP Connection
                          </button>
                          {emailTestResult && (
                            <span className={`flex items-center gap-1.5 text-sm font-medium ${
                              emailTestResult.success
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                              {emailTestResult.success
                                ? <CheckCircle className="w-4 h-4" />
                                : <XCircle className="w-4 h-4" />}
                              {emailTestResult.message}
                            </span>
                          )}
                        </div>

                        {/* Send Test Email */}
                        <div className="flex items-center gap-2">
                          <input
                            type="email"
                            value={testEmailRecipient}
                            onChange={(e) => setTestEmailRecipient(e.target.value)}
                            placeholder="recipient@example.com"
                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                          />
                          <button
                            onClick={handleSendTestEmail}
                            disabled={sendingTestEmail || !testEmailRecipient.trim()}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
                          >
                            {sendingTestEmail ? <Loader className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            Send Test Email
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Database */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-purple-600" />
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Database Configuration</h4>
                    </div>
                    {dbConfig?.isConfigured ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  {dbConfig && dbConfig.host && (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Host:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{dbConfig.host}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Port:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{dbConfig.port}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Database:</span>
                        <span className="text-gray-900 dark:text-gray-100 font-mono">{dbConfig.database}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'monitoring' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Performance Monitoring
                </h3>
                <div className="space-y-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={profiling.enabled}
                      onChange={(e) => setProfiling({ ...profiling, enabled: e.target.checked })}
                      className="w-5 h-5 text-purple-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Enable Performance Profiling
                    </span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Sample Rate (0.0 - 1.0)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={profiling.sampleRate}
                        onChange={(e) => setProfiling({ ...profiling, sampleRate: parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Slow Query Threshold (ms)
                      </label>
                      <input
                        type="number"
                        value={profiling.slowQueryThreshold}
                        onChange={(e) => setProfiling({ ...profiling, slowQueryThreshold: parseInt(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={updateProfiling}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Profiling Settings
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'environment' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="w-5 h-5 text-orange-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Environment Variables
                  </h3>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    🔐 <strong>Sensitive Data:</strong> This section shows configuration status only. Actual values are masked for security.
                  </p>
                </div>
                {envVars && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">System Info</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Node Environment:</span>
                            <span className="text-gray-900 dark:text-gray-100 font-mono">{envVars.nodeEnv}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Port:</span>
                            <span className="text-gray-900 dark:text-gray-100 font-mono">{envVars.port}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Node Version:</span>
                            <span className="text-gray-900 dark:text-gray-100 font-mono">{envVars.nodeVersion}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Platform:</span>
                            <span className="text-gray-900 dark:text-gray-100 font-mono">{envVars.platform}</span>
                          </div>
                        </div>
                      </div>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Configuration Status</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 dark:text-gray-400">MongoDB:</span>
                            {envVars.mongoConfigured ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 dark:text-gray-400">JWT Secret:</span>
                            {envVars.jwtSecretConfigured ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 dark:text-gray-400">Email:</span>
                            {envVars.emailConfigured ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-600 dark:text-gray-400">R2 Storage:</span>
                            {envVars.r2Configured ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
