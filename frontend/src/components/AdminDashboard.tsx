import { Activity } from 'lucide-react';
import { toast } from 'react-toastify';
import UserSupportTab from './StandardAdmin/UserSupportTab';
import BasicReportsTab from './StandardAdmin/BasicReportsTab';
import FuelStationsTab from './SuperAdmin/FuelStationsTab';
import RoutesTab from './SuperAdmin/RoutesTab';
import FuelPriceTab from './SuperAdmin/FuelPriceTab';

interface AdminDashboardProps {
  user: any;
  section?: 'users' | 'fuel_stations' | 'fuel_prices' | 'routes' | 'reports';
  initialDestination?: string;
  onDestinationConsumed?: () => void;
}

export default function AdminDashboard({ user, section = 'users', initialDestination, onDestinationConsumed }: AdminDashboardProps) {
  const showMessage = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      toast.success(message);
    } else {
      toast.error(message);
    }
  };

  const getSectionTitle = () => {
    const titles: Record<string, string> = {
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
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {section === 'users' && <UserSupportTab user={user} showMessage={showMessage} />}
        {section === 'fuel_stations' && <FuelStationsTab onMessage={showMessage} />}
        {section === 'fuel_prices' && <FuelPriceTab onMessage={(msg, type) => showMessage(type === 'info' ? 'success' : (type ?? 'success'), msg)} />}
        {section === 'routes' && <RoutesTab onMessage={showMessage} initialDestination={initialDestination} onDestinationConsumed={onDestinationConsumed} />}
        {section === 'reports' && <BasicReportsTab user={user} showMessage={showMessage} />}
      </div>
    </div>
  );
}
