import { useState } from 'react';
import { 
  FileText, 
  Fuel, 
  ClipboardList, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  Bell,
  TruckIcon
} from 'lucide-react';
import { DOManagement } from './DOManagement';
import { FuelRecords } from './FuelRecords';
import { LPOManagement } from './LPOManagement';
import { YardFuelEntry } from './YardFuelEntry';
import { Reports } from './Reports';
import { DriverPortal } from './DriverPortal';
import { StationView } from './StationView';
import { PaymentManager } from './PaymentManager';

interface DashboardProps {
  user: any;
  onLogout: () => void;
}

export function Dashboard({ user, onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const getMenuItems = () => {
    const baseItems = [
      { id: 'overview', label: 'Overview', icon: BarChart3 },
    ];

    if (user.role === 'fuel_order_maker' || user.role === 'boss') {
      return [
        ...baseItems,
        { id: 'do', label: 'DO Management', icon: FileText },
        { id: 'fuel_records', label: 'Fuel Records', icon: Fuel },
        { id: 'lpo', label: 'LPO Management', icon: ClipboardList },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ];
    }

    if (user.role === 'yard_personnel') {
      return [
        ...baseItems,
        { id: 'yard_fuel', label: 'Yard Fuel Entry', icon: Fuel },
      ];
    }

    if (user.role === 'driver') {
      return [
        { id: 'driver_portal', label: 'My Orders', icon: TruckIcon },
      ];
    }

    if (user.role === 'fuel_attendant' || user.role === 'station_manager') {
      return [
        { id: 'station_view', label: 'Station Orders', icon: ClipboardList },
      ];
    }

    if (user.role === 'payment_manager') {
      return [
        ...baseItems,
        { id: 'payment_manager', label: 'Manage Orders', icon: ClipboardList },
      ];
    }

    return baseItems;
  };

  const menuItems = getMenuItems();

  const renderContent = () => {
    switch (activeTab) {
      case 'do':
        return <DOManagement user={user} />;
      case 'fuel_records':
        return <FuelRecords user={user} />;
      case 'lpo':
        return <LPOManagement user={user} />;
      case 'yard_fuel':
        return <YardFuelEntry user={user} />;
      case 'reports':
        return <Reports user={user} />;
      case 'driver_portal':
        return <DriverPortal user={user} />;
      case 'station_view':
        return <StationView user={user} />;
      case 'payment_manager':
        return <PaymentManager user={user} />;
      default:
        return <OverviewContent user={user} />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
              >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
              <div className="flex items-center ml-4 lg:ml-0">
                <TruckIcon className="w-8 h-8 text-indigo-600" />
                <span className="ml-2 text-gray-900">Tahmeed Fuel System</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-500 relative">
                <Bell className="w-6 h-6" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.role.replace(/_/g, ' ')}</div>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 rounded-md"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex pt-16">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } fixed lg:static lg:translate-x-0 inset-y-0 left-0 z-20 w-64 bg-white border-r border-gray-200 pt-16 lg:pt-0 transition-transform duration-300 ease-in-out`}
        >
          <nav className="h-full overflow-y-auto py-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center px-6 py-3 text-left transition-colors ${
                    activeTab === item.id
                      ? 'bg-indigo-50 text-indigo-600 border-r-4 border-indigo-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-8">
          {renderContent()}
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}
    </div>
  );
}

function OverviewContent({ user }: { user: any }) {
  const stats = [
    { label: 'Active Trucks', value: '487', change: '+12' },
    { label: 'Pending LPOs', value: '23', change: '+5' },
    { label: 'Fuel This Month', value: '145,200L', change: '+8%' },
    { label: 'Active Routes', value: '156', change: '+3' },
  ];

  return (
    <div>
      <h1 className="text-gray-900 mb-6">Welcome, {user.name}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">{stat.label}</div>
            <div className="flex items-end justify-between">
              <div className="text-gray-900">{stat.value}</div>
              <div className="text-sm text-green-600">{stat.change}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-gray-900 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {[
              { action: 'LPO #2356 created', time: '10 mins ago', station: 'LAKE KAPIRI' },
              { action: 'DO #6842 updated', time: '25 mins ago', station: 'DAR' },
              { action: 'Yard fuel entry', time: '1 hour ago', station: 'TANGA YARD' },
              { action: 'LPO #2355 completed', time: '2 hours ago', station: 'LAKE NDOLA' },
            ].map((activity, idx) => (
              <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <div>
                  <div className="text-sm text-gray-900">{activity.action}</div>
                  <div className="text-xs text-gray-500">{activity.station}</div>
                </div>
                <div className="text-xs text-gray-400">{activity.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {user.role === 'fuel_order_maker' || user.role === 'boss' ? (
              <>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-center">
                  <FileText className="w-6 h-6 mx-auto mb-2 text-indigo-600" />
                  <div className="text-sm text-gray-700">Create DO</div>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-center">
                  <ClipboardList className="w-6 h-6 mx-auto mb-2 text-indigo-600" />
                  <div className="text-sm text-gray-700">Create LPO</div>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-center">
                  <Fuel className="w-6 h-6 mx-auto mb-2 text-indigo-600" />
                  <div className="text-sm text-gray-700">Fuel Records</div>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors text-center">
                  <BarChart3 className="w-6 h-6 mx-auto mb-2 text-indigo-600" />
                  <div className="text-sm text-gray-700">Reports</div>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
