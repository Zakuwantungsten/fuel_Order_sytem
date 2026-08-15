import { useState, useEffect, Suspense } from 'react';
import { lazyWithRetry } from '../utils/lazyWithRetry';
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
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Menu,
  Stamp,
  Settings2,
} from 'lucide-react';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';

const ClerkDailyWorkspace = lazyWithRetry(() => import('./clerk/ClerkDailyWorkspace'));
const ClerkOverviewPlaceholder = lazyWithRetry(() => import('./clerk/ClerkOverviewPlaceholder'));
const ClerkConfig = lazyWithRetry(() => import('./clerk/ClerkConfig'));

interface ClerkPortalProps {
  user: User;
}

type ActiveTab = 'daily' | 'overview' | 'config';

const TabFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
  </div>
);

export function ClerkPortal({ user }: ClerkPortalProps) {
  const { logout, toggleTheme, isDark } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('daily');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const homeTab: ActiveTab = 'daily';
  const accentColor = '#0D9488';

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!window.history.state?.tab) {
      window.history.replaceState({ tab: activeTab }, '', window.location.pathname + window.location.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const previousTab = event.state?.tab as ActiveTab | undefined;
      if (previousTab && previousTab !== activeTab && ['daily', 'overview', 'config'].includes(previousTab)) {
        setActiveTab(previousTab);
        return;
      }
      if ((!previousTab || !['daily', 'overview', 'config'].includes(previousTab)) && activeTab !== homeTab) {
        window.history.pushState({ tab: homeTab }, '', window.location.pathname + window.location.search);
        setActiveTab(homeTab);
        return;
      }
      window.history.pushState({ tab: activeTab }, '', window.location.pathname + window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeTab]);

  const navigateToTab = (tab: ActiveTab) => {
    if (tab === activeTab) return;
    window.history.pushState({ tab }, '', window.location.pathname + window.location.search);
    setActiveTab(tab);
  };

  if (loading) return <UnifiedTabLoader label="Loading clerk portal..." />;

  const navItems: { id: ActiveTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'daily', label: 'Daily Desk', icon: ClipboardList },
    { id: 'config', label: 'Configuration', icon: Settings2 },
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  ];

  const handleTabClick = (tab: ActiveTab) => {
    navigateToTab(tab);
    setMobileSidebarOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-3 px-4 py-4 border-b"
        style={{ borderColor: isDark ? '#334155' : '#E2E8F0', minHeight: '64px' }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accentColor }}
        >
          <Stamp className="w-4 h-4 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
              Clerk Portal
            </p>
            <p className="text-[10px] truncate" style={{ color: '#64748B' }}>
              Visas & Overstays
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              title={sidebarCollapsed ? item.label : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left"
              style={{
                background: active ? (isDark ? `${accentColor}25` : `${accentColor}15`) : 'transparent',
                color: active ? accentColor : isDark ? '#94A3B8' : '#64748B',
                fontWeight: active ? 600 : 400,
              }}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span className="text-sm truncate">{item.label}</span>}
              {active && !sidebarCollapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
              )}
            </button>
          );
        })}
      </nav>

      <button
        onClick={() => setSidebarCollapsed((c) => !c)}
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

      {mobileSidebarOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
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

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header
          className="flex items-center justify-between px-4 lg:px-6 border-b flex-shrink-0"
          style={{
            height: '64px',
            background: isDark ? '#1E293B' : '#FFFFFF',
            borderColor: isDark ? '#334155' : '#E2E8F0',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 rounded-lg transition-colors"
              style={{ color: isDark ? '#94A3B8' : '#64748B' }}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                Clerk Portal
              </h1>
              <p className="text-xs hidden sm:block" style={{ color: '#64748B' }}>
                {activeTab === 'daily'
                  ? 'Daily visa & overstay desk'
                  : activeTab === 'config'
                    ? 'Build day rules & amounts'
                    : 'Overview (coming soon)'}
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

            <div className="relative">
              <button
                onClick={() => setShowProfileMenu((v) => !v)}
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
                      <p className="text-xs" style={{ color: '#64748B' }}>
                        Signed in as
                      </p>
                      <p className="text-sm font-medium truncate" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                        {user.firstName} {user.lastName}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        setShowChangePassword(true);
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center"
                      style={{ color: isDark ? '#CBD5E1' : '#374151' }}
                    >
                      <Key className="w-4 h-4 mr-3" /> Change Password
                    </button>
                    <div className="border-t my-1" style={{ borderColor: isDark ? '#334155' : '#E2E8F0' }} />
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        logout();
                      }}
                      className="w-full px-4 py-2 text-left text-sm flex items-center text-red-500"
                    >
                      <LogOut className="w-4 h-4 mr-3" /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6" id="main-scroll-container">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'daily' && <ClerkDailyWorkspace />}
            {activeTab === 'config' && <ClerkConfig />}
            {activeTab === 'overview' && <ClerkOverviewPlaceholder />}
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

export default ClerkPortal;
