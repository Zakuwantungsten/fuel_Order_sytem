import React, { useState, useEffect } from 'react';
import { Bell, Save, RefreshCw, AlertTriangle, Loader2, X, CheckCircle } from 'lucide-react';
import apiClient from '../../services/api';

interface Thresholds {
  memoryUsagePct: number;
  dbConnectionsMax: number;
  errorRatePer5min: number;
  diskUsagePct: number;
  cpuUsagePct: number;
}

const API = '/system-admin/config/settings/alert-thresholds';

const FIELDS: { key: keyof Thresholds; label: string; description: string; unit: string; min: number; max: number }[] = [
  { key: 'memoryUsagePct', label: 'Heap Memory Usage', description: 'Alert when Node.js heap usage exceeds this %', unit: '%', min: 10, max: 100 },
  { key: 'cpuUsagePct', label: 'CPU Usage', description: 'Alert when CPU usage exceeds this %', unit: '%', min: 10, max: 100 },
  { key: 'diskUsagePct', label: 'Disk Usage', description: 'Reference threshold for disk usage alerting', unit: '%', min: 10, max: 100 },
  { key: 'dbConnectionsMax', label: 'DB Connections', description: 'Alert when active DB connections exceed this number', unit: 'connections', min: 1, max: 10000 },
  { key: 'errorRatePer5min', label: 'Error Rate (per 5 min)', description: 'Alert when error count per 5-minute window exceeds this', unit: 'errors', min: 1, max: 10000 },
];

export const AlertThresholdsTab: React.FC = () => {
  const [thresholds, setThresholds] = useState<Thresholds>({
    memoryUsagePct: 85,
    dbConnectionsMax: 90,
    errorRatePer5min: 20,
    diskUsagePct: 90,
    cpuUsagePct: 90,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchThresholds = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(API);
      setThresholds(res.data.data);
    } catch {
      setError('Failed to load thresholds');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchThresholds(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.put(API, thresholds);
      setSuccess('Alert thresholds saved');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Save failed';
      setError(msg);
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
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Alert Thresholds</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure alerting thresholds for system metrics</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchThresholds}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Thresholds
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />{success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {FIELDS.map((f) => {
          const val = thresholds[f.key];
          const pct = f.unit === '%' ? val : null;
          const color = pct !== null ? (pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-green-500') : 'bg-blue-500';
          return (
            <div key={f.key} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{f.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={f.min}
                    max={f.max}
                    value={val}
                    onChange={(e) => setThresholds((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                    className="w-24 px-3 py-1.5 text-sm text-right rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-500 dark:text-gray-400 w-20">{f.unit}</span>
                </div>
              </div>
              {pct !== null && (
                <div className="mt-2">
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>{f.min}%</span>
                    <span>{f.max}%</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
        <p className="font-medium mb-1">How thresholds work</p>
        <p>These values are stored in system configuration. The System Health Monitor checks them on each refresh and highlights metrics that exceed their threshold. Future versions will send email alerts when thresholds are breached.</p>
      </div>
    </div>
  );
};

export default AlertThresholdsTab;
