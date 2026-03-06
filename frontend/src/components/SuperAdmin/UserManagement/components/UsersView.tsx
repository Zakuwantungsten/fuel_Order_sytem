import { useState, useCallback, useRef, useMemo } from 'react';
import { toast } from 'react-toastify';
import { Users, UserCheck, UserX, Ban, AlertTriangle, LogOut } from 'lucide-react';
import { usersAPI } from '../../../../services/api';
import * as bulkUserService from '../../../../services/bulkUserService';
import type { User } from '../../../../types';
import Pagination from '../../../Pagination';
import { useUsers } from '../hooks/useUsers';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useUndoToast } from '../hooks/useUndoToast';
import { useUserDetail } from '../hooks/useUserDetail';
import { useOptimisticMutations } from '../hooks/useOptimisticMutations';
import { STAT_GRADIENTS, EXTENDED_PAGE_SIZE_OPTIONS, KEYBOARD_SHORTCUTS } from '../constants';
import type { BulkActionType } from '../types';
import StatCard from './StatCard';
import UserTableToolbar from './UserTableToolbar';
import BulkActionBar from './BulkActionBar';
import UserTable from './UserTable';
import UserDetailDrawer from './UserDetailDrawer';
import AccessibleModal from './AccessibleModal';
import CreateUserModal from './CreateUserModal';
import EditUserModal from './EditUserModal';
import ResetPasswordModal from './ResetPasswordModal';
import BanUserModal from './BanUserModal';
import type { UserAction } from './UserActionsMenu';

// ── Confirmation modal state (simple confirm-only modals) ────────────────────
type SimpleModalType = 'delete' | 'unban' | 'forceLogout' | null;

const SIMPLE_MODAL_CONFIG: Record<Exclude<SimpleModalType, null>, { title: string; description: string; confirmLabel: string; variant: string; icon: React.ComponentType<{ className?: string }> }> = {
  delete: { title: 'Delete User', description: 'This action cannot be undone. The user account and all associated data will be permanently removed.', confirmLabel: 'Delete', variant: 'red', icon: AlertTriangle },
  unban: { title: 'Unban User', description: 'This will restore the user\'s access and allow them to log in again.', confirmLabel: 'Unban', variant: 'green', icon: UserCheck },
  forceLogout: { title: 'Force Logout', description: 'This will immediately terminate the user\'s active session. They will need to log in again.', confirmLabel: 'Force Logout', variant: 'yellow', icon: LogOut },
};

const VARIANT_STYLES: Record<string, string> = {
  red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  green: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  yellow: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
};

const ICON_BG_STYLES: Record<string, string> = {
  red: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
};

