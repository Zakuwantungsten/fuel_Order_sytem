// Phase 0 barrel export — updated Phase 7
// Re-exports all building blocks plus the main orchestrator.

// Types
export type * from './types';

// Constants
export {
  USER_ROLES,
  ALL_ROLE_VALUES,
  getRoleDefinition,
  YARDS,
  LIFECYCLE_STATES,
  PRIVILEGE_STATUS_CONFIG,
  TABLE_COLUMNS,
  PAGE_SIZE_OPTIONS,
  EXTENDED_PAGE_SIZE_OPTIONS,
  DEFAULT_PAGE_SIZE,
  VIRTUAL_SCROLL_THRESHOLD,
  TABLE_ROW_HEIGHT,
  KEYBOARD_SHORTCUTS,
  STAT_GRADIENTS,
  ROLE_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  MFA_FILTER_OPTIONS,
} from './constants';

// Hooks
export { useUsers, userQueryKeys } from './hooks/useUsers';
export { useUserDetail } from './hooks/useUserDetail';
export { useBulkSelection } from './hooks/useBulkSelection';
export { useUndoToast } from './hooks/useUndoToast';
export { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
export { useOptimisticMutations } from './hooks/useOptimisticMutations';

// Components
export { default as StatCard } from './components/StatCard';
export { default as FilterChips } from './components/FilterChips';
export { default as FilterDropdown } from './components/FilterDropdown';
export { default as SkeletonTable } from './components/SkeletonTable';
export { default as EmptyState } from './components/EmptyState';
export { default as RelativeTime } from './components/RelativeTime';
export { default as UserAvatar } from './components/UserAvatar';
export { default as StatusBadge, resolveLifecycleState } from './components/StatusBadge';
export { default as RoleBadge } from './components/RoleBadge';
export { default as AccessibleModal } from './components/AccessibleModal';
export { default as SortableColumnHeader } from './components/SortableColumnHeader';

// Phase 1 Components
export { default as UserActionsMenu } from './components/UserActionsMenu';
export type { UserAction } from './components/UserActionsMenu';
export { default as UserTableRow } from './components/UserTableRow';
export { default as UserTableToolbar } from './components/UserTableToolbar';
export { default as BulkActionBar } from './components/BulkActionBar';
export { default as UserTable } from './components/UserTable';
export { default as UsersView } from './components/UsersView';

// Phase 2 Components
export { default as UserDetailDrawer } from './components/UserDetailDrawer';
export { default as OverviewTab } from './components/drawer/OverviewTab';
export { default as SecurityTab } from './components/drawer/SecurityTab';
export { default as ActivityTab } from './components/drawer/ActivityTab';
export { default as SessionsTab } from './components/drawer/SessionsTab';
export { default as RolesTab } from './components/drawer/RolesTab';
export { default as NotesTab } from './components/drawer/NotesTab';

// Phase 3 Components
export { default as CreateUserModal } from './components/CreateUserModal';
export { default as EditUserModal } from './components/EditUserModal';
export { default as ResetPasswordModal } from './components/ResetPasswordModal';
export { default as BanUserModal } from './components/BanUserModal';

// Phase 4 Components
export { default as DriverCredentialsView } from './components/DriverCredentialsView';
export { default as PrivilegeElevationView } from './components/PrivilegeElevationView';

// Phase 5 Components
export { default as VirtualUserTableBody } from './components/VirtualUserTableBody';

// Phase 7 — Error boundary & main orchestrator
export { default as SectionErrorBoundary } from './components/ErrorBoundary';
export { default as UserManagementPage } from './components/UserManagementPage';
