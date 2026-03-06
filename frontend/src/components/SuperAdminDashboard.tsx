import { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  Settings,
  FileSearch,
  ChevronRight,
  Database,
  Activity,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  X,
  Plus,
  Download,
  Shield,
  TrendingUp,
  TrendingDown,
  HardDrive,
} from 'lucide-react';
import { systemAdminAPI } from '../services/api';
import { OverviewStats } from '../types';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
// DatabaseMonitorTab merged into MonitoringUnifiedTab
import { UserManagementPage } from './SuperAdmin/UserManagement';
import FuelStationsTab from './SuperAdmin/FuelStationsTab';
import RoutesTab from './SuperAdmin/RoutesTab';
import AuditLogsTab from './SuperAdmin/AuditLogsTab';
import SecurityUnifiedTab from './SuperAdmin/SecurityUnifiedTab';
import BackupRecoveryTab from './SuperAdmin/BackupRecoveryTab';
import AnalyticsTab from './SuperAdmin/AnalyticsTab';
import TrashManagementTab from './SuperAdmin/TrashManagementTab';
import ArchivalManagementTab from './SuperAdmin/ArchivalManagementTab';
// SystemConfigDashboard, ConfigDiffTab, ConfigVersionHistoryTab, CronJobsTab, MaintenanceModeTab,
// RateLimitConfigTab, DbIndexExplorerTab, WebhookManagerTab, FeatureFlagsTab, NotificationCenterConfigTab,
// AnnouncementsTab, ExcelImport merged into SystemUnifiedTab
import SystemUnifiedTab from './SuperAdmin/SystemUnifiedTab';
import FuelPriceTab from './SuperAdmin/FuelPriceTab';
import DataExportTab from './SuperAdmin/DataExportTab';
import StorageManagerTab from './SuperAdmin/StorageManagerTab';
import MonitoringUnifiedTab from './SuperAdmin/MonitoringUnifiedTab';
import CustomReportBuilderTab from './SuperAdmin/CustomReportBuilderTab';
// SecurityScoreTab merged into SecurityUnifiedTab
// PrivilegeElevationTab merged into UserManagement module
// DLPControlsTab merged into SecurityUnifiedTab
// BreakGlassTab merged into SecurityUnifiedTab
// ThreatDetectionTab merged into SecurityUnifiedTab
// SIEMExportTab merged into MonitoringUnifiedTab
// SecurityBlocklistTab merged into SecurityUnifiedTab
// SecurityEventsTab merged into SecurityUnifiedTab

interface SuperAdminDashboardProps {
  user: any;
  section?: 'overview' | 'database' | 'users' | 'fuel_stations' | 'routes' | 'config' | 'audit' | 'security' | 'backup' | 'analytics' | 'trash' | 'archival' | 'announcements' | 'config_diff' | 'fuel_prices' | 'cron_jobs' | 'data_export' | 'feature_flags' | 'system_health' | 'maintenance' | 'webhooks' | 'rate_limits' | 'activity_heatmap' | 'storage' | 'alert_thresholds' | 'email_logs' | 'performance_metrics' | 'db_indexes' | 'config_history' | 'custom_report' | 'notification_config' | 'siem_export' | 'monitoring' | 'system';
  onNavigate?: (section: string) => void;
}

