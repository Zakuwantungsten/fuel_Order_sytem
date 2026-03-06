/**
 * SecurityChangeLog — Collapsible panel showing recent security-related
 * audit log entries (who changed what security setting, when).
 */
import { useState, useEffect } from 'react';
import {
  History, ChevronDown, ChevronRight, RefreshCw, User, Clock,
  Loader2,
} from 'lucide-react';

interface AuditEntry {
  _id: string;
  action: string;
  resourceType: string;
  userId?: { firstName?: string; lastName?: string; email?: string };
  details?: Record<string, any>;
  riskLevel?: string;
  createdAt: string;
}

const API = '/api/v1/system-admin/security-audit-log';

const ACTION_LABELS: Record<string, string> = {
  UPDATE: 'Updated',
  CREATE: 'Created',
  DELETE: 'Deleted',
  ENABLE: 'Enabled',
  DISABLE: 'Disabled',
  ACTIVATE: 'Activated',
  DEACTIVATE: 'Deactivated',
  REVOKE: 'Revoked',
  GRANT: 'Granted',
  LOGIN: 'Logged in',
  RESET: 'Reset',
};

const RESOURCE_LABELS: Record<string, string> = {
  security_settings: 'Security Settings',
  session: 'Session',
  user_session: 'User Session',
  user_mfa: 'MFA Config',
  ip_rule: 'IP Rule',
  break_glass_account: 'Break-Glass Account',
  security_blocklist: 'Security Blocklist',
  dlp_rule: 'DLP Rule',
  api_token: 'API Token',
  security_score: 'Security Score',
  csrf_protection: 'CSRF Protection',
  access_control: 'Access Control',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

export default function SecurityChangeLog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLog = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('fuel_order_token');
      const res = await fetch(`${API}?limit=15`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'Failed');
      setEntries(json.data.entries || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && entries.length === 0 && !loading) fetchLog();
  }, [open]);

  const authorName = (e: AuditEntry): string => {
    if (!e.userId) return 'System';
    const u = e.userId;
    if (u.firstName) return `${u.firstName} ${u.lastName || ''}`.trim();
    return u.email || 'Unknown';
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <History className="w-4.5 h-4.5 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Recent Security Changes</span>
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={e => { e.stopPropagation(); fetchLog(); }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {loading && entries.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500 px-5 py-4">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 px-5 py-6 text-center">No security changes recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-80 overflow-y-auto">
              {entries.map(entry => (
                <div key={entry._id} className="px-5 py-3 flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 dark:text-gray-200">
                      <span className="font-medium">{authorName(entry)}</span>
                      {' '}
                      <span className="text-gray-500 dark:text-gray-400">
                        {ACTION_LABELS[entry.action] || entry.action.toLowerCase()} {RESOURCE_LABELS[entry.resourceType] || entry.resourceType}
                      </span>
                    </p>
                    {entry.details && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                        {typeof entry.details === 'object' ? JSON.stringify(entry.details).slice(0, 120) : String(entry.details)}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 flex items-center gap-1 text-[10px] text-gray-400">
                    <Clock className="w-3 h-3" />{relativeTime(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
