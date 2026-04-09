import { useState, useEffect } from 'react';
import { Activity, Server, BarChart3, Bell } from 'lucide-react';
import MonitoringInfraSubTab from './MonitoringInfraSubTab';
import MonitoringAnalyticsSubTab from './MonitoringAnalyticsSubTab';
import MonitoringAlertsSubTab from './MonitoringAlertsSubTab';

/* ─── Navigation groups (sidebar pattern) ─────────────────────────── */

type SubTab = 'infra' | 'analytics' | 'alerts';
interface NavItem  { id: SubTab; label: string; icon: React.ReactNode }
interface NavGroup { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'System',
    items: [
      { id: 'infra',     label: 'Infrastructure', icon: <Server   className="w-3.5 h-3.5" /> },
      { id: 'analytics', label: 'Analytics',       icon: <BarChart3 className="w-3.5 h-3.5" /> },
    ],
  },
  {
    label: 'Notifications',
    items: [
      { id: 'alerts', label: 'Alerts & Integration', icon: <Bell className="w-3.5 h-3.5" /> },
    ],
  },
];

interface MonitoringUnifiedTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}

export default function MonitoringUnifiedTab({ onMessage, onNavigate }: MonitoringUnifiedTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('infra');

  useEffect(() => {
    const preferred = sessionStorage.getItem('sa_monitoring_preferred_subtab') as SubTab | null;
    if (preferred && ['infra', 'analytics', 'alerts'].includes(preferred)) {
      setSubTab(preferred);
    }
    if (preferred) sessionStorage.removeItem('sa_monitoring_preferred_subtab');
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Monitoring</h2>
      </div>

      {/* Sidebar + content */}
      <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden" style={{ minHeight: 520 }}>

        {/* LEFT: sidebar nav */}
        <aside className="w-44 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 py-2 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-3.5 pt-4 pb-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {group.label}
              </p>
              {group.items.map(item => {
                const active = subTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSubTab(item.id)}
                    className={[
                      'w-full flex items-center gap-2 py-1.5 text-[13px] transition-colors',
                      active
                        ? 'border-l-2 border-orange-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-medium pl-[12px]'
                        : 'border-l-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-white/60 dark:hover:bg-gray-700/60 pl-[14px]',
                    ].join(' ')}
                  >
                    <span className={active ? 'text-orange-600 dark:text-orange-500' : 'text-gray-400 dark:text-gray-500'}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* RIGHT: content panel */}
        <div className="flex-1 p-5 bg-white dark:bg-gray-900 overflow-y-auto">
          {subTab === 'infra'     && <MonitoringInfraSubTab onMessage={onMessage} />}
          {subTab === 'analytics' && <MonitoringAnalyticsSubTab onMessage={onMessage} />}
          {subTab === 'alerts'    && <MonitoringAlertsSubTab onNavigate={onNavigate} />}
        </div>
      </div>
    </div>
  );
}
