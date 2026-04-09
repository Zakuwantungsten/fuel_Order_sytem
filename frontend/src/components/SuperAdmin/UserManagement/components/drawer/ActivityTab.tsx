import { useMemo } from 'react';
import {
  LogIn, LogOut, XCircle, Globe, Monitor, Clock,
  Key, Shield, ShieldOff, Lock, Unlock, UserCog, RefreshCw,
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
  if (ua.includes('Chrome') && !ua.includes('Edge')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown browser';
}

type ActionMeta = {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
};

function getActionMeta(action: string, outcome?: string): ActionMeta {
  const isFail = outcome === 'FAILURE';
  switch (action) {
    case 'LOGIN':
      return isFail
        ? { label: 'Failed Login', icon: XCircle, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' }
        : { label: 'Login', icon: LogIn, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    case 'FAILED_LOGIN':
      return { label: 'Failed Login', icon: XCircle, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' };
    case 'LOGOUT':
      return { label: 'Logout', icon: LogOut, color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800' };
    case 'PASSWORD_RESET':
    case 'PASSWORD_CHANGE':
      return { label: 'Password Changed', icon: Key, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' };
    case 'MFA_ENABLED':
      return { label: 'MFA Enabled', icon: Shield, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
    case 'MFA_DISABLED':
      return { label: 'MFA Disabled', icon: ShieldOff, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' };
    case 'ACCOUNT_LOCKED':
      return { label: 'Account Locked', icon: Lock, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/30' };
    case 'ACCOUNT_UNLOCKED':
      return { label: 'Account Unlocked', icon: Unlock, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' };
    case 'ROLE_CHANGE':
      return { label: 'Role Changed', icon: UserCog, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/30' };
    case 'UPDATE':
      return { label: 'Profile Updated', icon: UserCog, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
    default:
      return {
        label: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        icon: RefreshCw,
        color: 'text-gray-500 dark:text-gray-400',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
      };
  }
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
        <p className="text-sm text-gray-500 dark:text-gray-400">No activity history available</p>
      </div>
    );
  }

  const loginActions = new Set(['LOGIN', 'FAILED_LOGIN']);
  const successLogins = entries.filter(e => loginActions.has(e.action) && e.outcome === 'SUCCESS').length;
  const failLogins = entries.filter(e => e.action === 'FAILED_LOGIN' || (e.action === 'LOGIN' && e.outcome === 'FAILURE')).length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="flex gap-3">
        <div className="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-700 dark:text-green-400">{successLogins}</div>
          <div className="text-xs text-green-600 dark:text-green-500">Successful Logins</div>
        </div>
        <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-red-700 dark:text-red-400">{failLogins}</div>
          <div className="text-xs text-red-600 dark:text-red-500">Failed Logins</div>
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-gray-700 dark:text-gray-300">{entries.length}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Total Events</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {entries.map((entry) => {
          const { label, icon: Icon, color, bgColor } = getActionMeta(entry.action, entry.outcome);
          return (
            <div
              key={entry._id}
              className="relative flex gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
            >
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${bgColor}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-medium ${color}`}>{label}</span>
                  <time className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {formatTimestamp(entry.timestamp)}
                  </time>
                </div>
                {entry.details && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={entry.details}>
                    {entry.details}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 dark:text-gray-500">
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

