import { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Globe, Clock, LogOut, RefreshCw, Loader2, Wifi, Hash,
} from 'lucide-react';
import { formatDistanceToNowStrict, parseISO, isValid } from 'date-fns';
import { systemAdminAPI } from '../../../../../services/api';
import type { ActiveSession } from '../../types';

interface SessionsTabProps {
  userId: string;
  onForceLogout: () => void;
}

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SessionsTab({ userId, onForceLogout }: SessionsTabProps) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const allSessions = await systemAdminAPI.getActiveSessions();
      const userSessions = (allSessions || []).filter(
        (s: ActiveSession) => s.userId === userId
      );
      setSessions(userSessions);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (session: ActiveSession) => {
    setRevokingId(session.userId);
    try {
      await systemAdminAPI.revokeSession(session.userId);
      setSessions((prev) => prev.filter((s) => s.userId !== session.userId));
    } catch {
      // fall through — session may have already expired
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Failed to load sessions</p>
        <button
          onClick={fetchSessions}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <Wifi className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No active sessions</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Sessions appear here while the user is actively making requests
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Active Sessions ({sessions.length})
        </h3>
        <button
          onClick={fetchSessions}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
          title="Refresh sessions"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3">
        {sessions.map((session) => {
          const lastSeenDate = parseISO(session.lastSeen);
          const lastSeenText = isValid(lastSeenDate)
            ? formatDistanceToNowStrict(lastSeenDate, { addSuffix: true })
            : 'Unknown';
          const firstSeenDate = parseISO(session.firstSeen);
          const firstSeenText = isValid(firstSeenDate)
            ? formatDistanceToNowStrict(firstSeenDate, { addSuffix: true })
            : 'Unknown';

          return (
            <div
              key={session.userId}
              className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {roleLabel(session.role)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {session.ip && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {session.ip}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Active {lastSeenText}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {session.requestCount} request{session.requestCount !== 1 ? 's' : ''}
                      </span>
                      <span>Session started {firstSeenText}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeSession(session)}
                  disabled={revokingId === session.userId}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  title="Revoke this session"
                >
                  {revokingId === session.userId
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <LogOut className="w-3 h-3" />
                  }
                  Revoke
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Force logout all */}
      <button
        onClick={onForceLogout}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
      >
        <LogOut className="w-4 h-4" />
        Force Logout All Sessions
      </button>
    </div>
  );
}

