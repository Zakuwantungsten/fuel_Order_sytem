import { useState, useEffect } from 'react';
import { Clock, User, ArrowRight } from 'lucide-react';

interface AuditEntry {
  _id: string;
  timestamp: string;
  username: string;
  action: string;
  previousValue?: Record<string, any>;
  newValue?: Record<string, any>;
  details?: string;
  severity?: string;
}

interface RecordTimelineProps {
  fetchHistory: () => Promise<AuditEntry[]>;
  isOpen: boolean;
}

const RecordTimeline = ({ fetchHistory, isOpen }: RecordTimelineProps) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    fetchHistory()
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch(() => { if (!cancelled) setEntries([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, fetchHistory]);

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading history...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
        No history available.
      </div>
    );
  }

  const actionLabel: Record<string, string> = {
    CREATE: 'Created',
    UPDATE: 'Updated',
    DELETE: 'Deleted',
    RESTORE: 'Restored',
  };

  const actionColor: Record<string, string> = {
    CREATE: 'text-green-600 dark:text-green-400',
    UPDATE: 'text-blue-600 dark:text-blue-400',
    DELETE: 'text-red-600 dark:text-red-400',
    RESTORE: 'text-amber-600 dark:text-amber-400',
  };

  const diffFields = (prev?: Record<string, any>, next?: Record<string, any>) => {
    if (!prev || !next) return [];
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const diffs: { field: string; from: any; to: any }[] = [];
    keys.forEach((k) => {
      if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
        diffs.push({ field: k, from: prev[k], to: next[k] });
      }
    });
    return diffs;
  };

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
      {entries.map((entry) => {
        const diffs = diffFields(entry.previousValue, entry.newValue);
        return (
          <div
            key={entry._id}
            className="relative pl-6 pb-3 border-l-2 border-gray-200 dark:border-gray-700 last:border-transparent"
          >
            <div className="absolute left-[-5px] top-1 w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              {new Date(entry.timestamp).toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <User className="w-3 h-3 text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {entry.username}
              </span>
              <span className={`text-xs font-semibold ${actionColor[entry.action] || 'text-gray-600'}`}>
                {actionLabel[entry.action] || entry.action}
              </span>
            </div>
            {entry.details && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{entry.details}</p>
            )}
            {diffs.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {diffs.slice(0, 5).map((d) => (
                  <div key={d.field} className="flex items-center gap-1 text-xs">
                    <span className="font-medium text-gray-600 dark:text-gray-400">{d.field}:</span>
                    <span className="text-red-500 line-through">{String(d.from ?? '—')}</span>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                    <span className="text-green-600 dark:text-green-400">{String(d.to ?? '—')}</span>
                  </div>
                ))}
                {diffs.length > 5 && (
                  <span className="text-xs text-gray-400">+{diffs.length - 5} more fields</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RecordTimeline;
