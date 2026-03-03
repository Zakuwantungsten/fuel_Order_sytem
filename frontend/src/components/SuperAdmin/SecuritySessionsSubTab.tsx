import { useState, useEffect, useCallback } from 'react';
import {
  Users, LogOut, Loader2, RefreshCw, MapPin, Clock, Activity,
  ShieldAlert, AlertTriangle, Zap, ShieldCheck, Lock, Unlock,
  X, CheckCircle, Search,
} from 'lucide-react';
import { sessionService, ActiveSession } from '../../services/sessionService';
import { useAuth } from '../../contexts/AuthContext';
import apiClient from '../../services/api';
import ConfirmModal from './ConfirmModal';

/* ───────── Types ───────── */

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

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

/* ───────── Helpers ───────── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  boss: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  driver: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

/* ───────── Component ───────── */

export default function SecuritySessionsSubTab({ onMessage }: Props) {
  const { user: currentUser } = useAuth();

  /* Sessions state */
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [killTarget, setKillTarget] = useState<ActiveSession | null>(null);
  const [killing, setKilling] = useState(false);
  const [showKillAll, setShowKillAll] = useState(false);
  const [killingAll, setKillingAll] = useState(false);

  /* MFA state */
  const [mfaUsers, setMfaUsers] = useState<UserMFAStatus[]>([]);
  const [loadingMFA, setLoadingMFA] = useState(true);
  const [mfaSearch, setMfaSearch] = useState('');
  const [filterMfa, setFilterMfa] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<{ userId: string; username: string } | null>(null);
  const [disabling, setDisabling] = useState(false);

  /* Messages */
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* ── Loaders ── */
  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setLoadingSessions(true);
    else setRefreshing(true);
    try {
      setSessions(await sessionService.getActive());
    } catch {
      if (!silent) setError('Failed to load sessions');
    } finally {
      setLoadingSessions(false);
      setRefreshing(false);
    }
  }, []);

  const loadMFA = async () => {
    setLoadingMFA(true);
    try {
      const res = await apiClient.get('/system-admin/mfa-management');
      setMfaUsers(res.data.data);
    } catch {
      setError('Failed to load MFA data');
    } finally {
      setLoadingMFA(false);
    }
  };

  useEffect(() => {
    loadSessions();
    loadMFA();
    const iv = setInterval(() => loadSessions(true), 15000);
    return () => clearInterval(iv);
  }, [loadSessions]);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
  }, [success]);

  /* ── Session actions ── */
  const handleKillOne = async () => {
    if (!killTarget) return;
    setKilling(true);
    try {
      const r = await sessionService.terminate(killTarget.userId);
      onMessage('success', r.message || 'Session terminated');
      setKillTarget(null);
      loadSessions(true);
    } catch (e: any) {
      onMessage('error', e?.response?.data?.message || 'Failed to terminate');
    } finally { setKilling(false); }
  };

  const handleKillAll = async () => {
    setKillingAll(true);
    try {
      const r = await sessionService.terminateAll();
      onMessage('success', `${r.terminated} session(s) terminated`);
      setShowKillAll(false);
      loadSessions(true);
    } catch (e: any) {
      onMessage('error', e?.response?.data?.message || 'Failed');
    } finally { setKillingAll(false); }
  };

  /* ── MFA actions ── */
  const confirmDisable = async () => {
    if (!disableTarget) return;
    setDisabling(true);
    setActionLoading(disableTarget.userId);
    try {
      await apiClient.post(`/system-admin/mfa-management/${disableTarget.userId}/disable`);
      setSuccess(`MFA disabled for ${disableTarget.username}`);
      setDisableTarget(null);
      await loadMFA();
    } catch { setError('Failed to disable MFA'); }
    finally { setActionLoading(null); setDisabling(false); }
  };

  const toggleMandatory = async (userId: string, username: string, current: boolean) => {
    setActionLoading(userId + '_req');
    try {
      await apiClient.post(`/system-admin/mfa-management/${userId}/require`, { mandatory: !current });
      setSuccess(`MFA ${!current ? 'required' : 'optional'} for ${username}`);
      await loadMFA();
    } catch { setError('Failed to update'); }
    finally { setActionLoading(null); }
  };

  /* ── Derived ── */
  const otherSessions = sessions.filter(s => s.userId !== currentUser?.id);
  const mfaEnabled = mfaUsers.filter(u => u.mfaEnabled).length;
  const filteredMFA = mfaUsers.filter(u => {
    const matchSearch = !mfaSearch || `${u.firstName} ${u.lastName} ${u.username} ${u.role}`.toLowerCase().includes(mfaSearch.toLowerCase());
    const matchFilter = filterMfa === 'all' || (filterMfa === 'enabled' ? u.mfaEnabled : !u.mfaEnabled);
    return matchSearch && matchFilter;
  });

  /* ── Render ── */
  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Active Sessions</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sessions.length}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Other Users</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{otherSessions.length}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">MFA Enabled</span>
          </div>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{mfaEnabled}<span className="text-sm text-gray-400 font-normal">/{mfaUsers.length}</span></p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <Unlock className="w-3.5 h-3.5 text-red-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">MFA Disabled</span>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{mfaUsers.length - mfaEnabled}</p>
        </div>
      </div>

      {/* ═══════ Active Sessions ═══════ */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Active Sessions</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Activity className="w-3 h-3" /> Auto-refresh 15s
                {refreshing && <span className="text-indigo-500">Updating…</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => loadSessions(true)} disabled={refreshing}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {otherSessions.length > 0 && (
              <button onClick={() => setShowKillAll(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors">
                <Zap className="w-3.5 h-3.5" /> Kill All
              </button>
            )}
          </div>
        </div>

        {loadingSessions ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No active sessions</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {sessions.map(s => {
              const self = s.userId === currentUser?.id;
              return (
                <div key={s.userId}
                  className={`group px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${self ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      self ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                           : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {s.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{s.username}</span>
                        {self && <span className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-full">You</span>}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[s.role] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                          {s.role.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /><code className="font-mono">{s.ip}</code></span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(s.lastSeen)}</span>
                        <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{s.requestCount} reqs</span>
                      </div>
                    </div>
                  </div>
                  {!self && (
                    <button onClick={() => setKillTarget(s)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 opacity-0 group-hover:opacity-100 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold transition-all border border-red-200 dark:border-red-800">
                      <LogOut className="w-3 h-3" /> Terminate
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════ User MFA Status ═══════ */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">User MFA Status</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Per-user two-factor authentication overview</p>
            </div>
          </div>
          <button onClick={loadMFA} disabled={loadingMFA}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <RefreshCw className={`w-4 h-4 ${loadingMFA ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search users…" value={mfaSearch} onChange={e => setMfaSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={filterMfa} onChange={e => setFilterMfa(e.target.value as any)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500">
            <option value="all">All</option>
            <option value="enabled">MFA On</option>
            <option value="disabled">MFA Off</option>
          </select>
        </div>

        {loadingMFA ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-teal-500 animate-spin" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  {['User', 'Role', 'MFA', 'Methods', 'Mandatory', 'Failed', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {filteredMFA.map(u => (
                  <tr key={u.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-sm text-gray-900 dark:text-white">{u.firstName} {u.lastName}</div>
                      <div className="text-xs text-gray-400">@{u.username}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                        {u.role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        u.mfaEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                     : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {u.mfaEnabled ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        {u.mfaEnabled ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {[u.totpEnabled && 'TOTP', u.emailEnabled && 'Email'].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs ${u.isMandatory ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                        {u.isMandatory ? 'Required' : 'Optional'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{u.failedAttempts}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        {u.mfaEnabled && u.role !== 'super_admin' && (
                          <button onClick={() => setDisableTarget({ userId: u.userId, username: u.username })}
                            disabled={actionLoading === u.userId}
                            className="px-2 py-1 text-xs rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 disabled:opacity-50">
                            {actionLoading === u.userId ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Disable'}
                          </button>
                        )}
                        {u.role !== 'super_admin' && (
                          <button onClick={() => toggleMandatory(u.userId, u.username, u.isMandatory)}
                            disabled={actionLoading === u.userId + '_req'}
                            className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 disabled:opacity-50">
                            {u.isMandatory ? 'Optional' : 'Require'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMFA.length === 0 && (
              <div className="text-center py-10 text-gray-400 text-sm">No users found</div>
            )}
          </div>
        )}
      </div>

      {/* ═══════ Modals ═══════ */}
      <ConfirmModal
        open={killTarget !== null}
        title="Terminate Session"
        message={`Terminate the session for ${killTarget?.username} (${killTarget?.ip})? They will be logged out immediately.`}
        variant="danger"
        confirmLabel="Terminate"
        loading={killing}
        onConfirm={handleKillOne}
        onCancel={() => !killing && setKillTarget(null)}
      />
      <ConfirmModal
        open={showKillAll}
        title="Kill All Sessions"
        message={`${otherSessions.length} session(s) will be terminated immediately. Your session will remain active.`}
        variant="danger"
        confirmLabel="Kill All Sessions"
        loading={killingAll}
        onConfirm={handleKillAll}
        onCancel={() => !killingAll && setShowKillAll(false)}
      />
      <ConfirmModal
        open={disableTarget !== null}
        title="Disable MFA"
        message={`Disable MFA for ${disableTarget?.username}? They will no longer need a second factor to log in.`}
        variant="warning"
        confirmLabel="Disable MFA"
        loading={disabling}
        onConfirm={confirmDisable}
        onCancel={() => !disabling && setDisableTarget(null)}
      />
    </div>
  );
}
