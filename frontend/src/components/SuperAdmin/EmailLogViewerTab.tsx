import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, Search, AlertTriangle, Loader2, X, Info } from 'lucide-react';
import apiClient from '../../services/api';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: 'audit' | 'logfile';
}

export const EmailLogViewerTab: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/email-logs', { params: { limit: 200 } });
      setLogs(res.data.data);
    } catch {
      setError('Failed to load email logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = search
    ? logs.filter((l) => l.message.toLowerCase().includes(search.toLowerCase()))
    : logs;

  const levelColor = (level: string) => {
    if (level === 'error') return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20';
    if (level === 'warn') return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20';
    return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email Log Viewer</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Email-related audit and server log entries</p>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-xs">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        Shows audit log entries for password resets and user creation, plus email-related server log lines.
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Filter logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Log list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No email log entries found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[600px] overflow-y-auto font-mono text-xs">
            {filtered.map((entry, idx) => (
              <div key={idx} className="px-4 py-3 flex gap-3 items-start hover:bg-gray-50 dark:hover:bg-gray-750">
                <span className="text-gray-400 dark:text-gray-500 shrink-0 w-40">
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
                </span>
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${levelColor(entry.level)}`}>
                  {entry.level}
                </span>
                <span className="text-gray-400 dark:text-gray-500 shrink-0 text-[10px] uppercase">
                  {entry.source}
                </span>
                <span className="text-gray-700 dark:text-gray-300 flex-1 break-all">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
            {filtered.length} entries shown{search ? ` (filtered from ${logs.length})` : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailLogViewerTab;
