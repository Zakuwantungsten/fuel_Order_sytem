/**
 * SecurityAlertsSubTab — Persistent, actionable alert queue.
 * Shows unresolved alerts with acknowledge/investigate/resolve workflow.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Bell, RefreshCw, AlertTriangle, CheckCircle, Eye, Search as SearchIcon,
  ShieldAlert, XCircle, ChevronDown, ChevronRight, MessageSquare,
  Filter, Loader2, Send, Clock,
} from 'lucide-react';
import SecurityIncidentPanel from './SecurityIncidentPanel';

/* ───────── Types ───────── */

type AlertStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

interface AlertNote {
  author: string;
  authorId: string;
  text: string;
  createdAt: string;
}

interface SecurityAlert {
  _id: string;
  severity: AlertSeverity;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  status: AlertStatus;
  createdAt: string;
  updatedAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  notes: AlertNote[];
  relatedIP?: string;
  relatedUsername?: string;
}

interface AlertsPage {
  alerts: SecurityAlert[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/* ───────── Constants ───────── */

const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-l-red-500', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500 animate-pulse' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-900/10', border: 'border-l-orange-500', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  medium:   { bg: 'bg-yellow-50 dark:bg-yellow-900/10', border: 'border-l-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low:      { bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
};

const STATUS_LABELS: Record<AlertStatus, { label: string; icon: React.ReactNode; color: string }> = {
  new:           { label: 'New', icon: <Bell className="w-3.5 h-3.5" />, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  acknowledged:  { label: 'Acknowledged', icon: <Eye className="w-3.5 h-3.5" />, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  investigating: { label: 'Investigating', icon: <SearchIcon className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  resolved:      { label: 'Resolved', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  false_positive: { label: 'False Positive', icon: <XCircle className="w-3.5 h-3.5" />, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const TYPE_LABELS: Record<string, string> = {
  security_event: 'Security Event',
  auth_failure: 'Auth Failure',
  ueba_anomaly: 'UEBA Anomaly',
  autoblock_trigger: 'Auto-Block',
  break_glass_used: 'Break-Glass',
  score_regression: 'Score Regression',
  policy_change: 'Policy Change',
  brute_force: 'Brute Force',
  mfa_bypass: 'MFA Bypass',
};

const API_BASE = '/api/v1/system-admin/security-alerts';

/* ───────── Helpers ───────── */

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem('fuel_order_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message || 'Request failed');
  return json.data;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

/* ───────── Component ───────── */

export default function SecurityAlertsSubTab() {
  const [section, setSection] = useState<'alerts' | 'incidents'>('alerts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertsPage, setAlertsPage] = useState<AlertsPage | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('new,acknowledged,investigating');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '30');
      if (statusFilter) params.set('status', statusFilter);
      if (severityFilter) params.set('severity', severityFilter);
      const data = await apiFetch<AlertsPage>(`?${params.toString()}`);
      setAlertsPage(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, severityFilter]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const performAction = async (alertId: string, action: string, body?: any) => {
    setActionLoading(alertId);
    try {
      await apiFetch(`/${alertId}/${action}`, {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : undefined,
      });
      await fetchAlerts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const addNote = async (alertId: string) => {
    if (!noteText.trim()) return;
    await performAction(alertId, 'note', { text: noteText.trim() });
    setNoteText('');
  };

  const unresolvedCount = alertsPage?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Section pills */}
      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
        <button
          onClick={() => setSection('alerts')}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            section === 'alerts' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <ShieldAlert className="w-4 h-4" /> Alerts
        </button>
        <button
          onClick={() => setSection('incidents')}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            section === 'incidents' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Incidents
        </button>
      </div>

      {section === 'incidents' && <SecurityIncidentPanel />}

      {section === 'alerts' && (<>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Security Alerts</h2>
          {unresolvedCount > 0 && statusFilter.includes('new') && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {unresolvedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Status quick filters */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => { setStatusFilter('new,acknowledged,investigating'); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === 'new,acknowledged,investigating' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => { setStatusFilter('resolved,false_positive'); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === 'resolved,false_positive' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => { setStatusFilter(''); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === '' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              All
            </button>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={fetchAlerts}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="grid grid-cols-2 gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={e => { setSeverityFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="investigating">Investigating</option>
              <option value="new,acknowledged,investigating">Active (all)</option>
              <option value="resolved">Resolved</option>
              <option value="false_positive">False Positive</option>
              <option value="resolved,false_positive">Closed</option>
            </select>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Alert List */}
      {loading && !alertsPage ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : !alertsPage || alertsPage.alerts.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">No alerts found</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {statusFilter.includes('new') ? 'All clear! No active security alerts.' : 'No alerts match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertsPage.alerts.map(alert => {
            const ss = SEVERITY_STYLES[alert.severity];
            const st = STATUS_LABELS[alert.status];
            const isExpanded = expandedId === alert._id;
            const isActioning = actionLoading === alert._id;

            return (
              <div
                key={alert._id}
                className={`border-l-4 ${ss.border} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden`}
              >
                {/* Alert header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full ${ss.dot}`} />
                        <span className={`text-xs font-semibold uppercase ${ss.text}`}>{alert.severity}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.icon} {st.label}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                          {TYPE_LABELS[alert.type] || alert.type}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mt-1.5 line-clamp-1">{alert.title}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{relativeTime(alert.createdAt)}</span>
                        {alert.relatedIP && <span>IP: {alert.relatedIP}</span>}
                        {alert.relatedUsername && <span>User: {alert.relatedUsername}</span>}
                        {alert.notes.length > 0 && (
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{alert.notes.length} note{alert.notes.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {alert.status === 'new' && (
                        <>
                          <button
                            onClick={() => performAction(alert._id, 'acknowledge')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50 transition-colors"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => performAction(alert._id, 'investigate')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                          >
                            Investigate
                          </button>
                        </>
                      )}
                      {(alert.status === 'acknowledged' || alert.status === 'investigating') && (
                        <>
                          <button
                            onClick={() => performAction(alert._id, 'resolve')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => performAction(alert._id, 'false-positive')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 transition-colors"
                          >
                            False +
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : alert._id)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
                    {/* Metadata */}
                    {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Details</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {Object.entries(alert.metadata).map(([k, v]) => (
                            <div key={k} className="bg-white dark:bg-gray-700/50 rounded px-2.5 py-1.5">
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase">{k}</span>
                              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{String(v)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Timeline info */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">Created</span>
                        <p className="text-gray-700 dark:text-gray-300">{new Date(alert.createdAt).toLocaleString()}</p>
                      </div>
                      {alert.acknowledgedBy && (
                        <div>
                          <span className="text-gray-400">Acknowledged by</span>
                          <p className="text-gray-700 dark:text-gray-300">{alert.acknowledgedBy} · {alert.acknowledgedAt ? relativeTime(alert.acknowledgedAt) : ''}</p>
                        </div>
                      )}
                      {alert.resolvedBy && (
                        <div>
                          <span className="text-gray-400">Resolved by</span>
                          <p className="text-gray-700 dark:text-gray-300">{alert.resolvedBy} · {alert.resolvedAt ? relativeTime(alert.resolvedAt) : ''}</p>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {alert.notes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Investigation Notes</p>
                        <div className="space-y-2">
                          {alert.notes.map((note, i) => (
                            <div key={i} className="bg-white dark:bg-gray-700/50 rounded-lg px-3 py-2">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{note.author}</span>
                                <span className="text-[10px] text-gray-400">{relativeTime(note.createdAt)}</span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">{note.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add note */}
                    {alert.status !== 'resolved' && alert.status !== 'false_positive' && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={expandedId === alert._id ? noteText : ''}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Add investigation note..."
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          onKeyDown={e => { if (e.key === 'Enter') addNote(alert._id); }}
                          maxLength={2000}
                        />
                        <button
                          onClick={() => addNote(alert._id)}
                          disabled={!noteText.trim() || isActioning}
                          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {alertsPage.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {alertsPage.page} of {alertsPage.pages} ({alertsPage.total.toLocaleString()} total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= alertsPage.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </>)}
    </div>
  );
}
