import React, { useState, useEffect } from 'react';
import { Bell, RefreshCw, AlertTriangle, Loader2, Save, Info } from 'lucide-react';
import apiClient from '../../services/api';

const ALL_EVENT_TYPES = [
  { id: 'truck_entry_rejected', label: 'Truck Entry Rejected' },
  { id: 'missing_total_liters', label: 'Missing Total Liters' },
  { id: 'lpo_created', label: 'LPO Created' },
  { id: 'lpo_approved', label: 'LPO Approved' },
  { id: 'fuel_record_flagged', label: 'Fuel Record Flagged' },
  { id: 'delivery_order_created', label: 'Delivery Order Created' },
  { id: 'user_account_locked', label: 'User Account Locked' },
  { id: 'failed_login_threshold', label: 'Failed Login Threshold' },
  { id: 'maintenance_mode_changed', label: 'Maintenance Mode Changed' },
  { id: 'config_changed', label: 'Config Changed' },
  { id: 'bulk_operation', label: 'Bulk Operation' },
];

const ALL_ROLES = [
  { id: 'super_admin', label: 'Super Admin' },
  { id: 'admin', label: 'Admin' },
  { id: 'manager', label: 'Manager' },
  { id: 'supervisor', label: 'Supervisor' },
];

interface NotificationConfig {
  emailEnabled: boolean;
  emailOnTypes: string[];
  alertRecipients: string[];
  digestEnabled: boolean;
  digestSchedule: 'daily' | 'weekly';
}

export const NotificationCenterConfigTab: React.FC = () => {
  const [config, setConfig] = useState<NotificationConfig>({
    emailEnabled: true,
    emailOnTypes: ['truck_entry_rejected', 'missing_total_liters', 'lpo_created'],
    alertRecipients: ['super_admin', 'admin'],
    digestEnabled: false,
    digestSchedule: 'daily',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/notification-config');
      setConfig(res.data.data);
    } catch {
      setError('Failed to load notification configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  const toggleType = (id: string) => {
    setConfig((c) => ({
      ...c,
      emailOnTypes: c.emailOnTypes.includes(id) ? c.emailOnTypes.filter((t) => t !== id) : [...c.emailOnTypes, id],
    }));
  };

  const toggleRole = (id: string) => {
    setConfig((c) => ({
      ...c,
      alertRecipients: c.alertRecipients.includes(id) ? c.alertRecipients.filter((r) => r !== id) : [...c.alertRecipients, id],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiClient.put('/system-admin/notification-config', config);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <Bell className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Notification Center Config</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure email alerts, event triggers, and digest settings</p>
          </div>
        </div>
        <button onClick={fetchConfig} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm"><Info className="h-4 w-4 shrink-0" />Configuration saved successfully.</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></div>
      ) : (
        <div className="space-y-5">
          {/* Master email toggle */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Email Notifications</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Send email alerts when monitored events occur</p>
              </div>
              <button
                onClick={() => setConfig((c) => ({ ...c, emailEnabled: !c.emailEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.emailEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${config.emailEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          {/* Event types */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-3">Trigger Events</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Send email when any of the following events occur:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_EVENT_TYPES.map((type) => (
                <label key={type.id} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${config.emailOnTypes.includes(type.id) ? 'border-amber-500 bg-amber-500' : 'border-gray-300 dark:border-gray-600'}`} onClick={() => toggleType(type.id)}>
                    {config.emailOnTypes.includes(type.id) && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleType(type.id)}>{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-3">Alert Recipients</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">User roles that receive alert emails:</p>
            <div className="flex flex-wrap gap-3">
              {ALL_ROLES.map((role) => (
                <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                  <div className={`h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${config.alertRecipients.includes(role.id) ? 'border-amber-500 bg-amber-500' : 'border-gray-300 dark:border-gray-600'}`} onClick={() => toggleRole(role.id)}>
                    {config.alertRecipients.includes(role.id) && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleRole(role.id)}>{role.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Digest */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Email Digest</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Send a periodic summary of all events instead of individual alerts</p>
              </div>
              <button
                onClick={() => setConfig((c) => ({ ...c, digestEnabled: !c.digestEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.digestEnabled ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${config.digestEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {config.digestEnabled && (
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Schedule:</span>
                {['daily', 'weekly'].map((s) => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" checked={config.digestSchedule === s} onChange={() => setConfig((c) => ({ ...c, digestSchedule: s as 'daily' | 'weekly' }))} className="accent-amber-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{s}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Configuration
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenterConfigTab;
