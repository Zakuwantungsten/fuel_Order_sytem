import { useState, useEffect } from 'react';
import {
  Activity,
  RefreshCw,
  X,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { adminAPI } from '../services/api';
import OperationalOverviewTab from './StandardAdmin/OperationalOverviewTab';
import DataManagementTab from './StandardAdmin/DataManagementTab';
import UserSupportTab from './StandardAdmin/UserSupportTab';
import BasicReportsTab from './StandardAdmin/BasicReportsTab';
import FuelStationsTab from './SuperAdmin/FuelStationsTab';
import RoutesTab from './SuperAdmin/RoutesTab';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface StandardAdminDashboardProps {
  user: any;
  section?: 'overview' | 'data' | 'users' | 'fuel_stations' | 'routes' | 'reports';
}

export default function StandardAdminDashboard({ user, section = 'overview' }: StandardAdminDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (section === 'overview') {
      loadData();
    }
  }, [section]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const statsData = await adminAPI.getStats();
      setStats(statsData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(
    ['fuel_records', 'delivery_orders', 'lpo_entries', 'users'],
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

  const getSectionTitle = () => {
    const titles: Record<string, string> = {
      overview: 'Operational Overview',
      data: 'Data Management',
      users: 'User Support',
      fuel_stations: 'Fuel Stations Management',
      routes: 'Routes Management',
      reports: 'Reports',
    };
    return titles[section] || 'Admin Dashboard';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 transition-colors">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Activity className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
                {getSectionTitle()}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {user.firstName} {user.lastName} • {user.role.replace('_', ' ').charAt(0).toUpperCase() + user.role.replace('_', ' ').slice(1)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {section === 'overview' && (
                <button
                  onClick={loadData}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {section === 'overview' && <OperationalOverviewTab stats={stats} onRefresh={loadData} />}
            {section === 'data' && <DataManagementTab user={user} showMessage={showMessage} />}
            {section === 'users' && <UserSupportTab user={user} showMessage={showMessage} />}
            {section === 'fuel_stations' && <FuelStationsTab onMessage={showMessage} />}
            {section === 'routes' && <RoutesTab onMessage={showMessage} />}
            {section === 'reports' && <BasicReportsTab user={user} showMessage={showMessage} />}
          </>
        )}
      </div>
    </div>
  );
}
