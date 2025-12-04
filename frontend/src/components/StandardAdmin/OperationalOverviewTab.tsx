import React from 'react';
import {
  FileText,
  ClipboardList,
  Fuel,
  TrendingUp,
  Users,
  Activity,
  CheckCircle,
  Clock,
  RefreshCw,
  TruckIcon,
} from 'lucide-react';

interface OperationalOverviewTabProps {
  stats: any;
  onRefresh: () => void;
}

export default function OperationalOverviewTab({ stats, onRefresh }: OperationalOverviewTabProps) {
  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Loading statistics...</p>
      </div>
    );
  }

  const todayStats = {
    dos: stats.records?.deliveryOrders || 0,
    lpos: stats.records?.lpoEntries || 0,
    fuelRecords: stats.records?.fuelRecords || 0,
    yardDispenses: stats.records?.yardDispenses || 0,
  };

  return (
    <div className="space-y-6">
      {/* Today's Metrics - 4 Cards in a Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Today's DOs */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">Today's DOs</p>
              <p className="text-3xl font-bold">{todayStats.dos}</p>
              <p className="text-blue-100 text-xs mt-2">Delivery Orders</p>
            </div>
            <FileText className="w-12 h-12 text-blue-200 opacity-80" />
          </div>
        </div>

        {/* Active LPOs */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm mb-1">Active LPOs</p>
              <p className="text-3xl font-bold">{todayStats.lpos}</p>
              <p className="text-purple-100 text-xs mt-2">LPO Entries</p>
            </div>
            <ClipboardList className="w-12 h-12 text-purple-200 opacity-80" />
          </div>
        </div>

        {/* Pending Fuel */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm mb-1">Fuel Records</p>
              <p className="text-3xl font-bold">{todayStats.fuelRecords}</p>
              <p className="text-orange-100 text-xs mt-2">Total Records</p>
            </div>
            <Fuel className="w-12 h-12 text-orange-200 opacity-80" />
          </div>
        </div>

        {/* Yard Status */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Yard Dispenses</p>
              <p className="text-3xl font-bold">{todayStats.yardDispenses}</p>
              <p className="text-green-100 text-xs mt-2">Active</p>
            </div>
            <TruckIcon className="w-12 h-12 text-green-200 opacity-80" />
          </div>
        </div>
      </div>

      {/* User Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Total Users</h3>
            <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{stats.users?.total || 0}</p>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-400">
                Active: {stats.users?.active || 0}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-400">
                Inactive: {stats.users?.inactive || 0}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pending Approvals</h3>
            <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">0</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
            Items awaiting review
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Data Health</h3>
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">100%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
            All systems operational
          </p>
        </div>
      </div>

      {/* Recent Activity Feed */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Recent Activity
          </h3>
          <button
            onClick={onRefresh}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="space-y-3">
          {stats.recentUsers && stats.recentUsers.length > 0 ? (
            stats.recentUsers.slice(0, 5).map((user: any, idx: number) => (
              <div
                key={user._id || idx}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium text-sm">
                      {user.firstName?.[0]}{user.lastName?.[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                      {user.role?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  user.isActive
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
              No recent activity
            </p>
          )}
        </div>
      </div>

      {/* Role Distribution */}
      {stats.roleDistribution && stats.roleDistribution.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            User Role Distribution
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.roleDistribution.map((role: any) => (
              <div key={role.role} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize mb-1">
                  {role.role.replace(/_/g, ' ')}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{role.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
