import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  Receipt, 
  Fuel,
  X,
  Users,
  Settings,
  BarChart3,
  LogOut,
  User,
  ChevronDown,
  Shield,
  Moon,
  Sun
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getRoleInfo, RESOURCES, ACTIONS } from '../utils/permissions';
import NotificationBell from './NotificationBell';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  const { user, hasPermission, logout, toggleTheme, isDark } = useAuth();

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUserMenu]);

  const navigation = [
    { 
      name: 'Dashboard', 
      href: '/', 
      icon: LayoutDashboard,
      resource: RESOURCES.DASHBOARD,
      action: ACTIONS.READ
    },
    { 
      name: 'Delivery Orders', 
      href: '/delivery-orders', 
      icon: FileText,
      resource: RESOURCES.DELIVERY_ORDERS,
      action: ACTIONS.READ
    },
    { 
      name: 'LPOs', 
      href: '/lpos', 
      icon: Receipt,
      resource: RESOURCES.LPOS,
      action: ACTIONS.READ
    },
    { 
      name: 'Fuel Records', 
      href: '/fuel-records', 
      icon: Fuel,
      resource: RESOURCES.FUEL_RECORDS,
      action: ACTIONS.READ
    },
    { 
      name: 'Users', 
      href: '/users', 
      icon: Users,
      resource: RESOURCES.USERS,
      action: ACTIONS.READ
    },
    { 
      name: 'Reports', 
      href: '/reports', 
      icon: BarChart3,
      resource: RESOURCES.REPORTS,
      action: ACTIONS.READ
    },
    { 
      name: 'Settings', 
      href: '/settings', 
      icon: Settings,
      resource: RESOURCES.SYSTEM_CONFIG,
      action: ACTIONS.READ
    },
  ].filter(item => hasPermission(item.resource, item.action));

  const isActive = (path: string) => location.pathname === path;
  
  const shouldShowText = !isCollapsed || isHovered;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div 
        className={`
          fixed inset-y-0 z-30 bg-white dark:bg-gray-800 shadow-lg transform transition-all duration-300 ease-in-out
          right-0 lg:right-auto lg:left-0
          ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          ${shouldShowText ? 'w-64' : 'w-16'}
        `}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center h-16 px-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center flex-1">
            {shouldShowText ? (
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center shadow-sm">
                  <span className="text-white font-bold text-sm">FO</span>
                </div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  Fuel Order System
                </h1>
              </div>
            ) : (
              <div className="w-8 h-8 flex items-center justify-center">
                <div className="flex flex-col space-y-1">
                  <div className="w-5 h-0.5 bg-gray-600 dark:bg-gray-300"></div>
                  <div className="w-5 h-0.5 bg-gray-600 dark:bg-gray-300"></div>
                  <div className="w-5 h-0.5 bg-gray-600 dark:bg-gray-300"></div>
                </div>
              </div>
            )}
          </div>
          
          {/* Toggle button - always visible on desktop */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-2 rounded-md hover:bg-gray-100 transition-all duration-200 group"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <div className="flex flex-col space-y-1">
              <div className={`w-4 h-0.5 bg-gray-500 dark:bg-gray-400 group-hover:bg-gray-700 dark:group-hover:bg-gray-200 transition-all duration-200 ${!isCollapsed ? 'rotate-45 translate-y-1.5' : ''}`}></div>
              <div className={`w-4 h-0.5 bg-gray-500 dark:bg-gray-400 group-hover:bg-gray-700 dark:group-hover:bg-gray-200 transition-all duration-200 ${!isCollapsed ? 'opacity-0' : ''}`}></div>
              <div className={`w-4 h-0.5 bg-gray-500 dark:bg-gray-400 group-hover:bg-gray-700 dark:group-hover:bg-gray-200 transition-all duration-200 ${!isCollapsed ? '-rotate-45 -translate-y-1.5' : ''}`}></div>
            </div>
          </button>

          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <nav className="mt-6 px-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center mb-2 rounded-lg transition-all duration-200 group relative
                  ${shouldShowText ? 'px-4 py-3' : 'px-3 py-3 justify-center'}
                  ${isActive(item.href)
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }
                `}
                title={!shouldShowText ? item.name : undefined}
              >
                <Icon className={`w-5 h-5 ${shouldShowText ? 'mr-3' : ''} flex-shrink-0`} />
                {shouldShowText && (
                  <span className="font-medium whitespace-nowrap overflow-hidden">
                    {item.name}
                  </span>
                )}
                
                {/* Tooltip for collapsed state */}
                {!shouldShowText && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 dark:bg-gray-600 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className={`transition-all duration-300 ease-in-out ${shouldShowText ? 'lg:pl-64' : 'lg:pl-16'}`}>
        {/* Mobile Header */}
        <header className="lg:hidden bg-white dark:bg-gray-800 shadow-sm border-b dark:border-gray-700 p-3 flex items-center gap-2 flex-shrink-0 transition-colors sticky top-0 z-50">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 truncate">
              {navigation.find(item => isActive(item.href))?.name || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Moon className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
            </button>

            {/* Notification Bell */}
            <div className="flex-shrink-0">
              <NotificationBell 
                onNotificationClick={(notification) => {
                  if (notification.metadata?.fuelRecordId) {
                    navigate(`/fuel-records?id=${notification.metadata.fuelRecordId}`);
                  }
                }}
                onEditDO={(doId) => {
                  navigate(`/delivery-orders?edit=${doId}`);
                }}
              />
            </div>

            {/* Profile Menu */}
            <div className="relative flex-shrink-0">
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </span>
                </div>
              </button>
              
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-20px)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110] max-h-[80vh] overflow-y-auto">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium">
                            {user?.firstName?.[0]}{user?.lastName?.[0]}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {user?.firstName} {user?.lastName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</div>
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleInfo(user?.role || 'viewer').color}`}>
                          <Shield className="w-3 h-3 mr-1" />
                          {getRoleInfo(user?.role || 'viewer').name}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <User className="w-4 h-4 mr-3" />
                      Profile Settings
                    </button>
                    
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                        navigate('/login');
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
            
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
              aria-label="Open menu"
            >
              <div className="flex flex-col space-y-1">
                <div className="w-5 h-0.5 bg-gray-600 dark:bg-gray-300"></div>
                <div className="w-5 h-0.5 bg-gray-600 dark:bg-gray-300"></div>
                <div className="w-5 h-0.5 bg-gray-600 dark:bg-gray-300"></div>
              </div>
            </button>
          </div>
        </header>

        {/* Desktop Top bar */}
        <div className="hidden lg:flex sticky top-0 z-50 items-center h-16 bg-white dark:bg-gray-800 shadow-sm px-4 lg:px-8 border-b dark:border-gray-700 transition-colors">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {navigation.find(item => isActive(item.href))?.name || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center space-x-4 relative z-[60]">
            {/* Notification Bell */}
            <div className="relative z-[60]">
              <NotificationBell 
                onNotificationClick={(notification) => {
                  // Navigate to fuel record or relevant page
                  if (notification.metadata?.fuelRecordId) {
                    navigate(`/fuel-records?id=${notification.metadata.fuelRecordId}`);
                  }
                }}
                onEditDO={(doId) => {
                  // Navigate to delivery orders page with the DO ID to edit
                  navigate(`/delivery-orders?edit=${doId}`);
                }}
              />
            </div>
            
            {/* User Menu */}
            <div className="relative z-[60]" ref={userMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('Profile clicked, current state:', showUserMenu);
                  setShowUserMenu(!showUserMenu);
                }}
                className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                aria-label="User menu"
              >
                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center pointer-events-none">
                  <span className="text-white text-sm font-medium">
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                  </span>
                </div>
                <div className="hidden sm:block text-left pointer-events-none">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {getRoleInfo(user?.role || 'viewer').name}
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform pointer-events-none ${showUserMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <>
                  {/* Backdrop to catch outside clicks */}
                  <div
                    className="fixed inset-0 z-[100]"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-20px)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110] max-h-[80vh] overflow-y-auto">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-medium">
                          {user?.firstName?.[0]}{user?.lastName?.[0]}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {user?.firstName} {user?.lastName}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{user?.department}</div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRoleInfo(user?.role || 'viewer').color}`}>
                        <Shield className="w-3 h-3 mr-1" />
                        {getRoleInfo(user?.role || 'viewer').name}
                      </span>
                    </div>
                  </div>
                  
                  <div className="py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        // Add profile logic here
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      style={{ cursor: 'pointer' }}
                    >
                      <User className="w-4 h-4 mr-3" />
                      Profile Settings
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        toggleTheme();
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      style={{ cursor: 'pointer' }}
                      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                      {isDark ? <Sun className="w-4 h-4 mr-3" /> : <Moon className="w-4 h-4 mr-3" />}
                      {isDark ? 'Light Mode' : 'Dark Mode'}
                    </button>
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Logout clicked');
                        setShowUserMenu(false);
                        logout();
                        navigate('/login');
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                      style={{ cursor: 'pointer' }}
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      Sign Out
                    </button>
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
