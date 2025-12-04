import { useState, useEffect } from 'react';
import {
  BarChart3,
  Users,
  Settings,
  FileSearch,
  Shield,
  Database,
  Activity,
  Trash2,
  Bell,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  X,
  Plus,
  Download,
} from 'lucide-react';
import { systemAdminAPI, trashAPI } from '../services/api';
import DatabaseMonitorTab from './SuperAdmin/DatabaseMonitorTab';
import UserManagementTab from './SuperAdmin/UserManagementTab';
import ConfigurationTab from './SuperAdmin/ConfigurationTab';
import AuditLogsTab from './SuperAdmin/AuditLogsTab';
import SecurityTab from './SuperAdmin/SecurityTab';
import BackupRecoveryTab from './SuperAdmin/BackupRecoveryTab';
import AnalyticsTab from './SuperAdmin/AnalyticsTab';
import TrashManagementTab from './SuperAdmin/TrashManagementTab';

interface SuperAdminDashboardProps {
  user: any;
  section?: 'overview' | 'database' | 'users' | 'config' | 'audit' | 'security' | 'backup' | 'analytics' | 'trash';
}

export default function SuperAdminDashboard({ user, section = 'overview' }: SuperAdminDashboardProps) {
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

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const getSectionTitle = () => {
    const titles: Record<string, string> = {
      overview: '🏠 SUPER ADMIN DASHBOARD',
      database: '💾 DATABASE MONITOR',
      users: '👥 USER MANAGEMENT',
      config: '⚙️ CONFIGURATION',
      audit: '📋 AUDIT & LOGS',
      security: '🔐 SECURITY',
      trash: '🗑️ TRASH MANAGEMENT',
      backup: '💾 BACKUP & RECOVERY',
      analytics: '📊 ANALYTICS & REPORTS',
    };
    return titles[section] || 'SUPER ADMIN';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-800 dark:to-purple-800 shadow-lg">
        <div className="px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  {getSectionTitle()}
                </h1>
                <p className="text-indigo-100 text-sm mt-1">
                  {user?.firstName || 'Admin'} • Full system control & monitoring
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-colors">
                <Bell className="w-4 h-4" />
                <span className="text-sm font-medium">0 Alerts</span>
              </button>
              {section === 'overview' && (
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="text-sm font-medium">Refresh</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="px-4 mt-4">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <span className="text-red-700 dark:text-red-300 flex-1">{error}</span>
            <button onClick={() => setError(null)} className="flex-shrink-0">
              <X className="w-4 h-4 text-red-600 dark:text-red-400 hover:text-red-800" />
            </button>
          </div>
        </div>
      )}
      {success && (
        <div className="px-4 mt-4">
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="text-green-700 dark:text-green-300 flex-1">{success}</span>
            <button onClick={() => setSuccess(null)} className="flex-shrink-0">
              <X className="w-4 h-4 text-green-600 dark:text-green-400 hover:text-green-800" />
            </button>
          </div>
        </div>
      )}

      {/* Section Content */}
      <div className="px-4 mt-6 pb-8">
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
              />
            )}
            {section === 'database' && (
              <DatabaseMonitorTab onMessage={showMessage} />
            )}
            {section === 'users' && (
              <UserManagementTab onMessage={showMessage} />
            )}
            {section === 'config' && (
              <ConfigurationTab onMessage={showMessage} />
            )}
            {section === 'audit' && (
              <AuditLogsTab onMessage={showMessage} />
            )}
            {section === 'security' && (
              <SecurityTab onMessage={showMessage} />
            )}
            {section === 'trash' && (
              <TrashManagementTab onMessage={showMessage} />
            )}
            {section === 'backup' && (
              <BackupRecoveryTab onMessage={showMessage} />
            )}
            {section === 'analytics' && (
              <AnalyticsTab onMessage={showMessage} />
            )}
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
  onRefresh 
}: { 
  stats: any; 
  dbHealth: any; 
  trashStats: any;
  recentActivity: any[];
  onRefresh: () => void;
}) {
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
            {dbHealth.healthy ? '✅ Online' : '❌ Offline'}
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
                  key={activity.id || index}
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
          <button className="flex items-center gap-2 px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Create User</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
            <BarChart3 className="w-5 h-5" />
            <span className="text-sm font-medium">Generate Report</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">
            <Database className="w-5 h-5" />
            <span className="text-sm font-medium">Backup Now</span>
          </button>
          <button className="flex items-center gap-2 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors">
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
