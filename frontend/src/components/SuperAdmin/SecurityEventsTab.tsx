import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  Search,
  BarChart3,
  Clock,
  Globe,
  Filter,
  TrendingUp,
  Download,
} from 'lucide-react';
import { EventTimelineChart, SeverityDonutChart, DistributionBarChart } from './SecurityCharts';
import { useSecurityExport } from '../../hooks/useSecurityExport';

/* ───────── Types ───────── */

type SecurityEventType =
  | 'path_blocked' | 'ip_blocked' | 'auth_failure' | 'suspicious_404'
  | 'honeypot_hit' | 'ua_blocked' | 'rate_limited' | 'csrf_failure' | 'jwt_failure';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface SecurityEvent {
  _id: string;
  timestamp: string;
  ip: string;
  method: string;
  url: string;
  userAgent?: string;
  eventType: SecurityEventType;
  severity: Severity;
  metadata?: Record<string, any>;
  blocked: boolean;
  userId?: string;
  username?: string;
}

interface EventsPage {
  events: SecurityEvent[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface EventStats {
  hours: number;
  since: string;
  totalEvents: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
}

interface TopIP {
  ip: string;
  count: number;
  lastSeen: string;
  types: string[];
}

interface TimelineBucket {
  time: string;
  count: number;
}

/* ───────── Constants ───────── */

const EVENT_TYPE_LABELS: Record<string, string> = {
  path_blocked: 'Path Blocked',
  ip_blocked: 'IP Blocked',
  auth_failure: 'Auth Failure',
  suspicious_404: 'Suspicious 404',
  honeypot_hit: 'Honeypot Hit',
  ua_blocked: 'UA Blocked',
  rate_limited: 'Rate Limited',
  csrf_failure: 'CSRF Failure',
  jwt_failure: 'JWT Failure',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  path_blocked: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  ip_blocked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  auth_failure: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  suspicious_404: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  honeypot_hit: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  ua_blocked: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  rate_limited: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  csrf_failure: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  jwt_failure: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-400 text-yellow-900',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const API_BASE = '/api/v1/system-admin/security-events';

/* ───────── Helpers ───────── */

async function apiFetch<T>(path: string): Promise<T> {
  const token = sessionStorage.getItem('fuel_order_token');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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

export default function SecurityEventsTab() {
  const { exporting, exportSecurityEvents } = useSecurityExport();
  const [view, setView] = useState<'events' | 'stats'>('stats');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<EventStats | null>(null);
  const [topIPs, setTopIPs] = useState<TopIP[]>([]);
  const [timeline, setTimeline] = useState<TimelineBucket[]>([]);
  const [statsHours, setStatsHours] = useState(24);

  // Events list
  const [eventsPage, setEventsPage] = useState<EventsPage | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    eventType: '' as string,
    severity: '' as string,
    ip: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, ips, tl] = await Promise.all([
        apiFetch<EventStats>(`/stats?hours=${statsHours}`),
        apiFetch<TopIP[]>(`/top-ips?hours=${statsHours}&limit=10`),
        apiFetch<TimelineBucket[]>(`/timeline?hours=${statsHours}&bucket=60`),
      ]);
      setStats(s);
      setTopIPs(ips);
      setTimeline(tl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statsHours]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '50');
      if (filters.eventType) params.set('eventType', filters.eventType);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.ip) params.set('ip', filters.ip);
      const data = await apiFetch<EventsPage>(`?${params.toString()}`);
      setEventsPage(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    if (view === 'stats') fetchStats();
    else fetchEvents();
  }, [view, fetchStats, fetchEvents]);

  // Simple bar chart using CSS (unused, timeline is now Recharts)

