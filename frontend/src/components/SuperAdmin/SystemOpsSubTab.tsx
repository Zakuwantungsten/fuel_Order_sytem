import { useState, useEffect } from 'react';
import {
  Cpu, Wrench, Gauge, Database, RefreshCw, ArrowRight,
  CheckCircle, AlertTriangle, XCircle,
} from 'lucide-react';
import cronJobService from '../../services/cronJobService';
import maintenanceModeService from '../../services/maintenanceModeService';
import apiClient from '../../services/api';
import CronJobsTab from './CronJobsTab';
import MaintenanceModeTab from './MaintenanceModeTab';
import RateLimitConfigTab from './RateLimitConfigTab';
import DbIndexExplorerTab from './DbIndexExplorerTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type View = 'overview' | 'cron' | 'maintenance' | 'rate_limits' | 'db_indexes';

export default function SystemOpsSubTab({ onMessage }: Props) {
  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<{
    jobsEnabled: number; jobsTotal: number; jobErrors: number;
    maintenanceActive: boolean;
    indexCount: number; collectionCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Child tabs use reversed onMessage: (msg, type)
  const reversedOnMessage = (msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  };

  useEffect(() => { loadOverview(); }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [jobsRes, maintRes, idxRes] = await Promise.allSettled([
        cronJobService.list(),
        maintenanceModeService.getStatus(),
        apiClient.get('/system-admin/db-indexes'),
      ]);

      const jobs = jobsRes.status === 'fulfilled' ? jobsRes.value : [];
      const maint = maintRes.status === 'fulfilled' ? maintRes.value : null;
      const idxData = idxRes.status === 'fulfilled' ? idxRes.value.data?.data : null;

      setStats({
        jobsEnabled: Array.isArray(jobs) ? jobs.filter((j: any) => j.isEnabled).length : 0,
        jobsTotal: Array.isArray(jobs) ? jobs.length : 0,
        jobErrors: Array.isArray(jobs) ? jobs.filter((j: any) => j.status === 'error').length : 0,
        maintenanceActive: maint?.isEnabled ?? false,
        indexCount: Array.isArray(idxData) ? idxData.reduce((sum: number, c: any) => sum + (c.indexes?.length ?? 0), 0) : 0,
        collectionCount: Array.isArray(idxData) ? idxData.length : 0,
      });
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'cron', label: 'Cron Jobs' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'rate_limits', label: 'Rate Limits' },
    { id: 'db_indexes', label: 'DB Indexes' },
  ];

  return (
    <div className="space-y-5">
      {/* Pill nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}>{v.label}</button>
        ))}
        {view === 'overview' && (
          <button onClick={loadOverview} disabled={loading}
            className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {view === 'overview' && (
        <div className="space-y-5">
          {/* Maintenance status banner */}
          {!loading && stats && (
            <div className={`flex items-center gap-3 p-4 rounded-xl border ${
              stats.maintenanceActive
                ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            }`}>
              {stats.maintenanceActive
                ? <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                : <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />}
              <div className="flex-1">
                <p className={`text-sm font-semibold ${stats.maintenanceActive ? 'text-red-800 dark:text-red-300' : 'text-green-800 dark:text-green-300'}`}>
                  {stats.maintenanceActive ? 'Maintenance Mode ACTIVE' : 'System Online — All Services Normal'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {stats.jobsEnabled}/{stats.jobsTotal} jobs enabled
                  {stats.jobErrors > 0 && ` · ${stats.jobErrors} with errors`}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                stats.maintenanceActive
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                  : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
              }`}>
                {stats.maintenanceActive ? 'MAINTENANCE' : 'ONLINE'}
              </span>
            </div>
          )}

          {/* Stats */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-orange-500 animate-spin" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={Cpu} label="Cron Jobs" value={`${stats.jobsEnabled}/${stats.jobsTotal}`}
                color="text-blue-500" sub={stats.jobErrors > 0 ? `${stats.jobErrors} errors` : 'All OK'} />
              <StatCard icon={Wrench} label="Maintenance" value={stats.maintenanceActive ? 'ON' : 'OFF'}
                color={stats.maintenanceActive ? 'text-red-500' : 'text-green-500'} />
              <StatCard icon={Gauge} label="Rate Limits" value="Configured" color="text-amber-500" />
              <StatCard icon={Database} label="DB Indexes" value={String(stats.indexCount)}
                color="text-purple-500" sub={`${stats.collectionCount} collections`} />
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QuickLink icon={Cpu} title="Cron Jobs"
              description="View, enable/disable, and manually trigger scheduled background jobs"
              color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
              iconColor="text-blue-600 dark:text-blue-400" onClick={() => setView('cron')} />
            <QuickLink icon={Wrench} title="Maintenance Mode"
              description="Toggle maintenance mode, customize the user-facing message and allowed roles"
              color="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
              iconColor="text-red-600 dark:text-red-400" onClick={() => setView('maintenance')} />
            <QuickLink icon={Gauge} title="Rate Limits"
              description="Configure API rate limiting thresholds and view static per-route limits"
              color="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
              iconColor="text-amber-600 dark:text-amber-400" onClick={() => setView('rate_limits')} />
            <QuickLink icon={Database} title="DB Indexes"
              description="Browse MongoDB collection indexes, keys, uniqueness, and TTL settings"
              color="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
              iconColor="text-purple-600 dark:text-purple-400" onClick={() => setView('db_indexes')} />
          </div>
        </div>
      )}

      {view === 'cron' && <CronJobsTab onMessage={reversedOnMessage} />}
      {view === 'maintenance' && <MaintenanceModeTab onMessage={reversedOnMessage} />}
      {view === 'rate_limits' && <RateLimitConfigTab onMessage={reversedOnMessage} />}
      {view === 'db_indexes' && <DbIndexExplorerTab />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ElementType; label: string; value: string; color: string; sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
      <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function QuickLink({ icon: Icon, title, description, color, iconColor, onClick }: {
  icon: React.ElementType; title: string; description: string; color: string; iconColor: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md ${color}`}>
      <Icon className={`w-6 h-6 ${iconColor} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
    </button>
  );
}
