import { useState, useCallback } from 'react';
import { Users, ShieldCheck } from 'lucide-react';
import UsersView from './UsersView';
import DriverCredentialsView from './DriverCredentialsView';
import PrivilegeElevationView from './PrivilegeElevationView';
import SectionErrorBoundary from './ErrorBoundary';

type SubTab = 'users' | 'credentials';

const SUB_TABS: { id: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'users',       label: 'Users',                icon: Users },
  { id: 'credentials', label: 'Credentials & Access',  icon: ShieldCheck },
];

interface UserManagementPageProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function UserManagementPage({ onMessage: _onMessage }: UserManagementPageProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('users');

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIdx = SUB_TABS.findIndex(t => t.id === activeTab);
    let nextIdx = -1;
    if (e.key === 'ArrowRight') {
      nextIdx = (currentIdx + 1) % SUB_TABS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (currentIdx - 1 + SUB_TABS.length) % SUB_TABS.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = SUB_TABS.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      setActiveTab(SUB_TABS[nextIdx].id);
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            User Management
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-[46px]">
            Manage users, credentials, and access controls
          </p>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 -mb-px" role="tablist" onKeyDown={handleTabKeyDown}>
          {SUB_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`mgmt-tab-${tab.id}`}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-controls={`mgmt-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`group flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className={`w-4 h-4 transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                }`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div role="tabpanel" id={`mgmt-panel-${activeTab}`} aria-labelledby={`mgmt-tab-${activeTab}`}>
        {activeTab === 'users' && (
          <SectionErrorBoundary fallbackTitle="Users section encountered an error">
            <UsersView />
          </SectionErrorBoundary>
        )}
        {activeTab === 'credentials' && (
          <SectionErrorBoundary fallbackTitle="Credentials & Access section encountered an error">
            <div className="space-y-8">
              <DriverCredentialsView />
              <div className="border-t border-gray-200 dark:border-gray-700" />
              <PrivilegeElevationView />
            </div>
          </SectionErrorBoundary>
        )}
      </div>
    </div>
  );
}
