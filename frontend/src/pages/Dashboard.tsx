import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { dashboardAPI } from '../services/api';
import { DashboardStats } from '../types';

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getStats();
      setStats(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch dashboard stats:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-300">{error || 'No data available'}</p>
      </div>
    );
  }

  const statsCards = [
    { 
      name: 'Total Delivery Orders', 
      value: stats.totalDOs.toString(), 
      change: '+12%', 
      changeType: 'increase' 
    },
    { 
      name: 'Active LPOs', 
      value: stats.totalLPOs.toString(), 
      change: '+8%', 
      changeType: 'increase' 
    },
    { 
      name: 'Fuel Records', 
      value: stats.totalFuelRecords.toString(), 
      change: '+5%', 
      changeType: 'increase' 
    },
    { 
      name: 'Total Tonnage', 
      value: stats.totalTonnage.toLocaleString(), 
      change: '+15%', 
      changeType: 'increase' 
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Overview</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Welcome to the Fuel Order Management System
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statsCards.map((stat) => (
          <div
            key={stat.name}
            className="bg-white dark:bg-gray-800 overflow-hidden shadow dark:shadow-gray-700/30 rounded-lg transition-colors"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 truncate">
                    {stat.name}
                  </p>
                  <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-gray-100">
                    {stat.value}
                  </p>
                </div>
                <div className={`
                  flex items-center text-sm font-semibold
                  ${stat.changeType === 'increase' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                `}>
                  {stat.changeType === 'increase' ? (
                    <TrendingUp className="w-4 h-4 mr-1" />
                  ) : (
                    <TrendingDown className="w-4 h-4 mr-1" />
                  )}
                  {stat.change}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-6 transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recent Delivery Orders
          </h3>
          <div className="space-y-3">
            {stats.recentActivities?.deliveryOrders && stats.recentActivities.deliveryOrders.length > 0 ? (
              stats.recentActivities.deliveryOrders.slice(0, 5).map((DO, index) => (
                <div key={`${DO.id || DO.doNumber}-${index}`} className="flex items-center justify-between py-2 border-b dark:border-gray-700">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{DO.doNumber}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{DO.haulier} - {DO.truckNo}</p>
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{DO.tonnages} tons</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No recent delivery orders</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-6 transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recent LPOs
          </h3>
          <div className="space-y-3">
            {stats.recentActivities?.lpoEntries && stats.recentActivities.lpoEntries.length > 0 ? (
              stats.recentActivities.lpoEntries.slice(0, 5).map((lpo, index) => (
                <div key={`${lpo.id || lpo.lpoNo}-${index}`} className="flex items-center justify-between py-2 border-b dark:border-gray-700">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{lpo.lpoNo}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{lpo.dieselAt}</p>
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{lpo.ltrs} L</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No recent LPOs</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
