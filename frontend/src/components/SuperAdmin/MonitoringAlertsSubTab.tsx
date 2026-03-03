import { useState, useEffect } from 'react';
import {
  Bell, Mail, Server, RefreshCw, ArrowRight, CheckCircle, AlertTriangle,
} from 'lucide-react';
import apiClient from '../../services/api';
import AlertThresholdsTab from './AlertThresholdsTab';
import EmailLogViewerTab from './EmailLogViewerTab';
import SIEMExportTab from './SIEMExportTab';

type View = 'overview' | 'thresholds' | 'email_logs' | 'siem';

export default function MonitoringAlertsSubTab() {
  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<{
    thresholdCount: number;
    emailLogCount: number;
    siemDestinations: number;
    siemActive: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

      const [thresholdRes, emailRes, siemRes] = await Promise.allSettled([
        apiClient.get('/system-admin/config/settings/alert-thresholds'),
        apiClient.get('/system-admin/email-logs', { params: { limit: 1 } }),
        fetch('/api/v1/system-admin/siem', { headers }),
      ]);

      const thresholds = thresholdRes.status === 'fulfilled' ? thresholdRes.value.data.data : null;
      const thresholdCount = thresholds ? Object.keys(thresholds).length : 0;

      let emailLogCount = 0;
      if (emailRes.status === 'fulfilled') {
        emailLogCount = emailRes.value.data.data?.length ?? 0;
      }

      let siemDestinations = 0;
      let siemActive = 0;
      if (siemRes.status === 'fulfilled') {
        const siemJson = await siemRes.value.json();
        if (siemJson.success) {
          siemDestinations = siemJson.data.length;
          siemActive = siemJson.data.filter((c: any) => c.isActive).length;
        }
      }

      setStats({ thresholdCount, emailLogCount, siemDestinations, siemActive });
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'thresholds', label: 'Alert Thresholds' },
    { id: 'email_logs', label: 'Email Logs' },
    { id: 'siem', label: 'SIEM Export' },
  ];

  return (
    <div className="space-y-5">
      {/* Pill navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {v.label}
          </button>
        ))}
        {view === 'overview' && (
          <button
            onClick={loadOverview}
            disabled={loading}
            className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Overview */}
      {view === 'overview' && (
        <div className="space-y-5">
          {/* Stats */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Bell className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.thresholdCount}</p>
                <p className="text-xs text-gray-400 mt-1">Thresholds Set</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Mail className="w-5 h-5 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.emailLogCount > 0 ? `${stats.emailLogCount}+` : '0'}</p>
                <p className="text-xs text-gray-400 mt-1">Email Entries</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Server className="w-5 h-5 text-purple-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.siemDestinations}</p>
                <p className="text-xs text-gray-400 mt-1">SIEM Destinations</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                {stats.siemActive > 0
                  ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-2" />
                  : <AlertTriangle className="w-5 h-5 text-gray-400 mx-auto mb-2" />
                }
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.siemActive}</p>
                <p className="text-xs text-gray-400 mt-1">Active Exports</p>
              </div>
            </div>
          )}

          {/* Quick-link cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setView('thresholds')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
            >
              <Bell className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Alert Thresholds</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Configure memory, CPU, disk, DB connection, and error rate alerting
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
            <button
              onClick={() => setView('email_logs')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            >
              <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Email Logs</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  View password reset and user creation email audit trail
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
            <button
              onClick={() => setView('siem')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
            >
              <Server className="w-6 h-6 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">SIEM Export</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Webhook, Syslog, Splunk, Datadog, and Elasticsearch destinations
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
          </div>
        </div>
      )}

      {/* Detail views */}
      {view === 'thresholds' && <AlertThresholdsTab />}
      {view === 'email_logs' && <EmailLogViewerTab />}
      {view === 'siem' && <SIEMExportTab />}
    </div>
  );
}
