import { useState, useEffect, useCallback } from 'react';
import {
  GitCompare,
  History,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Plus,
  Minus,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { configDiffService, ConfigChangeEntry } from '../../services/configDiffService';

interface Props {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// ─── Diff utilities ───────────────────────────────────────────────────────────

type DiffLine =
  | { type: 'added'; key: string; value: string }
  | { type: 'removed'; key: string; value: string }
  | { type: 'changed'; key: string; oldValue: string; newValue: string }
  | { type: 'unchanged'; key: string; value: string };

function flattenObj(obj: any, prefix = ''): Record<string, string> {
  if (obj === null || obj === undefined) return {};
  if (typeof obj !== 'object') return { [prefix || '(root)']: String(obj) };
  const result: Record<string, string> = {};
  for (const k of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    const val = obj[k];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObj(val, path));
    } else {
      result[path] = Array.isArray(val) ? JSON.stringify(val) : String(val ?? '');
    }
  }
  return result;
}

function computeDiff(prev: any, next: any): DiffLine[] {
  const prevFlat = flattenObj(prev);
  const nextFlat = flattenObj(next);
  const allKeys = new Set([...Object.keys(prevFlat), ...Object.keys(nextFlat)]);
  const lines: DiffLine[] = [];

  for (const key of allKeys) {
    const hasOld = key in prevFlat;
    const hasNew = key in nextFlat;
    if (!hasOld) {
      lines.push({ type: 'added', key, value: nextFlat[key] });
    } else if (!hasNew) {
      lines.push({ type: 'removed', key, value: prevFlat[key] });
    } else if (prevFlat[key] !== nextFlat[key]) {
      lines.push({ type: 'changed', key, oldValue: prevFlat[key], newValue: nextFlat[key] });
    } else {
      lines.push({ type: 'unchanged', key, value: prevFlat[key] });
    }
  }

  // Sort: changed first, added, removed, unchanged
  const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
  lines.sort((a, b) => order[a.type] - order[b.type] || a.key.localeCompare(b.key));
  return lines;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const ACTION_STYLES: Record<string, string> = {
  CONFIG_CHANGE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  UPDATE: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  ENABLE_MAINTENANCE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  DISABLE_MAINTENANCE: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function actionStyle(action: string) {
  return ACTION_STYLES[action] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
}

function DiffViewer({ entry }: { entry: ConfigChangeEntry }) {
  const [showRaw, setShowRaw] = useState(false);

  const hasDiff = entry.previousValue !== undefined || entry.newValue !== undefined;
  const diffLines = hasDiff ? computeDiff(entry.previousValue, entry.newValue) : [];
  const changedCount = diffLines.filter((l) => l.type !== 'unchanged').length;

  if (!hasDiff) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
        {entry.details ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Details</p>
            <p>{entry.details}</p>
          </div>
        ) : (
          <p className="italic">No diff data recorded for this change.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entry.details && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">{entry.details}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <Plus className="w-3 h-3" />{diffLines.filter((l) => l.type === 'added').length} added
          </span>
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <Minus className="w-3 h-3" />{diffLines.filter((l) => l.type === 'removed').length} removed
          </span>
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Edit3 className="w-3 h-3" />{diffLines.filter((l) => l.type === 'changed').length} changed
          </span>
        </div>
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 underline"
        >
          {showRaw ? 'Show diff' : 'Show raw JSON'}
        </button>
      </div>

      {showRaw ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">Before</p>
            <pre className="text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded p-3 overflow-auto max-h-60 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {JSON.stringify(entry.previousValue, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">After</p>
            <pre className="text-xs bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded p-3 overflow-auto max-h-60 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {JSON.stringify(entry.newValue, null, 2)}
            </pre>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-3 py-2 font-semibold text-gray-600 dark:text-gray-400 w-1/3">Field</th>
                <th className="text-left px-3 py-2 font-semibold text-red-600 dark:text-red-400 w-1/3">Before</th>
                <th className="text-left px-3 py-2 font-semibold text-green-600 dark:text-green-400 w-1/3">After</th>
              </tr>
            </thead>
            <tbody>
              {diffLines
                .filter((l) => l.type !== 'unchanged' || changedCount === 0)
                .map((line, i) => (
                  <tr
                    key={`${line.key}-${i}`}
                    className={`border-b border-gray-100 dark:border-gray-800 ${
                      line.type === 'added' ? 'bg-green-50/50 dark:bg-green-950/20' :
                      line.type === 'removed' ? 'bg-red-50/50 dark:bg-red-950/20' :
                      line.type === 'changed' ? 'bg-amber-50/50 dark:bg-amber-950/20' :
                      ''
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300 truncate max-w-0">
                      <span className="flex items-center gap-1">
                        {line.type === 'added' && <Plus className="w-3 h-3 text-green-500 flex-shrink-0" />}
                        {line.type === 'removed' && <Minus className="w-3 h-3 text-red-500 flex-shrink-0" />}
                        {line.type === 'changed' && <Edit3 className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                        <span className="truncate">{line.key}</span>
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-red-700 dark:text-red-300 truncate max-w-0">
                      {line.type === 'removed' ? line.value :
                       line.type === 'changed' ? line.oldValue :
                       line.type === 'unchanged' ? line.value : '—'}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-green-700 dark:text-green-300 truncate max-w-0">
                      {line.type === 'added' ? line.value :
                       line.type === 'changed' ? line.newValue :
                       line.type === 'unchanged' ? line.value : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConfigDiffTab({ onMessage }: Props) {
  const [entries, setEntries] = useState<ConfigChangeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterResource, setFilterResource] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Expanded entries
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const result = await configDiffService.getChanges({
        page,
        limit: 20,
        username: search || undefined,
        resourceType: filterResource || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      });
      setEntries(result.data);
      setPagination(result.pagination);
    } catch {
      onMessage('Failed to load config change history', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, filterResource, filterFrom, filterTo, onMessage]);

  const loadResourceTypes = useCallback(async () => {
    try {
      const types = await configDiffService.getResourceTypes();
      setResourceTypes(types);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    loadResourceTypes();
  }, [loadResourceTypes]);

  useEffect(() => {
    load(1);
  }, [load]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const severityDot: Record<string, string> = {
    low: 'bg-gray-400', medium: 'bg-amber-400', high: 'bg-orange-500', critical: 'bg-red-600',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
          <GitCompare className="w-5 h-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Config Change History</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Diff viewer for all configuration changes with before/after comparison</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-gray-100"
          />
        </div>
        <select
          value={filterResource}
          onChange={(e) => setFilterResource(e.target.value)}
          className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
        >
          <option value="">All resources</option>
          {resourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
          title="From date"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300"
          title="To date"
        />
      </div>

      {/* Total */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {pagination.total} change{pagination.total !== 1 ? 's' : ''} found
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No config changes found</p>
          <p className="text-xs mt-1">Config changes will appear here once they occur</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isExpanded = expanded.has(entry._id);
            const hasDiff = entry.previousValue !== undefined || entry.newValue !== undefined;
            return (
              <div
                key={entry._id}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-all shadow-sm hover:shadow-md"
              >
                <button
                  className="w-full px-4 py-3 flex items-center justify-between gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                  onClick={() => toggleExpand(entry._id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Severity dot */}
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${severityDot[entry.severity] ?? 'bg-gray-400'}`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${actionStyle(entry.action)}`}>
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                          {entry.resourceType}
                          {entry.resourceId ? `:${entry.resourceId.slice(-6)}` : ''}
                        </span>
                        {entry.outcome !== 'SUCCESS' && (
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />{entry.outcome}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <User className="w-3 h-3" />{entry.username}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="w-3 h-3" />
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                        {entry.ipAddress && (
                          <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{entry.ipAddress}</span>
                        )}
                      </div>
                      {!isExpanded && entry.details && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{entry.details}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasDiff && (
                      <span className="text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                        has diff
                      </span>
                    )}
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700">
                    <DiffViewer entry={entry} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Page {pagination.page} of {pagination.pages} · {pagination.total} total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => load(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors text-gray-700 dark:text-gray-300"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              onClick={() => load(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors text-gray-700 dark:text-gray-300"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
