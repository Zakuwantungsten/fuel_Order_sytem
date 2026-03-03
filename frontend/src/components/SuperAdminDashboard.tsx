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
} from 'lucide-react';
import { systemAdminAPI, trashAPI } from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
// DatabaseMonitorTab merged into MonitoringUnifiedTab
import UserManagementUnifiedTab from './SuperAdmin/UserManagementUnifiedTab';
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
// PrivilegeElevationTab merged into UserManagementUnifiedTab
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
  const [stats, setStats] = useState<any>(null);
  const [dbHealth, setDbHealth] = useState<any>(null);
  const [trashStats, setTrashStats] = useState<any>(null);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    if (section === 'overview') {
      loadData();
    }
  }, [section]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [systemStats, dbHealthData, trashData, activityData] = await Promise.all([
        systemAdminAPI.getSystemStats(),
        systemAdminAPI.getDatabaseHealth(),
        trashAPI.getStats(),
        systemAdminAPI.getRecentActivity(10),
      ]);
      setStats(systemStats);
      setDbHealth(dbHealthData);
      setTrashStats(trashData);
      setRecentActivity(activityData || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
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
                stats={stats} 
                dbHealth={dbHealth} 
                trashStats={trashStats}
                recentActivity={recentActivity}
                onRefresh={loadData}
                onNavigate={onNavigate}
              />
            )}
            {section === 'monitoring' && (
              <MonitoringUnifiedTab onMessage={showMessage} />
            )}
            {/* database, system_health, performance_metrics, activity_heatmap, alert_thresholds, email_logs, siem_export merged into 'monitoring' tab */}
            {section === 'users' && (
              <UserManagementUnifiedTab onMessage={showMessage} />
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

// Overview Tab Component
function OverviewTab({ 
  stats, 
  dbHealth, 
  trashStats,
  recentActivity,
  onRefresh: _onRefresh,
  onNavigate 
}: { 
  stats: any; 
  dbHealth: any; 
  trashStats: any;
  recentActivity: any[];
  onRefresh: () => void;
  onNavigate?: (section: string) => void;
}) {
  // Using underscore prefix to suppress unused variable warning
  void _onRefresh;
  if (!stats || !dbHealth) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  // Map icon strings to color classes
  const getColorForIcon = (icon: string) => {
    const colorMap: Record<string, string> = {
      user: 'blue',
      edit: 'purple',
      trash: 'orange',
      database: 'green',
      plus: 'indigo',
      refresh: 'cyan',
      alert: 'red',
      download: 'teal',
      activity: 'gray',
    };
    return colorMap[icon] || 'gray';
  };

  return (
    <div className="space-y-6">
      {/* System Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Server Status */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6" />
            </div>
            <span className="text-green-100 text-xs font-medium">LIVE</span>
          </div>
          <p className="text-green-100 text-sm">Server Status</p>
          <p className="text-2xl font-bold mt-1">
            {dbHealth.healthy ? 'Online' : 'Offline'}
          </p>
          <p className="text-xs text-green-100 mt-2">
            DB: {dbHealth.status || 'Unknown'}
          </p>
        </div>

        {/* Active Users */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <p className="text-blue-100 text-sm">Active Users</p>
          <p className="text-2xl font-bold mt-1">{stats.users?.active || 0}</p>
          <p className="text-xs text-blue-100 mt-2">
            Total: {stats.users?.total || 0} users
          </p>
        </div>

        {/* Pending Items */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <p className="text-orange-100 text-sm">Pending Approvals</p>
          <p className="text-2xl font-bold mt-1">0</p>
          <p className="text-xs text-orange-100 mt-2">No pending items</p>
        </div>

        {/* Trash Items */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
          </div>
          <p className="text-purple-100 text-sm">Deleted Items</p>
          <p className="text-2xl font-bold mt-1">{trashStats?.totalItems || 0}</p>
          <p className="text-xs text-purple-100 mt-2">In recycle bin</p>
        </div>
      </div>

      {/* System Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Records Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            System Records
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Delivery Orders</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.deliveryOrders?.total || 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.deliveryOrders?.today || 0} today
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">LPO Entries</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.lpoEntries?.total || 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.lpoEntries?.today || 0} today
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Fuel Records</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.fuelRecords?.total || 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.fuelRecords?.today || 0} today
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Yard Dispenses</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.yardDispenses?.total || 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {stats.yardDispenses?.today || 0} today
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => (
                <ActivityItem 
                  key={String(activity.id || index)}
                  icon={activity.icon}
                  text={activity.description}
                  time={activity.timeAgo}
                  color={getColorForIcon(activity.icon)}
                />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button 
            onClick={() => onNavigate?.('sa_users')}
            className="flex items-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors"
          >
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Create User</span>
          </button>
          <button 
            onClick={() => onNavigate?.('sa_analytics')}
            className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
          >
            <BarChart3 className="w-5 h-5" />
            <span className="text-sm font-medium">Generate Report</span>
          </button>
          <button 
            onClick={() => onNavigate?.('sa_backup')}
            className="flex items-center gap-2 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
          >
            <Database className="w-5 h-5" />
            <span className="text-sm font-medium">Backup Now</span>
          </button>
          <button 
            onClick={() => onNavigate?.('sa_audit')}
            className="flex items-center gap-2 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          >
            <FileSearch className="w-5 h-5" />
            <span className="text-sm font-medium">View Logs</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Activity Item Component
function ActivityItem({ 
  icon, 
  text, 
  time, 
  color 
}: { 
  icon: string; 
  text: string; 
  time: string; 
  color: string;
}) {
  const iconMap: any = {
    user: Users,
    edit: Settings,
    trash: Trash2,
    database: Database,
    plus: Plus,
    refresh: RefreshCw,
    alert: AlertTriangle,
    download: Download,
    activity: Activity,
  };
  const Icon = iconMap[icon] || Activity;

  const colorClasses: any = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    teal: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
    gray: 'bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400',
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClasses[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 dark:text-gray-100 truncate">{text}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{time}</p>
      </div>
    </div>
  );
}
