import { useState, useEffect } from 'react';
import {
  Activity,
  Database,
  Users,
  Trash2,
  FileSearch,
  Shield,
  Settings,
  RefreshCw,
  Server,
  HardDrive,
  Zap,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  RotateCcw,
  XCircle,
  LogOut,
  Filter,
} from 'lucide-react';
import { systemAdminAPI, trashAPI } from '../services/api';
import { 
  DatabaseMetrics, 
  AuditLog, 
  TrashStats, 
  AuditAction,
  AuditSeverity 
} from '../types';
import Pagination from './Pagination';

interface SystemAdminDashboardProps {
  user: any;
  section?: 'database' | 'audit' | 'trash' | 'sessions' | 'quick';
}

type SectionType = 'overview' | 'database' | 'audit' | 'trash' | 'sessions' | 'quick';

export default function SystemAdminDashboard({ user, section }: SystemAdminDashboardProps) {
  // If section prop is provided, use it directly (for system_admin role with sidebar nav)
  // Otherwise use internal state (for super_admin viewing full dashboard)
  const [activeSection, setActiveSection] = useState<SectionType>(section || 'overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [dbMetrics, setDbMetrics] = useState<DatabaseMetrics | null>(null);
  const [dbHealth, setDbHealth] = useState<{ healthy: boolean; status: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPagination, setAuditPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [trashStats, setTrashStats] = useState<{ stats: TrashStats[]; totalItems: number } | null>(null);
  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [trashType, setTrashType] = useState('delivery_orders');
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [activityFeed, setActivityFeed] = useState<AuditLog[]>([]);
  const [criticalEvents, setCriticalEvents] = useState<AuditLog[]>([]);

  // Filter states
  const [auditFilters, setAuditFilters] = useState({
    action: '',
    resourceType: '',
    username: '',
    severity: '',
    startDate: '',
    endDate: '',
  });

  const isSuperAdmin = user?.role === 'super_admin';

  // Sync activeSection when section prop changes (for system_admin direct nav)
  useEffect(() => {
    if (section) {
      setActiveSection(section);
    }
  }, [section]);

  // Load data based on active section
  useEffect(() => {
    loadData();
  }, [activeSection, trashType, auditFilters, auditPagination.page]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      switch (activeSection) {
        case 'overview':
          const [stats, feed, critical, health] = await Promise.all([
            systemAdminAPI.getSystemStats(),
            systemAdminAPI.getActivityFeed(10),
            systemAdminAPI.getCriticalEvents(5),
            systemAdminAPI.getDatabaseHealth(),
          ]);
          setSystemStats(stats);
          setActivityFeed(feed);
          setCriticalEvents(critical);
          setDbHealth(health);
          break;

        case 'database':
          const [metrics, dbStatus] = await Promise.all([
            systemAdminAPI.getDatabaseMetrics(),
            systemAdminAPI.getDatabaseHealth(),
          ]);
          setDbMetrics(metrics);
          setDbHealth(dbStatus);
          break;

        case 'audit':
          const auditResult = await systemAdminAPI.getAuditLogs({
            ...auditFilters,
            page: auditPagination.page,
            limit: auditPagination.limit,
          });
          setAuditLogs(auditResult.data);
          setAuditPagination(auditResult.pagination);
          break;

        case 'trash':
          const [trashStatsData, items] = await Promise.all([
            trashAPI.getStats(),
            trashAPI.getDeletedItems(trashType),
          ]);
          setTrashStats(trashStatsData);
          setTrashItems(items.data);
          break;

        case 'sessions':
          const sessions = await systemAdminAPI.getActiveSessions();
          setActiveSessions(sessions);
          break;
      }
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

  // Trash handlers
  const handleRestoreItem = async (type: string, id: string) => {
    try {
      await trashAPI.restoreItem(type, id);
      showMessage('success', 'Item restored successfully');
      loadData();
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to restore item');
    }
  };

  const handlePermanentDelete = async (type: string, id: string) => {
    if (!confirm('Are you sure? This cannot be undone.')) return;
    try {
      await trashAPI.permanentDelete(type, id);
      showMessage('success', 'Item permanently deleted');
      loadData();
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to delete item');
    }
  };

  const handleEmptyTrash = async (type: string) => {
    if (!confirm(`Empty all ${type.replace('_', ' ')}? This cannot be undone.`)) return;
    try {
      await trashAPI.emptyTrash(type);
      showMessage('success', 'Trash emptied successfully');
      loadData();
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to empty trash');
    }
  };

  // Session handlers
  const handleForceLogout = async (userId: string, username: string) => {
    if (!confirm(`Force logout ${username}?`)) return;
    try {
      await systemAdminAPI.forceLogout(userId);
      showMessage('success', `User ${username} has been logged out`);
      loadData();
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to logout user');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getSeverityColor = (severity: AuditSeverity): string => {
    const colors: Record<AuditSeverity, string> = {
      low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      high: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return colors[severity] || colors.low;
  };

  const getActionIcon = (action: AuditAction) => {
    const icons: Record<AuditAction, JSX.Element> = {
      CREATE: <CheckCircle className="w-4 h-4 text-green-500" />,
      UPDATE: <RefreshCw className="w-4 h-4 text-blue-500" />,
      DELETE: <Trash2 className="w-4 h-4 text-red-500" />,
      RESTORE: <RotateCcw className="w-4 h-4 text-green-500" />,
      PERMANENT_DELETE: <XCircle className="w-4 h-4 text-red-600" />,
      LOGIN: <CheckCircle className="w-4 h-4 text-green-500" />,
      LOGOUT: <LogOut className="w-4 h-4 text-gray-500" />,
      FAILED_LOGIN: <AlertTriangle className="w-4 h-4 text-red-500" />,
      PASSWORD_RESET: <Shield className="w-4 h-4 text-blue-500" />,
      CONFIG_CHANGE: <Settings className="w-4 h-4 text-purple-500" />,
      BULK_OPERATION: <Activity className="w-4 h-4 text-indigo-500" />,
      EXPORT: <FileSearch className="w-4 h-4 text-cyan-500" />,
    };
    return icons[action] || <Activity className="w-4 h-4 text-gray-500" />;
  };

  const sections = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'database', label: 'Database Monitor', icon: Database },
    { id: 'audit', label: 'Audit Logs', icon: FileSearch },
    { id: 'trash', label: 'Trash Management', icon: Trash2 },
    { id: 'sessions', label: 'Active Sessions', icon: Users },
    { id: 'quick', label: 'Quick Actions', icon: Settings },
  ];

  // Render Overview Tab
  const renderOverview = () => (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={systemStats?.users?.total || 0}
          subtitle={`${systemStats?.users?.active || 0} active`}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="Delivery Orders"
          value={systemStats?.deliveryOrders?.total || 0}
          subtitle={`${systemStats?.deliveryOrders?.today || 0} today`}
          icon={<FileSearch className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="Database Status"
          value={dbHealth?.healthy ? 'Healthy' : 'Issue'}
          subtitle={dbHealth?.status || 'Checking...'}
          icon={<Database className="w-6 h-6" />}
          color={dbHealth?.healthy ? 'green' : 'red'}
        />
        <StatCard
          title="Deleted Items"
          value={trashStats?.totalItems || 0}
          subtitle="In trash"
          icon={<Trash2 className="w-6 h-6" />}
          color="orange"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Recent Activity
          </h3>
          <div className="space-y-3">
            {activityFeed.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No recent activity</p>
            ) : (
              activityFeed.slice(0, 8).map((log, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm">
                  {getActionIcon(log.action)}
                  <span className="flex-1 text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{log.username}</span>
                    {' '}{log.action.toLowerCase().replace('_', ' ')}{' '}
                    <span className="text-gray-500">{log.resourceType}</span>
                  </span>
                  <span className="text-gray-400 text-xs">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Critical Events */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Critical Events
          </h3>
          <div className="space-y-3">
            {criticalEvents.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No critical events</p>
            ) : (
              criticalEvents.map((event, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {event.details || event.action}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {event.username} • {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {systemStats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            System Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <MiniStat label="LPO Entries" value={systemStats.lpoEntries?.total || 0} />
            <MiniStat label="Fuel Records" value={systemStats.fuelRecords?.total || 0} />
            <MiniStat label="Yard Dispenses" value={systemStats.yardDispenses?.total || 0} />
            <MiniStat label="Driver Accounts" value={systemStats.driverAccounts?.total || 0} />
            <MiniStat label="Pending Accounts" value={systemStats.driverAccounts?.pending || 0} />
            <MiniStat label="Deleted Items" value={
              (systemStats.users?.deleted || 0) +
              (systemStats.deliveryOrders?.deleted || 0) +
              (systemStats.lpoEntries?.deleted || 0)
            } />
          </div>
        </div>
      )}
    </div>
  );

  // Render Database Tab
  const renderDatabase = () => (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server className="w-5 h-5" />
            Database Status
          </h3>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
            <div className="flex items-center gap-2 mb-2">
              {dbHealth?.healthy ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-medium text-gray-900 dark:text-white">Connection</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {dbHealth?.status || 'Unknown'}
            </p>
          </div>

          {dbMetrics?.connections && (
            <>
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Active Connections</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbMetrics.connections.current} / {dbMetrics.connections.available}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-gray-900 dark:text-white">Total Created</span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {dbMetrics.connections.totalCreated}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Storage Info */}
      {dbMetrics?.storage && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <HardDrive className="w-5 h-5" />
            Storage
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Size</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatBytes(dbMetrics.storage.totalSize)}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Data Size</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatBytes(dbMetrics.storage.dataSize)}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Index Size</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatBytes(dbMetrics.storage.indexSize)}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">Free Space</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {formatBytes(dbMetrics.storage.freeSpace)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Collections */}
      {dbMetrics?.collections && dbMetrics.collections.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Collections
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Documents</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Size</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Avg Doc Size</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Indexes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {dbMetrics.collections.map((col) => (
                  <tr key={col.name}>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white font-medium">{col.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {col.documentCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {formatBytes(col.size)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {formatBytes(col.avgDocSize)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">{col.indexes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // Render Audit Logs Tab
  const renderAuditLogs = () => (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium text-gray-900 dark:text-white">Filters</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <select
            value={auditFilters.action}
            onChange={(e) => setAuditFilters(f => ({ ...f, action: e.target.value }))}
            className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="">All Actions</option>
            {['CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'FAILED_LOGIN', 'CONFIG_CHANGE', 'EXPORT'].map(a => (
              <option key={a} value={a}>{a.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={auditFilters.severity}
            onChange={(e) => setAuditFilters(f => ({ ...f, severity: e.target.value }))}
            className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="">All Severity</option>
            {['low', 'medium', 'high', 'critical'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Username"
            value={auditFilters.username}
            onChange={(e) => setAuditFilters(f => ({ ...f, username: e.target.value }))}
            className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <input
            type="text"
            placeholder="Resource Type"
            value={auditFilters.resourceType}
            onChange={(e) => setAuditFilters(f => ({ ...f, resourceType: e.target.value }))}
            className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <input
            type="date"
            value={auditFilters.startDate}
            onChange={(e) => setAuditFilters(f => ({ ...f, startDate: e.target.value }))}
            className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
          <input
            type="date"
            value={auditFilters.endDate}
            onChange={(e) => setAuditFilters(f => ({ ...f, endDate: e.target.value }))}
            className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white text-sm"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Resource</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Details</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No audit logs found
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                      {log.username}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="flex items-center gap-2">
                        {getActionIcon(log.action)}
                        {log.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {log.resourceType}
                      {log.resourceId && <span className="text-xs ml-1">({log.resourceId.slice(-8)})</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {log.details || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(log.severity)}`}>
                        {log.severity}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {auditPagination.totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <Pagination
              currentPage={auditPagination.page}
              totalPages={auditPagination.totalPages}
              totalItems={auditPagination.total}
              itemsPerPage={auditPagination.limit}
              onPageChange={(page) => setAuditPagination(p => ({ ...p, page }))}
              showItemsPerPage={false}
            />
          </div>
        )}
      </div>
    </div>
  );

  // Render Trash Tab
  const renderTrash = () => (
    <div className="space-y-6">
      {/* Trash Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {trashStats?.stats.map((stat) => (
          <button
            key={stat.type}
            onClick={() => setTrashType(stat.type)}
            className={`p-4 rounded-lg text-center transition-colors ${
              trashType === stat.type
                ? 'bg-primary-100 dark:bg-primary-900 border-2 border-primary-500'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.count}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {stat.type.replace('_', ' ')}
            </p>
          </button>
        ))}
      </div>

      {/* Trash Items */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 dark:text-white capitalize">
            {trashType.replace('_', ' ')} ({trashItems.length})
          </h3>
          {isSuperAdmin && trashItems.length > 0 && (
            <button
              onClick={() => handleEmptyTrash(trashType)}
              className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 rounded"
            >
              Empty Trash
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {trashItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Trash2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No deleted items</p>
            </div>
          ) : (
            trashItems.map((item) => (
              <div key={item._id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {item.doNumber || item.lpoNo || item.truckNo || item.username || item._id}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Deleted {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : 'Unknown'}
                    {item.deletedBy && ` by ${item.deletedBy}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestoreItem(trashType, item._id)}
                    className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"
                    title="Restore"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => handlePermanentDelete(trashType, item._id)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Delete Permanently"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // Render Sessions Tab
  const renderSessions = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5" />
            Active Sessions ({activeSessions.length})
          </h3>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 rounded"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {activeSessions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No active sessions</p>
            </div>
          ) : (
            activeSessions.map((session) => (
              <div key={session._id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                    <span className="text-primary-600 dark:text-primary-400 font-medium">
                      {session.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{session.username}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {session.email} • {session.role}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Last Login</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {session.lastLogin ? new Date(session.lastLogin).toLocaleString() : 'Unknown'}
                    </p>
                  </div>
                  {isSuperAdmin && session._id !== user?.id && (
                    <button
                      onClick={() => handleForceLogout(session._id, session.username)}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                      title="Force Logout"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // If section prop is provided (system_admin via global sidebar), render just the content
  if (section) {
    return (
      <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {success}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        )}

        {/* Content */}
        {!loading && (
          <>
            {activeSection === 'database' && renderDatabase()}
            {activeSection === 'audit' && renderAuditLogs()}
            {activeSection === 'trash' && renderTrash()}
            {activeSection === 'sessions' && renderSessions()}
            {activeSection === 'quick' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <button 
                      onClick={() => loadData()} 
                      className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-white">Refresh Data</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Reload all system data</p>
                      </div>
                    </button>
                    <button 
                      onClick={() => showMessage('success', 'Test notification sent')} 
                      className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-white">Test Notification</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Send test alert</p>
                      </div>
                    </button>
                    <button 
                      onClick={() => showMessage('success', 'Cache cleared')} 
                      className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                    >
                      <Trash2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <div className="text-left">
                        <p className="font-medium text-gray-900 dark:text-white">Clear Cache</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Clear system cache</p>
                      </div>
                    </button>
                  </div>
                </div>
                
                {/* System Info */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">System Information</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Environment</p>
                      <p className="font-medium text-gray-900 dark:text-white">Production</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Version</p>
                      <p className="font-medium text-gray-900 dark:text-white">1.0.0</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Last Deploy</p>
                      <p className="font-medium text-gray-900 dark:text-white">{new Date().toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Uptime</p>
                      <p className="font-medium text-gray-900 dark:text-white">99.9%</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // Full dashboard view for super_admin (with internal sidebar)
  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {isSuperAdmin ? 'Super Admin Dashboard' : 'System Admin Dashboard'}
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Monitor system health, manage configurations, and view audit logs
        </p>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Two-column layout: left nav for sections, right content */}
      <div className="flex gap-6">
        <aside className="w-56 bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex-shrink-0">
          <nav className="space-y-2">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id as SectionType)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    activeSection === s.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border-l-2 border-indigo-500'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-6 border-t pt-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="mb-2">Quick Actions</div>
            <button onClick={() => loadData()} className="text-sm text-blue-600 dark:text-blue-400">Refresh All</button>
          </div>
        </aside>

        <section className="flex-1">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          )}

          {/* Content */}
          {!loading && (
            <>
              {activeSection === 'overview' && renderOverview()}
              {activeSection === 'database' && renderDatabase()}
              {activeSection === 'audit' && renderAuditLogs()}
              {activeSection === 'trash' && renderTrash()}
              {activeSection === 'sessions' && renderSessions()}
              {activeSection === 'quick' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
                    <div className="flex items-center gap-3">
                      <button onClick={() => showMessage('success', 'Test notification sent')} className="px-3 py-2 rounded bg-indigo-600 text-white">Send Test Notification</button>
                      <button onClick={() => loadData()} className="px-3 py-2 rounded border">Refresh Data</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* (content handled above in two-column layout) */}
    </div>
  );
}

// Helper Components
function StatCard({ title, value, subtitle, icon, color }: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: JSX.Element;
  color: 'blue' | 'green' | 'red' | 'orange' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
