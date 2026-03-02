import { useState, useEffect } from 'react';
import { Wrench, Shield, AlertTriangle, CheckCircle, RefreshCw, Save } from 'lucide-react';
import maintenanceModeService, { MaintenanceStatus } from '../../services/maintenanceModeService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const ALL_ROLES = [
  'super_admin', 'admin', 'boss', 'fuel_order_maker', 'payment_manager',
  'fuel_attendant', 'station_manager', 'manager', 'super_manager',
  'driver', 'yard_personnel',
];

export default function MaintenanceModeTab({ onMessage }: Props) {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [allowedRoles, setAllowedRoles] = useState<string[]>(['super_admin']);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await maintenanceModeService.getStatus();
      setStatus(data);
      setMessage(data.message);
      setAllowedRoles(data.allowedRoles ?? ['super_admin']);
    } catch {
      onMessage('Failed to load maintenance status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    setShowConfirm(false);
    try {
      const data = await maintenanceModeService.toggle();
      setStatus(data);
      onMessage(`Maintenance mode ${data.enabled ? 'ENABLED' : 'DISABLED'} successfully`, data.enabled ? 'info' : 'success');
    } catch {
      onMessage('Failed to toggle maintenance mode', 'error');
    } finally {
      setToggling(false);
    }
  };

  const handleSaveMessage = async () => {
    setSaving(true);
    try {
      await maintenanceModeService.updateMessage(message, allowedRoles);
      onMessage('Maintenance settings saved', 'success');
      load();
    } catch {
      onMessage('Failed to save maintenance settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = (role: string) => {
    if (role === 'super_admin') return; // super_admin always allowed
    setAllowedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  const enabled = status?.enabled ?? false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Maintenance Mode</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Control system access during maintenance windows
        </p>
      </div>

      {/* Status Card */}
      <div
        className={`relative overflow-hidden rounded-2xl p-6 ${
          enabled
            ? 'bg-gradient-to-br from-red-500 to-orange-600 text-white'
            : 'bg-gradient-to-br from-green-500 to-emerald-600 text-white'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Wrench className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="text-lg font-bold">
                {enabled ? '🔴 Maintenance Mode ACTIVE' : '🟢 System is ONLINE'}
              </p>
              <p className="text-white/80 text-sm">
                {enabled
                  ? 'Non-allowed users are blocked from accessing the system'
                  : 'All users can access the system normally'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={toggling}
            className="px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {toggling ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {enabled ? 'Disable Maintenance' : 'Enable Maintenance'}
          </button>
        </div>

        {/* Decorative circles */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full" />
        <div className="absolute -right-4 -bottom-8 w-28 h-28 bg-white/5 rounded-full" />
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-amber-500" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {enabled ? 'Disable Maintenance Mode?' : 'Enable Maintenance Mode?'}
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              {enabled
                ? 'This will restore access for all users. Confirm?'
                : 'This will block all non-allowed users from accessing the system immediately. Continue?'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleToggle}
                className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${
                  enabled ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {enabled ? 'Yes, Disable' : 'Yes, Enable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning when active */}
      {enabled && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Maintenance Mode is Active</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Only roles listed below can access the system. All other users see a maintenance page.
            </p>
          </div>
        </div>
      )}

      {/* Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-5">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Maintenance Settings
          </h3>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            User-facing Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="System is under maintenance. Please check back later."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Allowed Roles (can bypass maintenance)
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_ROLES.map((role) => {
              const selected = allowedRoles.includes(role);
              const isFixed = role === 'super_admin';
              return (
                <button
                  key={role}
                  onClick={() => toggleRole(role)}
                  disabled={isFixed}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    selected
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  } ${isFixed ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                >
                  {selected && <CheckCircle className="w-3 h-3 inline mr-1" />}
                  {role.replace(/_/g, ' ')}
                  {isFixed && ' (always)'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveMessage}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">How Maintenance Mode Works</h3>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
            When enabled, all API requests from non-allowed roles return HTTP 503.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
            The system checks maintenance status with a 30-second cache — disable invalidates immediately.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
            Frontend clients receive a WebSocket event <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">maintenance:toggle</code> and display the maintenance message.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
            All toggle actions are recorded in the audit log with critical severity.
          </li>
        </ul>
      </div>
    </div>
  );
}
