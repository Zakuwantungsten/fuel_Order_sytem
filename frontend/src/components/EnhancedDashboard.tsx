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
  Moon,
  Shield,
  Database,
  FileSearch,
  Trash2,
  Users,
  Zap,
  TrendingUp
} from 'lucide-react';
import YardFuelSimple from './YardFuelSimple';
import Reports from './Reports';
import DriverPortal from './DriverPortal';
import StationView from './StationView';
import PaymentManager from './PaymentManager';
import SystemAdminDashboard from './SystemAdminDashboard';
import SuperAdminDashboard from './SuperAdminDashboard';
import StandardAdminDashboard from './StandardAdminDashboard';
import ManagerView from './ManagerView';
import OfficerPortal from './OfficerPortal';
import PendingYardFuel from './PendingYardFuel';
import NotificationsPage from './NotificationsPage';
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';
import { useNavigate } from 'react-router-dom';

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
  const isManager = userRole === 'manager' || userRole === 'super_manager' || userRole === 'station_manager';
  
  // Get stored tab and role from localStorage
  const storedTab = localStorage.getItem('fuel_order_active_tab');
  const storedRole = localStorage.getItem('fuel_order_active_role');
  
  // Define valid tabs for each role type
  const getValidTabs = () => {
    if (isDriver) return ['driver_portal'];
    if (isYardRole || userRole === 'yard_personnel') return ['yard_fuel'];
    if (userRole === 'super_admin') {
      return [
        'overview', 'do', 'fuel_records', 'lpo', 'reports',
        'sa_overview', 'sa_database', 'sa_users', 'sa_config', 
        'sa_audit', 'sa_security', 'sa_trash', 'sa_backup', 'sa_analytics'
      ];
    }
    if (userRole === 'system_admin') {
      return ['sys_database', 'sys_audit', 'sys_trash', 'sys_sessions', 'sys_quick'];
    }
    if (userRole === 'admin' || userRole === 'boss') {
      return [
        'overview', 'do', 'fuel_records', 'lpo', 'reports',
        'admin_overview', 'admin_data', 'admin_users', 'admin_reports', 'admin_quick'
      ];
    }
    if (userRole === 'fuel_order_maker') {
      return ['overview', 'do', 'fuel_records', 'lpo', 'reports'];
    }
    if (userRole === 'payment_manager') {
      return ['overview', 'payments'];
    }
    if (userRole === 'fuel_attendant') {
      return ['overview', 'station_view'];
    }
    if (isManager) {
      return ['manager_view'];
    }
    return ['overview'];
  };
  
  const validTabs = getValidTabs();
  
  // Only use stored tab if it's for the SAME role and is valid
  if (storedTab && storedRole === userRole && validTabs.includes(storedTab)) {
    return storedTab;
  }
  
  // Default based on role
  if (isYardRole || userRole === 'yard_personnel') return 'yard_fuel';
  if (isDriver) return 'driver_portal';
  if (isManager) return 'manager_view';
  if (userRole === 'system_admin') return 'sys_database';
  if (userRole === 'super_admin') return 'sa_overview'; // Super admin should start at their overview, not generic overview
  return 'overview';
};

