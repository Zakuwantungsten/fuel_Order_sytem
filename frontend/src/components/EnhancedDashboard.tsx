import { useState, useEffect, useRef, lazy, Suspense, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { fuelRecordKeys } from '../hooks/useFuelRecords';
import { deliveryOrderKeys } from '../hooks/useDeliveryOrders';
import {
  Fuel, 
  ClipboardList, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
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
  TrendingUp,
  Route,
  Key,
  Archive,
  PackageCheck,
  Navigation,
  MapPinned,
  FileBarChart,
  Activity,
  Building2,
  Receipt,
  FileUp,
  Download,
  HardDrive,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Search,
  Waypoints,
} from 'lucide-react';
// Eagerly loaded — needed on first render (header/auth)
import { useAuth } from '../contexts/AuthContext';
import NotificationBell from './NotificationBell';

// Lazy-loaded components — only fetched when the user navigates to them
const YardFuelSimple = lazy(() => import('./YardFuelSimple'));
const Reports = lazy(() => import('./Reports'));
const DriverPortal = lazy(() => import('./DriverPortal'));
const StationView = lazy(() => import('./StationView'));
const PaymentManager = lazy(() => import('./PaymentManager'));
const SuperAdminDashboard = lazy(() => import('./SuperAdminDashboard'));
const AdminDashboard = lazy(() => import('./AdminDashboard'));
const ManagerView = lazy(() => import('./ManagerView'));
const DriverCredentialsManager = lazy(() => import('../pages/Admin/DriverCredentialsManager'));
const OfficerPortal = lazy(() => import('./OfficerPortal'));
const PendingYardFuel = lazy(() => import('./PendingYardFuel'));
const NotificationsPage = lazy(() => import('./NotificationsPage'));
const ChangePasswordModal = lazy(() => import('./ChangePasswordModal'));
const MFASettings = lazy(() => import('./MFASettings').then(m => ({ default: m.MFASettings })));
const DevicesSessionsPanel = lazy(() => import('./DevicesSessionsPanel'));

// Lazy-loaded pages
const Dashboard = lazy(() => import('../pages/Dashboard'));
const DeliveryOrders = lazy(() => import('../pages/DeliveryOrders'));
const LPOs = lazy(() => import('../pages/LPOs'));
const FuelRecordsPage = lazy(() => import('../pages/FuelRecords'));
const ExcelImport = lazy(() => import('../pages/ExcelImport'));
const TruckBatchesPage = lazy(() => import('../pages/TruckBatches'));
const FleetTracking = lazy(() => import('../pages/FleetTracking'));
const CheckpointManagement = lazy(() => import('../pages/CheckpointManagement'));
const JourneyConfig = lazy(() => import('../pages/JourneyConfig'));

// Suspense fallback shown while a lazy chunk is loading
const TabFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
  </div>
);

interface EnhancedDashboardProps {
  user: any;
  onLogout: () => void;
}

