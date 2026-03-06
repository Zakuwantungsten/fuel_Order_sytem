import { useMemo } from 'react';
import {
  LogIn, XCircle, Globe, Monitor, Clock,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { LoginHistoryEntry } from '../../types';

interface ActivityTabProps {
  loginHistory: LoginHistoryEntry[];
}

function formatTimestamp(dateStr: string): string {
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, 'MMM d, yyyy h:mm:ss a') : dateStr;
}

function parseUserAgent(ua?: string): string {
  if (!ua) return 'Unknown device';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown browser';
}

export default function ActivityTab({ loginHistory }: ActivityTabProps) {
  const entries = useMemo(() => {
    return [...loginHistory]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
  }, [loginHistory]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Clock className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No login history available</p>
      </div>
    );
  }

  const successCount = entries.filter(e => e.outcome === 'SUCCESS').length;
  const failCount = entries.filter(e => e.outcome === 'FAILURE').length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex gap-3">
        <div className="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-700 dark:text-green-400">{successCount}</div>
          <div className="text-xs text-green-600 dark:text-green-500">Successful</div>
        </div>
        <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-red-700 dark:text-red-400">{failCount}</div>
          <div className="text-xs text-red-600 dark:text-red-500">Failed</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {entries.map((entry) => {
          const isSuccess = entry.outcome === 'SUCCESS';
          return (
            <div
              key={entry._id}
              className="relative flex gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
            >
              {/* Icon */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                isSuccess
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : 'bg-red-100 dark:bg-red-900/30'
              }`}>
                {isSuccess
                  ? <LogIn className="w-4 h-4 text-green-600 dark:text-green-400" />
                  : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                }
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${
                    isSuccess
                      ? 'text-green-700 dark:text-green-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}>
                    {entry.action === 'LOGIN' ? 'Login' : 'Failed Login'}
                  </span>
                  <time className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </time>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {entry.ipAddress && (
                    <span className="inline-flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {entry.ipAddress}
                    </span>
                  )}
                  {entry.userAgent && (
                    <span className="inline-flex items-center gap-1">
                      <Monitor className="w-3 h-3" />
                      {parseUserAgent(entry.userAgent)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
