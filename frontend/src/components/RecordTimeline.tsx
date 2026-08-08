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

interface FieldDiff {
  field: string;
  from: any;
  to: any;
}

interface RecordTimelineProps {
  fetchHistory: () => Promise<AuditEntry[]>;
  isOpen: boolean;
}

/** Human-readable audit value (avoids "[object Object]"). */
function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toLocaleString();
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((v) => formatAuditValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Common nested shapes
    if ('oldValue' in obj || 'newValue' in obj) {
      return formatAuditValue(obj.newValue ?? obj.oldValue);
    }
    if ('doNumber' in obj && Object.keys(obj).length <= 3) {
      return String(obj.doNumber);
    }
    try {
      return JSON.stringify(obj);
    } catch {
      return '—';
    }
  }
  return String(value);
}

function isChangeObject(item: unknown): item is { field: string; oldValue?: any; newValue?: any } {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as any).field === 'string' &&
    ('oldValue' in (item as any) || 'newValue' in (item as any))
  );
}

/**
 * Prefer explicit change arrays used by DeliveryOrder audits:
 *   previousValue.changes = ["truckNo", ...]  OR [{ field, oldValue, newValue }, ...]
 *   newValue.changes      = [{ field, oldValue, newValue }, ...]
 * Fall back to top-level key diffs for fuel-record / generic audits.
 */
function extractDiffs(prev?: Record<string, any>, next?: Record<string, any>): FieldDiff[] {
  const changeLists = [next?.changes, prev?.changes].filter(Array.isArray) as any[][];
  const objectChanges = changeLists.flat().filter(isChangeObject);

  if (objectChanges.length > 0) {
    const byField = new Map<string, FieldDiff>();
    for (const c of objectChanges) {
      byField.set(c.field, {
        field: c.field,
        from: c.oldValue,
        to: c.newValue,
      });
    }
    return Array.from(byField.values());
  }

  // Legacy DO shape: previous.changes = field name strings only, new.changes missing objects
  if (Array.isArray(prev?.changes) && prev.changes.every((c: unknown) => typeof c === 'string')) {
    // Nothing useful beyond field names — still list them as "changed" without values
    if (!Array.isArray(next?.changes) || next.changes.length === 0) {
      return (prev.changes as string[]).map((field) => ({
        field,
        from: '—',
        to: '(updated)',
      }));
    }
  }

  if (!prev || !next) return [];

  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const diffs: FieldDiff[] = [];
  keys.forEach((k) => {
    // Skip the changes bag when we already tried above; avoid raw array dumps
    if (k === 'changes') return;
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
      diffs.push({ field: k, from: prev[k], to: next[k] });
    }
  });
  return diffs;
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

  const isPendingPromotion = (entry: AuditEntry) =>
    /pending/i.test(entry.details || '') && /promot/i.test(entry.details || '');

  const isPendingMerge = (entry: AuditEntry) =>
    /merg/i.test(entry.details || '') ||
    !!(entry.newValue && (entry.newValue as any).merge) ||
    /merge_source/i.test(String((entry.previousValue as any)?.role || ''));

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
      {entries.map((entry) => {
        const diffs = extractDiffs(entry.previousValue, entry.newValue);
        const promotion = isPendingPromotion(entry);
        const merge = isPendingMerge(entry);
        const highlight = merge || promotion;
        const label = merge
          ? 'Merged pending → DO'
          : promotion
            ? 'Pending → Real DO'
            : (actionLabel[entry.action] || entry.action);
        return (
          <div
            key={entry._id}
            className={`relative pl-6 pb-3 border-l-2 last:border-transparent ${
              highlight
                ? merge
                  ? 'border-violet-300 dark:border-violet-700'
                  : 'border-amber-300 dark:border-amber-700'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div
              className={`absolute left-[-5px] top-1 w-2 h-2 rounded-full ${
                highlight
                  ? merge
                    ? 'bg-violet-500'
                    : 'bg-amber-500'
                  : 'bg-gray-400 dark:bg-gray-500'
              }`}
            />
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              {new Date(entry.timestamp).toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <User className="w-3 h-3 text-gray-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {entry.username}
              </span>
              <span className={`text-xs font-semibold ${
                merge
                  ? 'text-violet-700 dark:text-violet-300'
                  : actionColor[entry.action] || 'text-gray-600'
              }`}>
                {label}
              </span>
            </div>
            {entry.details && (
              <p className={`text-xs mt-0.5 ${
                merge
                  ? 'text-violet-800 dark:text-violet-300'
                  : promotion
                    ? 'text-amber-800 dark:text-amber-300'
                    : 'text-gray-500 dark:text-gray-400'
              }`}>
                {entry.details}
              </p>
            )}
            {diffs.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {diffs.slice(0, 8).map((d) => (
                  <div key={d.field} className="flex items-center gap-1 text-xs flex-wrap">
                    <span className="font-medium text-gray-600 dark:text-gray-400">{d.field}:</span>
                    <span className="text-red-500 line-through">{formatAuditValue(d.from)}</span>
                    <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                    <span className="text-green-600 dark:text-green-400">{formatAuditValue(d.to)}</span>
                  </div>
                ))}
                {diffs.length > 8 && (
                  <span className="text-xs text-gray-400">+{diffs.length - 8} more fields</span>
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
