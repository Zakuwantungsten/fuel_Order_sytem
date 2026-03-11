import { useState, useEffect, useCallback } from 'react';
import { Settings, Cpu, Webhook, Megaphone, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import systemHealthService from '../../services/systemHealthService';
import type { SystemHealth } from '../../services/systemHealthService';
import SystemConfigSubTab from './SystemConfigSubTab';
import SystemOpsSubTab from './SystemOpsSubTab';
import SystemIntegrationsSubTab from './SystemIntegrationsSubTab';
import SystemContentSubTab from './SystemContentSubTab';

const TABS = [
  { id: 'config',       label: 'Configuration',   icon: Settings },
  { id: 'operations',   label: 'Operations',       icon: Cpu },
  { id: 'integrations', label: 'Integrations',     icon: Webhook },
  { id: 'content',      label: 'Content & Import', icon: Megaphone },
] as const;

type TabId = typeof TABS[number]['id'];

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

export default function SystemUnifiedTab({ onMessage }: Props) {
  const [tab, setTab] = useState<TabId>('config');
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await systemHealthService.get();
      setHealth(data);
    } catch {
      // status strip stays blank — non-critical
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  const isOk = health?.database?.status === 'connected';
  const heapPct = health
    ? Math.round((health.process.memory.heapUsedMB / health.process.memory.heapTotalMB) * 100)
    : null;

  return (
    <div className="system-admin-wrap min-h-full">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-[#E4E7EC] dark:border-gray-700 px-6 pt-5 pb-0">

        {/* Title row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#EEF2FF] dark:bg-indigo-900/30 flex-shrink-0">
              <Settings className="w-[18px] h-[18px] text-[#4F46E5] dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold text-[#111827] dark:text-gray-100 leading-none">
                System Administration
              </h1>
              <p className="text-[11px] text-[#9CA3AF] dark:text-gray-500 mt-1">
                Infrastructure, configuration, and operational controls
              </p>
            </div>
          </div>

          {/* Live status strip */}
          <div className="flex items-center gap-2 flex-wrap">
            {health && (
              <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-[12px] font-medium ${
                isOk
                  ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#16A34A] dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                  : 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626] dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
              }`}>
                {isOk
                  ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                <span>{isOk ? 'Operational' : 'Degraded'}</span>
                <span className="text-[#D1D5DB] dark:text-gray-600">|</span>
                <span className="text-[#6B7280] dark:text-gray-400">
                  Up <span className="font-semibold text-[#111827] dark:text-gray-200">{fmtUptime(health.process.uptimeSeconds)}</span>
                </span>
                <span className="text-[#D1D5DB] dark:text-gray-600">|</span>
                <span className="text-[#6B7280] dark:text-gray-400">
                  DB <span className="font-semibold text-[#111827] dark:text-gray-200">
                    {health.database.connections?.current ?? '–'}/{health.database.connections?.available ?? '–'}
                  </span>
                </span>
                {heapPct !== null && (
                  <>
                    <span className="text-[#D1D5DB] dark:text-gray-600">|</span>
                    <span className="text-[#6B7280] dark:text-gray-400">
                      Heap <span className={`font-semibold ${
                        heapPct > 85 ? 'text-[#DC2626]' : heapPct > 65 ? 'text-[#D97706]' : 'text-[#111827] dark:text-gray-200'
                      }`}>{heapPct}%</span>
                    </span>
                  </>
                )}
                <span className="text-[#D1D5DB] dark:text-gray-600">|</span>
                <span className="text-[#6B7280] dark:text-gray-400">
                  Sessions <span className="font-semibold text-[#111827] dark:text-gray-200">{health.sessions.active}</span>
                </span>
              </div>
            )}
            <button
              onClick={loadHealth}
              disabled={healthLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#6B7280] dark:text-gray-400 border border-[#E4E7EC] dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 hover:bg-[#F8F9FB] dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <nav className="flex -mb-px overflow-x-auto scrollbar-thin">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[#4F46E5] text-[#4F46E5] dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-[#6B7280] dark:text-gray-400 hover:text-[#111827] dark:hover:text-gray-200 hover:border-[#E4E7EC] dark:hover:border-gray-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <div className="bg-[#F8F9FB] dark:bg-gray-900 min-h-[calc(100vh-220px)]">
        {tab === 'config'       && <SystemConfigSubTab       onMessage={onMessage} />}
        {tab === 'operations'   && <SystemOpsSubTab          onMessage={onMessage} />}
        {tab === 'integrations' && <SystemIntegrationsSubTab onMessage={onMessage} />}
        {tab === 'content'      && <SystemContentSubTab      onMessage={onMessage} />}
      </div>
    </div>
  );
}
