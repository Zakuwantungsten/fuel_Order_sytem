import React, { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { ShieldCheck, RefreshCw, AlertTriangle, Loader2, X, CheckCircle, Lock, Unlock } from 'lucide-react';
import apiClient from '../../services/api';

interface UserMFAStatus {
  userId: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  totpEnabled: boolean;
  emailEnabled: boolean;
  isMandatory: boolean;
  lastVerified?: string;
  failedAttempts: number;
  lockedUntil?: string;
}

export const MFAManagementTab: React.FC = () => {
  const [users, setUsers] = useState<UserMFAStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterMfa, setFilterMfa] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<{ userId: string; username: string } | null>(null);
  const [disabling, setDisabling] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/mfa-management');
      setUsers(res.data.data);
    } catch {
      setError('Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleDisable = (userId: string, username: string) => {
    setDisableTarget({ userId, username });
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    setDisabling(true);
    setActionLoading(disableTarget.userId);
    try {
      await apiClient.post(`/system-admin/mfa-management/${disableTarget.userId}/disable`);
      setSuccess(`MFA disabled for ${disableTarget.username}`);
      setDisableTarget(null);
      await fetchData();
    } catch {
      setError('Failed to disable MFA');
    } finally {
      setActionLoading(null);
      setDisabling(false);
    }
  };

  const handleToggleMandatory = async (userId: string, username: string, current: boolean) => {
    setActionLoading(userId + '_req');
    try {
      await apiClient.post(`/system-admin/mfa-management/${userId}/require`, { mandatory: !current });
      setSuccess(`MFA mandatory=${!current} for ${username}`);
      await fetchData();
    } catch {
      setError('Failed to update MFA requirement');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = users.filter((u) => {
    const matchSearch = !search || `${u.firstName} ${u.lastName} ${u.username} ${u.role}`.toLowerCase().includes(search.toLowerCase());
    const matchMfa = filterMfa === 'all' || (filterMfa === 'enabled' ? u.mfaEnabled : !u.mfaEnabled);
    return matchSearch && matchMfa;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
            <ShieldCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Two-Factor Auth Management</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">View and manage MFA status for all users</p>
          </div>
        </div>
        <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}<button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button></div>}
      {success && <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm"><CheckCircle className="h-4 w-4 shrink-0" />{success}<button onClick={() => setSuccess(null)} className="ml-auto"><X className="h-4 w-4" /></button></div>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Users', value: users.length },
          { label: 'MFA Enabled', value: users.filter((u) => u.mfaEnabled).length, color: 'text-green-600 dark:text-green-400' },
          { label: 'MFA Disabled', value: users.filter((u) => !u.mfaEnabled).length, color: 'text-red-500 dark:text-red-400' },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color || 'text-gray-900 dark:text-white'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input type="text" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <select value={filterMfa} onChange={(e) => setFilterMfa(e.target.value as any)} className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500">
          <option value="all">All MFA Status</option>
          <option value="enabled">MFA Enabled</option>
          <option value="disabled">MFA Disabled</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                  {['User', 'Role', 'MFA Status', 'Methods', 'Mandatory', 'Failed Attempts', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map((u) => (
                  <tr key={u.userId} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{u.firstName} {u.lastName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">@{u.username}</div>
                    </td>
                    <td className="px-4 py-3 text-xs"><span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{u.role.replace(/_/g, ' ')}</span></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${u.mfaEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {u.mfaEnabled ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        {u.mfaEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {u.totpEnabled && <span className="mr-1">TOTP</span>}
                      {u.emailEnabled && <span>Email</span>}
                      {!u.totpEnabled && !u.emailEnabled && '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${u.isMandatory ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                        {u.isMandatory ? 'Required' : 'Optional'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{u.failedAttempts}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {u.mfaEnabled && u.role !== 'super_admin' && (
                          <button
                            onClick={() => handleDisable(u.userId, u.username)}
                            disabled={actionLoading === u.userId}
                            className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                          >
                            {actionLoading === u.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Disable'}
                          </button>
                        )}
                        {u.role !== 'super_admin' && (
                          <button
                            onClick={() => handleToggleMandatory(u.userId, u.username, u.isMandatory)}
                            disabled={actionLoading === u.userId + '_req'}
                            className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
                          >
                            {u.isMandatory ? 'Make Optional' : 'Require'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">No users found</div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={disableTarget !== null}
        title="Disable MFA"
        message={`Disable MFA for ${disableTarget?.username}? They will no longer be required to verify their identity with a second factor.`}
        variant="warning"
        confirmLabel="Disable MFA"
        loading={disabling}
        onConfirm={confirmDisable}
        onCancel={() => !disabling && setDisableTarget(null)}
      />
    </div>
  );
};

export default MFAManagementTab;