export function EnhancedDashboard({ user }: EnhancedDashboardProps) {
  // Check if user is a driver or officer
  const isDriver = user.role === 'driver';
  const isOfficer = user.role === 'import_officer' || user.role === 'export_officer';
  const isManager = user.role === 'manager' || user.role === 'super_manager' || user.role === 'station_manager';
  
  // For drivers, default to driver_portal, no overview
  // Now reads from localStorage to persist across refreshes
  const [activeTab, setActiveTab] = useState(() => getInitialTab(user.role));
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showPendingYardFuel, setShowPendingYardFuel] = useState(false);
  const [showNotificationsPage, setShowNotificationsPage] = useState(false);
  const [editDoId, setEditDoId] = useState<string | null>(null);
  const { logout, toggleTheme, isDark } = useAuth();

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('fuel_order_active_tab', activeTab);
    localStorage.setItem('fuel_order_active_role', user.role);
  }, [activeTab, user.role]);

  // Reset to default tab when user role changes (e.g., after login/logout)
  useEffect(() => {
    const defaultTab = getInitialTab(user.role);
    setActiveTab(defaultTab);
  }, [user.role]);

  // Handle edit DO ID by updating URL search params
  useEffect(() => {
    if (editDoId && activeTab === 'do') {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('edit', editDoId);
      window.history.replaceState({}, '', currentUrl.toString());
      // Dispatch a custom event to notify child components
      window.dispatchEvent(new CustomEvent('urlchange'));
      // Clear the editDoId after setting
      setEditDoId(null);
    }
  }, [editDoId, activeTab]);

  const getMenuItems = () => {
    // Drivers only see their portal, no overview
    if (isDriver) {
      return [
        { id: 'driver_portal', label: 'My Orders', icon: TruckIcon },
      ];
    }

    // Manager/Super Manager/Station Manager - only see LPO view
    if (isManager) {
      let label = 'Station LPOs';
      if (user.role === 'super_manager') {
        label = 'All Stations LPOs';
      } else if (user.role === 'station_manager') {
        label = `${user.station || 'My Station'} LPOs`;
      }
      return [
        { id: 'manager_view', label, icon: ClipboardList },
      ];
    }

    const baseItems = [
      { id: 'overview', label: 'Overview', icon: BarChart3 },
    ];

    // Check if user is a yard-specific role
    const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard'].includes(user.role);

    // Super Admin gets only super admin specific sections
    if (user.role === 'super_admin') {
      return [
        { id: 'sa_overview', label: 'Super Admin Overview', icon: Shield },
        { id: 'sa_database', label: 'Database Monitor', icon: Database },
        { id: 'sa_users', label: 'User Management', icon: Users },
        { id: 'sa_config', label: 'Configuration', icon: Settings },
        { id: 'sa_audit', label: 'Audit & Logs', icon: FileSearch },
        { id: 'sa_security', label: 'Security', icon: Shield },
        { id: 'sa_trash', label: 'Trash Management', icon: Trash2 },
        { id: 'sa_backup', label: 'Backup & Recovery', icon: Database },
        { id: 'sa_analytics', label: 'Analytics & Reports', icon: BarChart3 },
      ];
    }

    // System Admin gets system monitoring sections directly in sidebar
    if (user.role === 'system_admin') {
      return [
        { id: 'sys_database', label: 'Database Monitor', icon: Database },
        { id: 'sys_audit', label: 'Audit Logs', icon: FileSearch },
        { id: 'sys_trash', label: 'Trash Management', icon: Trash2 },
        { id: 'sys_sessions', label: 'Active Sessions', icon: Users },
        { id: 'sys_quick', label: 'Quick Actions', icon: Zap },
      ];
    }

    // Admin and Boss roles get expanded admin dashboard sections
    if (user.role === 'admin' || user.role === 'boss') {
      return [
        ...baseItems,
        { id: 'do', label: 'DO Management', icon: FileText },
        { id: 'fuel_records', label: 'Fuel Records', icon: Fuel },
        { id: 'lpo', label: 'LPO Management', icon: ClipboardList },
        { id: 'reports', label: 'Reports', icon: BarChart3 },
        // Admin sections - expanded in sidebar
        { id: 'admin_overview', label: 'Operational Overview', icon: BarChart3 },
        { id: 'admin_data', label: 'Data Management', icon: FileText },
        { id: 'admin_users', label: 'User Support', icon: Users },
        { id: 'admin_reports', label: 'Admin Reports', icon: TrendingUp },
        { id: 'admin_quick', label: 'Quick Actions', icon: Zap },
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
        return <YardFuelSimple user={user} />;
      case 'driver_portal':
        return <DriverPortal user={user} />;
      case 'station_view':
        return <StationView user={user} />;
      case 'payments':
        return <PaymentManager user={user} />;
      case 'reports':
        return <Reports user={user} />;
      
      // Super Admin sections
      case 'sa_overview':
        return <SuperAdminDashboard user={user} section="overview" />;
      case 'sa_database':
        return <SuperAdminDashboard user={user} section="database" />;
      case 'sa_users':
        return <SuperAdminDashboard user={user} section="users" />;
      case 'sa_config':
        return <SuperAdminDashboard user={user} section="config" />;
      case 'sa_audit':
        return <SuperAdminDashboard user={user} section="audit" />;
      case 'sa_security':
        return <SuperAdminDashboard user={user} section="security" />;
      case 'sa_trash':
        return <SuperAdminDashboard user={user} section="trash" />;
      case 'sa_backup':
        return <SuperAdminDashboard user={user} section="backup" />;
      case 'sa_analytics':
        return <SuperAdminDashboard user={user} section="analytics" />;
      
      // Standard Admin sections (admin/boss roles)
      case 'admin_overview':
        return <StandardAdminDashboard user={user} section="overview" />;
      case 'admin_data':
        return <StandardAdminDashboard user={user} section="data" />;
      case 'admin_users':
        return <StandardAdminDashboard user={user} section="users" />;
      case 'admin_reports':
        return <StandardAdminDashboard user={user} section="reports" />;
      case 'admin_quick':
        return <StandardAdminDashboard user={user} section="quick-actions" />;
      
      // System Admin sections  
      case 'sys_database':
        return <SystemAdminDashboard user={user} section="database" />;
      case 'sys_audit':
        return <SystemAdminDashboard user={user} section="audit" />;
      case 'sys_trash':
        return <SystemAdminDashboard user={user} section="trash" />;
      case 'sys_sessions':
        return <SystemAdminDashboard user={user} section="sessions" />;
      case 'sys_quick':
        return <SystemAdminDashboard user={user} section="quick" />;
      
      case 'manager_view':
        return <ManagerView user={user} />;
      default:
        return <Dashboard />;
    }
  };

  const menuItems = getMenuItems();
  
  // Check if user is a yard-specific role
  const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard', 'yard_personnel'].includes(user.role);

  // For import/export officers, show simplified officer portal without sidebar
  if (isOfficer) {
    return <OfficerPortal user={user} />;
  }

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

  // For station managers (station_manager, manager, super_manager), show full-screen layout without sidebar
  if (isManager) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors">
        {/* Main Content - Full screen without sidebar */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {renderActiveComponent()}
        </main>
      </div>
    );
  }

  // For yard personnel (dar_yard, tanga_yard, mmsa_yard, yard_personnel), show full-screen layout without sidebar
  if (isYardRole) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors">
        {/* Main Content - Full screen without sidebar */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
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
              
              {/* Notification Bell */}
              <NotificationBell 
                onNotificationClick={(notification) => {
                  if (notification.metadata?.fuelRecordId) {
                    setActiveTab('fuel_records');
                  }
                }}
                onEditDO={(doId) => {
                  // Switch to DO tab first
                  setActiveTab('do');
                  // Then set the edit DO ID which will trigger the URL update
                  setEditDoId(doId);
                }}
                onViewPendingYardFuel={() => {
                  setShowPendingYardFuel(true);
                }}
                onViewAllNotifications={() => {
                  setShowNotificationsPage(true);
                }}
              />
              
              {/* Profile Menu */}
              <div className="relative">
                <button 
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg p-2 transition-colors"
                >
                  <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user.firstName?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-gray-700 dark:text-gray-200 font-medium">{user.firstName} {user.lastName}</span>
                </button>
                
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110]">
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          logout();
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-gray-900 transition-colors">
          {renderActiveComponent()}
        </main>
      </div>

      {/* Pending Yard Fuel Modal */}
      {showPendingYardFuel && (
        <PendingYardFuel onClose={() => setShowPendingYardFuel(false)} />
      )}

      {/* All Notifications Page Modal */}
      {showNotificationsPage && (
        <NotificationsPage onClose={() => setShowNotificationsPage(false)} />
      )}
    </div>
  );
}

export default EnhancedDashboard;