import { useState, useEffect } from 'react';
import { Settings, Clock, Database, Bell, Shield, Globe, Save, Power, AlertTriangle } from 'lucide-react';
import { systemAdminAPI } from '../../services/api';

interface ConfigurationTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function ConfigurationTab({ onMessage }: ConfigurationTabProps) {
  const [activeSection, setActiveSection] = useState<'general' | 'session' | 'data' | 'notifications' | 'maintenance'>('general');

  // System Configuration States
  const [generalSettings, setGeneralSettings] = useState({
    systemName: 'Fuel Order Management System',
    timezone: 'Africa/Dar_es_Salaam',
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
  });

  const [sessionSettings, setSessionSettings] = useState({
    sessionTimeout: 30, // minutes
    jwtExpiry: 24, // hours
    refreshTokenExpiry: 7, // days
    maxLoginAttempts: 5,
    lockoutDuration: 15, // minutes
    allowMultipleSessions: true,
  });

  const [dataSettings, setDataSettings] = useState({
    archivalEnabled: true,
    archivalMonths: 6,
    auditLogRetention: 12, // months
    trashRetention: 90, // days
    autoCleanupEnabled: false,
    backupFrequency: 'daily',
    backupRetention: 30, // days
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    criticalAlerts: true,
    dailySummary: false,
    weeklyReport: true,
    slowQueryThreshold: 500, // ms
    storageWarningThreshold: 80, // percentage
  });

  const [maintenanceMode, setMaintenanceMode] = useState({
    enabled: false,
    message: 'System is under maintenance. Please check back later.',
    allowedRoles: ['super_admin'],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load actual system settings from backend
      const settings = await systemAdminAPI.getSystemSettings();
      if (settings) {
        if (settings.general) setGeneralSettings(settings.general);
        if (settings.session) setSessionSettings(settings.session);
        if (settings.data) setDataSettings(settings.data);
        if (settings.notifications) setNotificationSettings(settings.notifications);
        if (settings.maintenance) setMaintenanceMode(settings.maintenance);
      }
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load configuration');
    }
  };

  const saveSettings = async (section: 'general' | 'session' | 'data' | 'notifications' | 'maintenance') => {
    try {
      let settingsToSave;
      switch (section) {
        case 'general':
          settingsToSave = generalSettings;
          break;
        case 'session':
          settingsToSave = sessionSettings;
          break;
        case 'data':
          settingsToSave = dataSettings;
          break;
        case 'notifications':
          settingsToSave = notificationSettings;
          break;
        case 'maintenance':
          settingsToSave = maintenanceMode;
          break;
        default:
          throw new Error('Invalid section');
      }
      
      await systemAdminAPI.updateSystemSettings(section, settingsToSave);
      onMessage('success', `${section.charAt(0).toUpperCase() + section.slice(1)} settings saved successfully`);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to save settings');
    }
  };

  const toggleMaintenanceMode = async () => {
    try {
      const result = await systemAdminAPI.toggleMaintenanceMode();
      setMaintenanceMode({
        enabled: result.data.enabled,
        message: result.data.message,
        allowedRoles: result.data.allowedRoles,
      });
      onMessage('success', result.message);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to toggle maintenance mode');
    }
  };

