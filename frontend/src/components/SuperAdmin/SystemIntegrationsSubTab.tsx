import { useState, useEffect, useCallback } from 'react';
import { Webhook, Flag, Bell, RefreshCw } from 'lucide-react';
import webhookService from '../../services/webhookService';
import featureFlagService from '../../services/featureFlagService';
import apiClient from '../../services/api';
import WebhookManagerTab from './WebhookManagerTab';
import FeatureFlagsTab from './FeatureFlagsTab';
import NotificationCenterConfigTab from './NotificationCenterConfigTab';

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

export default function SystemIntegrationsSubTab({ onMessage }: Props) {
  const [stats, setStats] = useState<{
    webhookCount: number; webhookActive: number;
    flagCount: number; flagEnabled: number;
    notifEnabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fwd = useCallback((msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  }, [onMessage]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, ffRes, notifRes] = await Promise.allSettled([
        webhookService.list(),
        featureFlagService.list(),
        apiClient.get('/system-admin/notification-config'),
      ]);
      const webhooks  = whRes.status    === 'fulfilled' ? whRes.value              : [];
      const flags     = ffRes.status    === 'fulfilled' ? ffRes.value              : [];
      const notifData = notifRes.status === 'fulfilled' ? notifRes.value.data?.data : null;
      setStats({
        webhookCount:  Array.isArray(webhooks) ? webhooks.length                                           : 0,
        webhookActive: Array.isArray(webhooks) ? webhooks.filter((w: any) => w.isEnabled).length           : 0,
        flagCount:     Array.isArray(flags)    ? flags.length                                               : 0,
        flagEnabled:   Array.isArray(flags)    ? flags.filter((f: any) => f.isEnabled).length              : 0,
        notifEnabled:  notifData?.emailEnabled ?? false,
      });
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
          <StatTile label="Active Webhooks"    value={`${stats?.webhookActive ?? 0}/${stats?.webhookCount ?? 0}`}
            icon={Webhook} iconBg="#ECFEFF" iconColor="#0891B2" sub="Receiving events" />
          <StatTile label="Feature Flags On"   value={`${stats?.flagEnabled ?? 0}/${stats?.flagCount ?? 0}`}
            icon={Flag}    iconBg="#FFF7ED" iconColor="#EA580C" sub="Currently enabled" />
          <StatTile label="Email Notifications" value={stats?.notifEnabled ? 'Enabled' : 'Disabled'}
            icon={Bell}    iconBg={stats?.notifEnabled ? '#F0FDF4' : '#F9FAFB'}
            iconColor={stats?.notifEnabled ? '#16A34A' : '#9CA3AF'} />
        </div>
      )}

      {/* ── Webhooks ────────────────────────────────────────────────────────────── */}
      <SectionDivider label="Webhooks" icon={Webhook} />
      <WebhookManagerTab onMessage={fwd} />

      {/* ── Feature Flags ─────────────────────────────────────────────────────── */}
      <SectionDivider label="Feature Flags" icon={Flag} />
      <FeatureFlagsTab onMessage={fwd} />

      {/* ── Notification Center ──────────────────────────────────────────────── */}
      <SectionDivider label="Notification Center" icon={Bell} />
      <NotificationCenterConfigTab />
    </div>
  );
}
