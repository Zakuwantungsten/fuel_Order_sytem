import React, { useState, useEffect } from 'react';
import { Key, RefreshCw, AlertTriangle, Loader2, User, Shield, Clock, Activity } from 'lucide-react';
import apiClient from '../../services/api';

interface DriverCredentialStats {
  totalDrivers: number;
  driversWithCredentials: number;
  recentlyActive: number;
  lockedAccounts: number;
}

interface DriverInfo {
  _id: string;
  username: string;
  email: string;
  status: string;
  isLocked: boolean;
  lastLogin?: string;
  createdAt: string;
  failedLoginAttempts?: number;
}

export const DriverCredentialManagerEnhancedTab: React.FC = () => {
  const [stats, setStats] = useState<DriverCredentialStats | null>(null);
  const [drivers, setDrivers] = useState<DriverInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/bulk-users', {
        params: { role: 'driver', q: search || undefined },
      });
      const users: DriverInfo[] = res.data.data.users || [];
      setDrivers(users);
      const locked = users.filter((u) => u.isLocked || u.status === 'locked').length;
      const withCreds = users.filter((u) => u.status !== 'inactive').length;
      const recent = users.filter((u) => {
        if (!u.lastLogin) return false;
        const diff = Date.now() - new Date(u.lastLogin).getTime();
        return diff < 7 * 24 * 60 * 60 * 1000;
      }).length;
      setStats({ totalDrivers: users.length, driversWithCredentials: withCreds, recentlyActive: recent, lockedAccounts: locked });
    } catch {
      setError('Failed to load driver data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); fetchData(); };

  const handleUnlock = async (driverId: string, username: string) => {
    setActionLoading(driverId);
    try {
      await apiClient.post('/system-admin/bulk-users/bulk-action', {
        userIds: [driverId],
        action: 'activate',
      });
      setActionMsg({ id: driverId, text: `${username} unlocked`, ok: true });
      setTimeout(() => setActionMsg(null), 3000);
      fetchData();
    } catch {
      setActionMsg({ id: driverId, text: 'Action failed', ok: false });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (driverId: string, username: string) => {
    setActionLoading(driverId);
    try {
      await apiClient.post('/system-admin/bulk-users/bulk-action', {
        userIds: [driverId],
        action: 'deactivate',
      });
      setActionMsg({ id: driverId, text: `${username} deactivated`, ok: true });
      setTimeout(() => setActionMsg(null), 3000);
      fetchData();
    } catch {
      setActionMsg({ id: driverId, text: 'Action failed', ok: false });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (driver: DriverInfo) => {
    if (driver.isLocked || driver.status === 'locked') return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">Locked</span>;
    if (driver.status === 'active') return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">Active</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium capitalize">{driver.status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
            <Key className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Driver Credential Manager</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Enhanced view of driver accounts, login status, and access control</p>
          </div>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Drivers', icon: User, value: stats.totalDrivers, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-900/30' },
            { label: 'Active Credentials', icon: Shield, value: stats.driversWithCredentials, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
            { label: 'Active (Last 7d)', icon: Activity, value: stats.recentlyActive, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-900/30' },
            { label: 'Locked Accounts', icon: Clock, value: stats.lockedAccounts, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
          ].map(({ label, icon: Icon, value, color, bg }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${bg}`}><Icon className={`h-5 w-5 ${color}`} /></div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      {actionMsg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm border ${actionMsg.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'}`}>
          {actionMsg.text}
        </div>
      )}

      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search drivers by name or email..."
          className="flex-1 sm:max-w-sm px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button type="submit" className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium">Search</button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Last Login</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Failed Attempts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Joined</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {drivers.map((driver) => (
                  <tr key={driver._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">@{driver.username}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{driver.email}</p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(driver)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {driver.lastLogin ? new Date(driver.lastLogin).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${(driver.failedLoginAttempts || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        {driver.failedLoginAttempts ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {new Date(driver.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {(driver.isLocked || driver.status === 'locked' || driver.status === 'inactive') && (
                          <button
                            onClick={() => handleUnlock(driver._id, driver.username)}
                            disabled={actionLoading === driver._id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-50"
                          >
                            {actionLoading === driver._id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Unlock'}
                          </button>
                        )}
                        {driver.status === 'active' && (
                          <button
                            onClick={() => handleDeactivate(driver._id, driver.username)}
                            disabled={actionLoading === driver._id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                          >
                            {actionLoading === driver._id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Deactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {drivers.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">No drivers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverCredentialManagerEnhancedTab;
