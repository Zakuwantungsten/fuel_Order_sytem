import { useState, useEffect } from 'react';
import {
  Settings, GitCompare, Clock, RefreshCw, ArrowRight, Database,
} from 'lucide-react';
import apiClient from '../../services/api';
import SystemConfigDashboard from './SystemConfigDashboard';
import ConfigVersionHistoryTab from './ConfigVersionHistoryTab';
import ConfigDiffTab from './ConfigDiffTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type View = 'overview' | 'settings' | 'history' | 'diff';

export default function SystemConfigSubTab({ onMessage }: Props) {
  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<{ snapshots: number; changes: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // ConfigDiffTab uses reversed onMessage order: (msg, type)
  const reversedOnMessage = (msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  };

  useEffect(() => { loadOverview(); }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [histRes, diffRes] = await Promise.allSettled([
        apiClient.get('/system-admin/config-history', { params: { page: 1, limit: 1 } }),
        apiClient.get('/system-admin/config-diff', { params: { page: 1, limit: 1 } }),
      ]);
      setStats({
        snapshots: histRes.status === 'fulfilled' ? (histRes.value.data.pagination?.total ?? 0) : 0,
        changes: diffRes.status === 'fulfilled' ? (diffRes.value.data.pagination?.total ?? 0) : 0,
      });
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'settings', label: 'System Settings' },
    { id: 'history', label: 'Version History' },
    { id: 'diff', label: 'Change Log' },
  ];

  return (
    <div className="space-y-5">
      {/* Pill nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-indigo-600 text-white shadow-sm'
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
          {/* Stats */}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Clock className="w-5 h-5 text-indigo-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.snapshots ?? 0}</p>
                <p className="text-xs text-gray-400 mt-1">Config Snapshots</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <GitCompare className="w-5 h-5 text-purple-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.changes ?? 0}</p>
                <p className="text-xs text-gray-400 mt-1">Config Changes</p>
              </div>
            </div>
          )}

          {/* Quick-link cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickLink icon={Settings} title="System Settings"
              description="General, security, data retention, notifications, integrations, and environment configuration"
              color="bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
              iconColor="text-indigo-600 dark:text-indigo-400" onClick={() => setView('settings')} />
            <QuickLink icon={Clock} title="Version History"
              description="Browse and compare configuration snapshots over time"
              color="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
              iconColor="text-blue-600 dark:text-blue-400" onClick={() => setView('history')} />
            <QuickLink icon={GitCompare} title="Change Log"
              description="Detailed audit trail of every config change with field-level diffs"
              color="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
              iconColor="text-purple-600 dark:text-purple-400" onClick={() => setView('diff')} />
          </div>
        </div>
      )}

      {view === 'settings' && <SystemConfigDashboard onMessage={onMessage} />}
      {view === 'history' && <ConfigVersionHistoryTab />}
      {view === 'diff' && <ConfigDiffTab onMessage={reversedOnMessage} />}
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
