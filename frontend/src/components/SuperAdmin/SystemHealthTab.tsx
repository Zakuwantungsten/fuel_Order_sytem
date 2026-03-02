import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Server, Database, Users, Clock, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Cpu,
} from 'lucide-react';
import systemHealthService, { SystemHealth } from '../../services/systemHealthService';

interface SystemHealthTabProps {
  onMessage: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function formatBytesMB(mb: number) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
    />
  );
}

function MetricCard({
  label, value, sub, icon: Icon, color = 'text-indigo-500',
}: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function MemoryBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const barColor = pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span>
          {formatBytesMB(used)} / {formatBytesMB(total)} ({pct.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function SystemHealthTab({ onMessage }: SystemHealthTabProps) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await systemHealthService.get();
      setHealth(data);
    } catch {
      if (!silent) onMessage('Failed to load system health', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onMessage]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => load(true), 10_000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!health) return null;

  const dbOk = health.database.status === 'connected';
  const heapPct =
    health.process.memory.heapTotalMB > 0
      ? (health.process.memory.heapUsedMB / health.process.memory.heapTotalMB) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">System Health</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Last updated: {new Date(health.timestamp).toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-indigo-600"
            />
            Auto-refresh (10s)
          </label>
          <button
            onClick={() => load()}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={`flex items-center gap-3 p-4 rounded-xl border ${
          dbOk
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
        }`}
      >
        {dbOk ? (
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        ) : (
          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
        )}
        <div>
          <p
            className={`text-sm font-semibold ${
              dbOk
                ? 'text-green-800 dark:text-green-300'
                : 'text-red-800 dark:text-red-300'
            }`}
          >
            {dbOk ? 'All Systems Operational' : 'Database Connection Issue'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Uptime: {formatUptime(health.process.uptimeSeconds)} · Node{' '}
            {health.process.nodeVersion} · PID {health.process.pid}
          </p>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="Uptime"
          value={formatUptime(health.process.uptimeSeconds)}
          icon={Clock}
          color="text-indigo-500"
        />
        <MetricCard
          label="DB Status"
          value={health.database.status}
          sub={
            health.database.connections
              ? `${health.database.connections.current} connections`
              : undefined
          }
          icon={Database}
          color={dbOk ? 'text-green-500' : 'text-red-500'}
        />
        <MetricCard
          label="Active Sessions"
          value={health.sessions.active}
          icon={Users}
          color="text-blue-500"
        />
        <MetricCard
          label="Heap Usage"
          value={`${heapPct.toFixed(0)}%`}
          sub={`${formatBytesMB(health.process.memory.heapUsedMB)} used`}
          icon={Cpu}
          color={heapPct > 85 ? 'text-red-500' : heapPct > 65 ? 'text-amber-500' : 'text-green-500'}
        />
      </div>

      {/* Memory Details */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Memory Usage
          </h3>
        </div>
        <div className="space-y-3">
          <MemoryBar
            used={health.process.memory.heapUsedMB}
            total={health.process.memory.heapTotalMB}
            label="Heap"
          />
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span>RSS (Resident Set Size)</span>
            <span className="font-medium">{formatBytesMB(health.process.memory.rssMB)}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>External (C++ objects)</span>
            <span className="font-medium">{formatBytesMB(health.process.memory.externalMB)}</span>
          </div>
        </div>
      </div>

      {/* Database Details */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Database
          </h3>
          <StatusDot ok={dbOk} />
          <span className="text-xs text-gray-400 capitalize">{health.database.status}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {health.database.connections && (
            <>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {health.database.connections.current}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Current connections</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {health.database.connections.available}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Available</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {health.database.connections.totalCreated}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Total created</p>
              </div>
            </>
          )}
          {health.database.storage && (
            <>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatBytesMB(health.database.storage.dataSize / 1024 / 1024)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Data size</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatBytesMB(health.database.storage.storageSize / 1024 / 1024)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Storage size</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatBytesMB(health.database.storage.indexSize / 1024 / 1024)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Index size</p>
              </div>
            </>
          )}
          {!health.database.connections && !health.database.storage && (
            <p className="col-span-3 text-sm text-gray-400 italic">
              Database metrics unavailable — limited permissions or connection issue.
            </p>
          )}
        </div>
      </div>

      {/* Jobs Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Background Jobs
          </h3>
          <span className="ml-auto text-xs font-medium text-gray-500">
            {health.jobs.enabled}/{health.jobs.total} enabled
          </span>
        </div>
        <div className="space-y-2">
          {health.jobs.list.map((job) => (
            <div key={job.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    job.isEnabled
                      ? job.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{job.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {job.lastRunAt && (
                  <span className="text-xs text-gray-400">
                    {job.lastRunStatus === 'success' ? (
                      <CheckCircle className="w-3 h-3 text-green-500 inline mr-1" />
                    ) : job.lastRunStatus === 'error' ? (
                      <AlertTriangle className="w-3 h-3 text-red-500 inline mr-1" />
                    ) : null}
                    {new Date(job.lastRunAt).toLocaleTimeString('en-GB')}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    job.isEnabled
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}
                >
                  {job.isEnabled ? 'on' : 'off'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Process Info
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Node.js', health.process.nodeVersion],
            ['Platform', health.process.platform],
            ['PID', String(health.process.pid)],
            ['Collections', String(health.database.collections ?? 'N/A')],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50"
            >
              <span className="text-gray-500 dark:text-gray-400">{label}</span>
              <span className="font-mono text-gray-900 dark:text-white text-xs">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
