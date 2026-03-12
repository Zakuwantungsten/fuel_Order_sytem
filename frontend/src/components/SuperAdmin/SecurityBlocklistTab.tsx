import { useState, useEffect, useCallback } from 'react';
import {
  ShieldBan,
  RefreshCw,
  Ban,
  CheckCircle,
  AlertTriangle,
  Clock,
  Search,
  Plus,
  Unlock,
  ChevronDown,
  ChevronUp,
  Activity,
  Settings,
  Save,
  ToggleLeft,
  ToggleRight,
  Download,
} from 'lucide-react';
import { useSecurityExport } from '../../hooks/useSecurityExport';

/* ───────── Types ───────── */

interface BlockedIPEntry {
  ip: string;
  reason: string;
  blockedAt: string;
  expiresAt: string | null;
  blockedBy: string;
  suspiciousCount: number;
  lastSuspiciousEvent: string;
  details: string;
  isActive: boolean;
}

interface SuspiciousIP {
  ip: string;
  count: number;
  reasons: string[];
  lastEvent: string;
}

interface BlocklistStats {
  totalBlocked: number;
  activeBlocks: number;
  expiredBlocks: number;
  permanentBlocks: number;
  suspiciousIPs: number;
  byReason: Record<string, number>;
}

interface HistoryEntry {
  ip: string;
  reason: string;
  blockedAt: string;
  expiresAt: string | null;
  blockedBy: string;
  isActive: boolean;
  unblockedAt?: string;
  unblockedBy?: string;
}

const REASON_LABELS: Record<string, string> = {
  path_probe: 'Path Probe',
  auth_failure: 'Auth Failure',
  rate_limit: 'Rate Limited',
  suspicious_404: 'Suspicious 404s',
  ua_blocked: 'User-Agent Blocked',
  honeypot: 'Honeypot Hit',
  manual: 'Manual Block',
  auto_escalation: 'Auto-Escalation',
};

