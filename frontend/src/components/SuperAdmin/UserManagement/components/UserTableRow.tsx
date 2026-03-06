import { memo } from 'react';
import { ShieldOff } from 'lucide-react';
import type { User } from '../../../../types';

import UserAvatar from './UserAvatar';
import StatusBadge from './StatusBadge';
import RoleBadge from './RoleBadge';
import RelativeTime from './RelativeTime';
import UserActionsMenu, { type UserAction } from './UserActionsMenu';

interface UserTableRowProps {
  user: User;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRowClick: (user: User) => void;
  onAction: (action: UserAction, user: User) => void;
}

export default memo(function UserTableRow({
  user,
  isSelected,
  onSelect,
  onRowClick,
  onAction,
}: UserTableRowProps) {
  const userId = String(user.id || (user as any)._id);

  return (
    <tr
      onClick={() => onRowClick(user)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(user);
        }
      }}
      tabIndex={0}
      className={`group transition-colors cursor-pointer ${
        isSelected
          ? 'bg-indigo-50/70 dark:bg-indigo-900/10'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      {/* Checkbox */}
      <td className="px-4 py-3 w-12">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onSelect(userId); }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
          aria-label={`Select ${user.firstName} ${user.lastName}`}
        />
      </td>

      {/* User: avatar + name + username */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <UserAvatar firstName={user.firstName} lastName={user.lastName} size="md" />
          <div className="min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{user.username}</p>
          </div>
        </div>
      </td>

      {/* Email */}
      <td className="px-4 py-3">
        <span className="text-sm text-gray-600 dark:text-gray-300 truncate block max-w-[200px]">
          {user.email || <span className="text-gray-400 dark:text-gray-500">--</span>}
        </span>
      </td>

      {/* Role */}
      <td className="px-4 py-3">
        <RoleBadge role={user.role} size="sm" />
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge user={user} size="sm" />
      </td>

      {/* MFA */}
      <td className="px-4 py-3 text-center">
        <MfaIndicator user={user} />
      </td>

      {/* Last Active */}
      <td className="px-4 py-3">
        <RelativeTime
          date={user.lastLogin}
          fallback="Never"
          className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
        />
      </td>

      {/* Created */}
      <td className="px-4 py-3">
        <RelativeTime
          date={user.createdAt}
          className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap"
        />
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex justify-end">
          <UserActionsMenu user={user} onAction={onAction} />
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  // Custom comparator: re-render only when user data or selection changes
  const prevId = String(prev.user.id || (prev.user as any)._id);
  const nextId = String(next.user.id || (next.user as any)._id);
  return (
    prevId === nextId &&
    prev.isSelected === next.isSelected &&
    prev.user.isActive === next.user.isActive &&
    prev.user.isBanned === next.user.isBanned &&
    prev.user.role === next.user.role &&
    prev.user.firstName === next.user.firstName &&
    prev.user.lastName === next.user.lastName &&
    prev.user.email === next.user.email &&
    prev.user.lastLogin === next.user.lastLogin
  );
});

// Small MFA indicator icon - this is a lightweight display, detail is in the drawer
function MfaIndicator({ user: _user }: { user: User }) {
  // We don't have MFA status on the list endpoint; show a neutral indicator
  // The detail drawer (Phase 2) will show full MFA info via getDetail()
  return (
    <span
      className="inline-flex items-center justify-center"
      title="View MFA status in user details"
      aria-label="MFA status unknown - click user for details"
    >
      <ShieldOff className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
    </span>
  );
}