export default function SuperAdminDashboard({ user, section = 'overview', onNavigate }: SuperAdminDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<OverviewStats | null>(null);

  useEffect(() => {
    if (section === 'overview') {
      loadData();
    }
  }, [section]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await systemAdminAPI.getOverviewStats();
      setOverviewData(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(
    ['fuel_records', 'delivery_orders', 'lpo_entries', 'users', 'yard_fuel'],
    loadData
  );

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const SECTION_META: Record<string, { group: string; label: string }> = {
    overview:                    { group: '',             label: 'Overview'             },
    users:                       { group: 'Users',        label: 'User Management'      },
    bulk_users:                  { group: 'Users',        label: 'Bulk Users'           },
    driver_credentials_enhanced: { group: 'Users',        label: 'Driver Credentials'   },
    security:                    { group: 'Security',     label: 'Security Settings'    },
    ip_rules:                    { group: 'Security',     label: 'IP Rules'             },
    sessions:                    { group: 'Security',     label: 'Active Sessions'      },
    mfa_management:              { group: 'Security',     label: 'MFA Management'       },
    api_tokens:                  { group: 'Security',     label: 'API Tokens'           },
    security_score:              { group: 'Security',     label: 'Security Score'       },
    threat_detection:            { group: 'Security',     label: 'Threat Detection'     },
    security_blocklist:          { group: 'Security',     label: 'IP Blocklist'         },
    security_events:             { group: 'Security',     label: 'Security Events'      },
    dlp_controls:                { group: 'Security',     label: 'DLP Controls'         },
    break_glass:                 { group: 'Security',     label: 'Break-Glass Access'   },
    privilege_elevation:         { group: 'Users',        label: 'Privilege Elevation'  },
    siem_export:                 { group: 'Monitoring',   label: 'SIEM Export'          },
    monitoring:                  { group: 'Monitoring',   label: 'Monitoring'           },
    fuel_stations:               { group: 'Fleet & Fuel', label: 'Fuel Stations'        },
    routes:                      { group: 'Fleet & Fuel', label: 'Routes'               },
    fuel_prices:                 { group: 'Fleet & Fuel', label: 'Fuel Prices'          },
    database:                    { group: 'Monitoring',   label: 'Database Monitor'     },
    system_health:               { group: 'Monitoring',   label: 'System Health'        },
    performance_metrics:         { group: 'Monitoring',   label: 'Performance Metrics'  },
    activity_heatmap:            { group: 'Monitoring',   label: 'Activity Heatmap'     },
    alert_thresholds:            { group: 'Monitoring',   label: 'Alert Thresholds'     },
    email_logs:                  { group: 'Monitoring',   label: 'Email Logs'           },
    analytics:                   { group: 'Analytics',    label: 'Analytics & Reports'  },
    audit:                       { group: 'Analytics',    label: 'Audit Logs'           },
    custom_report:               { group: 'Analytics',    label: 'Custom Reports'       },
    backup:                      { group: 'Data',         label: 'Backup & Recovery'    },
    archival:                    { group: 'Data',         label: 'Data Archival'        },
    trash:                       { group: 'Data',         label: 'Trash Management'     },
    storage:                     { group: 'Data',         label: 'Storage Manager'      },
    data_export:                 { group: 'Data',         label: 'Data Export'          },
    system:                      { group: 'System',       label: 'System'               },
    // config, config_history, config_diff, feature_flags, cron_jobs, maintenance,
    // webhooks, rate_limits, db_indexes, announcements, notification_config merged into 'system' tab
  };

  const breadcrumb = SECTION_META[section];

  return (
    <div className="min-h-full">
      {/* Breadcrumb */}
      {breadcrumb && (
        <div className="px-4 pt-3 pb-1">
          <nav className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span>Super Admin</span>
            {breadcrumb.group && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span>{breadcrumb.group}</span>
              </>
            )}
            <ChevronRight className="w-3 h-3" />
            <span className="font-medium text-gray-700 dark:text-gray-300">{breadcrumb.label}</span>
          </nav>
        </div>
      )}

      {/* Section Content */}
      <div className="px-4 pb-8 pt-3">
        {(error || success) && (
          <div className="mb-4 space-y-2">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</span>
                <button onClick={() => setError(null)} className="flex-shrink-0">
                  <X className="w-4 h-4 text-red-400 hover:text-red-600" />
                </button>
              </div>
            )}
            {success && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                <span className="text-sm text-green-700 dark:text-green-300 flex-1">{success}</span>
                <button onClick={() => setSuccess(null)} className="flex-shrink-0">
                  <X className="w-4 h-4 text-green-400 hover:text-green-600" />
                </button>
              </div>
            )}
          </div>
        )}
        {loading && section === 'overview' ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : (
          <>
            {section === 'overview' && (
              <OverviewTab
                data={overviewData}
                onNavigate={onNavigate}
              />
            )}
            {section === 'monitoring' && (
              <MonitoringUnifiedTab onMessage={showMessage} />
            )}
            {/* database, system_health, performance_metrics, activity_heatmap, alert_thresholds, email_logs, siem_export merged into 'monitoring' tab */}
            {section === 'users' && (
              <UserManagementPage onMessage={showMessage} />
            )}
            {section === 'fuel_stations' && (
              <FuelStationsTab onMessage={showMessage} />
            )}
            {section === 'routes' && (
              <RoutesTab onMessage={showMessage} />
            )}
            {section === 'system' && (
              <SystemUnifiedTab onMessage={showMessage} />
            )}
            {/* config, config_diff, config_history, cron_jobs, maintenance, webhooks, rate_limits,
                db_indexes, feature_flags, notification_config, announcements merged into 'system' tab */}
            {section === 'audit' && (
              <AuditLogsTab onMessage={showMessage} />
            )}
            {section === 'security' && (
              <SecurityUnifiedTab onMessage={showMessage} />
            )}
            {section === 'trash' && (
              <TrashManagementTab onMessage={showMessage} />
            )}
            {section === 'archival' && (
              <ArchivalManagementTab onMessage={showMessage} />
            )}
            {section === 'backup' && (
              <BackupRecoveryTab onMessage={showMessage} />
            )}
            {section === 'analytics' && (
              <AnalyticsTab onMessage={showMessage} />
            )}
            {/* announcements merged into 'system' tab */}
            {/* ip_rules and sessions merged into 'security' tab */}
            {/* config_diff merged into 'system' tab */}
            {section === 'fuel_prices' && (
              <FuelPriceTab onMessage={showMessage} />
            )}
            {/* cron_jobs merged into 'system' tab */}
            {section === 'data_export' && (
              <DataExportTab onMessage={showMessage} />
            )}
            {/* feature_flags, maintenance, webhooks, rate_limits merged into 'system' tab */}
            {/* activity_heatmap merged into 'monitoring' tab */}
            {/* bulk_users merged into 'users' tab */}
            {section === 'storage' && (
              <StorageManagerTab />
            )}
            {/* alert_thresholds and email_logs merged into 'monitoring' tab */}
            {/* mfa_management and api_tokens merged into 'security' tab */}
            {/* performance_metrics merged into 'monitoring' tab */}
            {/* db_indexes, config_history, notification_config merged into 'system' tab */}
            {/* driver_credentials_enhanced merged into 'users' tab */}
            {section === 'custom_report' && (
              <CustomReportBuilderTab />
            )}
            {/* security_score, dlp_controls, break_glass, threat_detection merged into 'security' tab */}
            {/* siem_export merged into 'monitoring' tab */}
            {/* security_blocklist and security_events merged into 'security' tab */}
          </>
        )}
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({
  data,
  onNavigate,
}: {
  data: OverviewStats | null;
  onNavigate?: (section: string) => void;
}) {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Maintenance Mode Banner */}
      {data.maintenanceMode && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300 flex-1">
            <span className="font-semibold">Maintenance Mode Active — </span>
            Standard users cannot access the platform. Non-privileged sessions are blocked.
          </p>
          <button
            onClick={() => onNavigate?.('sa_system')}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap"
          >
            Manage
          </button>
        </div>
      )}

      {/* Row 1 — Headline KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Platform Health Score */}
        <button
          onClick={() => onNavigate?.('sa_monitoring')}
          className="text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Platform Health
            </p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              data.healthScore >= 80
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : data.healthScore >= 60
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
            }`}>
              {data.healthScore >= 80 ? 'Healthy' : data.healthScore >= 60 ? 'Degraded' : 'Critical'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <HealthGauge score={data.healthScore} />
            <div className="space-y-1.5 flex-1 min-w-0">
              {(data.healthComponents ?? []).map((c) => (
                <div key={c.name} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    c.status === 'healthy'  ? 'bg-emerald-500' :
                    c.status === 'degraded' ? 'bg-amber-500'   : 'bg-rose-500'
                  }`} />
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </button>

        {/* Active Sessions */}
        <button
          onClick={() => onNavigate?.('sa_security')}
          className="text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 border-l-sky-500 p-5 hover:border-sky-300 dark:hover:border-sky-600 transition-colors shadow-sm"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Active Sessions
              </p>
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {data.sessions?.activeLast24h ?? 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Logged in within 24 h</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data.system?.users?.total ?? 0} registered · {data.system?.users?.active ?? 0} active accounts
            </p>
          </div>
        </button>

        {/* Pending Actions */}
        <button
          onClick={() => onNavigate?.('sa_users')}
          className={`text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${
            (data.pending?.total ?? 0) > 0 ? 'border-l-amber-500' : 'border-l-emerald-500'
          } p-5 transition-colors shadow-sm`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Pending Actions
              </p>
              <p className={`text-3xl font-bold ${
                (data.pending?.total ?? 0) > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {data.pending?.total ?? 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {(data.pending?.total ?? 0) > 0 ? 'Items require attention' : 'No items pending'}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              (data.pending?.total ?? 0) > 0
                ? 'bg-amber-50 dark:bg-amber-900/30'
                : 'bg-emerald-50 dark:bg-emerald-900/30'
            }`}>
              <AlertTriangle className={`w-5 h-5 ${
                (data.pending?.total ?? 0) > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`} />
            </div>
          </div>
          {(data.pending?.total ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-0.5">
              {(data.pending?.driverAccounts ?? 0) > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {data.pending.driverAccounts} driver account{data.pending.driverAccounts !== 1 ? 's' : ''} pending
                </p>
              )}
              {(data.pending?.yardDispenses ?? 0) > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {data.pending.yardDispenses} yard dispense{data.pending.yardDispenses !== 1 ? 's' : ''} pending
                </p>
              )}
            </div>
          )}
        </button>

        {/* Database Status */}
        <button
          onClick={() => onNavigate?.('sa_monitoring')}
          className={`text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 ${
            data.database?.healthy ? 'border-l-emerald-500' : 'border-l-rose-500'
          } p-5 transition-colors shadow-sm`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                Database
              </p>
              <p className={`text-3xl font-bold ${
                data.database?.healthy
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {data.database?.healthy ? 'Online' : 'Offline'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 capitalize">
                {data.database?.status ?? 'Unknown'}
              </p>
            </div>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              data.database?.healthy
                ? 'bg-emerald-50 dark:bg-emerald-900/30'
                : 'bg-rose-50 dark:bg-rose-900/30'
            }`}>
              <Database className={`w-5 h-5 ${
                data.database?.healthy
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`} />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${data.database?.healthy ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {data.database?.healthy ? 'All queries responding normally' : 'Connection issues detected'}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Row 2 — Security Signals + Business KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Security Signals */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center">
                <Shield className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Security Signals</h3>
            </div>
            <button
              onClick={() => onNavigate?.('sa_security')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View details
            </button>
          </div>
          <div className="space-y-1">
            <SecuritySignalRow label="Failed Login Attempts"  value={data.security?.failedLoginsToday ?? 0}   threshold={{ warn: 3, crit: 8 }}  sub="today" />
            <SecuritySignalRow label="Critical Audit Events"  value={data.security?.criticalEventsToday ?? 0} threshold={{ warn: 1, crit: 3 }}  sub="today" />
            <SecuritySignalRow label="Access Denied Events"   value={data.security?.accessDeniedToday ?? 0}   threshold={{ warn: 5, crit: 15 }} sub="today" />
            <SecuritySignalRow label="High-Risk Events"       value={data.security?.highRiskEventCount ?? 0}  threshold={{ warn: 2, crit: 5 }}  sub="last 24 h" />
            <SecuritySignalRow label="Locked Accounts"        value={data.security?.lockedAccounts ?? 0}      threshold={{ warn: 1, crit: 5 }}  sub="currently" />
            <SecuritySignalRow label="Operational Failures"   value={data.security?.last24hFailures ?? 0}     threshold={{ warn: 5, crit: 20 }} sub="last 24 h" />
          </div>
          {(data.security?.recentCriticalEvents?.length ?? 0) > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Recent Critical Events
              </p>
              <div className="space-y-1.5">
                {data.security.recentCriticalEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/10">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{e.action}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate">by {e.username}</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                      {new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Business KPIs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Business KPIs</h3>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">Last 30 days</span>
          </div>
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Revenue</p>
                <TrendBadge value={data.financials?.revenueTrend ?? 0} />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatMoney(data.financials?.revenue30d ?? 0)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {(data.financials?.revenueTrend ?? 0) >= 0 ? 'Up' : 'Down'} from prior 30-day period
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fuel Dispensed</p>
                <TrendBadge value={data.financials?.fuelTrend ?? 0} />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {formatLiters(data.financials?.fuelLiters30d ?? 0)}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {data.system?.fuelRecords?.activeTrips ?? 0} trips currently active
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.system?.deliveryOrders?.today ?? 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">DOs today</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.system?.lpoEntries?.today ?? 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">LPOs today</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{data.system?.fuelRecords?.activeTrips ?? 0}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active trips</p>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={() => onNavigate?.('sa_analytics')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Open full analytics report
            </button>
          </div>
        </div>
      </div>

      {/* Row 3 — System Records + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* System Records */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">System Records</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RecordTile
              label="Delivery Orders"
              total={data.system?.deliveryOrders?.total ?? 0}
              today={data.system?.deliveryOrders?.today ?? 0}
              onClick={() => onNavigate?.('do')}
            />
            <RecordTile
              label="LPO Entries"
              total={data.system?.lpoEntries?.total ?? 0}
              today={data.system?.lpoEntries?.today ?? 0}
              onClick={() => onNavigate?.('lpo')}
            />
            <RecordTile
              label="Fuel Records"
              total={data.system?.fuelRecords?.total ?? 0}
              today={data.system?.fuelRecords?.today ?? 0}
              onClick={() => onNavigate?.('fuel')}
            />
            <RecordTile
              label="Yard Dispenses"
              total={data.system?.yardDispenses?.total ?? 0}
              today={data.system?.yardDispenses?.today ?? 0}
              onClick={() => onNavigate?.('yard')}
            />
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {data.system?.users?.total ?? 0} registered users · {data.system?.users?.locked ?? 0} locked accounts
            </p>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <Activity className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recent Activity</h3>
            </div>
            <button
              onClick={() => onNavigate?.('sa_audit')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View audit logs
            </button>
          </div>
          <div className="space-y-0.5">
            {(data.recentActivity?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No activity recorded</p>
            ) : (
              data.recentActivity.map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Row 4 — Role Distribution + Backup & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Role Distribution */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
              <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">User Role Distribution</h3>
          </div>
          <div className="space-y-2">
            {(data.system?.users?.byRole ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No role data available</p>
            ) : (
              data.system.users.byRole.map((r) => {
                const total = data.system.users.total || 1;
                const pct   = Math.round((r.count / total) * 100);
                return (
                  <div key={r._id} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 dark:text-slate-400 w-36 truncate capitalize">
                      {r._id?.replace(/_/g, ' ') ?? 'Unknown'}
                    </span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 dark:bg-indigo-400 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 w-6 text-right">{r.count}</span>
                    <span className="text-xs text-slate-400 w-9 text-right">{pct}%</span>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={() => onNavigate?.('sa_users')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Manage users
            </button>
          </div>
        </div>

        {/* Backup & Quick Actions */}
        <div className="space-y-4">
          {/* Last Backup */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <HardDrive className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Last Backup</h3>
              </div>
              <button
                onClick={() => onNavigate?.('sa_backup')}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Manage backups
              </button>
            </div>
            {data.backup ? (
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                  data.backup.status === 'completed'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : data.backup.status === 'failed'
                    ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                    : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                }`}>
                  {data.backup.status === 'completed'
                    ? <CheckCircle className="w-3 h-3" />
                    : <AlertTriangle className="w-3 h-3" />}
                  {data.backup.status}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {(data.backup.ageHours ?? 0) === 0
                      ? 'Less than 1 hour ago'
                      : (data.backup.ageHours ?? 0) < 24
                      ? `${data.backup.ageHours} hours ago`
                      : `${Math.floor((data.backup.ageHours ?? 0) / 24)} days ago`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {formatBytes(data.backup.fileSize ?? 0)} · {data.backup.type}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-500">No completed backup on record</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickActionButton
                icon={Users}
                label={
                  (data.pending?.driverAccounts ?? 0) > 0
                    ? `Review ${data.pending.driverAccounts} Pending`
                    : 'Manage Users'
                }
                onClick={() => onNavigate?.('sa_users')}
                variant={(data.pending?.driverAccounts ?? 0) > 0 ? 'amber' : 'default'}
              />
              <QuickActionButton
                icon={BarChart3}
                label="Analytics Report"
                onClick={() => onNavigate?.('sa_analytics')}
                variant="default"
              />
              <QuickActionButton
                icon={Database}
                label="Create Backup"
                onClick={() => onNavigate?.('sa_backup')}
                variant="default"
              />
              <QuickActionButton
                icon={FileSearch}
                label="Audit Logs"
                onClick={() => onNavigate?.('sa_audit')}
                variant="default"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const r    = 34;
  const circ = 2 * Math.PI * r;
  const off  = circ - (score / 100) * circ;
  const stroke =
    score >= 80 ? '#059669' :
    score >= 60 ? '#d97706' : '#e11d48';
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7"
          className="stroke-slate-200 dark:stroke-slate-700" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7"
          stroke={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="absolute text-sm font-bold text-slate-900 dark:text-slate-100 select-none">
        {score}
      </span>
    </div>
  );
}

function SecuritySignalRow({ label, value, threshold, sub }: {
  label: string;
  value: number;
  threshold: { warn: number; crit: number };
  sub: string;
}) {
  const status =
    value >= threshold.crit ? 'critical' :
    value >= threshold.warn ? 'warning'  : 'ok';
  const dotColor =
    status === 'critical' ? 'bg-rose-500'   :
    status === 'warning'  ? 'bg-amber-500'  : 'bg-emerald-500';
  const badgeColor =
    status === 'critical'
      ? 'bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
      : status === 'warning'
      ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400';
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{label}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">{sub}</span>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${badgeColor}`}>
        {value}
      </span>
    </div>
  );
}

function TrendBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
      positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
    }`}>
      {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function RecordTile({ label, total, today, onClick }: {
  label: string;
  total: number;
  today: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-600 hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors w-full"
    >
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 truncate">{label}</p>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{total.toLocaleString()}</p>
      {today > 0 && (
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">+{today} today</p>
      )}
    </button>
  );
}

function ActivityRow({ activity }: { activity: any }) {
  const actionColors: Record<string, string> = {
    FAILED_LOGIN:     'bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400',
    ACCESS_DENIED:    'bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400',
    DELETE:           'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    PERMANENT_DELETE: 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
    CREATE:           'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400',
    UPDATE:           'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    LOGIN:            'bg-sky-100 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400',
    LOGOUT:           'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
    EXPORT:           'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400',
    RESTORE:          'bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400',
  };
  const badge = actionColors[activity.action] ?? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400';
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge}`}>
        {activity.actionLabel ?? activity.action}
      </span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex-shrink-0">
        {activity.username ?? '—'}
      </span>
      <span className="text-xs text-slate-400 dark:text-slate-500 truncate flex-1">
        {activity.resourceType}
      </span>
      <span className="text-xs text-slate-400 flex-shrink-0">{activity.timeAgo}</span>
    </div>
  );
}

function QuickActionButton({ icon: Icon, label, onClick, variant = 'default' }: {
  icon: any;
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'amber';
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors text-sm font-medium w-full ${
        variant === 'amber'
          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800'
          : 'bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Formatter utilities ────────────────────────────────────────────────────────

function formatMoney(amount: number): string {
  if (amount >= 1_000_000_000) return `TSh ${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000)     return `TSh ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)         return `TSh ${(amount / 1_000).toFixed(0)}K`;
  return `TSh ${amount.toLocaleString()}`;
}

function formatLiters(liters: number): string {
  if (liters >= 1_000_000) return `${(liters / 1_000_000).toFixed(2)}M L`;
  if (liters >= 1_000)     return `${(liters / 1_000).toFixed(1)}K L`;
  return `${liters.toLocaleString()} L`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576)     return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)         return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
}
