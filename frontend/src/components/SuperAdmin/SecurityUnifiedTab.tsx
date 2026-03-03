import { useState } from 'react';
import { Shield, Settings, ShieldCheck, Lock, Radar } from 'lucide-react';
import SecurityPoliciesSubTab from './SecurityPoliciesSubTab';
import SecurityAccessControlSubTab from './SecurityAccessControlSubTab';
import SecuritySessionsSubTab from './SecuritySessionsSubTab';
import SecurityThreatMonitorSubTab from './SecurityThreatMonitorSubTab';

const SUB_TABS = [
  { id: 'policies',       label: 'Policies',        icon: Settings },
  { id: 'access_control', label: 'Access Control',  icon: Lock },
  { id: 'sessions',       label: 'Sessions & Users', icon: ShieldCheck },
  { id: 'threats',        label: 'Threat Monitor',  icon: Radar },
] as const;

type SubTab = typeof SUB_TABS[number]['id'];

interface SecurityUnifiedTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function SecurityUnifiedTab({ onMessage }: SecurityUnifiedTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('policies');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          Security
        </h2>
      </div>

      {/* Sub-tab navigation */}
      <div className="border-b dark:border-gray-700">
        <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-thin">
          {SUB_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  subTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {subTab === 'policies'       && <SecurityPoliciesSubTab onMessage={onMessage} />}
      {subTab === 'access_control' && <SecurityAccessControlSubTab onMessage={onMessage} />}
      {subTab === 'sessions'       && <SecuritySessionsSubTab onMessage={onMessage} />}
      {subTab === 'threats'        && <SecurityThreatMonitorSubTab />}
    </div>
  );
}