const REASON_COLORS: Record<string, string> = {
  path_probe: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  auth_failure: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  rate_limit: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  suspicious_404: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  ua_blocked: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  honeypot: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  manual: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  auto_escalation: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

interface AutoblockConfig {
  ipBlockingEnabled: boolean;
  blockDurationMs: number;
  suspiciousThreshold: number;
  threshold404Count: number;
  threshold404WindowMs: number;
  uaBlockingEnabled: boolean;
  ipGatingEnabled: boolean;
}

const DURATION_OPTIONS = [
  { value: 60000, label: '1 minute' },
  { value: 300000, label: '5 minutes' },
  { value: 600000, label: '10 minutes' },
  { value: 1800000, label: '30 minutes' },
  { value: 3600000, label: '1 hour' },
  { value: 7200000, label: '2 hours' },
  { value: 86400000, label: '24 hours' },
  { value: 172800000, label: '48 hours' },
  { value: 604800000, label: '7 days' },
  { value: 2592000000, label: '30 days' },
  { value: 7776000000, label: '90 days' },
  { value: 0, label: 'Permanent' },
];

const WINDOW_OPTIONS = [
  { value: 60000, label: '1 minute' },
  { value: 120000, label: '2 minutes' },
  { value: 300000, label: '5 minutes' },
  { value: 600000, label: '10 minutes' },
  { value: 900000, label: '15 minutes' },
];

/* ───────── Helpers ───────── */

const API_BASE = '/api/v1/system-admin/security-blocklist';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('fuel_order_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...(opts?.headers as Record<string, string> || {}),
  };
  // Attach CSRF token for state-changing requests
  const method = (opts?.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
    const match = decodeURIComponent(document.cookie).split(';').map(c => c.trim()).find(c => c.startsWith('XSRF-TOKEN='));
    if (match) headers['X-XSRF-TOKEN'] = match.substring('XSRF-TOKEN='.length);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Request failed');
  return json.data;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

/* ───────── Component ───────── */

export default function SecurityBlocklistTab() {
  const { exporting, exportClientCSV } = useSecurityExport();
  const [tab, setTab] = useState<'active' | 'suspicious' | 'history'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data
  const [blocked, setBlocked] = useState<BlockedIPEntry[]>([]);
  const [suspicious, setSuspicious] = useState<SuspiciousIP[]>([]);
  const [stats, setStats] = useState<BlocklistStats | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Manual block form
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockIP, setBlockIP] = useState('');
  const [blockDuration, setBlockDuration] = useState('600000');
  const [blockReason, setBlockReason] = useState('');

  // Filters
  const [searchIP, setSearchIP] = useState('');

  // Autoblock configuration
  const [showConfig, setShowConfig] = useState(false);
  const [autoblockConfig, setAutoblockConfig] = useState<AutoblockConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<AutoblockConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiFetch<AutoblockConfig>('/config');
      setAutoblockConfig(data);
      setConfigDraft(data);
    } catch (err: any) {
      // Non-critical, don't block the rest of the UI
    }
  }, []);

  const saveConfig = async () => {
    if (!configDraft) return;
    setSavingConfig(true);
    try {
      const updated = await apiFetch<AutoblockConfig>('/config', {
        method: 'PUT',
        body: JSON.stringify(configDraft),
      });
      setAutoblockConfig(updated);
      setConfigDraft(updated);
      setSuccess('Autoblock configuration saved');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingConfig(false);
    }
    setTimeout(() => setSuccess(null), 3000);
  };

  const configChanged = autoblockConfig && configDraft &&
    JSON.stringify(autoblockConfig) !== JSON.stringify(configDraft);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [blockedData, statsData] = await Promise.all([
        apiFetch<BlockedIPEntry[]>('/'),
        apiFetch<BlocklistStats>('/stats'),
      ]);
      setBlocked(blockedData);
      setStats(statsData);

      if (tab === 'suspicious') {
        const susData = await apiFetch<SuspiciousIP[]>('/suspicious');
        setSuspicious(susData);
      }
      if (tab === 'history') {
        const histData = await apiFetch<HistoryEntry[]>('/history');
        setHistory(histData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/block', {
        method: 'POST',
        body: JSON.stringify({
          ip: blockIP.trim(),
          durationMs: parseInt(blockDuration),
          reason: blockReason || 'Manually blocked',
        }),
      });
      setSuccess(`Blocked ${blockIP}`);
      setShowBlockForm(false);
      setBlockIP('');
      setBlockReason('');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleUnblock = async (ip: string) => {
    try {
      await apiFetch(`/unblock/${encodeURIComponent(ip)}`, { method: 'DELETE' });
      setSuccess(`Unblocked ${ip}`);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
    setTimeout(() => setSuccess(null), 3000);
  };

  const filteredBlocked = searchIP
    ? blocked.filter(b => b.ip.includes(searchIP))
    : blocked;

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldBan className="w-6 h-6 text-red-600 dark:text-red-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">IP Blocklist & Reputation</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBlockForm(!showBlockForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Block IP
          </button>
          <button
            onClick={() => exportClientCSV(
              filteredBlocked.map(b => ({ ip: b.ip, reason: b.reason, blockedAt: b.blockedAt, expiresAt: b.expiresAt || 'permanent', permanent: !b.expiresAt })),
              'security-blocklist'
            )}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* Manual Block Form */}
      {showBlockForm && (
        <form
          onSubmit={handleBlock}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Manually Block an IP</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">IP Address</label>
              <input
                type="text"
                value={blockIP}
                onChange={e => setBlockIP(e.target.value)}
                placeholder="e.g. 198.51.100.100"
                required
                pattern="^[\d.:a-fA-F]+$"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Duration</label>
              <select
                value={blockDuration}
                onChange={e => setBlockDuration(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
              >
                <option value="600000">10 minutes</option>
                <option value="3600000">1 hour</option>
                <option value="86400000">24 hours</option>
                <option value="604800000">7 days</option>
                <option value="2592000000">30 days</option>
                <option value="0">Permanent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                placeholder="Reason for blocking"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">
              Block IP
            </button>
            <button type="button" onClick={() => setShowBlockForm(false)} className="px-4 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Active Blocks', value: stats.activeBlocks, icon: Ban, color: 'text-red-600 dark:text-red-400' },
            { label: 'Permanent', value: stats.permanentBlocks, icon: ShieldBan, color: 'text-red-700 dark:text-red-300' },
            { label: 'Expired', value: stats.expiredBlocks, icon: Clock, color: 'text-gray-500' },
            { label: 'Suspicious IPs', value: stats.suspiciousIPs, icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400' },
            { label: 'Total Ever', value: stats.totalBlocked, icon: Activity, color: 'text-indigo-600 dark:text-indigo-400' },
          ].map(card => (
            <div key={card.label} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-xs text-gray-500 dark:text-gray-400">{card.label}</span>
              </div>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Autoblock Configuration */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Autoblock Configuration</span>
            {autoblockConfig && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                autoblockConfig.ipBlockingEnabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {autoblockConfig.ipBlockingEnabled ? 'Active' : 'Disabled'}
              </span>
            )}
          </div>
          {showConfig ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showConfig && configDraft && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 space-y-4">
            {/* Toggles row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* IP Blocking toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">IP Auto-Blocking</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Automatically block suspicious IPs</p>
                </div>
                <button
                  onClick={() => setConfigDraft({ ...configDraft, ipBlockingEnabled: !configDraft.ipBlockingEnabled })}
                  className="flex-shrink-0"
                >
                  {configDraft.ipBlockingEnabled
                    ? <ToggleRight className="w-8 h-8 text-green-600 dark:text-green-400" />
                    : <ToggleLeft className="w-8 h-8 text-gray-400" />
                  }
                </button>
              </div>

              {/* UA Blocking toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">User-Agent Blocking</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Block malicious bots / user-agents</p>
                </div>
                <button
                  onClick={() => setConfigDraft({ ...configDraft, uaBlockingEnabled: !configDraft.uaBlockingEnabled })}
                  className="flex-shrink-0"
                >
                  {configDraft.uaBlockingEnabled
                    ? <ToggleRight className="w-8 h-8 text-green-600 dark:text-green-400" />
                    : <ToggleLeft className="w-8 h-8 text-gray-400" />
                  }
                </button>
              </div>

              {/* IP Gating toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">IP Gating</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Auto-add blocked IPs to persistent rules</p>
                </div>
                <button
                  onClick={() => setConfigDraft({ ...configDraft, ipGatingEnabled: !configDraft.ipGatingEnabled })}
                  className="flex-shrink-0"
                >
                  {configDraft.ipGatingEnabled
                    ? <ToggleRight className="w-8 h-8 text-green-600 dark:text-green-400" />
                    : <ToggleLeft className="w-8 h-8 text-gray-400" />
                  }
                </button>
              </div>
            </div>

            {/* Duration + thresholds */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Block Duration */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">Auto-Block Duration</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">How long auto-blocked IPs stay blocked</p>
                <select
                  value={configDraft.blockDurationMs}
                  onChange={e => setConfigDraft({ ...configDraft, blockDurationMs: parseInt(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  {DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Suspicious event threshold */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  Suspicious Event Threshold
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Events before auto-block triggers</p>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={configDraft.suspiciousThreshold}
                  onChange={e => setConfigDraft({ ...configDraft, suspiciousThreshold: parseInt(e.target.value) || 1 })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* 404 count threshold */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  404 Count Threshold
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">404 errors to flag as suspicious</p>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={configDraft.threshold404Count}
                  onChange={e => setConfigDraft({ ...configDraft, threshold404Count: parseInt(e.target.value) || 5 })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* 404 sliding window */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
                  404 Sliding Window
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Time window for counting 404s</p>
                <select
                  value={configDraft.threshold404WindowMs}
                  onChange={e => setConfigDraft({ ...configDraft, threshold404WindowMs: parseInt(e.target.value) })}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  {WINDOW_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Changes apply immediately and persist across server restarts
              </p>
              <div className="flex gap-2">
                {configChanged && (
                  <button
                    onClick={() => setConfigDraft(autoblockConfig)}
                    className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    Discard
                  </button>
                )}
                <button
                  onClick={saveConfig}
                  disabled={!configChanged || savingConfig}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-colors ${
                    configChanged
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  {savingConfig ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reason breakdown */}
      {stats && stats.byReason && Object.keys(stats.byReason).length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Blocks by Reason</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byReason).map(([reason, count]) => (
              <span
                key={reason}
                className={`px-3 py-1 rounded-full text-xs font-medium ${REASON_COLORS[reason] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
              >
                {REASON_LABELS[reason] || reason}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-4">
          {(['active', 'suspicious', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-red-500 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t === 'active' ? `Active Blocks (${blocked.length})` : t === 'suspicious' ? 'Suspicious IPs' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      {tab === 'active' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchIP}
            onChange={e => setSearchIP(e.target.value)}
            placeholder="Filter by IP…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>
      )}

      {/* Active Blocks Table */}
      {tab === 'active' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {filteredBlocked.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="font-medium">No active blocks</p>
              <p className="text-xs mt-1">All clear — no IPs are currently blocked.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">IP Address</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Reason</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Blocked</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Expires</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Hits</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filteredBlocked.map(entry => (
                    <tr key={entry.ip} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{entry.ip}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REASON_COLORS[entry.reason] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {REASON_LABELS[entry.reason] || entry.reason}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{relativeTime(entry.blockedAt)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {entry.expiresAt ? relativeTime(entry.expiresAt) : <span className="text-red-500 font-medium">Permanent</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium">{entry.suspiciousCount}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => handleUnblock(entry.ip)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                        >
                          <Unlock className="w-3 h-3" /> Unblock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Suspicious IPs Tab */}
      {tab === 'suspicious' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {suspicious.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="font-medium">No suspicious IPs</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">IP Address</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Events</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Reasons</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Last Event</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {suspicious.map(entry => (
                    <tr key={entry.ip} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{entry.ip}</td>
                      <td className="px-4 py-2.5 text-xs font-medium">{entry.count}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {entry.reasons.map(r => (
                            <span key={r} className={`px-2 py-0.5 rounded-full text-xs ${REASON_COLORS[r] || 'bg-gray-100 dark:bg-gray-700'}`}>
                              {REASON_LABELS[r] || r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{relativeTime(entry.lastEvent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          {history.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p className="font-medium">No block history yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">IP Address</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Reason</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Blocked At</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Status</th>
                    <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Unblocked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {history.map((entry, i) => (
                    <tr key={`${entry.ip}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{entry.ip}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REASON_COLORS[entry.reason] || 'bg-gray-100 dark:bg-gray-700'}`}>
                          {REASON_LABELS[entry.reason] || entry.reason}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {new Date(entry.blockedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.isActive ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Active</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">Expired</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                        {entry.unblockedAt ? `${relativeTime(entry.unblockedAt)} by ${entry.unblockedBy || '—'}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
