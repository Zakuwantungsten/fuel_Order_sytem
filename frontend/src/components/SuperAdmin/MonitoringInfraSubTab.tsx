import { useState, useEffect } from 'react';
import {
  Activity, Database, Server, Cpu, Clock, Zap,
  RefreshCw, CheckCircle, XCircle, HardDrive, ArrowRight,
} from 'lucide-react';
import systemHealthService, { SystemHealth } from '../../services/systemHealthService';
import { systemAdminAPI } from '../../services/api';
import DatabaseMonitorTab from './DatabaseMonitorTab';
import SystemHealthTab from './SystemHealthTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type View = 'overview' | 'database' | 'system';

function formatUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export default function MonitoringInfraSubTab({ onMessage }: Props) {
  const [view, setView] = useState<View>('overview');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [dbMetrics, setDbMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // SystemHealthTab uses reversed onMessage order
  const reversedOnMessage = (msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [h, db] = await Promise.all([
        systemHealthService.get(),
        systemAdminAPI.getDatabaseMetrics(),
      ]);
      setHealth(h);
      setDbMetrics(db);
    } catch {
      // Silent — individual tabs handle their own errors
    } finally {
      setLoading(false);
    }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'database', label: 'Database Monitor' },
    { id: 'system', label: 'System Health' },
  ];

  const dbOk = health?.database?.status === 'connected';
  const heapPct = health?.process?.memory
    ? health.process.memory.heapTotalMB > 0
      ? (health.process.memory.heapUsedMB / health.process.memory.heapTotalMB) * 100
      : 0
    : 0;

  return (
    <div className="space-y-5">
      {/* Pill navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {v.label}
          </button>
        ))}
        {view === 'overview' && (
          <button
            onClick={loadOverview}
            disabled={loading}
            className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Overview */}
      {view === 'overview' && (
        <div className="space-y-5">
          {/* Status Banner */}
          {!loading && health && (
            <div
              className={`flex items-center gap-3 p-4 rounded-xl border ${
                dbOk
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                  : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
              }`}
            >
              {dbOk ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-semibold ${dbOk ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                  {dbOk ? 'All Systems Operational' : 'System Issue Detected'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Uptime: {formatUptime(health.process.uptimeSeconds)} · Node {health.process.nodeVersion} · PID {health.process.pid}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${dbOk ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
                {dbOk ? 'HEALTHY' : 'DEGRADED'}
              </span>
            </div>
          )}

          {/* Key Metrics Grid */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <MetricCard icon={Clock} label="Uptime" value={health ? formatUptime(health.process.uptimeSeconds) : '—'} color="text-indigo-500" />
              <MetricCard icon={Database} label="DB Status" value={health?.database?.status || '—'} color={dbOk ? 'text-green-500' : 'text-red-500'} />
              <MetricCard icon={Cpu} label="Heap Usage" value={`${heapPct.toFixed(0)}%`} color={heapPct > 85 ? 'text-red-500' : heapPct > 65 ? 'text-amber-500' : 'text-green-500'} />
              <MetricCard icon={Zap} label="Queries/s" value={dbMetrics?.performance?.queriesPerSecond ?? '—'} color="text-blue-500" />
              <MetricCard icon={Activity} label="Avg Response" value={dbMetrics?.performance?.averageResponseTime ? `${dbMetrics.performance.averageResponseTime}ms` : '—'} color="text-purple-500" />
              <MetricCard icon={HardDrive} label="DB Size" value={dbMetrics?.storage?.totalSize ? formatBytes(dbMetrics.storage.totalSize) : '—'} color="text-orange-500" />
            </div>
          )}

          {/* Quick-link cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QuickLink
              icon={Database}
              title="Database Monitor"
              description="Real-time connections, query performance, collection stats, and slow query detection"
              color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
              iconColor="text-blue-600 dark:text-blue-400"
              onClick={() => setView('database')}
            />
            <QuickLink
              icon={Server}
              title="System Health"
              description="Process info, memory usage, background jobs, database connections, and uptime metrics"
              color="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
              iconColor="text-emerald-600 dark:text-emerald-400"
              onClick={() => setView('system')}
            />
          </div>

          {/* Active Connections + Jobs Summary side by side */}
          {health && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Active Sessions */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  Active Sessions
                </h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">{health.sessions.active}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {health.database.connections
                    ? `${health.database.connections.current} DB connections · ${health.database.connections.available} available`
                    : 'DB connection info unavailable'}
                </p>
              </div>

              {/* Background Jobs */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500" />
                  Background Jobs
                </h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {health.jobs.enabled}<span className="text-base font-normal text-gray-400">/{health.jobs.total}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {health.jobs.list.filter(j => j.lastRunStatus === 'error').length > 0
                    ? `${health.jobs.list.filter(j => j.lastRunStatus === 'error').length} jobs with errors`
                    : 'All jobs running normally'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail views */}
      {view === 'database' && <DatabaseMonitorTab onMessage={onMessage} />}
      {view === 'system' && <SystemHealthTab onMessage={reversedOnMessage} />}
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────── */

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: string | number; color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white truncate">{value}</p>
    </div>
  );
}

function QuickLink({ icon: Icon, title, description, color, iconColor, onClick }: {
  icon: React.ElementType; title: string; description: string; color: string; iconColor: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md ${color}`}
    >
      <div className="shrink-0 mt-0.5">
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
    </button>
  );
}
