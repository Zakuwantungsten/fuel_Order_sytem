import { useState, useEffect, useCallback } from 'react';
import {
  Monitor, Globe, Clock, LogOut, RefreshCw, Loader2, Wifi,
} from 'lucide-react';
import { formatDistanceToNowStrict, parseISO, isValid } from 'date-fns';
import { systemAdminAPI } from '../../../../../services/api';
import type { ActiveSession } from '../../types';

interface SessionsTabProps {
  userId: string;
  onForceLogout: () => void;
}

function parseDevice(ua?: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  if (ua.includes('Android')) return 'Android';
  return 'Unknown';
}

function parseBrowser(ua?: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edge')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
}

export default function SessionsTab({ userId, onForceLogout }: SessionsTabProps) {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Failed to load sessions</p>
        <button
          onClick={fetchSessions}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
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
          const lastActivityDate = parseISO(session.lastActivity);
          const lastActivity = isValid(lastActivityDate)
            ? formatDistanceToNowStrict(lastActivityDate, { addSuffix: true })
            : 'Unknown';

          return (
            <div
              key={session.sessionId}
              className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Monitor className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {parseBrowser(session.userAgent)} on {parseDevice(session.userAgent)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {session.ipAddress && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {session.ipAddress}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {lastActivity}
                      </span>
                    </div>
                  </div>
                </div>
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
