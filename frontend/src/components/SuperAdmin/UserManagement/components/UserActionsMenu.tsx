import { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal, Edit2, Key, LogOut, ShieldCheck, Ban,
  Trash2, UserCheck, UserX,
} from 'lucide-react';
import type { User } from '../../../../types';

export type UserAction =
  | 'edit'
  | 'reset_password'
  | 'force_logout'
  | 'ban'
  | 'unban'
  | 'delete'
  | 'toggle_status';

interface UserActionsMenuProps {
  user: User;
  onAction: (action: UserAction, user: User) => void;
}

interface MenuItem {
  action: UserAction;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  hoverBg: string;
  show: boolean;
  danger?: boolean;
}

export default function UserActionsMenu({ user, onAction }: UserActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAction = (action: UserAction) => {
    setOpen(false);
    setFocusIndex(-1);
    onAction(action, user);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setFocusIndex(-1);
      buttonRef.current?.focus();
      return;
    }

    const allItems = [...items.filter(i => i.show)];
    const count = allItems.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex(prev => (prev + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex(prev => (prev - 1 + count) % count);
        break;
      case 'Home':
        e.preventDefault();
        setFocusIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusIndex(count - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < count) {
          handleAction(allItems[focusIndex].action);
        }
        break;
    }
  };

  // Focus the active menu item when focusIndex changes
  useEffect(() => {
    if (open && focusIndex >= 0) {
      menuItemRefs.current[focusIndex]?.focus();
    }
  }, [focusIndex, open]);

  const items: MenuItem[] = [
    {
      action: 'edit',
      label: 'Edit user',
      icon: Edit2,
      color: 'text-gray-700 dark:text-gray-300',
      hoverBg: 'hover:bg-gray-50 dark:hover:bg-gray-700',
      show: true,
    },
    {
      action: 'toggle_status',
      label: user.isActive ? 'Deactivate' : 'Activate',
      icon: user.isActive ? UserX : UserCheck,
      color: user.isActive
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-emerald-600 dark:text-emerald-400',
      hoverBg: user.isActive
        ? 'hover:bg-orange-50 dark:hover:bg-orange-900/20'
        : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
      show: !user.isBanned,
    },
    {
      action: 'reset_password',
      label: 'Reset password',
      icon: Key,
      color: 'text-amber-600 dark:text-amber-400',
      hoverBg: 'hover:bg-amber-50 dark:hover:bg-amber-900/20',
      show: true,
    },
    {
      action: 'force_logout',
      label: 'Force logout',
      icon: LogOut,
      color: 'text-yellow-600 dark:text-yellow-400',
      hoverBg: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20',
      show: !!user.lastLogin,
    },
    {
      action: user.isBanned ? 'unban' : 'ban',
      label: user.isBanned ? 'Unban user' : 'Ban user',
      icon: user.isBanned ? ShieldCheck : Ban,
      color: user.isBanned
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-purple-600 dark:text-purple-400',
      hoverBg: user.isBanned
        ? 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
        : 'hover:bg-purple-50 dark:hover:bg-purple-900/20',
      show: true,
    },
    {
      action: 'delete',
      label: 'Delete user',
      icon: Trash2,
      color: 'text-red-600 dark:text-red-400',
      hoverBg: 'hover:bg-red-50 dark:hover:bg-red-900/20',
      show: true,
      danger: true,
    },
  ];

  const visibleItems = items.filter(i => i.show);
  const standardItems = visibleItems.filter(i => !i.danger);
  const dangerItems = visibleItems.filter(i => i.danger);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); if (!open) setFocusIndex(0); }}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label={`Actions for ${user.firstName} ${user.lastName}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          onKeyDown={handleKeyDown}
          className="absolute right-0 top-full mt-1 z-40 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl py-1 overflow-hidden"
        >
          {/* User info header */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{user.username}</p>
          </div>

          {/* Standard actions */}
          <div className="py-1">
            {standardItems.map(item => {
              const visibleIdx = visibleItems.indexOf(item);
              const Icon = item.icon;
              return (
                <button
                  key={item.action}
                  ref={el => { menuItemRefs.current[visibleIdx] = el; }}
                  role="menuitem"
                  tabIndex={focusIndex === visibleIdx ? 0 : -1}
                  onClick={(e) => { e.stopPropagation(); handleAction(item.action); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${item.color} ${item.hoverBg} transition-colors text-left`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Danger zone */}
          {dangerItems.length > 0 && (
            <>
              <div className="border-t border-gray-100 dark:border-gray-700" />
              <div className="py-1">
                {dangerItems.map(item => {
                  const visibleIdx = visibleItems.indexOf(item);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.action}
                      ref={el => { menuItemRefs.current[visibleIdx] = el; }}
                      role="menuitem"
                      tabIndex={focusIndex === visibleIdx ? 0 : -1}
                      onClick={(e) => { e.stopPropagation(); handleAction(item.action); }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm ${item.color} ${item.hoverBg} transition-colors text-left`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
