import { useState, useEffect } from 'react';
import { Gauge, RefreshCw, Save, AlertTriangle, Info } from 'lucide-react';
import api from '../../services/api';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface RateLimitConfig {
  apiRateLimitMax: number;
  rateLimitWindowMs: number;
}

const STATIC_LIMITERS = [
  { name: 'Auth (Login)', windowMs: 60_000, max: 5, note: 'Per IP — skips successful requests' },
  { name: 'Password Reset', windowMs: 3_600_000, max: 3, note: 'Per IP per hour' },
  { name: 'Registration', windowMs: 3_600_000, max: 5, note: 'Per IP per hour' },
  { name: 'Driver Auth', windowMs: 900_000, max: 3, note: 'Per IP — 15 min window' },
  { name: 'General API', windowMs: 900_000, max: 100, note: 'Env-based fallback' },
];

function fmtWindow(ms: number) {
  if (ms >= 3_600_000) return `${ms / 3_600_000}h`;
  if (ms >= 60_000) return `${ms / 60_000}m`;
  return `${ms / 1000}s`;
}

export default function RateLimitConfigTab({ onMessage }: Props) {
  const [config, setConfig] = useState<RateLimitConfig>({ apiRateLimitMax: 500, rateLimitWindowMs: 60_000 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<RateLimitConfig>({ apiRateLimitMax: 500, rateLimitWindowMs: 60_000 });

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Read current env-based values via system config endpoint
      const res = await api.get('/system-config/settings/rate-limits');
      const data = res.data.data;
      const cfg: RateLimitConfig = {
        apiRateLimitMax: data.apiRateLimitMax ?? 500,
        rateLimitWindowMs: data.rateLimitWindowMs ?? 60_000,
      };
      setConfig(cfg);
      setDraft(cfg);
    } catch {
      // Silently use defaults if endpoint not yet available
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (draft.apiRateLimitMax < 10 || draft.apiRateLimitMax > 10_000) {
      onMessage('API rate limit max must be between 10 and 10,000', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/system-config/settings/rate-limits', {
        apiRateLimitMax: draft.apiRateLimitMax,
        rateLimitWindowMs: draft.rateLimitWindowMs,
      });
      setConfig(draft);
      onMessage('Rate limit settings saved. Restart server to apply.', 'success');
    } catch (e: any) {
      onMessage(e.response?.data?.message || 'Failed to save rate limit config', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Rate Limit Configuration</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          View and adjust request rate limits across API endpoints
        </p>
      </div>

      {/* Note */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Auth, password reset, registration, and driver auth limits are defined in code and cannot be changed at runtime.
          The main <strong>API rate limit</strong> below is configurable and persisted to system config — a server restart is required to apply changes.
        </p>
      </div>

      {/* Configurable API rate limit */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            API Rate Limit (configurable)
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Max Requests per Window
            </label>
            <input
              type="number"
              min={10}
              max={10000}
              value={draft.apiRateLimitMax}
              onChange={(e) => setDraft((p) => ({ ...p, apiRateLimitMax: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Default: 500 · Min: 10 · Max: 10,000</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Window Duration
            </label>
            <select
              value={draft.rateLimitWindowMs}
              onChange={(e) => setDraft((p) => ({ ...p, rateLimitWindowMs: Number(e.target.value) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value={15_000}>15 seconds</option>
              <option value={30_000}>30 seconds</option>
              <option value={60_000}>1 minute</option>
              <option value={300_000}>5 minutes</option>
              <option value={900_000}>15 minutes</option>
            </select>
          </div>
        </div>

        {(draft.apiRateLimitMax !== config.apiRateLimitMax || draft.rateLimitWindowMs !== config.rateLimitWindowMs) && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Unsaved changes — effective after server restart.
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {/* Current effective rate: derived from draft */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="w-4 h-4 text-green-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Current Effective</h3>
        </div>
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-3">{config.apiRateLimitMax} req / {fmtWindow(config.rateLimitWindowMs)}</p>
        <p className="text-xs text-gray-400 mt-1">Per IP address on all authenticated API routes</p>
      </div>

      {/* Static limiters table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-4">
          Static Rate Limiters (read-only)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 text-xs font-medium text-gray-500 dark:text-gray-400">Endpoint</th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Max</th>
                <th className="text-right py-2 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">Window</th>
                <th className="text-left py-2 pl-4 text-xs font-medium text-gray-500 dark:text-gray-400">Notes</th>
              </tr>
            </thead>
            <tbody>
              {STATIC_LIMITERS.map((l) => (
                <tr key={l.name} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                  <td className="py-3 pr-4 font-medium text-gray-900 dark:text-white">{l.name}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{l.max}</td>
                  <td className="py-3 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{fmtWindow(l.windowMs)}</td>
                  <td className="py-3 pl-4 text-gray-400 text-xs">{l.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
