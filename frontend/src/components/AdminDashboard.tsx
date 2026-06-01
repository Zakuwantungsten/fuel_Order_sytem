import { useState, useEffect } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { adminAPI } from '../services/api';
import OperationalOverviewTab from './StandardAdmin/OperationalOverviewTab';
import DataManagementTab from './StandardAdmin/DataManagementTab';
import UserSupportTab from './StandardAdmin/UserSupportTab';
import BasicReportsTab from './StandardAdmin/BasicReportsTab';
import FuelStationsTab from './SuperAdmin/FuelStationsTab';
import RoutesTab from './SuperAdmin/RoutesTab';
import FuelPriceTab from './SuperAdmin/FuelPriceTab';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';

interface AdminDashboardProps {
  user: any;
  section?: 'overview' | 'data' | 'users' | 'fuel_stations' | 'fuel_prices' | 'routes' | 'reports';
}

export default function AdminDashboard({ user, section = 'overview' }: AdminDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (section === 'overview') {
      loadData();
    }
  }, [section]);

  const loadData = async () => {
    setLoading(true);
    try {
      const statsData = await adminAPI.getStats();
      setStats(statsData);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(
    ['fuel_records', 'delivery_orders', 'lpo_summaries', 'users'],
    loadData
  );

  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      toast.success(message);
    } else {
      toast.error(message);
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

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <UnifiedTabLoader label="Loading admin section..." />
        ) : (
          <>
            {section === 'overview' && <OperationalOverviewTab stats={stats} onRefresh={loadData} />}
            {section === 'data' && <DataManagementTab user={user} showMessage={showMessage} />}
            {section === 'users' && <UserSupportTab user={user} showMessage={showMessage} />}
            {section === 'fuel_stations' && <FuelStationsTab onMessage={showMessage} />}
            {section === 'fuel_prices' && <FuelPriceTab onMessage={(msg, type) => showMessage(type === 'info' ? 'success' : (type ?? 'success'), msg)} />}
            {section === 'routes' && <RoutesTab onMessage={showMessage} />}
            {section === 'reports' && <BasicReportsTab user={user} showMessage={showMessage} />}
          </>
        )}
      </div>
    </div>
  );
}
