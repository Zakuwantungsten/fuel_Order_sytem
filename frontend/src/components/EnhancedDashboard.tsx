import { useState, useEffect } from 'react';
import { 
  FileText, 
  Fuel, 
  ClipboardList, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  Bell,
  TruckIcon,
  MapPin,
  DollarSign,
  Truck,
  Settings,
  Sun,
  Moon
} from 'lucide-react';
import YardFuelEntry from './YardFuelEntry';
import YardFuelSimple from './YardFuelSimple';
import Reports from './Reports';
import DriverPortal from './DriverPortal';
import StationView from './StationView';
import PaymentManager from './PaymentManager';
import AdminDashboard from './AdminDashboard';
import { useAuth } from '../contexts/AuthContext';

// Import your existing components
import Dashboard from '../pages/Dashboard';
import DeliveryOrders from '../pages/DeliveryOrders';
import LPOs from '../pages/LPOs';
import FuelRecordsPage from '../pages/FuelRecords';

interface EnhancedDashboardProps {
  user: any;
  onLogout: () => void;
}

// Helper function to get initial tab based on user role and localStorage
const getInitialTab = (userRole: string): string => {
  const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard'].includes(userRole);
  const isDriver = userRole === 'driver';
  
  // Get stored tab from localStorage
  const storedTab = localStorage.getItem('fuel_order_active_tab');
  
  // Define valid tabs for each role type
  const getValidTabs = () => {
    if (isDriver) return ['driver_portal'];
    if (isYardRole || userRole === 'yard_personnel') return ['yard_fuel'];
    if (userRole === 'super_admin' || userRole === 'admin' || userRole === 'boss') {
      return ['overview', 'do', 'fuel_records', 'lpo', 'reports', 'admin'];
    }
    if (userRole === 'fuel_order_maker') {
      return ['overview', 'do', 'fuel_records', 'lpo', 'reports'];
    }
    if (userRole === 'payment_manager') {
      return ['overview', 'payments'];
    }
    if (userRole === 'fuel_attendant' || userRole === 'station_manager') {
      return ['overview', 'station_view'];
    }
    return ['overview'];
  };
  
  const validTabs = getValidTabs();
  
  // If stored tab is valid for this role, use it
  if (storedTab && validTabs.includes(storedTab)) {
    return storedTab;
  }
  
  // Default based on role
  if (isYardRole || userRole === 'yard_personnel') return 'yard_fuel';
  if (isDriver) return 'driver_portal';
  return 'overview';
};

export function EnhancedDashboard({ user }: EnhancedDashboardProps) {
  // Check if user is a driver
  const isDriver = user.role === 'driver';
  
  // For drivers, default to driver_portal, no overview
  // Now reads from localStorage to persist across refreshes
  const [activeTab, setActiveTab] = useState(() => getInitialTab(user.role));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { logout, toggleTheme, isDark } = useAuth();

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('fuel_order_active_tab', activeTab);
  }, [activeTab]);

  const getMenuItems = () => {
    // Drivers only see their portal, no overview
    if (isDriver) {
      return [
        { id: 'driver_portal', label: 'My Orders', icon: TruckIcon },
      ];
    }

    const baseItems = [
      { id: 'overview', label: 'Overview', icon: BarChart3 },
    ];

    // Check if user is a yard-specific role
    const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard'].includes(user.role);

    // Admin roles get admin dashboard
    if (user.role === 'super_admin' || user.role === 'admin' || user.role === 'boss') {
      return [
        ...baseItems,
        { id: 'do', label: 'DO Management', icon: FileText },
        { id: 'fuel_records', label: 'Fuel Records', icon: Fuel },
        { id: 'lpo', label: 'LPO Management', icon: ClipboardList },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        { id: 'admin', label: 'Admin Settings', icon: Settings },
      ];
    }

    if (user.role === 'fuel_order_maker') {
      return [
        ...baseItems,
        { id: 'do', label: 'DO Management', icon: FileText },
        { id: 'fuel_records', label: 'Fuel Records', icon: Fuel },
        { id: 'lpo', label: 'LPO Management', icon: ClipboardList },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
      ];
    }

    if (user.role === 'payment_manager') {
      return [
        ...baseItems,
        { id: 'payments', label: 'Payment & Order Management', icon: DollarSign },
      ];
    }

    if (user.role === 'yard_personnel' || isYardRole) {
      return [
        { id: 'yard_fuel', label: 'Fuel Dispense', icon: Fuel },
      ];
    }

    if (user.role === 'fuel_attendant' || user.role === 'station_manager') {
      return [
        ...baseItems,
        { id: 'station_view', label: 'Station Orders', icon: MapPin },
      ];
    }

    return baseItems;
  };

  const renderActiveComponent = () => {
    // Check if user is a yard-specific role
    const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard'].includes(user.role);

    switch (activeTab) {
      case 'overview':
        return <Dashboard />;
      case 'do':
        return <DeliveryOrders />;
      case 'fuel_records':
        return <FuelRecordsPage />;
      case 'lpo':
        return <LPOs />;
      case 'yard_fuel':
        // Use simple mobile UI for yard-specific roles
        if (isYardRole) {
          return <YardFuelSimple user={user} />;
        }
        return <YardFuelEntry user={user} />;
      case 'driver_portal':
        return <DriverPortal user={user} />;
      case 'station_view':
        return <StationView user={user} />;
      case 'payments':
        return <PaymentManager user={user} />;
      case 'reports':
        return <Reports user={user} />;
      case 'admin':
        return <AdminDashboard user={user} />;
      default:
        return <Dashboard />;
    }
  };

  const menuItems = getMenuItems();

  // For drivers, show full-screen mobile layout
  if (isDriver) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors">
        {/* Mobile Header for Drivers */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 p-4 flex items-center justify-between flex-shrink-0 md:hidden">
          <div className="flex items-center space-x-3">
            <Truck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span className="font-bold text-gray-800 dark:text-gray-100">Driver Portal</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={logout}
              className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Driver Content */}
        <main className="flex-1 overflow-y-auto">
          {renderActiveComponent()}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden transition-colors">
      {/* Sidebar */}
      <div className={`bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 flex flex-col ${sidebarOpen ? 'w-64' : 'w-16'}`}>
        <div className="p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div>
                <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">Fuel Order</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Management System</p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <nav className="mt-8 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  activeTab === item.id 
                    ? 'bg-indigo-50 dark:bg-indigo-900/30 border-r-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <IconComponent className="w-5 h-5" />
                {sidebarOpen && <span className="ml-3">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t dark:border-gray-700 flex-shrink-0 mt-auto">
          {sidebarOpen && (
            <div className="mb-4">
              <div className="text-sm text-gray-500 dark:text-gray-400">Logged in as</div>
              <div className="font-medium text-gray-800 dark:text-gray-100">{user.firstName} {user.lastName}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 capitalize">{user.role?.replace('_', ' ')}</div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            {sidebarOpen && <span className="ml-3">Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 p-4 flex-shrink-0 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                {menuItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
              </h2>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={toggleTheme}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <Bell className="w-5 h-5" />
              </button>
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user.firstName?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-gray-700 dark:text-gray-200 font-medium">{user.firstName} {user.lastName}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-gray-900 transition-colors">
          {renderActiveComponent()}
        </main>
      </div>
    </div>
  );
}

export default EnhancedDashboard;