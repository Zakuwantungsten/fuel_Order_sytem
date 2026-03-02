import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Users, Search, RefreshCw, CheckSquare, Square, ChevronDown, AlertTriangle,
  UserCheck, UserX, ShieldOff, Loader2, X,
} from 'lucide-react';
import * as bulkUserService from '../../services/bulkUserService';
import type { BulkUser, BulkAction } from '../../services/bulkUserService';

const ALL_ROLES = [
  'admin', 'manager', 'super_manager', 'supervisor', 'clerk', 'driver',
  'viewer', 'fuel_order_maker', 'boss', 'yard_personnel', 'fuel_attendant',
  'station_manager', 'payment_manager', 'dar_yard', 'tanga_yard', 'mmsa_yard',
  'import_officer', 'export_officer',
];

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  manager: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  super_manager: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  driver: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  super_admin: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

function roleBadge(role: string) {
  const cls = ROLE_COLORS[role] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {role.replace(/_/g, ' ')}
    </span>
  );
}

interface ConfirmModal {
  open: boolean;
  action: BulkAction | null;
  targetRole: string;
}

export const BulkUserManagementTab: React.FC = () => {
  const [users, setUsers] = useState<BulkUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const [confirm, setConfirm] = useState<ConfirmModal>({ open: false, action: null, targetRole: '' });
  const [roleDropdown, setRoleDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await bulkUserService.listUsers({
        q: search || undefined,
        role: filterRole || undefined,
        status: filterStatus || undefined,
      });
      setUsers(res.data);
      setSelectedIds(new Set());
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, filterRole, filterStatus]);

  useEffect(() => {
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map((u) => u._id)));
    }
  };

  const openConfirm = (action: BulkAction, targetRole = '') => {
    setConfirm({ open: true, action, targetRole });
    setRoleDropdown(false);
  };

  const executeAction = async () => {
    if (!confirm.action) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await bulkUserService.bulkAction({
        userIds: Array.from(selectedIds),
        action: confirm.action,
        role: confirm.targetRole || undefined,
      });
      setSuccess(`${result.modified} user(s) updated successfully`);
      setConfirm({ open: false, action: null, targetRole: '' });
      await fetchUsers();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Operation failed';
      setError(msg);
      setConfirm({ open: false, action: null, targetRole: '' });
    } finally {
      setActionLoading(false);
    }
  };

  const allSelected = users.length > 0 && selectedIds.size === users.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < users.length;
  const noneSelected = selectedIds.size === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Users className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Bulk User Management</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Manage multiple user accounts at once
            </p>
          </div>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
          <UserCheck className="h-4 w-4 shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Bulk Action Bar */}
      {!noneSelected && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700">
          <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button
              onClick={() => openConfirm('activate')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <UserCheck className="h-3.5 w-3.5" /> Activate
            </button>
            <button
              onClick={() => openConfirm('deactivate')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              <UserX className="h-3.5 w-3.5" /> Deactivate
            </button>
            {/* Change Role dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setRoleDropdown((v) => !v)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <ShieldOff className="h-3.5 w-3.5" /> Change Role <ChevronDown className="h-3 w-3" />
              </button>
              {roleDropdown && (
                <div className="absolute top-full mt-1 right-0 z-20 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
                  {ALL_ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => openConfirm('change_role', r)}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 capitalize"
                    >
                      {r.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                  <th className="px-4 py-3 text-left">
                    <button onClick={toggleAll} className="flex items-center">
                      {allSelected ? (
                        <CheckSquare className="h-4 w-4 text-violet-600" />
                      ) : someSelected ? (
                        <CheckSquare className="h-4 w-4 text-violet-400" />
                      ) : (
                        <Square className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">User</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {users.map((user) => {
                  const checked = selectedIds.has(user._id);
                  const isProtected = user.role === 'super_admin';
                  return (
                    <tr
                      key={user._id}
                      onClick={() => !isProtected && toggleSelect(user._id)}
                      className={`transition-colors ${isProtected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750'} ${checked ? 'bg-violet-50 dark:bg-violet-900/10' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center">
                          {checked ? (
                            <CheckSquare className="h-4 w-4 text-violet-600" />
                          ) : (
                            <Square className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</div>
                      </td>
                      <td className="px-4 py-3">{roleBadge(user.role)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className={`text-xs font-medium ${user.isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {user.isBanned && (
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">(Banned)</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && users.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            {users.length} user{users.length !== 1 ? 's' : ''} shown
            {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Bulk Action</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              You are about to{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {confirm.action === 'activate' && 'activate'}
                {confirm.action === 'deactivate' && 'deactivate'}
                {confirm.action === 'change_role' && `change role to "${confirm.targetRole?.replace(/_/g, ' ')}"`}
              </span>{' '}
              for{' '}
              <span className="font-semibold text-violet-600 dark:text-violet-400">{selectedIds.size} user(s)</span>.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">This action will be logged in the audit trail.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirm({ open: false, action: null, targetRole: '' })}
                disabled={actionLoading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkUserManagementTab;
