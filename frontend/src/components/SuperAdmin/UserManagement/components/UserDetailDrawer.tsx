import { useEffect, useRef, useCallback } from 'react';
import {
  X, User as UserIcon, Shield, Activity, Monitor, Key, StickyNote,
  Loader2,
} from 'lucide-react';
import type { DrawerTab } from '../types';
import type { UserDetail } from '../../../../types';
import UserAvatar from './UserAvatar';
import StatusBadge from './StatusBadge';
import RoleBadge from './RoleBadge';
import OverviewTab from './drawer/OverviewTab';
import SecurityTab from './drawer/SecurityTab';
import ActivityTab from './drawer/ActivityTab';
import SessionsTab from './drawer/SessionsTab';
import RolesTab from './drawer/RolesTab';
import NotesTab from './drawer/NotesTab';

interface UserDetailDrawerProps {
  isOpen: boolean;
  userDetail: UserDetail | null;
  isLoading: boolean;
  isError: boolean;
  activeTab: DrawerTab;
  onClose: () => void;
  onSwitchTab: (tab: DrawerTab) => void;
  onRefresh: () => void;
  onAction: (action: string, userId: string) => void;
}

const TABS: { id: DrawerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',  label: 'Overview',  icon: UserIcon },
  { id: 'security',  label: 'Security',  icon: Shield },
  { id: 'activity',  label: 'Activity',  icon: Activity },
  { id: 'sessions',  label: 'Sessions',  icon: Monitor },
  { id: 'roles',     label: 'Roles',     icon: Key },
  { id: 'notes',     label: 'Notes',     icon: StickyNote },
];

export default function UserDetailDrawer({
  isOpen,
  userDetail,
  isLoading,
  isError,
  activeTab,
  onClose,
  onSwitchTab,
  onRefresh,
  onAction,
}: UserDetailDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save & restore focus
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => drawerRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else {
      previousFocusRef.current?.focus();
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap — keep Tab within the drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusableSelector =
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector);
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstEl) {
            e.preventDefault();
            lastEl?.focus();
          }
        } else {
          if (document.activeElement === lastEl) {
            e.preventDefault();
            firstEl?.focus();
          }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // ArrowLeft/ArrowRight on tabs
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIdx = TABS.findIndex(t => t.id === activeTab);
    let nextIdx = -1;
    if (e.key === 'ArrowRight') {
      nextIdx = (currentIdx + 1) % TABS.length;
    } else if (e.key === 'ArrowLeft') {
      nextIdx = (currentIdx - 1 + TABS.length) % TABS.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = TABS.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      onSwitchTab(TABS[nextIdx].id);
    }
  }, [activeTab, onSwitchTab]);

  if (!isOpen) return null;

  const user = userDetail?.user;
  const userId = user ? String(user.id || (user as any)._id) : '';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={user ? `Details for ${user.firstName} ${user.lastName}` : 'User details'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <div
        ref={drawerRef}
        tabIndex={-1}
        className="relative w-full max-w-xl bg-white dark:bg-gray-800 shadow-2xl flex flex-col animate-slide-in-right outline-none"
      >
        {/* Loading / Error overlay */}
        {isLoading && !userDetail && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 z-10">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        )}
        {isError && !userDetail && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white dark:bg-gray-800 z-10 p-8">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Failed to load user details</p>
            <button
              onClick={onRefresh}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
          <div className="p-5 pb-0">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                {user && (
                  <UserAvatar firstName={user.firstName} lastName={user.lastName} size="lg" />
                )}
                <div className="min-w-0">
                  {user ? (
                    <>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {user.firstName} {user.lastName}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        @{user.username}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                      <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-1" />
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status & Role badges */}
            {user && (
              <div className="flex items-center gap-2 mb-4">
                <StatusBadge user={user} size="md" />
                <RoleBadge role={user.role} size="md" />
              </div>
            )}

            {/* Tabs */}
            <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="User detail tabs" onKeyDown={handleTabKeyDown}>
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    id={`drawer-tab-${tab.id}`}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.id}`}
                    onClick={() => onSwitchTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                      isActive
                        ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {user && userDetail && (
            <div
              id={`tabpanel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`drawer-tab-${activeTab}`}
              className="p-5"
            >
              {activeTab === 'overview' && (
                <OverviewTab user={user} />
              )}
              {activeTab === 'security' && (
                <SecurityTab
                  user={user}
                  mfaStatus={userDetail.mfaStatus}
                  onAction={(action: string) => onAction(action, userId)}
                />
              )}
              {activeTab === 'activity' && (
                <ActivityTab
                  loginHistory={userDetail.loginHistory || []}
                />
              )}
              {activeTab === 'sessions' && (
                <SessionsTab
                  userId={userId}
                  onForceLogout={() => onAction('force_logout', userId)}
                />
              )}
              {activeTab === 'roles' && (
                <RolesTab user={user} />
              )}
              {activeTab === 'notes' && (
                <NotesTab user={user} onRefresh={onRefresh} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