// Helper function to get initial tab based on user role and localStorage
const getInitialTab = (userRole: string): string => {
  const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard'].includes(userRole);
  const isDriver = userRole === 'driver';
  const isManager = userRole === 'manager' || userRole === 'super_manager' || userRole === 'station_manager';
  
  // Get stored tab and role from sessionStorage (cleared when tab/browser is closed)
  const storedTab = sessionStorage.getItem('fuel_order_active_tab');
  const storedRole = sessionStorage.getItem('fuel_order_active_role');
  
  // Define valid tabs for each role type
  const getValidTabs = () => {
    if (isDriver) return ['driver_portal'];
    if (isYardRole || userRole === 'yard_personnel') return ['yard_fuel'];
    if (userRole === 'super_admin') {
      return [
        'overview', 'do', 'fuel_records', 'lpo', 'fleet_tracking', 'reports',
        'sa_overview', 'sa_users', 'sa_fuel_stations', 'sa_routes', 'sa_system', 
        'sa_audit', 'sa_security', 'sa_trash', 'sa_archival', 'sa_backup', 'sa_analytics', 'sa_fuel_prices', 'sa_data_export', 'sa_monitoring', 'sa_storage', 'sa_custom_report', 'driver_credentials', 'excel_import'
      ];
    }
    if (userRole === 'admin' || userRole === 'boss') {
      return [
        'overview', 'do', 'fuel_records', 'lpo', 'truck_batches', 'fleet_tracking',
        'admin_users', 'admin_fuel_stations', 'admin_fuel_prices', 'admin_routes', 'admin_reports', 'driver_credentials', 'excel_import'
      ];
    }
    if (userRole === 'fuel_order_maker') {
      return ['overview', 'do', 'fuel_records', 'lpo', 'fleet_tracking', 'reports'];
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
  if (userRole === 'super_admin') return 'sa_overview'; // Super admin should start at their overview
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('fuel_order_collapsed_sections');
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showSecurityPanel, setShowSecurityPanel] = useState(false);
  const [showMFASettings, setShowMFASettings] = useState(false);
  const [showPendingYardFuel, setShowPendingYardFuel] = useState(false);
  const [showNotificationsPage, setShowNotificationsPage] = useState(false);
  const [saNavSearch, setSaNavSearch] = useState('');
  const [editDoId, setEditDoId] = useState<string | null>(null);
  const [pendingTruckSuffix, setPendingTruckSuffix] = useState<string>('');
  const [pendingDestination, setPendingDestination] = useState<string>('');
  const [, setHighlightParam] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const { logout, toggleTheme, isDark } = useAuth();
  const queryClient = useQueryClient();

  // Global listener: when truck batches change on any client, invalidate fuel records
  // and delivery orders regardless of which tab is currently active. Without this,
  // the invalidation only fires if TruckBatchesPage is mounted (i.e. the user is on
  // that tab), so switching to Fuel Records would show stale extra-liters values.
  const invalidateTruckBatchDependents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
    queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
  }, [queryClient]);
  useRealtimeSync('truck_batches', invalidateTruckBatchDependents, 'dashboard-truck-batches');

  // Global listener: when a route is created/updated, auto-fill may have updated fuel
  // records. Invalidate the fuel records cache so any tab switch shows fresh data
  // without a manual refresh.
  const invalidateRouteDependents = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
  }, [queryClient]);
  useRealtimeSync('routes', invalidateRouteDependents, 'dashboard-routes');

  // The "home" tab for this role — pressing back beyond this triggers exit confirm
  const getHomeTab = (): string => {
    if (user.role === 'super_admin') return 'sa_overview';
    if (user.role === 'driver') return 'driver_portal';
    if (['manager', 'super_manager', 'station_manager'].includes(user.role)) return 'manager_view';
    if (['dar_yard', 'tanga_yard', 'mmsa_yard', 'yard_personnel'].includes(user.role)) return 'yard_fuel';
    return 'overview';
  };

  // Persist active tab to sessionStorage whenever it changes (cleared when tab/browser is closed)
  useEffect(() => {
    sessionStorage.setItem('fuel_order_active_tab', activeTab);
    sessionStorage.setItem('fuel_order_active_role', user.role);
  }, [activeTab, user.role]);

  // Push a history entry whenever the active tab changes so the back button
  // pops to the previous tab instead of exiting the app.
  // We store the tab name in history state so popstate can restore it.
  const isRestoringFromHistory = useRef(false);

  const navigateToTab = (tab: string) => {
    if (tab === activeTab) return;
    window.history.pushState({ tab }, '', window.location.pathname + window.location.search);
    setActiveTab(tab);
  };

  // Seed the very first history entry with the initial tab so there is always
  // at least one entry that has our state shape.
  useEffect(() => {
    // Only replace if the current entry has no tab state (i.e. first load)
    if (!window.history.state?.tab) {
      window.history.replaceState({ tab: activeTab }, '', window.location.pathname + window.location.search);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back-button handler: restore previous tab from history state.
  // If we are already on the home tab, show exit confirmation instead.
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const previousTab: string | undefined = event.state?.tab;
      const homeTab = getHomeTab();

      if (!previousTab || previousTab === homeTab) {
        // Nothing (or home) to go back to — ask user if they want to exit
        // Push a dummy entry back so the history stack isn't consumed
        window.history.pushState({ tab: activeTab }, '', window.location.pathname + window.location.search);
        setShowExitConfirm(true);
        return;
      }

      isRestoringFromHistory.current = true;
      setActiveTab(previousTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  // getHomeTab is stable (no deps that change), activeTab needed for the pushState fallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reset to default tab when user role changes (e.g., after login/logout)
  useEffect(() => {
    const defaultTab = getInitialTab(user.role);
    setActiveTab(defaultTab);
  }, [user.role]);

  // Set when handleNavigate is about to write highlight params, so the
  // activeTab-change effect below doesn't immediately wipe the params we just set.
  const skipHighlightClearRef = useRef(false);

  // Handle navigation from Dashboard search results
  const handleNavigate = (tab: string, highlight?: string) => {
    // Only suppress the clear effect when the tab actually changes (that's the
    // render that triggers the [activeTab] effect). If we're already on the tab,
    // the effect won't fire, so we must not leave the flag stuck on.
    if (highlight && tab !== activeTab) {
      skipHighlightClearRef.current = true;
    }
    navigateToTab(tab);
    if (highlight) {
      setHighlightParam(highlight);
      // Update URL with highlight parameter
      const currentUrl = new URL(window.location.href);
      
      // Parse compound parameters (e.g., "DO123&year=2025&month=12" or "action=create-do")
      if (highlight.includes('&') || highlight.includes('=')) {
        const parts = highlight.split('&');
        
        parts.forEach(part => {
          const [key, value] = part.split('=');
          if (key && value) {
            currentUrl.searchParams.set(key, value);
          }
        });
      } else {
        currentUrl.searchParams.set('highlight', highlight);
      }
      
      window.history.replaceState({ tab }, '', currentUrl.toString());
      // Dispatch event to notify child components
      window.dispatchEvent(new CustomEvent('urlchange'));
    }
  };

  // Clear highlight when tab changes — but NOT on the tab change that handleNavigate
  // itself triggered while setting a highlight (otherwise we'd wipe the params before
  // the destination tab's urlchange handler reads them).
  useEffect(() => {
    if (skipHighlightClearRef.current) {
      skipHighlightClearRef.current = false;
      return;
    }
    setHighlightParam(null);
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('highlight');
    currentUrl.searchParams.delete('month');
    currentUrl.searchParams.delete('year');
    window.history.replaceState({}, '', currentUrl.toString());
  }, [activeTab]);

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

  const toggleSidebarSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      sessionStorage.setItem('fuel_order_collapsed_sections', JSON.stringify([...next]));
      return next;
    });
  };

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
        // ── Overview ─────────────────────────────────────────────────────
        { id: 'sa_overview',        label: 'Overview',          icon: Shield,       impact: 'low'    as const },
        // ── Security ─────────────────────────────────────────────────────
        { id: 'sa_users',           label: 'User Management',   icon: Users,        impact: 'medium' as const, sectionLabel: 'Security' },
        { id: 'sa_security',        label: 'Security Center',   icon: ShieldCheck,  impact: 'high'   as const, sectionLabel: 'Security' },
        // ── Platform ─────────────────────────────────────────────────────
        { id: 'sa_fuel_stations',   label: 'Fuel Stations',     icon: Building2,    impact: 'low'    as const, sectionLabel: 'Platform' },
        { id: 'sa_routes',          label: 'Routes',            icon: Route,        impact: 'low'    as const, sectionLabel: 'Platform' },
        { id: 'sa_fuel_prices',     label: 'Fuel Prices',       icon: TrendingUp,   impact: 'medium' as const, sectionLabel: 'Platform' },
        { id: 'fleet_tracking',     label: 'Fleet Tracking',    icon: Navigation,   impact: 'low'    as const, sectionLabel: 'Platform' },
        { id: 'checkpoints',        label: 'Checkpoints',       icon: MapPinned,    impact: 'low'    as const, sectionLabel: 'Platform' },
        { id: 'journey_config',     label: 'Journey Config',    icon: Waypoints,    impact: 'low'    as const, sectionLabel: 'Platform' },
        { id: 'driver_credentials', label: 'Driver Access',     icon: Key,          impact: 'medium' as const, sectionLabel: 'Platform' },
        // ── Monitoring & Alerts ───────────────────────────────────────────
        { id: 'sa_monitoring',      label: 'Monitoring',        icon: Activity,     impact: 'medium' as const, sectionLabel: 'Monitoring & Alerts' },
        // ── Analytics ────────────────────────────────────────────────────
        { id: 'sa_analytics',       label: 'Analytics',         icon: FileBarChart, impact: 'low'    as const, sectionLabel: 'Analytics' },
        { id: 'sa_audit',           label: 'Audit Logs',        icon: FileSearch,   impact: 'low'    as const, sectionLabel: 'Analytics' },
        { id: 'sa_custom_report',   label: 'Custom Reports',    icon: FileBarChart, impact: 'low'    as const, sectionLabel: 'Analytics' },
        // ── Data Lifecycle ────────────────────────────────────────────────
        { id: 'sa_backup',          label: 'Backup & Recovery', icon: Database,     impact: 'high'   as const, sectionLabel: 'Data Lifecycle' },
        { id: 'sa_archival',        label: 'Data Archival',     icon: Archive,      impact: 'high'   as const, sectionLabel: 'Data Lifecycle' },
        { id: 'sa_trash',           label: 'Trash Management',  icon: Trash2,       impact: 'medium' as const, sectionLabel: 'Data Lifecycle' },
        { id: 'sa_storage',         label: 'Storage Manager',   icon: HardDrive,    impact: 'medium' as const, sectionLabel: 'Data Lifecycle' },
        { id: 'sa_data_export',     label: 'Data Export',       icon: Download,     impact: 'medium' as const, sectionLabel: 'Data Lifecycle' },
        // ── System ────────────────────────────────────────────────────────
        { id: 'sa_system',          label: 'System',            icon: Settings,     impact: 'high'   as const, sectionLabel: 'System' },
      ];
    }

    // Admin and Boss roles get expanded admin dashboard sections
    if (user.role === 'admin' || user.role === 'boss') {
      return [
        ...baseItems,
        { id: 'do', label: 'DO Management', icon: PackageCheck },
        { id: 'fuel_records', label: 'Fuel Records', icon: Fuel },
        { id: 'lpo', label: 'LPO Management', icon: Receipt },
        { id: 'truck_batches', label: 'Truck Batches', icon: Truck },
        { id: 'fleet_tracking', label: 'Fleet Tracking', icon: Navigation },
        { id: 'checkpoints', label: 'Checkpoints', icon: MapPinned },
        { id: 'journey_config', label: 'Journey Config', icon: Waypoints },
        // Admin sections - expanded in sidebar
        { id: 'admin_users', label: 'User Support', icon: Users },
        { id: 'admin_fuel_stations', label: 'Fuel Stations', icon: Building2 },
        { id: 'admin_fuel_prices', label: 'Fuel Prices', icon: TrendingUp },
        { id: 'admin_routes', label: 'Routes', icon: Route },
        { id: 'driver_credentials', label: 'Driver Credentials', icon: Key },
        { id: 'admin_reports', label: 'Admin Reports', icon: FileBarChart },
        { id: 'excel_import', label: 'Excel Import', icon: FileUp },
      ];
    }

    if (user.role === 'fuel_order_maker') {
      return [
        ...baseItems,
        { id: 'do', label: 'DO Management', icon: PackageCheck },
        { id: 'fuel_records', label: 'Fuel Records', icon: Fuel },
        { id: 'lpo', label: 'LPO Management', icon: Receipt },
        { id: 'fleet_tracking', label: 'Fleet Tracking', icon: Navigation },
        { id: 'checkpoints', label: 'Checkpoints', icon: MapPinned },
        { id: 'journey_config', label: 'Journey Config', icon: Waypoints },
        { id: 'reports', label: 'Reports', icon: FileBarChart },
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
        return null; // Always-mounted via CSS hidden below
      case 'do':
        return <DeliveryOrders />;
      case 'fuel_records':
        return <FuelRecordsPage />;
      case 'lpo':
        return <LPOs />;
      case 'truck_batches':
        return <TruckBatchesPage initialSuffix={pendingTruckSuffix} onSuffixConsumed={() => setPendingTruckSuffix('')} />;
      case 'fleet_tracking':
        return <FleetTracking />;
      case 'checkpoints':
        return <CheckpointManagement />;
      case 'journey_config':
        return <JourneyConfig />;
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
        return <SuperAdminDashboard user={user} section="overview" onNavigate={setActiveTab} />;
      case 'sa_monitoring':
        return <SuperAdminDashboard user={user} section="monitoring" onNavigate={setActiveTab} />;
      case 'sa_users':
        return <SuperAdminDashboard user={user} section="users" onNavigate={setActiveTab} />;
      case 'sa_fuel_stations':
        return <SuperAdminDashboard user={user} section="fuel_stations" onNavigate={setActiveTab} />;
      case 'sa_routes':
        return <SuperAdminDashboard user={user} section="routes" onNavigate={setActiveTab} initialDestination={pendingDestination} onDestinationConsumed={() => setPendingDestination('')} />;
      case 'sa_system':
        return <SuperAdminDashboard user={user} section="system" onNavigate={setActiveTab} />;
      // sa_config, sa_config_history, sa_config_diff, sa_feature_flags, sa_cron_jobs,
      // sa_maintenance, sa_webhooks, sa_rate_limits, sa_db_indexes, sa_announcements,
      // sa_notification_config, excel_import (super_admin) merged into sa_system
      case 'sa_audit':
        return <SuperAdminDashboard user={user} section="audit" onNavigate={setActiveTab} />;
      case 'sa_security':
        return <SuperAdminDashboard user={user} section="security" onNavigate={setActiveTab} />;
      case 'sa_trash':
        return <SuperAdminDashboard user={user} section="trash" onNavigate={setActiveTab} />;
      case 'sa_archival':
        return <SuperAdminDashboard user={user} section="archival" onNavigate={setActiveTab} />;
      case 'sa_backup':
        return <SuperAdminDashboard user={user} section="backup" onNavigate={setActiveTab} />;
      case 'sa_analytics':
        return <SuperAdminDashboard user={user} section="analytics" onNavigate={setActiveTab} />;
      case 'sa_fuel_prices':
        return <SuperAdminDashboard user={user} section="fuel_prices" onNavigate={setActiveTab} />;
      case 'sa_data_export':
        return <SuperAdminDashboard user={user} section="data_export" onNavigate={setActiveTab} />;
      case 'sa_storage':
        return <SuperAdminDashboard user={user} section="storage" onNavigate={setActiveTab} />;
      case 'sa_custom_report':
        return <SuperAdminDashboard user={user} section="custom_report" onNavigate={setActiveTab} />;
      // sa_siem_export merged into sa_monitoring
      
      // Admin sections (admin/boss roles)
      case 'admin_users':
        return <AdminDashboard user={user} section="users" />;
      case 'admin_fuel_stations':
        return <AdminDashboard user={user} section="fuel_stations" />;
      case 'admin_fuel_prices':
        return <AdminDashboard user={user} section="fuel_prices" />;
      case 'admin_routes':
        return <AdminDashboard user={user} section="routes" initialDestination={pendingDestination} onDestinationConsumed={() => setPendingDestination('')} />;
      case 'admin_reports':
        return <AdminDashboard user={user} section="reports" />;
      
      case 'driver_credentials':
        return <DriverCredentialsManager />;
      
      case 'excel_import':
        return <ExcelImport />;
      
      case 'manager_view':
        return <ManagerView user={user} />;
      default:
        return null;
    }
  };

  const menuItems = getMenuItems();

  // Determine which persistent (always-mounted) dashboards to render
  const hasOverviewTab = menuItems.some((item: any) => item.id === 'overview');

  // Check if user is a yard-specific role
  const isYardRole = ['dar_yard', 'tanga_yard', 'mmsa_yard', 'yard_personnel'].includes(user.role);

  // For import/export officers, show simplified officer portal without sidebar
  if (isOfficer) {
    return <Suspense fallback={<TabFallback />}><OfficerPortal user={user} /></Suspense>;
  }

  // For drivers, render DriverPortal directly without wrapper
  // DriverPortal has its own complete header with all controls
  if (isDriver) {
    return <Suspense fallback={<TabFallback />}>{renderActiveComponent()}</Suspense>;
  }

  // For station managers (station_manager, manager, super_manager), show full-screen layout without sidebar
  if (isManager) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors">
        {/* Main Content - Full screen without sidebar */}
        <main id="main-scroll-container" className="flex-1 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={<TabFallback />}>{renderActiveComponent()}</Suspense>
        </main>
      </div>
    );
  }

  // For yard personnel (dar_yard, tanga_yard, mmsa_yard, yard_personnel), show full-screen layout without sidebar
  if (isYardRole) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden transition-colors">
        {/* Main Content - Full screen without sidebar */}
        <main id="main-scroll-container" className="flex-1 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={<TabFallback />}>{renderActiveComponent()}</Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: isDark ? '#0F172A' : '#F8FAFC' }}>
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && user.role !== 'super_admin' && (
        <div 
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: 'rgba(15,23,42,0.6)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`transition-all duration-300 flex flex-col fixed lg:relative inset-y-0 left-0 z-30 transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } w-60 ${!sidebarOpen && 'lg:w-14'}`} style={{ background: '#0F172A' }}>
        <div className="p-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            {sidebarOpen && (
              <div>
                <h1 className="text-lg font-bold" style={{ color: '#FFFFFF' }}>Fuel Order</h1>
                <p className="text-xs" style={{ color: '#94A3B8' }}>Management System</p>
              </div>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg transition-colors lg:ml-auto"
              style={{ color: '#94A3B8' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1E293B')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              aria-label={sidebarOpen ? 'Close menu' : 'Toggle menu'}
            >
              {/* On mobile: always show X, on desktop: toggle between X and Menu */}
              <X className="w-5 h-5 lg:hidden" />
              <span className="hidden lg:block">
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </span>
            </button>
          </div>
        </div>

        <nav className="mt-2 flex-1 overflow-y-auto pb-4">
          {/* Settings search — only for super_admin when sidebar is expanded */}
          {user.role === 'super_admin' && sidebarOpen && (
            <div className="px-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#64748B' }} />
                <input
                  type="text"
                  placeholder="Quick-jump to section…"
                  value={saNavSearch}
                  onChange={e => setSaNavSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-md focus:outline-none focus:ring-1"
                  style={{
                    background: '#1E293B',
                    border: '1px solid #334155',
                    color: '#CBD5E1',
                    '--tw-ring-color': '#2563EB',
                  } as React.CSSProperties}
                />
              </div>
            </div>
          )}
          {(() => {
            const isSA = user.role === 'super_admin';
            const searchTerm = saNavSearch.trim().toLowerCase();
            const isSearching = isSA && searchTerm.length > 0;

            // When searching, flatten all items that match by label regardless of collapsed state
            const displayItems = isSearching
              ? (menuItems as any[]).filter(item =>
                  item.label.toLowerCase().includes(searchTerm) ||
                  (item.sectionLabel && (item.sectionLabel as string).toLowerCase().includes(searchTerm))
                )
              : (menuItems as any[]);

            return displayItems.map((item, idx) => {
              const IconComponent = item.icon as React.ElementType;
              const prevItem = displayItems[idx - 1];
              // Show section label when not searching (normal mode) OR show it as a context hint when searching
              const showSectionLabel = sidebarOpen && item.sectionLabel &&
                item.sectionLabel !== prevItem?.sectionLabel;
              const currentSection = item.sectionLabel;
              const isCollapsed = !isSearching && currentSection && collapsedSections.has(currentSection);

              const impactColor: Record<string, string> = {
                high:   'bg-red-400 dark:bg-red-500',
                medium: 'bg-amber-400 dark:bg-amber-500',
                low:    'bg-green-400 dark:bg-green-500',
              };
              const impactDotClass = item.impact ? impactColor[item.impact] ?? '' : '';

              return (
                <div key={item.id}>
                  {showSectionLabel && (
                    <button
                      onClick={() => !isSearching && toggleSidebarSection(currentSection)}
                      className="w-full px-3 pt-4 pb-1 flex items-center justify-between group rounded"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>
                        {currentSection}
                      </span>
                      {!isSearching && (
                        isCollapsed
                          ? <ChevronRight className="w-3 h-3" style={{ color: '#475569' }} />
                          : <ChevronDown className="w-3 h-3" style={{ color: '#475569' }} />
                      )}
                    </button>
                  )}
                  {!isCollapsed && (
                    <button
                      onClick={() => {
                        navigateToTab(item.id);
                        setSidebarOpen(false);
                        if (isSearching) setSaNavSearch('');
                      }}
                      title={!sidebarOpen ? item.label : undefined}
                      className="w-full flex items-center px-3 py-2 text-left transition-colors rounded-md mx-0"
                      style={activeTab === item.id ? {
                        background: '#2563EB',
                        color: '#FFFFFF',
                        fontWeight: 500,
                      } : {
                        color: '#94A3B8',
                      }}
                      onMouseEnter={e => { if (activeTab !== item.id) { e.currentTarget.style.background = '#1E293B'; e.currentTarget.style.color = '#CBD5E1'; } }}
                      onMouseLeave={e => { if (activeTab !== item.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; } }}
                    >
                      <IconComponent className="w-5 h-5 flex-shrink-0" style={{ opacity: activeTab === item.id ? 1 : 0.75 }} />
                      {sidebarOpen && (
                        <span className="ml-2.5 text-sm truncate flex-1">{item.label}</span>
                      )}
                      {sidebarOpen && impactDotClass && (
                        <span
                          className={`ml-1 flex-shrink-0 w-1.5 h-1.5 rounded-full ${impactDotClass}`}
                          title={`${item.impact} impact`}
                        />
                      )}
                    </button>
                  )}
                </div>
              );
            });
          })()}
        </nav>


      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden p-3 flex items-center justify-between flex-shrink-0" style={{ background: '#0F172A', borderBottom: '1px solid #1E293B', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 0 }}>
          {/* Left: hamburger + page name */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: '#94A3B8' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1E293B')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-base font-bold truncate" style={{ color: '#F1F5F9' }}>
              {menuItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
            </h2>
          </div>
          {/* Right: theme toggle, notification bell, profile avatar */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button 
              onClick={toggleTheme}
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: '#94A3B8' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1E293B')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            <div className="flex-shrink-0">
              <NotificationBell
              onNotificationClick={(notification) => {
                if (
                  notification.type === 'missing_extra_fuel' &&
                  notification.metadata?.truckSuffix
                ) {
                  setPendingTruckSuffix(notification.metadata.truckSuffix);
                  navigateToTab('truck_batches');
                } else if (
                  (notification.type === 'missing_total_liters' || notification.type === 'both') &&
                  notification.metadata?.destination
                ) {
                  setPendingDestination(notification.metadata.destination);
                  navigateToTab(user.role === 'super_admin' ? 'sa_routes' : 'admin_routes');
                } else if (notification.metadata?.fuelRecordId) {
                  navigateToTab('fuel_records');
                }
              }}
              onEditDO={(doId) => {
                navigateToTab('do');
                setEditDoId(doId);
              }}
              onViewPendingYardFuel={() => {
                setShowPendingYardFuel(true);
              }}
              onViewAllNotifications={() => {
                setShowNotificationsPage(true);
              }}
              />
            </div>
            
            <div className="relative flex-shrink-0">
              <button 
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="p-1 rounded-lg transition-colors"
                onMouseEnter={e => (e.currentTarget.style.background = '#1E293B')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#2563EB' }}>
                  <span className="text-white text-sm font-medium">
                    {user.firstName?.charAt(0).toUpperCase()}
                  </span>
                </div>
              </button>
              
              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-20px)] rounded-lg shadow-xl py-2 z-[110] max-h-[80vh] overflow-y-auto" style={{ background: isDark ? '#1E293B' : '#FFFFFF', border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`, boxShadow: '0 8px 30px rgba(15,23,42,0.12)' }}>
                      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}` }}>
                        <div className="text-xs" style={{ color: '#64748B' }}>Logged in as</div>
                        <div className="text-sm font-medium truncate" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>{user.firstName} {user.lastName}</div>
                        <div className="text-xs capitalize" style={{ color: '#94A3B8' }}>{user.role?.replace('_', ' ')}</div>
                    </div>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowChangePassword(true);
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm transition-colors"
                      style={{ color: isDark ? '#CBD5E1' : '#334155' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#334155' : '#F1F5F9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Key className="w-4 h-4 mr-3" />
                      Change Password
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowSecurityPanel(true);
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm transition-colors"
                      style={{ color: isDark ? '#CBD5E1' : '#334155' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#334155' : '#F1F5F9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Shield className="w-4 h-4 mr-3" />
                      Security & Devices
                    </button>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowMFASettings(true);
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm transition-colors"
                      style={{ color: isDark ? '#CBD5E1' : '#334155' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#334155' : '#F1F5F9')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <ShieldCheck className="w-4 h-4 mr-3" />
                      2FA / MFA Settings
                    </button>
                    <div className="my-1" style={{ borderTop: `1px solid ${isDark ? '#334155' : '#E2E8F0'}` }}></div>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                      className="w-full flex items-center px-4 py-2 text-sm transition-colors"
                      style={{ color: '#B91C1C' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#450A0A' : '#FEE2E2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        
        {/* Desktop Header */}
        <header className="hidden lg:flex p-3 flex-shrink-0" style={{ background: '#0F172A', borderBottom: '1px solid #1E293B' }}>
          <div className="flex items-center justify-between w-full">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: '#FFFFFF' }}>
                {menuItems.find(item => item.id === activeTab)?.label || 'Dashboard'}
              </h2>
              {activeTab.startsWith('sa_') && (
                <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Super Admin</p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button 
                onClick={toggleTheme}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1E293B'; e.currentTarget.style.color = '#F1F5F9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              
              {/* Notification Bell */}
              <NotificationBell
                onNotificationClick={(notification) => {
                  if (
                    notification.type === 'missing_extra_fuel' &&
                    notification.metadata?.truckSuffix
                  ) {
                    setPendingTruckSuffix(notification.metadata.truckSuffix);
                    navigateToTab('truck_batches');
                  } else if (
                    (notification.type === 'missing_total_liters' || notification.type === 'both') &&
                    notification.metadata?.destination
                  ) {
                    setPendingDestination(notification.metadata.destination);
                    navigateToTab(user.role === 'super_admin' ? 'sa_routes' : 'admin_routes');
                  } else if (notification.metadata?.fuelRecordId) {
                    navigateToTab('fuel_records');
                  }
                }}
                onEditDO={(doId) => {
                  navigateToTab('do');
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
                  className="flex items-center space-x-2 rounded-lg p-1.5 transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = '#1E293B')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#2563EB' }}>
                    <span className="text-white text-xs font-medium">
                      {user.firstName?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-slate-200 font-medium">{user.firstName} {user.lastName}</span>
                </button>
                
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-20px)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110] max-h-[80vh] overflow-y-auto">
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Logged in as</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.firstName} {user.lastName}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 capitalize">{user.role?.replace('_', ' ')}</div>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowChangePassword(true);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Key className="w-4 h-4 mr-3" />
                        Change Password
                      </button>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowSecurityPanel(true);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Shield className="w-4 h-4 mr-3" />
                        Security & Devices
                      </button>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowMFASettings(true);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <ShieldCheck className="w-4 h-4 mr-3" />
                        2FA / MFA Settings
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
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

        <main id="main-scroll-container" className="flex-1 overflow-y-auto p-6" style={{ background: isDark ? '#0F172A' : '#F8FAFC' }}>
          {/* Always-mounted overview dashboards — stay alive when navigating to other tabs */}
          <Suspense fallback={<TabFallback />}>
            {hasOverviewTab && (
              <div className={activeTab === 'overview' ? '' : 'hidden'}>
                <Dashboard onNavigate={handleNavigate} />
              </div>
            )}
            {renderActiveComponent()}
          </Suspense>
        </main>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <Suspense fallback={null}>
          <ChangePasswordModal
            onClose={() => setShowChangePassword(false)}
            onSuccess={() => {
              setShowChangePassword(false);
              toast.success('Password changed successfully!');
            }}
          />
        </Suspense>
      )}

      {/* Security & Devices Modal */}
      {showSecurityPanel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSecurityPanel(false)} />
          <div className="relative z-[210] w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <Suspense fallback={null}>
              <DevicesSessionsPanel onClose={() => setShowSecurityPanel(false)} />
            </Suspense>
          </div>
        </div>
      )}

      {/* MFA Settings Modal */}
      {showMFASettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMFASettings(false)} />
          <div className="relative z-[210] w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" style={{ color: '#2563EB' }} />
                Two-Factor Authentication
              </h2>
              <button onClick={() => setShowMFASettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <Suspense fallback={null}>
              <MFASettings />
            </Suspense>
          </div>
        </div>
      )}

      {/* Pending Yard Fuel Modal */}
      {showPendingYardFuel && (
        <Suspense fallback={null}>
          <PendingYardFuel onClose={() => setShowPendingYardFuel(false)} />
        </Suspense>
      )}

      {/* All Notifications Page Modal */}
      {showNotificationsPage && (
        <Suspense fallback={null}>
          <NotificationsPage 
            onClose={() => setShowNotificationsPage(false)}
            onNotificationClick={(notification) => {
              setShowNotificationsPage(false);
              if (
                notification.type === 'missing_extra_fuel' &&
                notification.metadata?.truckSuffix
              ) {
                setPendingTruckSuffix(notification.metadata.truckSuffix);
                navigateToTab('truck_batches');
              } else if (
                (notification.type === 'missing_total_liters' || notification.type === 'both') &&
                notification.metadata?.destination
              ) {
                setPendingDestination(notification.metadata.destination);
                navigateToTab(user.role === 'super_admin' ? 'sa_routes' : 'admin_routes');
              } else if (notification.metadata?.fuelRecordId) {
                navigateToTab('fuel_records');
              }
            }}
          />
        </Suspense>
      )}

      {/* Exit Confirmation Modal — shown when user presses back on the home tab */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center" style={{ background: 'rgba(15,23,42,0.7)' }}>
          <div className="w-full sm:max-w-sm mx-4 mb-6 sm:mb-0 rounded-2xl shadow-2xl overflow-hidden" style={{ background: isDark ? '#1E293B' : '#FFFFFF', border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}` }}>
            {/* Top accent */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2563EB, #0891B2)' }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2' }}>
                  <LogOut className="w-5 h-5" style={{ color: '#DC2626' }} />
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Exit App?</h3>
                  <p className="text-sm" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>Do you want to close the application?</p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: isDark ? '#334155' : '#F1F5F9', color: isDark ? '#CBD5E1' : '#334155' }}
                >
                  Stay
                </button>
                <button
                  onClick={() => { setShowExitConfirm(false); window.history.go(-window.history.length); window.close(); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                  style={{ background: '#DC2626' }}
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnhancedDashboard;