import type { User } from '../../../../types';
import type { SortConfig, SortField } from '../types';
import { TABLE_COLUMNS, VIRTUAL_SCROLL_THRESHOLD } from '../constants';
import SortableColumnHeader from './SortableColumnHeader';
import UserTableRow from './UserTableRow';
import SkeletonTable from './SkeletonTable';
import EmptyState from './EmptyState';
import VirtualUserTableBody from './VirtualUserTableBody';
import UserActionsMenu from './UserActionsMenu';
import type { UserAction } from './UserActionsMenu';
import UserAvatar from './UserAvatar';
import StatusBadge from './StatusBadge';
import RelativeTime from './RelativeTime';

// ── Mobile card component (shown below md breakpoint) ───────────────────────
interface MobileUserCardProps {
  user: User;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onClick: () => void;
  onAction: (action: UserAction, user: User) => void;
}

function MobileUserCard({ user, isSelected, onSelect, onClick, onAction }: MobileUserCardProps) {
  const userId = String(user.id || (user as any)._id);
  return (
    <div className={`px-4 py-3.5 transition-colors ${isSelected ? 'bg-blue-50/70 dark:bg-blue-900/10' : ''}`}>
      {/* Primary row: checkbox + avatar + name/username + badges + menu */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => { e.stopPropagation(); onSelect(userId); }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer flex-shrink-0"
          aria-label={`Select ${user.firstName} ${user.lastName}`}
        />
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onClick}>
          <UserAvatar firstName={user.firstName} lastName={user.lastName} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm leading-5">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">@{user.username}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <StatusBadge user={user} size="sm" />
          </div>
        </button>
        <div className="flex-shrink-0">
          <UserActionsMenu user={user} onAction={onAction} />
        </div>
      </div>
      {/* Secondary row: email + last login */}
      {(user.email || user.lastLogin) && (
        <div className="mt-1.5 flex items-center gap-3 pl-[52px] text-xs text-gray-500 dark:text-gray-400">
          {user.email && (
            <span className="truncate max-w-[200px]">{user.email}</span>
          )}
          {user.email && user.lastLogin && (
            <span className="text-gray-300 dark:text-gray-600">·</span>
          )}
          {user.lastLogin && (
            <span className="flex-shrink-0">
              Last active <RelativeTime date={user.lastLogin} fallback="never" className="inline" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface UserTableProps {
  users: User[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  sort: SortConfig | null;
  onSort: (field: SortField) => void;
  // Selection
  selectedIds: Set<string>;
  allPageSelected: boolean;
  checkboxRef: React.RefObject<HTMLInputElement | null>;
  onToggleOne: (id: string) => void;
  onTogglePage: () => void;
  // Row interactions
  onRowClick: (user: User) => void;
  onAction: (action: UserAction, user: User) => void;
  // Empty state
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onCreateUser: () => void;
  onRetry: () => void;
}

export default function UserTable({
  users,
  isLoading,
  isFetching,
  isError,
  sort,
  onSort,
  selectedIds,
  allPageSelected,
  checkboxRef,
  onToggleOne,
  onTogglePage,
  onRowClick,
  onAction,
  hasActiveFilters,
  onClearFilters,
  onCreateUser,
  onRetry,
}: UserTableProps) {
  const useVirtual = users.length > VIRTUAL_SCROLL_THRESHOLD;
  const isPageTransition = isFetching && users.length > 0 && !isLoading;
  if (isLoading && users.length === 0) {
    return <SkeletonTable rows={8} columns={8} showCheckbox />;
  }

  if (isError) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <EmptyState
          variant="error"
          actions={[{ label: 'Try again', onClick: onRetry, variant: 'primary' }]}
        />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <EmptyState
          variant={hasActiveFilters ? 'no-results' : 'no-data'}
          actions={
            hasActiveFilters
              ? [{ label: 'Clear filters', onClick: onClearFilters }]
              : [{ label: 'Create User', onClick: onCreateUser, variant: 'primary' }]
          }
        />
      </div>
    );
  }

  // Determine sortable columns from TABLE_COLUMNS

  return (
    <div className="relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Page transition overlay */}
      {isPageTransition && (
        <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 backdrop-blur-[1px] z-10 flex items-start justify-center pt-20 transition-opacity" role="status" aria-live="polite">
          <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 rounded-full shadow-lg border border-gray-200 dark:border-gray-600">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Updating...</span>
          </div>
        </div>
      )}

      {/* ── MOBILE: card list (< md) ─────────────────────────────────── */}
      <div className="md:hidden">
        {/* Select-all header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/50">
          <input
            ref={checkboxRef as React.Ref<HTMLInputElement>}
            type="checkbox"
            checked={allPageSelected}
            onChange={onTogglePage}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
            aria-label={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
          />
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {allPageSelected ? 'All on this page selected' : 'Select all on this page'}
          </span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {users.map(user => {
            const userId = String(user.id || (user as any)._id);
            return (
              <MobileUserCard
                key={userId}
                user={user}
                isSelected={selectedIds.has(userId)}
                onSelect={onToggleOne}
                onClick={() => onRowClick(user)}
                onAction={onAction}
              />
            );
          })}
        </div>
      </div>

      {/* ── DESKTOP: full table (md+) ────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm" aria-label="Users">
          <thead className="bg-gray-50/80 dark:bg-gray-900/50">
            <tr>
              {/* Checkbox header */}
              <th className="px-4 py-3 w-12">
                <input
                  ref={checkboxRef as React.Ref<HTMLInputElement>}
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={onTogglePage}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                  aria-label={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
                />
              </th>

              {/* Sortable columns */}
              {TABLE_COLUMNS.filter(c => c.id !== 'select' && c.id !== 'actions').map(col => {
                if (col.sortable && col.sortField) {
                  return (
                    <SortableColumnHeader
                      key={col.id}
                      label={col.label}
                      field={col.sortField}
                      currentSort={sort}
                      onSort={onSort}
                      className={col.width || ''}
                    />
                  );
                }
                return (
                  <th
                    key={col.id}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap ${col.width || ''} ${
                      col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                );
              })}

              {/* Actions header (empty) */}
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>

          {useVirtual ? (
            <VirtualUserTableBody
              users={users}
              selectedIds={selectedIds}
              onToggleOne={onToggleOne}
              onRowClick={onRowClick}
              onAction={onAction}
            />
          ) : (
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {users.map(user => {
                const userId = String(user.id || (user as any)._id);
                return (
                  <UserTableRow
                    key={userId}
                    user={user}
                    isSelected={selectedIds.has(userId)}
                    onSelect={onToggleOne}
                    onRowClick={onRowClick}
                    onAction={onAction}
                  />
                );
              })}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
