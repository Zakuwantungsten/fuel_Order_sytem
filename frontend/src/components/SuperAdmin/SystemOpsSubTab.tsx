import { useState, useEffect, useCallback } from 'react';
import { Cpu, Wrench, Gauge, Database, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
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

// ── Shared primitives ───────────────────────────────────────────────────────

function StatTile({ label, value, sub, icon: Icon, iconBg, iconColor }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; iconBg: string; iconColor: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-[#E4E7EC] dark:border-gray-700 rounded-xl p-4 flex items-center gap-3.5 min-w-0">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
        <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <div className="text-[22px] font-extrabold text-[#111827] dark:text-gray-100 leading-none">{value}</div>
        <div className="text-[12px] text-[#6B7280] dark:text-gray-400 mt-1">{label}</div>
        {sub && <div className="text-[11px] text-[#9CA3AF] dark:text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function SectionDivider({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[#E4E7EC] dark:bg-gray-700" />
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#E4E7EC] dark:border-gray-700 bg-white dark:bg-gray-800">
        {Icon && <Icon className="w-3 h-3 text-[#9CA3AF] dark:text-gray-500" />}
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#9CA3AF] dark:text-gray-500">{label}</span>
      </div>
      <div className="h-px flex-1 bg-[#E4E7EC] dark:bg-gray-700" />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function SystemOpsSubTab({ onMessage }: Props) {
  const [stats, setStats] = useState<{
    jobsEnabled: number; jobsTotal: number; jobErrors: number;
    maintenanceActive: boolean;
    indexCount: number; collectionCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fwd = useCallback((msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  }, [onMessage]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, maintRes, idxRes] = await Promise.allSettled([
        cronJobService.list(),
        maintenanceModeService.getStatus(),
        apiClient.get('/system-admin/db-indexes'),
      ]);
      const jobs    = jobsRes.status  === 'fulfilled' ? jobsRes.value       : [];
      const maint   = maintRes.status === 'fulfilled' ? maintRes.value      : null;
      const idxData = idxRes.status   === 'fulfilled' ? idxRes.value.data?.data : null;

      setStats({
        jobsEnabled:       Array.isArray(jobs) ? jobs.filter((j: any) => j.isEnabled).length  : 0,
        jobsTotal:         Array.isArray(jobs) ? jobs.length                                   : 0,
        jobErrors:         Array.isArray(jobs) ? jobs.filter((j: any) => j.status === 'error').length : 0,
        maintenanceActive: (maint as any)?.enabled ?? (maint as any)?.isEnabled ?? false,
        indexCount:        Array.isArray(idxData) ? idxData.reduce((s: number, c: any) => s + (c.indexes?.length ?? 0), 0) : 0,
        collectionCount:   Array.isArray(idxData) ? idxData.length : 0,
      });
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="p-6 space-y-6">
      {/* ── Stat tiles ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center gap-2 py-6">
          <RefreshCw className="w-4 h-4 text-[#4F46E5] animate-spin" />
          <span className="text-[13px] text-[#6B7280] dark:text-gray-400">Loading…</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile label="Cron Jobs Active"  value={`${stats?.jobsEnabled ?? 0}/${stats?.jobsTotal ?? 0}`}
            sub={stats?.jobErrors ? `${stats.jobErrors} with errors` : 'All OK'}
            icon={Cpu}      iconBg="#EFF6FF" iconColor="#2563EB" />
          <StatTile label="Maintenance"       value={stats?.maintenanceActive ? 'ON' : 'OFF'}
            icon={Wrench}   iconBg={stats?.maintenanceActive ? '#FEF2F2' : '#F0FDF4'}
            iconColor={stats?.maintenanceActive ? '#DC2626' : '#16A34A'} />
          <StatTile label="Rate Limit Config" value="Active"
            icon={Gauge}    iconBg="#FFFBEB" iconColor="#D97706" />
          <StatTile label="DB Indexes"        value={stats?.indexCount ?? 0}
            sub={`${stats?.collectionCount ?? 0} collections`}
            icon={Database} iconBg="#F5F3FF" iconColor="#7C3AED" />
        </div>
      )}

      {/* ── Maintenance banner (when active) ────────────────────────────────── */}
      {stats?.maintenanceActive && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#FEF2F2] border border-[#FECACA] rounded-xl dark:bg-red-900/20 dark:border-red-700">
          <AlertTriangle className="w-4 h-4 text-[#DC2626] dark:text-red-400 flex-shrink-0" />
          <span className="text-[13px] font-semibold text-[#DC2626] dark:text-red-400">
            Maintenance mode is currently ACTIVE — only allowed roles can access the system
          </span>
        </div>
      )}
      {stats && !stats.maintenanceActive && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-xl dark:bg-green-900/20 dark:border-green-700">
          <CheckCircle className="w-4 h-4 text-[#16A34A] dark:text-green-400 flex-shrink-0" />
          <span className="text-[13px] font-medium text-[#16A34A] dark:text-green-400">
            System online — all services operating normally
          </span>
        </div>
      )}

      {/* ── Cron Jobs ───────────────────────────────────────────────────────── */}
      <SectionDivider label="Cron Jobs" icon={Cpu} />
      <CronJobsTab onMessage={fwd} />

      {/* ── Maintenance Mode ────────────────────────────────────────────────── */}
      <SectionDivider label="Maintenance Mode" icon={Wrench} />
      <MaintenanceModeTab onMessage={fwd} />

      {/* ── Rate Limits ─────────────────────────────────────────────────────── */}
      <SectionDivider label="Rate Limits" icon={Gauge} />
      <RateLimitConfigTab onMessage={fwd} />

      {/* ── Database Indexes ────────────────────────────────────────────────── */}
      <SectionDivider label="Database Indexes" icon={Database} />
      <DbIndexExplorerTab />
    </div>
  );
}

