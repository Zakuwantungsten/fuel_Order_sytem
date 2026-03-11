import { useState, useEffect, useCallback } from 'react';
import { Megaphone, FileUp, RefreshCw } from 'lucide-react';
import announcementService from '../../services/announcementService';
import AnnouncementsTab from './AnnouncementsTab';
import ExcelImport from '../../pages/ExcelImport';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

// ── Shared primitives ────────────────────────────────────────────────────────

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

export default function SystemContentSubTab({ onMessage }: Props) {
  const [stats, setStats] = useState<{ live: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const all = await announcementService.getAll();
      const live = Array.isArray(all) ? all.filter((a: any) => a.isActive).length : 0;
      setStats({ live, total: Array.isArray(all) ? all.length : 0 });
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="p-6 space-y-6">
      {/* ── Stat tiles ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center gap-2 py-6">
          <RefreshCw className="w-4 h-4 text-[#4F46E5] animate-spin" />
          <span className="text-[13px] text-[#6B7280] dark:text-gray-400">Loading…</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatTile label="Live Announcements"     value={stats?.live ?? 0}
            sub={`${stats?.total ?? 0} total`}
            icon={Megaphone} iconBg="#FDF2F8" iconColor="#DB2777" />
          <StatTile label="Import Types Supported" value={3}
            sub="Fuel · Deliveries · LPO"
            icon={FileUp}    iconBg="#EFF6FF" iconColor="#2563EB" />
          <StatTile label="Archived Announcements" value={(stats?.total ?? 0) - (stats?.live ?? 0)}
            icon={Megaphone} iconBg="#F8F9FB" iconColor="#9CA3AF" />
        </div>
      )}

      {/* ── Announcements ───────────────────────────────────────────────────── */}
      <SectionDivider label="Announcements" icon={Megaphone} />
      <AnnouncementsTab onMessage={onMessage} />

      {/* ── Excel Import ──────────────────────────────────────────────────────── */}
      <SectionDivider label="Excel Import" icon={FileUp} />
      <ExcelImport />
    </div>
  );
}