export default function UsersView() {
  // ── Data & State ─────────────────────────────────────────────────────────
  const {
    users,
    pagination,
    filters,
    sort,
    page,
    limit,
    isLoading,
    isFetching,
    isError,
    hasActiveFilters,
    setSearch,
    setFilter,
    setSort,
    setPage,
    setLimit,
    clearFilters,
    refetch,
    invalidate,
  } = useUsers();

  const pageIds = useMemo(
    () => users.map(u => String(u.id || (u as any)._id)),
    [users],
  );

  const bulk = useBulkSelection({ pageIds, totalMatching: pagination.total });
  const undo = useUndoToast();
  const drawer = useUserDetail();
  const mutations = useOptimisticMutations();

  // Keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);
  useKeyboardShortcuts({
    shortcuts: [
      { key: KEYBOARD_SHORTCUTS.GLOBAL_SEARCH.key, ctrl: true, handler: () => searchInputRef.current?.focus() },
      { key: KEYBOARD_SHORTCUTS.SELECT_ALL.key, ctrl: true, shift: true, handler: () => bulk.togglePage() },
      { key: KEYBOARD_SHORTCUTS.CREATE_USER.key, ctrl: true, shift: true, handler: () => setShowCreateModal(true) },
      { key: KEYBOARD_SHORTCUTS.CLOSE.key, handler: () => { if (drawer.isOpen) drawer.closeDrawer(); } },
    ],
  });

  // ── Modal State ──────────────────────────────────────────────────────────
  // Simple confirmation modals (delete, unban, forceLogout)
  const [simpleModal, setSimpleModal] = useState<SimpleModalType>(null);
  const [simpleModalUser, setSimpleModalUser] = useState<User | null>(null);
  const [simpleModalLoading, setSimpleModalLoading] = useState(false);

  // Rich modals (create, edit, ban, resetPassword)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editModalUser, setEditModalUser] = useState<User | null>(null);
  const [banModalUser, setBanModalUser] = useState<User | null>(null);
  const [resetPwModalUser, setResetPwModalUser] = useState<User | null>(null);

  const openSimpleModal = useCallback((type: SimpleModalType, user: User) => {
    setSimpleModalUser(user);
    setSimpleModal(type);
  }, []);

  const closeSimpleModal = useCallback(() => {
    setSimpleModal(null);
    setSimpleModalUser(null);
    setSimpleModalLoading(false);
  }, []);

  // ── Stat Aggregation ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = pagination.total;
    const active = users.filter(u => u.isActive).length;
    const inactive = users.filter(u => !u.isActive && !u.isBanned).length;
    const banned = users.filter(u => u.isBanned).length;
    return { total, active, inactive, banned };
  }, [users, pagination.total]);

  // ── Row Action Handler ───────────────────────────────────────────────────
  const handleAction = useCallback((action: UserAction, user: User) => {
    switch (action) {
      case 'edit':
        setEditModalUser(user);
        break;
      case 'toggle_status': {
        const willDeactivate = user.isActive;
        const label = willDeactivate ? 'deactivated' : 'activated';
        const userId = String(user.id || (user as any)._id);
        const opt = mutations.prepareOptimisticToggle(userId);
        opt.apply();
        undo.trigger({
          message: `${user.firstName} ${user.lastName} ${label}`,
          onCommit: async () => {
            try {
              await opt.commit();
            } catch {
              opt.revert();
              toast.error(`Failed to ${willDeactivate ? 'deactivate' : 'activate'} user`);
            }
          },
          onUndo: async () => {
            opt.revert();
          },
        });
        break;
      }
      case 'reset_password':
        setResetPwModalUser(user);
        break;
      case 'force_logout':
        openSimpleModal('forceLogout', user);
        break;
      case 'ban':
        setBanModalUser(user);
        break;
      case 'unban':
        openSimpleModal('unban', user);
        break;
      case 'delete':
        openSimpleModal('delete', user);
        break;
    }
  }, [undo, invalidate, openSimpleModal]);

  // ── Simple Modal Confirmation ──────────────────────────────────────────
  const handleSimpleConfirm = useCallback(async () => {
    if (!simpleModalUser || !simpleModal) return;
    const userId = String(simpleModalUser.id || (simpleModalUser as any)._id);
    setSimpleModalLoading(true);

    try {
      switch (simpleModal) {
        case 'delete':
          await mutations.deleteUser(userId);
          toast.success('User deleted successfully');
          break;
        case 'unban':
          await mutations.unbanUser(userId);
          toast.success('User unbanned successfully');
          break;
        case 'forceLogout':
          await mutations.forceLogout(userId);
          toast.success('User session terminated');
          break;
      }
      closeSimpleModal();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Operation failed';
      toast.error(msg);
      setSimpleModalLoading(false);
    }
  }, [simpleModal, simpleModalUser, mutations, closeSimpleModal]);

  // ── Rich modal success handlers ──────────────────────────────────────
  const handleCreateSuccess = useCallback(() => {
    toast.success('User created successfully');
    invalidate();
  }, [invalidate]);

  const handleEditSuccess = useCallback(() => {
    toast.success('User updated successfully');
    invalidate();
    drawer.invalidateDetail();
  }, [invalidate, drawer]);

  const handleBanSuccess = useCallback(() => {
    toast.success('User banned successfully');
    invalidate();
  }, [invalidate]);

  const handleResetPwSuccess = useCallback(() => {
    toast.success('Password reset successfully');
    invalidate();
  }, [invalidate]);

  // ── Bulk Actions ─────────────────────────────────────────────────────────
  const handleBulkAction = useCallback(async (action: BulkActionType, targetRole?: string) => {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;

    try {
      switch (action) {
        case 'activate':
          await bulkUserService.bulkAction({ action: 'activate', userIds: ids });
          toast.success(`${ids.length} user(s) activated`);
          break;
        case 'deactivate':
          await bulkUserService.bulkAction({ action: 'deactivate', userIds: ids });
          toast.success(`${ids.length} user(s) deactivated`);
          break;
        case 'change_role':
          if (!targetRole) return;
          await bulkUserService.bulkAction({ action: 'change_role', userIds: ids, role: targetRole });
          toast.success(`${ids.length} user(s) role changed`);
          break;
        case 'delete':
          await usersAPI.bulkDelete(ids);
          toast.success(`${ids.length} user(s) deleted`);
          break;
        case 'reset_password':
          await usersAPI.bulkResetPasswords(ids);
          toast.success(`${ids.length} password(s) reset`);
          break;
        case 'export':
          handleExportCSV();
          return;
      }
      bulk.clearSelection();
      invalidate();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message || 'Bulk operation failed';
      toast.error(msg);
    }
  }, [bulk, invalidate]);

  // ── CSV Export/Import ────────────────────────────────────────────────────
  const handleExportCSV = useCallback(async () => {
    try {
      const blob = await usersAPI.exportCSV({
        ...(filters.role && { role: filters.role }),
        ...(filters.status && { isActive: filters.status }),
        ...(filters.q && { q: filters.q }),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Users exported successfully');
    } catch {
      toast.error('Failed to export users');
    }
  }, [filters]);

  const handleImportCSV = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const result = await usersAPI.importCSV(text);
        toast.success(`Imported: ${result.created} created, ${result.skipped} skipped`);
        if (result.errors?.length) {
          toast.warn(`${result.errors.length} row(s) had errors`);
        }
        invalidate();
      } catch {
        toast.error('Failed to import CSV');
      }
    };
    input.click();
  }, [invalidate]);

  // ── Row click → Detail drawer ────────────────────────────────────────────
  const handleRowClick = useCallback((user: User) => {
    const userId = String(user.id || (user as any)._id);
    drawer.openDrawer(userId);
  }, [drawer]);

  // ── Drawer action handler (maps drawer actions to modals) ────────────
  const handleDrawerAction = useCallback((action: string, userId: string) => {
    const user = users.find(u => String(u.id || (u as any)._id) === userId);
    if (!user) return;

    switch (action) {
      case 'reset_password':
        setResetPwModalUser(user);
        break;
      case 'force_logout':
        openSimpleModal('forceLogout', user);
        break;
      case 'ban':
        setBanModalUser(user);
        break;
      case 'unban':
        openSimpleModal('unban', user);
        break;
      case 'toggle_status':
        handleAction('toggle_status', user);
        break;
    }
  }, [users, openSimpleModal, handleAction]);

  // ── Create User ─────────────────────────────────────────────────────────
  const handleCreateUser = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users" value={stats.total} icon={Users} gradient={STAT_GRADIENTS.total} />
        <StatCard label="Active" value={stats.active} icon={UserCheck} gradient={STAT_GRADIENTS.active} />
        <StatCard label="Inactive" value={stats.inactive} icon={UserX} gradient={STAT_GRADIENTS.inactive} />
        <StatCard label="Banned" value={stats.banned} icon={Ban} gradient={STAT_GRADIENTS.banned} />
      </div>

      {/* Toolbar */}
      <UserTableToolbar
        filters={filters}
        totalItems={pagination.total}
        page={page}
        limit={limit}
        isFetching={isFetching}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        onRefresh={refetch}
        onCreateUser={handleCreateUser}
        onImportCSV={handleImportCSV}
        onExportCSV={handleExportCSV}
        searchInputRef={searchInputRef}
      />

      {/* Bulk Action Bar */}
      {bulk.selectedCount > 0 && (
        <BulkActionBar
          selectedCount={bulk.selectedCount}
          selectionScope={bulk.selectionScope}
          totalMatching={pagination.total}
          pageCount={users.length}
          onSelectAllMatching={bulk.selectAllMatching}
          onClearSelection={bulk.clearSelection}
          onBulkAction={handleBulkAction}
        />
      )}

      {/* User Table */}
      <UserTable
        users={users}
        isLoading={isLoading}
        isFetching={isFetching}
        isError={isError}
        sort={sort}
        onSort={setSort}
        selectedIds={bulk.selectedIds}
        allPageSelected={bulk.allPageSelected}
        checkboxRef={bulk.checkboxRef}
        onToggleOne={bulk.toggleOne}
        onTogglePage={bulk.togglePage}
        onRowClick={handleRowClick}
        onAction={handleAction}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        onCreateUser={handleCreateUser}
        onRetry={refetch}
      />

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          itemsPerPage={limit}
          onPageChange={setPage}
          onItemsPerPageChange={setLimit}
          showItemsPerPage
          itemsPerPageOptions={[...EXTENDED_PAGE_SIZE_OPTIONS]}
        />
      )}

      {/* ── Detail Drawer ─────────────────────────────────────────────── */}
      <UserDetailDrawer
        isOpen={drawer.isOpen}
        userDetail={drawer.userDetail}
        isLoading={drawer.isLoading}
        isError={drawer.isError}
        activeTab={drawer.activeTab}
        onClose={drawer.closeDrawer}
        onSwitchTab={drawer.switchTab}
        onRefresh={drawer.refetch}
        onAction={handleDrawerAction}
      />

      {/* ── Create User Modal ─────────────────────────────────────────── */}
      <CreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      {/* ── Edit User Modal ───────────────────────────────────────────── */}
      {editModalUser && (
        <EditUserModal
          isOpen={!!editModalUser}
          user={editModalUser}
          onClose={() => setEditModalUser(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* ── Ban User Modal ────────────────────────────────────────────── */}
      {banModalUser && (
        <BanUserModal
          isOpen={!!banModalUser}
          user={banModalUser}
          onClose={() => setBanModalUser(null)}
          onSuccess={handleBanSuccess}
        />
      )}

      {/* ── Reset Password Modal ──────────────────────────────────────── */}
      {resetPwModalUser && (
        <ResetPasswordModal
          isOpen={!!resetPwModalUser}
          user={resetPwModalUser}
          onClose={() => setResetPwModalUser(null)}
          onSuccess={handleResetPwSuccess}
        />
      )}

      {/* ── Simple Confirmation Modal (delete, unban, forceLogout) ───── */}
      {simpleModal && simpleModalUser && (() => {
        const config = SIMPLE_MODAL_CONFIG[simpleModal];
        const Icon = config.icon;
        return (
          <AccessibleModal
            isOpen={true}
            title={config.title}
            onClose={closeSimpleModal}
            size="md"
          >
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${ICON_BG_STYLES[config.variant]}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{config.description}</p>
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Name</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{simpleModalUser.firstName} {simpleModalUser.lastName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Username</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{simpleModalUser.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Role</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 capitalize">{simpleModalUser.role?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={closeSimpleModal}
                  disabled={simpleModalLoading}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSimpleConfirm}
                  disabled={simpleModalLoading}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:ring-2 focus:ring-offset-2 disabled:opacity-50 flex items-center gap-2 ${VARIANT_STYLES[config.variant]}`}
                >
                  {simpleModalLoading && (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {config.confirmLabel}
                </button>
              </div>
            </div>
          </AccessibleModal>
        );
      })()}
    </div>
  );
}