  /* ───────── Render ───────── */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Security Events</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
            <button
              onClick={() => setView('stats')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                view === 'stats' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <BarChart3 className="w-4 h-4 inline mr-1" /> Dashboard
            </button>
            <button
              onClick={() => setView('events')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                view === 'events' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Clock className="w-4 h-4 inline mr-1" /> Events
            </button>
          </div>
          <button
            onClick={() => exportSecurityEvents(24)}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            title="Export events (last 24h) as CSV"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => (view === 'stats' ? fetchStats() : fetchEvents())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {/* ─── Stats Dashboard View ─── */}
      {view === 'stats' && stats && (
        <>
          {/* Time range selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Time range:</span>
            {[1, 6, 24, 72, 168, 720].map(h => (
              <button
                key={h}
                onClick={() => setStatsHours(h)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                  statsHours === h
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Events</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stats.totalEvents.toLocaleString()}</p>
            </div>
            {(['critical', 'high', 'medium', 'low'] as const).map(sev => (
              <div key={sev} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{sev}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{(stats.bySeverity[sev] || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Timeline chart + Severity breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Timeline chart */}
            {timeline.length > 0 && (
              <div className="lg:col-span-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Event Timeline
                </h3>
                <EventTimelineChart
                  data={timeline.map(b => ({ time: b.time, count: b.count }))}
                  height={160}
                />
              </div>
            )}

            {/* Severity donut */}
            {stats && Object.keys(stats.bySeverity).length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Severity Breakdown</h3>
                <SeverityDonutChart
                  data={Object.entries(stats.bySeverity).map(([name, value]) => ({ name, value }))}
                  height={160}
                />
              </div>
            )}
          </div>

          {/* Two-column: By Type + Top IPs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By type */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Events by Type</h3>
              {Object.keys(stats.byType).length === 0 ? (
                <p className="text-xs text-gray-400">No events in this period</p>
              ) : (
                <DistributionBarChart
                  data={Object.entries(stats.byType)
                    .sort(([, a], [, b]) => b - a)
                    .map(([name, value]) => ({ name: EVENT_TYPE_LABELS[name] || name, value }))}
                  height={200}
                  layout="horizontal"
                />
              )}
            </div>

            {/* Top IPs */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Top Offending IPs
              </h3>
              {topIPs.length === 0 ? (
                <p className="text-xs text-gray-400">No events in this period</p>
              ) : (
                <div className="space-y-2">
                  {topIPs.map(ip => (
                    <div key={ip.ip} className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-gray-900 dark:text-white">{ip.ip}</span>
                        <div className="flex gap-1 mt-0.5">
                          {ip.types.map(t => (
                            <span key={t} className={`px-1.5 py-0 rounded text-[10px] ${EVENT_TYPE_COLORS[t] || 'bg-gray-100 dark:bg-gray-700'}`}>
                              {EVENT_TYPE_LABELS[t] || t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{ip.count}</span>
                        <p className="text-[10px] text-gray-400">{relativeTime(ip.lastSeen)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Events List View ─── */}
      {view === 'events' && (
        <>
          {/* Filters */}
          <div className="space-y-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              <Filter className="w-4 h-4" /> Filters <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Event Type</label>
                  <select
                    value={filters.eventType}
                    onChange={e => { setFilters(f => ({ ...f, eventType: e.target.value })); setPage(1); }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">All Types</option>
                    {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Severity</label>
                  <select
                    value={filters.severity}
                    onChange={e => { setFilters(f => ({ ...f, severity: e.target.value })); setPage(1); }}
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
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">IP Address</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={filters.ip}
                      onChange={e => { setFilters(f => ({ ...f, ip: e.target.value })); setPage(1); }}
                      placeholder="Filter by IP"
                      className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Events Table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {!eventsPage || eventsPage.events.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <p className="font-medium">No security events found</p>
                <p className="text-xs mt-1">Adjust filters or wait for events to occur.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50 text-left">
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Time</th>
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Type</th>
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Severity</th>
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">IP</th>
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Method</th>
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">URL</th>
                        <th className="px-4 py-2.5 font-medium text-gray-600 dark:text-gray-400">Blocked</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {eventsPage.events.map(evt => (
                        <tr key={evt._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{relativeTime(evt.timestamp)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_TYPE_COLORS[evt.eventType] || 'bg-gray-100 dark:bg-gray-700'}`}>
                              {EVENT_TYPE_LABELS[evt.eventType] || evt.eventType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[evt.severity]}`}>
                              {evt.severity}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs">{evt.ip}</td>
                          <td className="px-4 py-2.5 text-xs font-medium">{evt.method}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400 max-w-[200px] truncate" title={evt.url}>{evt.url}</td>
                          <td className="px-4 py-2.5">
                            {evt.blocked ? (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Yes</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">No</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {eventsPage.pages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Page {eventsPage.page} of {eventsPage.pages} ({eventsPage.total.toLocaleString()} total)
                    </p>
                    <div className="flex gap-1">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        disabled={page >= eventsPage.pages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
