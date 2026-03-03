import { useState, useEffect } from 'react';
import {
  Webhook, Flag, Bell, RefreshCw, ArrowRight,
  CheckCircle, ToggleRight,
} from 'lucide-react';
import webhookService from '../../services/webhookService';
import featureFlagService from '../../services/featureFlagService';
import apiClient from '../../services/api';
import WebhookManagerTab from './WebhookManagerTab';
import FeatureFlagsTab from './FeatureFlagsTab';
import NotificationCenterConfigTab from './NotificationCenterConfigTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type View = 'overview' | 'webhooks' | 'feature_flags' | 'notifications';

export default function SystemIntegrationsSubTab({ onMessage }: Props) {
  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<{
    webhookCount: number; webhookActive: number;
    flagCount: number; flagEnabled: number;
    notifEnabled: boolean;
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
      const [whRes, ffRes, notifRes] = await Promise.allSettled([
        webhookService.list(),
        featureFlagService.list(),
        apiClient.get('/system-admin/notification-config'),
      ]);

      const webhooks = whRes.status === 'fulfilled' ? whRes.value : [];
      const flags = ffRes.status === 'fulfilled' ? ffRes.value : [];
      const notifData = notifRes.status === 'fulfilled' ? notifRes.value.data?.data : null;

      setStats({
        webhookCount: Array.isArray(webhooks) ? webhooks.length : 0,
        webhookActive: Array.isArray(webhooks) ? webhooks.filter((w: any) => w.isEnabled).length : 0,
        flagCount: Array.isArray(flags) ? flags.length : 0,
        flagEnabled: Array.isArray(flags) ? flags.filter((f: any) => f.isEnabled).length : 0,
        notifEnabled: notifData?.emailEnabled ?? false,
      });
    } catch { /* silent */ } finally { setLoading(false); }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'feature_flags', label: 'Feature Flags' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <div className="space-y-5">
      {/* Pill nav */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-teal-600 text-white shadow-sm'
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
              <RefreshCw className="w-6 h-6 text-teal-500 animate-spin" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Webhook className="w-5 h-5 text-cyan-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.webhookActive}<span className="text-base font-normal text-gray-400">/{stats.webhookCount}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Webhooks Active</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Flag className="w-5 h-5 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.flagEnabled}<span className="text-base font-normal text-gray-400">/{stats.flagCount}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Flags Enabled</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                {stats.notifEnabled
                  ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-2" />
                  : <ToggleRight className="w-5 h-5 text-gray-400 mx-auto mb-2" />}
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stats.notifEnabled ? 'ON' : 'OFF'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Email Notifications</p>
              </div>
            </div>
          )}

          {/* Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickLink icon={Webhook} title="Webhooks"
              description="Create webhook endpoints, manage event subscriptions, test connections, and view delivery logs"
              color="bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
              iconColor="text-cyan-600 dark:text-cyan-400" onClick={() => setView('webhooks')} />
            <QuickLink icon={Flag} title="Feature Flags"
              description="Toggle features, set role restrictions, and manage rollout with flag CRUD"
              color="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"
              iconColor="text-orange-600 dark:text-orange-400" onClick={() => setView('feature_flags')} />
            <QuickLink icon={Bell} title="Notification Config"
              description="Email toggles, event triggers, alert recipients, and digest schedule settings"
              color="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
              iconColor="text-green-600 dark:text-green-400" onClick={() => setView('notifications')} />
          </div>
        </div>
      )}

      {view === 'webhooks' && <WebhookManagerTab onMessage={reversedOnMessage} />}
      {view === 'feature_flags' && <FeatureFlagsTab onMessage={reversedOnMessage} />}
      {view === 'notifications' && <NotificationCenterConfigTab />}
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
