import { useState, useEffect, useCallback } from 'react';
import { Shield, Settings, ShieldCheck, Lock, Radar, Bell, Keyboard } from 'lucide-react';
import SecurityPoliciesSubTab from './SecurityPoliciesSubTab';
import SecurityAccessControlSubTab from './SecurityAccessControlSubTab';
import SecuritySessionsSubTab from './SecuritySessionsSubTab';
import SecurityThreatMonitorSubTab from './SecurityThreatMonitorSubTab';
import SecurityAlertsSubTab from './SecurityAlertsSubTab';
import SecurityOverviewBanner from './SecurityOverviewBanner';

const SUB_TABS = [
  { id: 'policies',       label: 'Policies',         shortLabel: 'Policies',  icon: Settings,    shortcut: '1' },
  { id: 'access_control', label: 'Access Control',   shortLabel: 'Access',    icon: Lock,        shortcut: '2' },
  { id: 'sessions',       label: 'Sessions & Users',  shortLabel: 'Sessions',  icon: ShieldCheck, shortcut: '3' },
  { id: 'threats',        label: 'Threat Monitor',    shortLabel: 'Threats',   icon: Radar,       shortcut: '4' },
  { id: 'alerts',          label: 'Alerts & Incidents', shortLabel: 'Alerts',    icon: Bell,        shortcut: '5' },
] as const;

type SubTab = typeof SUB_TABS[number]['id'];

interface SecurityUnifiedTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export default function SecurityUnifiedTab({ onMessage }: SecurityUnifiedTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('policies');
  const [alertBadge, setAlertBadge] = useState(0);

  // Keyboard shortcuts: 1-5 switch tabs, R refreshes (triggers re-mount)
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = e.key;
    const tab = SUB_TABS.find(t => t.shortcut === key);
    if (tab) { setSubTab(tab.id); return; }
    if (key === 'r' || key === 'R') {
      const current = subTab;
      setSubTab('' as SubTab);
      requestAnimationFrame(() => setSubTab(current));
    }
  }, [subTab]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  useEffect(() => {
    const token = sessionStorage.getItem('fuel_order_token');
    fetch(`${API_BASE}/system-admin/security-alerts/count`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(j => { if (j.success) setAlertBadge(j.data.total || 0); })
      .catch(() => {});
  }, [subTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
              <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            Security Center
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-[52px]">
            Manage policies, access control, sessions, threats, and incidents
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
          <Keyboard className="w-3.5 h-3.5" />
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">1</kbd>–<kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">5</kbd> tabs
          <span className="mx-0.5">·</span>
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded font-mono">R</kbd> refresh
        </div>
      </div>

      {/* Overview Banner */}
      <SecurityOverviewBanner onNavigate={(tab) => setSubTab(tab as SubTab)} />

      {/* Sub-tab navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <nav className="flex gap-0.5 p-1.5 overflow-x-auto scrollbar-thin" role="tablist" aria-label="Security sub-tabs">
          {SUB_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`security-panel-${tab.id}`}
                title={`${tab.label} (${tab.shortcut})`}
                onClick={() => setSubTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-1 justify-center ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span className="hidden md:inline">{tab.label}</span>
                <span className="md:hidden">{tab.shortLabel}</span>
                {tab.id === 'alerts' && alertBadge > 0 && (
                  <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {alertBadge > 99 ? '99+' : alertBadge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div role="tabpanel" id={`security-panel-${subTab}`} aria-label={SUB_TABS.find(t => t.id === subTab)?.label}>
        {subTab === 'policies'       && <SecurityPoliciesSubTab onMessage={onMessage} />}
        {subTab === 'access_control' && <SecurityAccessControlSubTab onMessage={onMessage} />}
        {subTab === 'sessions'       && <SecuritySessionsSubTab onMessage={onMessage} />}
        {subTab === 'threats'        && <SecurityThreatMonitorSubTab />}
        {subTab === 'alerts'          && <SecurityAlertsSubTab />}
      </div>
    </div>
  );
}
