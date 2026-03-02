import React, { useState, useEffect } from 'react';
import { TrendingUp, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import apiClient from '../../services/api';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

const PERIOD_OPTIONS = [7, 14, 30, 60, 90];

interface MetricsData {
  period: { days: number; since: string };
  totalRequests: number;
  failureCount: number;
  failureRate: string;
  topActions: { action: string; count: number }[];
  hourlyDistribution: { hour: number; count: number }[];
  topUsers: { username: string; requests: number }[];
  severityBreakdown: { severity: string; count: number }[];
}

export const PerformanceMetricsTab: React.FC = () => {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/performance-metrics', { params: { days } });
      setData(res.data.data);
    } catch {
      setError('Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
            <TrendingUp className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Performance Metrics</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Action counts, user load, and error rates from audit logs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
            {PERIOD_OPTIONS.map((d) => (
              <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 text-xs font-medium transition-colors ${days === d ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}>{d}d</button>
            ))}
          </div>
          <button onClick={fetchData} disabled={loading} className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
      ) : data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Events', value: data.totalRequests.toLocaleString() },
              { label: 'Failures', value: data.failureCount.toLocaleString(), color: 'text-red-500' },
              { label: 'Failure Rate', value: `${data.failureRate}%`, color: Number(data.failureRate) > 5 ? 'text-red-500' : 'text-green-600 dark:text-green-400' },
              { label: 'Action Types', value: data.topActions.length },
            ].map((k) => (
              <div key={k.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
                <p className={`text-2xl font-bold mt-1 ${k.color || 'text-gray-900 dark:text-white'}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Hourly chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-4">Events by Hour of Day</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.hourlyDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val) => [val, 'Events']} labelFormatter={(h) => `Hour ${h}:00`} />
                <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top actions */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-4">Top Actions</h3>
              <div className="space-y-2">
                {data.topActions.slice(0, 10).map((a, idx) => {
                  const maxCount = data.topActions[0]?.count || 1;
                  return (
                    <div key={a.action} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-4">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{a.action}</span>
                          <span className="text-xs text-gray-500">{a.count.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(a.count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Severity pie */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-4">Severity Breakdown</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.severityBreakdown} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {data.severityBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top users */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <h3 className="font-medium text-gray-900 dark:text-white text-sm mb-4">Top Users by Event Volume</h3>
            <div className="space-y-2">
              {data.topUsers.map((u, idx) => {
                const max = data.topUsers[0]?.requests || 1;
                return (
                  <div key={u.username} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-4">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">@{u.username}</span>
                        <span className="text-xs text-gray-500">{u.requests.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(u.requests / max) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PerformanceMetricsTab;