  const sections = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'session', label: 'Session & Security', icon: Shield },
    { id: 'data', label: 'Data Management', icon: Database },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'maintenance', label: 'Maintenance', icon: Power },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          System Configuration
        </h2>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4 overflow-x-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                  activeSection === section.id
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* General Settings */}
      {activeSection === 'general' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            General System Settings
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                System Name
              </label>
              <input
                type="text"
                value={generalSettings.systemName}
                onChange={(e) => setGeneralSettings({ ...generalSettings, systemName: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Timezone
              </label>
              <select
                value={generalSettings.timezone}
                onChange={(e) => setGeneralSettings({ ...generalSettings, timezone: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="Africa/Dar_es_Salaam">East Africa Time (EAT)</option>
                <option value="Africa/Nairobi">Nairobi</option>
                <option value="Africa/Lusaka">Lusaka</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date Format
              </label>
              <select
                value={generalSettings.dateFormat}
                onChange={(e) => setGeneralSettings({ ...generalSettings, dateFormat: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Language
              </label>
              <select
                value={generalSettings.language}
                onChange={(e) => setGeneralSettings({ ...generalSettings, language: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="en">English</option>
                <option value="sw">Swahili</option>
              </select>
            </div>
          </div>
          <button
            onClick={() => saveSettings('general')}
            className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Save className="w-4 h-4" />
            Save General Settings
          </button>
        </div>
      )}

      {/* Session & Security Settings */}
      {activeSection === 'session' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Session & Security Settings
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Session Timeout (minutes)
              </label>
              <input
                type="number"
                value={sessionSettings.sessionTimeout}
                onChange={(e) => setSessionSettings({ ...sessionSettings, sessionTimeout: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Auto-logout after inactivity (currently: 30 min)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                JWT Token Expiry (hours)
              </label>
              <input
                type="number"
                value={sessionSettings.jwtExpiry}
                onChange={(e) => setSessionSettings({ ...sessionSettings, jwtExpiry: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Refresh Token Expiry (days)
              </label>
              <input
                type="number"
                value={sessionSettings.refreshTokenExpiry}
                onChange={(e) => setSessionSettings({ ...sessionSettings, refreshTokenExpiry: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Login Attempts
              </label>
              <input
                type="number"
                value={sessionSettings.maxLoginAttempts}
                onChange={(e) => setSessionSettings({ ...sessionSettings, maxLoginAttempts: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account Lockout Duration (minutes)
              </label>
              <input
                type="number"
                value={sessionSettings.lockoutDuration}
                onChange={(e) => setSessionSettings({ ...sessionSettings, lockoutDuration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={sessionSettings.allowMultipleSessions}
                  onChange={(e) => setSessionSettings({ ...sessionSettings, allowMultipleSessions: e.target.checked })}
                  className="rounded text-purple-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Allow multiple concurrent sessions
                </span>
              </label>
            </div>
          </div>
          <button
            onClick={() => saveSettings('session')}
            className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Save className="w-4 h-4" />
            Save Session Settings
          </button>
        </div>
      )}

      {/* Data Management Settings */}
      {activeSection === 'data' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Data Management & Archival
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-center">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dataSettings.archivalEnabled}
                  onChange={(e) => setDataSettings({ ...dataSettings, archivalEnabled: e.target.checked })}
                  className="rounded text-purple-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enable automatic data archival
                </span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Archive data older than (months)
              </label>
              <input
                type="number"
                value={dataSettings.archivalMonths}
                onChange={(e) => setDataSettings({ ...dataSettings, archivalMonths: parseInt(e.target.value) })}
                disabled={!dataSettings.archivalEnabled}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Runs monthly on 1st at 2:00 AM
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Audit Log Retention (months)
              </label>
              <input
                type="number"
                value={dataSettings.auditLogRetention}
                onChange={(e) => setDataSettings({ ...dataSettings, auditLogRetention: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trash Retention (days)
              </label>
              <input
                type="number"
                value={dataSettings.trashRetention}
                onChange={(e) => setDataSettings({ ...dataSettings, trashRetention: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Deleted items kept before permanent removal
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Backup Frequency
              </label>
              <select
                value={dataSettings.backupFrequency}
                onChange={(e) => setDataSettings({ ...dataSettings, backupFrequency: e.target.value })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Backup Retention (days)
              </label>
              <input
                type="number"
                value={dataSettings.backupRetention}
                onChange={(e) => setDataSettings({ ...dataSettings, backupRetention: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex items-center md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dataSettings.autoCleanupEnabled}
                  onChange={(e) => setDataSettings({ ...dataSettings, autoCleanupEnabled: e.target.checked })}
                  className="rounded text-purple-600"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enable automatic cleanup of expired trash items
                </span>
              </label>
            </div>
          </div>
          <button
            onClick={() => saveSettings('data')}
            className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Save className="w-4 h-4" />
            Save Data Settings
          </button>
        </div>
      )}

      {/* Notification Settings */}
      {activeSection === 'notifications' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Notification & Alert Settings
          </h3>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notificationSettings.emailNotifications}
                onChange={(e) => setNotificationSettings({ ...notificationSettings, emailNotifications: e.target.checked })}
                className="rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Enable email notifications
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notificationSettings.criticalAlerts}
                onChange={(e) => setNotificationSettings({ ...notificationSettings, criticalAlerts: e.target.checked })}
                className="rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Send critical system alerts
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notificationSettings.dailySummary}
                onChange={(e) => setNotificationSettings({ ...notificationSettings, dailySummary: e.target.checked })}
                className="rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Send daily activity summary
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={notificationSettings.weeklyReport}
                onChange={(e) => setNotificationSettings({ ...notificationSettings, weeklyReport: e.target.checked })}
                className="rounded text-purple-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Send weekly system report
              </span>
            </label>
            
            <div className="grid md:grid-cols-2 gap-6 pt-4 border-t dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Slow Query Threshold (ms)
                </label>
                <input
                  type="number"
                  value={notificationSettings.slowQueryThreshold}
                  onChange={(e) => setNotificationSettings({ ...notificationSettings, slowQueryThreshold: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Alert when database query exceeds this time
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Storage Warning Threshold (%)
                </label>
                <input
                  type="number"
                  value={notificationSettings.storageWarningThreshold}
                  onChange={(e) => setNotificationSettings({ ...notificationSettings, storageWarningThreshold: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Alert when storage usage exceeds this percentage
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => saveSettings('notifications')}
            className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            <Save className="w-4 h-4" />
            Save Notification Settings
          </button>
        </div>
      )}

      {/* Maintenance Mode */}
      {activeSection === 'maintenance' && (
        <div className="space-y-6">
          <div className={`rounded-lg border p-6 shadow-sm ${
            maintenanceMode.enabled 
              ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          }`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <Power className={`w-5 h-5 ${maintenanceMode.enabled ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`} />
                <h3 className={`text-lg font-semibold ${maintenanceMode.enabled ? 'text-orange-900 dark:text-orange-100' : 'text-gray-900 dark:text-gray-100'}`}>
                  Maintenance Mode
                </h3>
              </div>
              <button
                onClick={toggleMaintenanceMode}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  maintenanceMode.enabled
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {maintenanceMode.enabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
              </button>
            </div>

            {maintenanceMode.enabled && (
              <div className="bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-700 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-900 dark:text-orange-100">System is in Maintenance Mode</p>
                    <p className="text-sm text-orange-800 dark:text-orange-200 mt-1">
                      Only super administrators can access the system. All other users will see the maintenance message.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Maintenance Message
                </label>
                <textarea
                  value={maintenanceMode.message}
                  onChange={(e) => setMaintenanceMode({ ...maintenanceMode, message: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Enter message to display to users during maintenance..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Allowed Roles During Maintenance
                </label>
                <div className="space-y-2">
                  {['super_admin', 'admin'].map((role) => (
                    <label key={role} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={maintenanceMode.allowedRoles.includes(role)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMaintenanceMode({
                              ...maintenanceMode,
                              allowedRoles: [...maintenanceMode.allowedRoles, role]
                            });
                          } else {
                            setMaintenanceMode({
                              ...maintenanceMode,
                              allowedRoles: maintenanceMode.allowedRoles.filter(r => r !== role)
                            });
                          }
                        }}
                        className="rounded text-purple-600"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                        {role.replace('_', ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => saveSettings('maintenance')}
              className="mt-6 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <Save className="w-4 h-4" />
              Save Maintenance Settings
            </button>
          </div>

          {/* Quick Actions */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700 p-6">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Quick Actions</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <button className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 justify-center">
                <Clock className="w-4 h-4" />
                Schedule Maintenance Window
              </button>
              <button className="flex items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 justify-center">
                <AlertTriangle className="w-4 h-4" />
                Emergency Shutdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}