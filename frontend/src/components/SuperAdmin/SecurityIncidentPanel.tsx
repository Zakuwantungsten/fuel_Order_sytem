/**
 * SecurityIncidentPanel — Incident lifecycle management.
 * Create, track, investigate, and resolve security incidents.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, RefreshCw, CheckCircle, Eye, Search as SearchIcon,
  ShieldAlert, ChevronDown, ChevronRight, MessageSquare,
  Loader2, Send, Clock, FileText, Link2, Plus, Users,
  ArrowUpRight, Target, BarChart3,
} from 'lucide-react';

/* ───────── Types ───────── */

type IncidentStatus = 'new' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive' | 'escalated';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface IncidentNote {
  author: string;
  authorId: string;
  text: string;
  createdAt: string;
}

interface Incident {
  _id: string;
  incidentId: string;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  description?: string;
  assignedTo?: string;
  linkedAlerts: string[];
  linkedEvents: string[];
  notes: IncidentNote[];
  createdBy?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  rootCause?: string;
  impactAssessment?: string;
  createdAt: string;
  updatedAt: string;
}

interface IncidentStats {
  open: number;
  investigating: number;
  resolvedThisWeek: number;
  total: number;
  mttrHours: number | null;
}

interface IncidentsPage {
  incidents: Incident[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/* ───────── Constants ───────── */

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-l-red-500', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500 animate-pulse' },
  high:     { bg: 'bg-orange-50 dark:bg-orange-900/10', border: 'border-l-orange-500', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  medium:   { bg: 'bg-yellow-50 dark:bg-yellow-900/10', border: 'border-l-yellow-500', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low:      { bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-l-blue-500', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
};

const STATUS_CONFIG: Record<IncidentStatus, { label: string; icon: React.ReactNode; color: string }> = {
  new:           { label: 'New', icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  acknowledged:  { label: 'Acknowledged', icon: <Eye className="w-3.5 h-3.5" />, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  investigating: { label: 'Investigating', icon: <SearchIcon className="w-3.5 h-3.5" />, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  escalated:     { label: 'Escalated', icon: <ArrowUpRight className="w-3.5 h-3.5" />, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  resolved:      { label: 'Resolved', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  false_positive: { label: 'False Positive', icon: <Target className="w-3.5 h-3.5" />, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
};

const API_BASE = '/api/v1/system-admin/incidents';

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

export default function SecurityIncidentPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incidentsPage, setIncidentsPage] = useState<IncidentsPage | null>(null);
  const [stats, setStats] = useState<IncidentStats | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('new,acknowledged,investigating,escalated');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', severity: 'medium' as Severity, assignedTo: '' });

  // Root cause dialog state
  const [rootCauseId, setRootCauseId] = useState<string | null>(null);
  const [rootCauseForm, setRootCauseForm] = useState({ rootCause: '', impactAssessment: '' });

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);
      const data = await apiFetch<IncidentsPage>(`?${params.toString()}`);
      setIncidentsPage(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiFetch<IncidentStats>('/stats');
      setStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchIncidents(); fetchStats(); }, [fetchIncidents, fetchStats]);

  const performStatusUpdate = async (id: string, status: string) => {
    setActionLoading(id);
    try {
      await apiFetch(`/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await fetchIncidents();
      await fetchStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const addNote = async (id: string) => {
    if (!noteText.trim()) return;
    setActionLoading(id);
    try {
      await apiFetch(`/${id}/note`, {
        method: 'POST',
        body: JSON.stringify({ text: noteText.trim() }),
      });
      setNoteText('');
      await fetchIncidents();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const createIncident = async () => {
    if (!createForm.title.trim()) return;
    setActionLoading('create');
    try {
      await apiFetch('', {
        method: 'POST',
        body: JSON.stringify({
          title: createForm.title.trim(),
          description: createForm.description.trim(),
          severity: createForm.severity,
          assignedTo: createForm.assignedTo.trim() || undefined,
        }),
      });
      setShowCreate(false);
      setCreateForm({ title: '', description: '', severity: 'medium', assignedTo: '' });
      await fetchIncidents();
      await fetchStats();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const submitRootCause = async () => {
    if (!rootCauseId || !rootCauseForm.rootCause.trim()) return;
    setActionLoading(rootCauseId);
    try {
      await apiFetch(`/${rootCauseId}/root-cause`, {
        method: 'PATCH',
        body: JSON.stringify({
          rootCause: rootCauseForm.rootCause.trim(),
          impactAssessment: rootCauseForm.impactAssessment.trim() || undefined,
        }),
      });
      setRootCauseId(null);
      setRootCauseForm({ rootCause: '', impactAssessment: '' });
      await fetchIncidents();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Open</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stats.open}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <SearchIcon className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Investigating</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stats.investigating}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">Resolved (7d)</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{stats.resolvedThisWeek}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              <span className="text-xs text-gray-500 dark:text-gray-400">MTTR</span>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">
              {stats.mttrHours != null ? `${stats.mttrHours}h` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-indigo-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Incidents</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Status filters */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => { setStatusFilter('new,acknowledged,investigating,escalated'); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === 'new,acknowledged,investigating,escalated' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >Active</button>
            <button
              onClick={() => { setStatusFilter('resolved,false_positive'); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === 'resolved,false_positive' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >Resolved</button>
            <button
              onClick={() => { setStatusFilter(''); setPage(1); }}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                statusFilter === '' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >All</button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
          <button
            onClick={() => { fetchIncidents(); fetchStats(); }}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Create Incident</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title *</label>
              <input
                type="text"
                value={createForm.title}
                onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Incident title"
                maxLength={200}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Severity</label>
                <select
                  value={createForm.severity}
                  onChange={e => setCreateForm(f => ({ ...f, severity: e.target.value as Severity }))}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Assign to</label>
                <input
                  type="text"
                  value={createForm.assignedTo}
                  onChange={e => setCreateForm(f => ({ ...f, assignedTo: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Username (optional)"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
            <textarea
              value={createForm.description}
              onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="Describe the incident..."
              maxLength={5000}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >Cancel</button>
            <button
              onClick={createIncident}
              disabled={!createForm.title.trim() || actionLoading === 'create'}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {actionLoading === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Root Cause Dialog */}
      {rootCauseId && (
        <div className="bg-white dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Set Root Cause Analysis</h4>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Root Cause *</label>
            <textarea
              value={rootCauseForm.rootCause}
              onChange={e => setRootCauseForm(f => ({ ...f, rootCause: e.target.value }))}
              rows={2}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="What caused this incident?"
              maxLength={5000}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Impact Assessment</label>
            <textarea
              value={rootCauseForm.impactAssessment}
              onChange={e => setRootCauseForm(f => ({ ...f, impactAssessment: e.target.value }))}
              rows={2}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="What was the impact?"
              maxLength={5000}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setRootCauseId(null)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            <button
              onClick={submitRootCause}
              disabled={!rootCauseForm.rootCause.trim() || actionLoading === rootCauseId}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >Save</button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* Incident List */}
      {loading && !incidentsPage ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : !incidentsPage || incidentsPage.incidents.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">No incidents found</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {statusFilter.includes('new') ? 'All clear — no active incidents.' : 'No incidents match the current filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidentsPage.incidents.map(incident => {
            const ss = SEVERITY_STYLES[incident.severity];
            const st = STATUS_CONFIG[incident.status];
            const isExpanded = expandedId === incident._id;
            const isActioning = actionLoading === incident._id;

            return (
              <div
                key={incident._id}
                className={`border-l-4 ${ss.border} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden`}
              >
                {/* Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full ${ss.dot}`} />
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{incident.incidentId}</span>
                        <span className={`text-xs font-semibold uppercase ${ss.text}`}>{incident.severity}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          {st.icon} {st.label}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mt-1.5 line-clamp-1">{incident.title}</h3>
                      {incident.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{incident.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{relativeTime(incident.createdAt)}</span>
                        {incident.assignedTo && (
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{incident.assignedTo}</span>
                        )}
                        {incident.linkedAlerts.length > 0 && (
                          <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />{incident.linkedAlerts.length} alert{incident.linkedAlerts.length !== 1 ? 's' : ''}</span>
                        )}
                        {incident.notes.length > 0 && (
                          <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{incident.notes.length} note{incident.notes.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {incident.status === 'new' && (
                        <>
                          <button
                            onClick={() => performStatusUpdate(incident._id, 'acknowledged')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:hover:bg-yellow-900/50 transition-colors"
                          >Acknowledge</button>
                          <button
                            onClick={() => performStatusUpdate(incident._id, 'investigating')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                          >Investigate</button>
                        </>
                      )}
                      {(incident.status === 'acknowledged' || incident.status === 'investigating') && (
                        <>
                          <button
                            onClick={() => performStatusUpdate(incident._id, 'escalated')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 transition-colors"
                          >Escalate</button>
                          <button
                            onClick={() => performStatusUpdate(incident._id, 'resolved')}
                            disabled={isActioning}
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors"
                          >Resolve</button>
                        </>
                      )}
                      {incident.status === 'escalated' && (
                        <button
                          onClick={() => performStatusUpdate(incident._id, 'resolved')}
                          disabled={isActioning}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 transition-colors"
                        >Resolve</button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : incident._id)}
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
                    {/* Timeline */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">Created</span>
                        <p className="text-gray-700 dark:text-gray-300">{new Date(incident.createdAt).toLocaleString()}</p>
                        {incident.createdBy && <p className="text-gray-400 text-[10px]">by {incident.createdBy}</p>}
                      </div>
                      {incident.acknowledgedBy && (
                        <div>
                          <span className="text-gray-400">Acknowledged</span>
                          <p className="text-gray-700 dark:text-gray-300">{incident.acknowledgedBy}</p>
                          {incident.acknowledgedAt && <p className="text-gray-400 text-[10px]">{relativeTime(incident.acknowledgedAt)}</p>}
                        </div>
                      )}
                      {incident.resolvedBy && (
                        <div>
                          <span className="text-gray-400">Resolved</span>
                          <p className="text-gray-700 dark:text-gray-300">{incident.resolvedBy}</p>
                          {incident.resolvedAt && <p className="text-gray-400 text-[10px]">{relativeTime(incident.resolvedAt)}</p>}
                        </div>
                      )}
                      {incident.assignedTo && (
                        <div>
                          <span className="text-gray-400">Assigned to</span>
                          <p className="text-gray-700 dark:text-gray-300">{incident.assignedTo}</p>
                        </div>
                      )}
                    </div>

                    {/* Linked evidence */}
                    {(incident.linkedAlerts.length > 0 || incident.linkedEvents.length > 0) && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Linked Evidence</p>
                        <div className="flex flex-wrap gap-1.5">
                          {incident.linkedAlerts.map(id => (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                              <ShieldAlert className="w-3 h-3" /> Alert {id.slice(-6)}
                            </span>
                          ))}
                          {incident.linkedEvents.map(id => (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                              <Eye className="w-3 h-3" /> Event {id.slice(-6)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Root cause */}
                    {incident.rootCause && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Root Cause</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 rounded-lg px-3 py-2">{incident.rootCause}</p>
                      </div>
                    )}
                    {incident.impactAssessment && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Impact Assessment</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700/50 rounded-lg px-3 py-2">{incident.impactAssessment}</p>
                      </div>
                    )}

                    {/* Action: set root cause */}
                    {!incident.rootCause && incident.status !== 'new' && (
                      <button
                        onClick={() => { setRootCauseId(incident._id); setRootCauseForm({ rootCause: '', impactAssessment: '' }); }}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >+ Set Root Cause Analysis</button>
                    )}

                    {/* Notes */}
                    {incident.notes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Investigation Notes</p>
                        <div className="space-y-2">
                          {incident.notes.map((note, i) => (
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
                    {incident.status !== 'resolved' && incident.status !== 'false_positive' && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={expandedId === incident._id ? noteText : ''}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder="Add investigation note..."
                          className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          onKeyDown={e => { if (e.key === 'Enter') addNote(incident._id); }}
                          maxLength={2000}
                        />
                        <button
                          onClick={() => addNote(incident._id)}
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
          {incidentsPage.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Page {incidentsPage.page} of {incidentsPage.pages} ({incidentsPage.total.toLocaleString()} total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-40"
                >Previous</button>
                <button
                  disabled={page >= incidentsPage.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
