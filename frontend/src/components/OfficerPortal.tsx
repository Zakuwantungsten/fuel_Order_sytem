import { useState, useEffect, lazy, Suspense } from 'react';
import { toast } from 'react-toastify';
import { User } from '../types';
import NotificationBell from './NotificationBell';
import ChangePasswordModal from './ChangePasswordModal';
import { useAuth } from '../contexts/AuthContext';
import {
  LogOut,
  User as UserIcon,
  Sun,
  Moon,
  Key,
  LayoutDashboard,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
} from 'lucide-react';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';
import { readOfficerConfig } from '../hooks/useOfficerConfig';

const DOManagement = lazy(() => import('./DOManagement'));
const OfficerOverview = lazy(() => import('./OfficerOverview'));
const OfficerConfig = lazy(() => import('./OfficerConfig'));

interface OfficerPortalProps {
  user: User;
}

type ActiveTab = 'overview' | 'do' | 'config';

const TabFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
  </div>
);

export function OfficerPortal({ user }: OfficerPortalProps) {
  const { logout, toggleTheme, isDark } = useAuth();
  const [loading, setLoading] = useState(true);
  // Initialise from saved config so the user lands on their preferred tab
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    () => readOfficerConfig(user.role).defaultTab,
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  // Params passed from overview search / quick actions to the DO tab
  const [doTabParams, setDoTabParams] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 250);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading) return <UnifiedTabLoader label="Loading officer portal..." />;

  const isExport = user.role === 'export_officer';
  const portalLabel = isExport ? 'Export' : 'Import';
  const accentColor = isExport ? '#EA580C' : '#2563EB';

  const navItems: { id: ActiveTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'do', label: 'Delivery Orders', icon: FileText },
    { id: 'config', label: 'Config', icon: Settings },
  ];

  const handleNavigateToDO = (params?: string) => {
    setDoTabParams(params);
    setActiveTab('do');
    setMobileSidebarOpen(false);
    // Inject params into URL so DeliveryOrders can read them
    if (params) {
      const url = new URL(window.location.href);
      params.split('&').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) url.searchParams.set(k, v);
      });
      window.history.replaceState({}, '', url.toString());
      // Fire the same event EnhancedDashboard uses so DeliveryOrders picks it up
      window.dispatchEvent(new CustomEvent('tab-url-change'));
    }
  };

  const handleTabClick = (tab: ActiveTab) => {
    if (tab !== 'do') setDoTabParams(undefined);
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / portal name */}
      <div
        className="flex items-center gap-3 px-4 py-4 border-b"
        style={{ borderColor: isDark ? '#334155' : '#E2E8F0', minHeight: '64px' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accentColor }}
        >
          <FileText className="w-4 h-4 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
              {portalLabel} Officer
            </p>
            <p className="text-[10px] truncate" style={{ color: '#64748B' }}>DO Portal</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map(item => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
              style={{
                background: active
                  ? isDark ? `${accentColor}25` : `${accentColor}15`
                  : 'transparent',
                color: active
                  ? accentColor
                  : isDark ? '#94A3B8' : '#64748B',
                fontWeight: active ? 600 : 400,
              }}
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.background = isDark ? '#1E293B' : '#F8FAFC';
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && (
                <span className="text-sm truncate">{item.label}</span>
              )}
              {active && !sidebarCollapsed && (
                <div
                  className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: accentColor }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={() => setSidebarCollapsed(c => !c)}
        className="hidden lg:flex items-center justify-center mx-auto mb-3 w-8 h-8 rounded-lg transition-colors"
        style={{
          background: isDark ? '#334155' : '#F1F5F9',
          color: isDark ? '#94A3B8' : '#64748B',
        }}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: isDark ? '#0F172A' : '#F8FAFC' }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col border-r flex-shrink-0 transition-all duration-200"
        style={{
          width: sidebarCollapsed ? '64px' : '220px',
          background: isDark ? '#1E293B' : '#FFFFFF',
          borderColor: isDark ? '#334155' : '#E2E8F0',
        }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r lg:hidden"
            style={{
              width: '220px',
              background: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            }}
          >
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header
          className="flex items-center justify-between px-4 lg:px-6 border-b flex-shrink-0"
          style={{
            height: '64px',
            background: isDark ? '#1E293B' : '#FFFFFF',
            borderColor: isDark ? '#334155' : '#E2E8F0',
          }}
        >
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 rounded-lg transition-colors"
              style={{ color: isDark ? '#94A3B8' : '#64748B' }}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <h1 className="text-base font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                {portalLabel} Officer Portal
              </h1>
              <p className="text-xs hidden sm:block" style={{ color: '#64748B' }}>
                {activeTab === 'overview'
                  ? 'Overview Dashboard'
                  : activeTab === 'do'
                  ? 'Delivery Order Management'
                  : 'Portal Settings'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />

            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg transition-colors"
              style={{ color: isDark ? '#94A3B8' : '#64748B' }}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Profile menu */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(v => !v)}
                className="flex items-center gap-2 p-1.5 rounded-lg transition-colors"
                style={{ background: showProfileMenu ? (isDark ? '#334155' : '#F1F5F9') : 'transparent' }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}CC)` }}
                >
                  <UserIcon className="w-4 h-4 text-white" />
                </div>
                <div className="text-left hidden md:block">
                  <p className="text-sm font-medium leading-tight" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-[10px] capitalize" style={{ color: '#64748B' }}>
                    {user.role.replace('_', ' ')}
                  </p>
                </div>
              </button>

              {showProfileMenu && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                  <div
                    className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl border py-2 z-[110]"
                    style={{
                      background: isDark ? '#1E293B' : '#FFFFFF',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    }}
                  >
                    <div className="px-4 py-2 border-b" style={{ borderColor: isDark ? '#334155' : '#E2E8F0' }}>
                      <p className="text-xs" style={{ color: '#64748B' }}>Signed in as</p>
                      <p className="text-sm font-medium truncate" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs truncate" style={{ color: '#64748B' }}>{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setShowProfileMenu(false); setShowChangePassword(true); }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center transition-colors"
                      style={{ color: isDark ? '#CBD5E1' : '#374151' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#334155' : '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <Key className="w-4 h-4 mr-3" /> Change Password
                    </button>
                    <div className="border-t my-1" style={{ borderColor: isDark ? '#334155' : '#E2E8F0' }} />
                    <button
                      onClick={() => { setShowProfileMenu(false); logout(); }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center text-red-500"
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(239,68,68,0.1)' : '#FFF5F5')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <LogOut className="w-4 h-4 mr-3" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" id="main-scroll-container">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'overview' && (
              <OfficerOverview user={user} onNavigateToDO={handleNavigateToDO} />
            )}
            {activeTab === 'do' && (
              <DOManagement user={user} />
            )}
            {activeTab === 'config' && (
              <OfficerConfig user={user} />
            )}
          </Suspense>
        </main>
      </div>

      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            toast.success('Password changed successfully!');
          }}
        />
      )}
    </div>
  );
}

export default OfficerPortal;
