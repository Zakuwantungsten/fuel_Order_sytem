import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  LogOut,
  Loader2,
  RefreshCw,
  Monitor,
  MapPin,
  Clock,
  Activity,
  ShieldAlert,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { sessionService, ActiveSession } from '../../services/sessionService';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function durationStr(fromStr: string, toStr: string): string {
  const diff = new Date(toStr).getTime() - new Date(fromStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  boss: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  driver: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

function roleColor(role: string): string {
  return ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

export default function SessionsTab({ onMessage }: Props) {
  const { user: currentUser } = useAuth();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Kill all confirmation
  const [confirmKillAll, setConfirmKillAll] = useState(false);
  const [killingAll, setKillingAll] = useState(false);

  // Kill single confirmation
  const [killTarget, setKillTarget] = useState<ActiveSession | null>(null);
  const [killing, setKilling] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await sessionService.getActive();
      setSessions(data);
    } catch {
      onMessage('Failed to load active sessions', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onMessage]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000); // auto-refresh every 15s
    return () => clearInterval(interval);
  }, [load]);

  async function handleKillOne() {
    if (!killTarget) return;
    setKilling(true);
    try {
      const result = await sessionService.terminate(killTarget.userId);
      onMessage(result.message || 'Session terminated', 'success');
      setKillTarget(null);
      load(true);
    } catch (err: any) {
      onMessage(err?.response?.data?.message || 'Failed to terminate session', 'error');
    } finally {
      setKilling(false);
    }
  }

  async function handleKillAll() {
    setKillingAll(true);
    try {
      const result = await sessionService.terminateAll();
      onMessage(`${result.terminated} session(s) terminated`, 'success');
      setConfirmKillAll(false);
      load(true);
    } catch (err: any) {
      onMessage(err?.response?.data?.message || 'Failed to terminate sessions', 'error');
    } finally {
      setKillingAll(false);
    }
  }

  const otherSessions = sessions.filter((s) => s.userId !== currentUser?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Active Sessions</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Monitor and forcefully terminate user sessions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {otherSessions.length > 0 && (
            <button
              onClick={() => setConfirmKillAll(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Kill All
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Active</span>
          </div>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sessions.length}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Other Users</span>
          </div>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{otherSessions.length}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Your Session</span>
          </div>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">1</p>
        </div>
      </div>

      {/* Auto-refresh indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <Activity className="w-3 h-3" />
        <span>Auto-refreshes every 15 seconds</span>
        {refreshing && <span className="text-indigo-500">Refreshing...</span>}
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No active sessions</p>
          <p className="text-xs mt-1">No users are currently logged in</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const isSelf = session.userId === currentUser?.id;
            return (
              <div
                key={session.userId}
                className={`group bg-white dark:bg-gray-800 rounded-xl border transition-all shadow-sm ${
                  isSelf
                    ? 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-200 dark:ring-indigo-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-800 hover:shadow-md'
                }`}
              >
                <div className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      isSelf ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {session.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{session.username}</span>
                        {isSelf && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-full">You</span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColor(session.role)}`}>
                          {session.role.replace(/_/g, ' ')}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          Active
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <MapPin className="w-3 h-3" />
                          <code className="font-mono">{session.ip}</code>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>Last active {timeAgo(session.lastSeen)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Monitor className="w-3 h-3" />
                          <span>Session: {durationStr(session.firstSeen, session.lastSeen)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Activity className="w-3 h-3" />
                          <span>{session.requestCount} requests</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Kill button */}
                  {!isSelf && (
                    <button
                      onClick={() => setKillTarget(session)}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 opacity-0 group-hover:opacity-100 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold transition-all border border-red-200 dark:border-red-800"
                    >
                      <LogOut className="w-3 h-3" />
                      Terminate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Kill single confirm */}
      {killTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setKillTarget(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <LogOut className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Terminate Session</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">The user will be logged out immediately</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              Terminate the session for <strong className="text-gray-900 dark:text-gray-100">{killTarget.username}</strong>{' '}
              (<code className="font-mono text-xs">{killTarget.ip}</code>)?
              They will need to log in again.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setKillTarget(null)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleKillOne}
                disabled={killing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {killing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Terminate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kill all confirm */}
      {confirmKillAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmKillAll(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Kill All Sessions</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">This is a drastic action — use with care</p>
              </div>
            </div>
            <div className="p-3 mb-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>{otherSessions.length}</strong> session(s) will be terminated immediately.
                All affected users will be logged out and must re-authenticate. Your own session will remain active.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmKillAll(false)} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleKillAll}
                disabled={killingAll}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {killingAll && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Kill All Sessions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
