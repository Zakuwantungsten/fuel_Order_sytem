import { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Smartphone, Tablet, Loader2, RefreshCw, Search,
  ShieldCheck, ShieldBan, Trash2, CheckCircle, XCircle,
  AlertTriangle, X, Laptop, HardDrive,
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';

/* ───────── Types ───────── */

interface KnownDevice {
  _id: string;
  userId: string;
  username: string;
  browser: string;
  os: string;
  deviceType: string;
  firstSeen: string;
  lastSeen: string;
  lastIP: string;
  sessionCount: number;
  trusted: boolean;
  blocked: boolean;
}

interface DeviceStats {
  total: number;
  trusted: number;
  blocked: number;
  newDevices: number;
  deviceTypes: Record<string, number> | { _id: string; count: number }[];
}

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

/* ───────── Helpers ───────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  desktop: <Monitor className="w-4 h-4" />,
  mobile: <Smartphone className="w-4 h-4" />,
  tablet: <Tablet className="w-4 h-4" />,
  unknown: <Laptop className="w-4 h-4" />,
};

/* ───────── Component ───────── */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function DeviceManagementPanel({ onMessage }: Props) {
  const [devices, setDevices] = useState<KnownDevice[]>([]);
  const [stats, setStats] = useState<DeviceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'trusted' | 'blocked'>('all');
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnownDevice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionStorage.getItem('fuel_order_token')}`,
  });

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filter === 'trusted') params.set('trusted', 'true');
      if (filter === 'blocked') params.set('blocked', 'true');
      params.set('limit', '100');

      const res = await fetch(`${API_BASE}/system-admin/known-devices?${params}`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setDevices(json.data.devices);
    } catch {
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/system-admin/known-devices/stats`, { headers: authHeaders() });
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch {
      // Non-critical
    }
  };

  useEffect(() => { loadDevices(); loadStats(); }, [loadDevices]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/system-admin/known-devices/sync`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const json = await res.json();
      onMessage('success', json.message || 'Sync complete');
      loadDevices();
      loadStats();
    } catch {
      onMessage('error', 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleTrust = async (id: string) => {
    setActionLoading(id + '_trust');
    try {
      await fetch(`${API_BASE}/system-admin/known-devices/${id}/trust`, { method: 'PATCH', headers: authHeaders() });
      onMessage('success', 'Device trusted');
      loadDevices();
      loadStats();
    } catch { onMessage('error', 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleBlock = async (id: string) => {
    setActionLoading(id + '_block');
    try {
      await fetch(`${API_BASE}/system-admin/known-devices/${id}/block`, { method: 'PATCH', headers: authHeaders() });
      onMessage('success', 'Device blocked');
      loadDevices();
      loadStats();
    } catch { onMessage('error', 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleUntrust = async (id: string) => {
    setActionLoading(id + '_untrust');
    try {
      await fetch(`${API_BASE}/system-admin/known-devices/${id}/untrust`, { method: 'PATCH', headers: authHeaders() });
      onMessage('success', 'Device untrusted');
      loadDevices();
      loadStats();
    } catch { onMessage('error', 'Failed'); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/system-admin/known-devices/${deleteTarget._id}`, { method: 'DELETE', headers: authHeaders() });
      onMessage('success', 'Device removed');
      setDeleteTarget(null);
      loadDevices();
      loadStats();
    } catch { onMessage('error', 'Failed to remove device'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total</span>
            </div>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Trusted</span>
            </div>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.trusted}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <ShieldBan className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Blocked</span>
            </div>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.blocked}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">New (7d)</span>
            </div>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.newDevices}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">By Type</div>
            <div className="flex flex-wrap gap-1">
              {(Array.isArray(stats.deviceTypes)
                ? stats.deviceTypes
                : Object.entries(stats.deviceTypes).map(([k, v]) => ({ _id: k, count: v }))
              ).map(dt => (
                <span key={dt._id} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                  {DEVICE_ICONS[dt._id] || DEVICE_ICONS.unknown}
                  {dt.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Search user, browser, OS, IP…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
          <option value="all">All Devices</option>
          <option value="trusted">Trusted</option>
          <option value="blocked">Blocked</option>
        </select>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Sync from History
        </button>
      </div>

      {/* Device list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>
      ) : devices.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Monitor className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No devices found</p>
          <button onClick={handleSync} className="mt-2 text-xs text-indigo-500 hover:underline">Sync from login history</button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                {['Device', 'User', 'Last IP', 'Sessions', 'First Seen', 'Last Seen', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {devices.map(d => (
                <tr key={d._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400">
                        {DEVICE_ICONS[d.deviceType] || DEVICE_ICONS.unknown}
                      </span>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white text-xs">{d.browser}</div>
                        <div className="text-[10px] text-gray-400">{d.os}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300">{d.username}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{d.lastIP}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400">{d.sessionCount}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(d.firstSeen)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{timeAgo(d.lastSeen)}</td>
                  <td className="px-4 py-2.5">
                    {d.blocked ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                        <XCircle className="w-3 h-3" /> Blocked
                      </span>
                    ) : d.trusted ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        <CheckCircle className="w-3 h-3" /> Trusted
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                        Unknown
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {!d.trusted && !d.blocked && (
                        <button onClick={() => handleTrust(d._id)}
                          disabled={actionLoading === d._id + '_trust'}
                          className="px-2 py-1 text-[10px] rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 disabled:opacity-50"
                          title="Trust this device">
                          Trust
                        </button>
                      )}
                      {d.trusted && (
                        <button onClick={() => handleUntrust(d._id)}
                          disabled={actionLoading === d._id + '_untrust'}
                          className="px-2 py-1 text-[10px] rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 disabled:opacity-50"
                          title="Remove trust">
                          Untrust
                        </button>
                      )}
                      {!d.blocked && (
                        <button onClick={() => handleBlock(d._id)}
                          disabled={actionLoading === d._id + '_block'}
                          className="px-2 py-1 text-[10px] rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 disabled:opacity-50"
                          title="Block this device">
                          Block
                        </button>
                      )}
                      <button onClick={() => setDeleteTarget(d)}
                        className="px-2 py-1 text-[10px] rounded bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="Remove device record">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={deleteTarget !== null}
        title="Remove Device"
        message={`Remove the device record for ${deleteTarget?.browser} on ${deleteTarget?.os} (user: ${deleteTarget?.username})? This does not block the device.`}
        variant="danger"
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  );
}
