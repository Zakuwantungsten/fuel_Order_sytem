import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users, UserPlus, Shield, Search, Edit2, Trash2, RefreshCw,
  Eye, EyeOff, X, Check, AlertTriangle, Key, User as UserIcon,
  Briefcase, MapPin, Truck, ChevronDown, Ban, ShieldOff, ShieldCheck,
  LogOut, CheckSquare, Square, UserCheck, UserX, Loader2,
  ShieldPlus, Clock, CheckCircle, XCircle, Activity,
} from 'lucide-react';
import { usersAPI, systemAdminAPI } from '../../services/api';
import apiClient from '../../services/api';
import * as bulkUserService from '../../services/bulkUserService';
import type { BulkUser, BulkAction } from '../../services/bulkUserService';
import type { User, UserRole } from '../../types';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import Pagination from '../Pagination';

// ── Constants ────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { id: 'users',       label: 'Users' },
  { id: 'bulk',        label: 'Bulk Operations' },
  { id: 'drivers',     label: 'Driver Credentials' },
  { id: 'privilege',   label: 'Privilege Elevation' },
] as const;
type SubTab = typeof SUB_TABS[number]['id'];

const USER_ROLES = [
  { value: 'super_admin',     label: 'Super Admin',      color: 'text-red-600',    bgColor: 'bg-red-50 dark:bg-red-900/30' },
  { value: 'admin',           label: 'Admin',             color: 'text-blue-600',   bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
  { value: 'super_manager',   label: 'Super Manager',     color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
  { value: 'boss',            label: 'Boss',              color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-900/30' },
  { value: 'fuel_order_maker',label: 'Fuel Order Maker',  color: 'text-green-600',  bgColor: 'bg-green-50 dark:bg-green-900/30' },
  { value: 'payment_manager', label: 'Payment Manager',   color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-900/30' },
  { value: 'import_officer',  label: 'Import Officer',    color: 'text-cyan-600',   bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
  { value: 'export_officer',  label: 'Export Officer',    color: 'text-sky-600',    bgColor: 'bg-sky-50 dark:bg-sky-900/30' },
  { value: 'yard_personnel',  label: 'Yard Personnel',    color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
  { value: 'fuel_attendant',  label: 'Fuel Attendant',    color: 'text-teal-600',   bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
  { value: 'station_manager', label: 'Station Manager',   color: 'text-pink-600',   bgColor: 'bg-pink-50 dark:bg-pink-900/30' },
  { value: 'viewer',          label: 'Viewer',            color: 'text-gray-600',   bgColor: 'bg-gray-50 dark:bg-gray-900/30' },
];

const ALL_ROLES = [
  'admin', 'manager', 'super_manager', 'supervisor', 'clerk', 'driver',
  'viewer', 'fuel_order_maker', 'boss', 'yard_personnel', 'fuel_attendant',
  'station_manager', 'payment_manager', 'dar_yard', 'tanga_yard', 'mmsa_yard',
  'import_officer', 'export_officer',
];

const YARDS = [
  { value: 'DAR YARD',   label: 'DAR YARD' },
  { value: 'TANGA YARD', label: 'TANGA YARD' },
  { value: 'MMSA YARD',  label: 'MMSA YARD' },
];

const BULK_ROLE_COLORS: Record<string, string> = {
  admin:         'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  manager:       'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  super_manager: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  driver:        'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  super_admin:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const PRIV_STATUS_BADGES: Record<string, { color: string; icon: any }> = {
  pending:  { color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  approved: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',   icon: CheckCircle },
  active:   { color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: ShieldPlus },
  denied:   { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',       icon: XCircle },
  expired:  { color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',      icon: Clock },
  revoked:  { color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: Ban },
};

// ── Interfaces ───────────────────────────────────────────────────────────────
interface UserManagementUnifiedTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

interface DriverCredential {
  _id: string;
  truckNo: string;
  driverName?: string;
  phoneNumber?: string;
  isActive: boolean;
  lastLogin?: string;
  createdBy: string;
  createdAt: string;
}

interface DriverCredentialStats {
  totalDrivers: number;
  activeDrivers: number;
  inactiveDrivers: number;
  recentLogins: number;
}

interface PrivilegeRequest {
  _id: string;
  requestedByUsername: string;
  targetRole: string;
  currentRole: string;
  reason: string;
  status: string;
  durationMinutes: number;
  approvedByUsername?: string;
  approvedAt?: string;
  deniedByUsername?: string;
  denialReason?: string;
  expiresAt?: string;
  createdAt: string;
}

// ── Shared dropdown (AuditLogs pattern) ──────────────────────────────────────
function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
      >
        <span>{selected?.label}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
          {options.map(opt => (
            <button
              key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check className="w-4 h-4 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stat card (AuditLogs pattern) ────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: any; color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function UserManagementUnifiedTab({ onMessage }: UserManagementUnifiedTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('users');

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          User Management
        </h2>
      </div>

      {/* ── Sub-tab nav ────────────────────────────────────────────────────── */}
      <div className="border-b dark:border-gray-700">
        <nav className="flex gap-1 -mb-px">
          {SUB_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                subTab === tab.id
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      {subTab === 'users'     && <UsersSubTab onMessage={onMessage} />}
      {subTab === 'bulk'      && <BulkSubTab onMessage={onMessage} />}
      {subTab === 'drivers'   && <DriversSubTab onMessage={onMessage} />}
      {subTab === 'privilege' && <PrivilegeSubTab onMessage={onMessage} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 1: USERS (individual CRUD)
// ═════════════════════════════════════════════════════════════════════════════
function UsersSubTab({ onMessage }: { onMessage: (t: 'success' | 'error', m: string) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [showUnbanModal, setShowUnbanModal] = useState(false);
  const [showForceLogoutModal, setShowForceLogoutModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (filterRole) filters.role = filterRole;
      if (filterStatus) filters.isActive = filterStatus === 'active';
      const data = await usersAPI.getAll(filters);
      setUsers(data);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('users', loadUsers);
  useEffect(() => { loadUsers(); }, [filterRole, filterStatus]);

  const handleToggleStatus = async (user: User) => {
    try {
      await usersAPI.toggleStatus(user.id);
      onMessage('success', `User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
      loadUsers();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update user status');
    }
  };

  const confirmForceLogout = async () => {
    if (!selectedUser) return;
    try {
      const userId = selectedUser.id || (selectedUser as any)._id;
      if (!userId) { onMessage('error', 'User ID not found'); return; }
      const response = await systemAdminAPI.forceLogout(String(userId));
      setShowForceLogoutModal(false);
      setSelectedUser(null);
      onMessage('success', response.message || `User ${selectedUser.username} has been logged out successfully`);
      loadUsers();
    } catch (error: any) {
      setShowForceLogoutModal(false);
      setSelectedUser(null);
      onMessage('error', error.response?.data?.message || 'Failed to force logout user');
    }
  };

  const getRoleInfo = (role: string) =>
    USER_ROLES.find(r => r.value === role) || USER_ROLES[USER_ROLES.length - 1];

  const filteredUsers = users.filter(user => {
    const q = searchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      user.firstName?.toLowerCase().includes(q) ||
      user.lastName?.toLowerCase().includes(q) ||
      user.department?.toLowerCase().includes(q) ||
      user.truckNo?.toLowerCase().includes(q)
    );
  });

  const activeUsers = users.filter(u => u.isActive).length;
  const inactiveUsers = users.filter(u => !u.isActive).length;
  const bannedUsers = users.filter(u => u.isBanned).length;

  const ROLE_OPTIONS = [{ value: '', label: 'All Roles' }, ...USER_ROLES.map(r => ({ value: r.value, label: r.label }))];
  const STATUS_OPTIONS = [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Users"  value={users.length}  icon={Users}       color="bg-indigo-500" />
        <StatCard label="Active"       value={activeUsers}   icon={CheckCircle} color="bg-green-500" />
        <StatCard label="Inactive"     value={inactiveUsers} icon={EyeOff}      color="bg-orange-500" />
        <StatCard label="Banned"       value={bannedUsers}   icon={Ban}         color="bg-red-500" />
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Username, email, name, department, truck…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <FilterDropdown label="Role" value={filterRole} options={ROLE_OPTIONS} onChange={setFilterRole} />
          <div className="flex gap-3">
            <div className="flex-1">
              <FilterDropdown label="Status" value={filterStatus} options={STATUS_OPTIONS} onChange={setFilterStatus} />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => { setSearchQuery(''); setFilterRole(''); setFilterStatus(''); }}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Clear
              </button>
              <button
                onClick={loadUsers}
                disabled={loading}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
              >
                <UserPlus className="w-4 h-4" />
                Create
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                {['User', 'Role', 'Dept / Station', 'Status', 'Last Login', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No users found</td></tr>
              ) : filteredUsers.map(user => {
                const roleInfo = getRoleInfo(user.role);
                return (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.firstName} {user.lastName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
                          {user.truckNo && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                              <Truck className="w-3 h-3" />{user.truckNo}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${roleInfo.bgColor} ${roleInfo.color}`}>
                        <Shield className="w-3 h-3" />{roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {user.department && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3 text-gray-400" />{user.department}</span>}
                      {user.station && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" />{user.station}</span>}
                      {!user.department && !user.station && <span className="text-gray-400">–</span>}
                    </td>
                    <td className="px-4 py-3">
                      {user.isBanned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                          <Ban className="w-3 h-3" />Banned
                        </span>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            user.isActive
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {user.isActive ? <><Eye className="w-3 h-3" />Active</> : <><EyeOff className="w-3 h-3" />Inactive</>}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setSelectedUser(user); setShowEditModal(true); }} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setSelectedUser(user); setShowResetPasswordModal(true); }} className="p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg" title="Reset password">
                          <Key className="w-4 h-4" />
                        </button>
                        {user.lastLogin && (
                          <button onClick={() => { setSelectedUser(user); setShowForceLogoutModal(true); }} className="p-1.5 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg" title="Force logout">
                            <LogOut className="w-4 h-4" />
                          </button>
                        )}
                        {user.isBanned ? (
                          <button onClick={() => { setSelectedUser(user); setShowUnbanModal(true); }} className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg" title="Unban">
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        ) : (
                          <button onClick={() => { setSelectedUser(user); setShowBanModal(true); }} className="p-1.5 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg" title="Ban">
                            <ShieldOff className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => { setSelectedUser(user); setShowDeleteModal(true); }} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals (reuse existing modals from old file) ────────────────────── */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); loadUsers(); onMessage('success', 'User created successfully'); }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}
      {showEditModal && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => { setShowEditModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowEditModal(false); setSelectedUser(null); loadUsers(); onMessage('success', 'User updated successfully'); }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}
      {showDeleteModal && selectedUser && (
        <DeleteUserModal
          user={selectedUser}
          onClose={() => { setShowDeleteModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowDeleteModal(false); setSelectedUser(null); loadUsers(); onMessage('success', 'User deleted successfully'); }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}
      {showResetPasswordModal && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => { setShowResetPasswordModal(false); setSelectedUser(null); }}
          onSuccess={(tp) => { setShowResetPasswordModal(false); setSelectedUser(null); onMessage('success', tp ? `Password reset! Temporary password: ${tp}` : 'Password reset successfully'); }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}
      {showBanModal && selectedUser && (
        <BanUserModal
          user={selectedUser}
          onClose={() => { setShowBanModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowBanModal(false); setSelectedUser(null); loadUsers(); onMessage('success', 'User banned successfully'); }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}
      {showUnbanModal && selectedUser && (
        <UnbanUserModal
          user={selectedUser}
          onClose={() => { setShowUnbanModal(false); setSelectedUser(null); }}
          onSuccess={() => { setShowUnbanModal(false); setSelectedUser(null); loadUsers(); onMessage('success', 'User unbanned successfully'); }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}
      {showForceLogoutModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <LogOut className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Force Logout User</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Terminate active session</p>
              </div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                This will immediately log out <strong>{selectedUser.username}</strong> and clear their active session.
              </p>
            </div>
            <div className="space-y-2 mb-6 text-sm">
              {[['User', `${selectedUser.firstName} ${selectedUser.lastName}`], ['Username', selectedUser.username], ['Last Login', selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : 'Never']].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{k}:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowForceLogoutModal(false); setSelectedUser(null); }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={confirmForceLogout} className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium">Force Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 2: BULK OPERATIONS
// ═════════════════════════════════════════════════════════════════════════════
function BulkSubTab({ onMessage }: { onMessage: (t: 'success' | 'error', m: string) => void }) {
  const [users, setUsers] = useState<BulkUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ open: boolean; action: BulkAction | null; targetRole: string }>({ open: false, action: null, targetRole: '' });
  const [roleDropdown, setRoleDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bulkUserService.listUsers({
        q: search || undefined,
        role: filterRole || undefined,
        status: filterStatus || undefined,
      });
      setUsers(res.data);
      setSelectedIds(new Set());
    } catch {
      onMessage('error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, filterRole, filterStatus]);

  useEffect(() => { const t = setTimeout(fetchUsers, 300); return () => clearTimeout(t); }, [fetchUsers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setRoleDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === users.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(users.map(u => u._id)));
  };

  const executeAction = async () => {
    if (!confirm.action) return;
    setActionLoading(true);
    try {
      const result = await bulkUserService.bulkAction({
        userIds: Array.from(selectedIds),
        action: confirm.action,
        role: confirm.targetRole || undefined,
      });
      onMessage('success', `${result.modified} user(s) updated successfully`);
      setConfirm({ open: false, action: null, targetRole: '' });
      await fetchUsers();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Operation failed';
      onMessage('error', msg);
      setConfirm({ open: false, action: null, targetRole: '' });
    } finally {
      setActionLoading(false);
    }
  };

  const allSelected = users.length > 0 && selectedIds.size === users.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < users.length;

  const ROLE_OPTIONS = [{ value: '', label: 'All Roles' }, ...ALL_ROLES.map(r => ({ value: r, label: r.replace(/_/g, ' ') }))];
  const STATUS_OPTIONS = [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="space-y-5">
      {/* Filter toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" placeholder="Search by name or username…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <FilterDropdown label="Role" value={filterRole} options={ROLE_OPTIONS} onChange={setFilterRole} />
          <div className="flex gap-3">
            <div className="flex-1">
              <FilterDropdown label="Status" value={filterStatus} options={STATUS_OPTIONS} onChange={setFilterStatus} />
            </div>
            <div className="flex items-end">
              <button onClick={fetchUsers}
                className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{selectedIds.size} selected</span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <button onClick={() => setConfirm({ open: true, action: 'activate', targetRole: '' })} disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              <UserCheck className="h-3.5 w-3.5" /> Activate
            </button>
            <button onClick={() => setConfirm({ open: true, action: 'deactivate', targetRole: '' })} disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">
              <UserX className="h-3.5 w-3.5" /> Deactivate
            </button>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setRoleDropdown(v => !v)} disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <ShieldOff className="h-3.5 w-3.5" /> Change Role <ChevronDown className="h-3 w-3" />
              </button>
              {roleDropdown && (
                <div className="absolute top-full mt-1 right-0 z-20 w-52 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
                  {ALL_ROLES.map(r => (
                    <button key={r}
                      onClick={() => { setConfirm({ open: true, action: 'change_role', targetRole: r }); setRoleDropdown(false); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 capitalize">
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
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <button onClick={toggleAll} className="flex items-center">
                      {allSelected ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : someSelected ? <CheckSquare className="h-4 w-4 text-indigo-400" /> : <Square className="h-4 w-4 text-gray-400" />}
                    </button>
                  </th>
                  {['User', 'Role', 'Status', 'Joined'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map(user => {
                  const checked = selectedIds.has(user._id);
                  const isProtected = user.role === 'super_admin';
                  const cls = BULK_ROLE_COLORS[user.role] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
                  return (
                    <tr key={user._id} onClick={() => !isProtected && toggleSelect(user._id)}
                      className={`transition-colors ${isProtected ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'} ${checked ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}`}>
                      <td className="px-4 py-3">
                        {checked ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4 text-gray-300 dark:text-gray-600" />}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{user.role.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-block w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className={`text-xs font-medium ${user.isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                          {user.isBanned && <span className="text-xs font-medium text-red-600 dark:text-red-400">(Banned)</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{new Date(user.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && users.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            {users.length} user{users.length !== 1 ? 's' : ''}{selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
          </div>
        )}
      </div>

      {/* Confirm modal */}
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
              You are about to <span className="font-semibold text-gray-900 dark:text-white">
                {confirm.action === 'activate' && 'activate'}
                {confirm.action === 'deactivate' && 'deactivate'}
                {confirm.action === 'change_role' && `change role to "${confirm.targetRole?.replace(/_/g, ' ')}"`}
              </span> for <span className="font-semibold text-indigo-600 dark:text-indigo-400">{selectedIds.size} user(s)</span>.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">This action will be logged in the audit trail.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm({ open: false, action: null, targetRole: '' })} disabled={actionLoading}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancel
              </button>
              <button onClick={executeAction} disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 3: DRIVER CREDENTIALS
// ═════════════════════════════════════════════════════════════════════════════
function DriversSubTab({ onMessage }: { onMessage: (t: 'success' | 'error', m: string) => void }) {
  const [stats, setStats] = useState<DriverCredentialStats | null>(null);
  const [drivers, setDrivers] = useState<DriverCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 25;
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const [credRes, statsRes] = await Promise.all([
        apiClient.get('/driver-credentials', { params: { search: search || undefined, page: p, limit: LIMIT } }),
        apiClient.get('/driver-credentials/stats'),
      ]);
      const creds: DriverCredential[] = credRes.data.data?.data || credRes.data.data || [];
      setDrivers(creds);
      setTotalItems(credRes.data.data?.pagination?.total || 0);
      setTotalPages(credRes.data.data?.pagination?.totalPages || 1);
      setStats(statsRes.data.data);
    } catch {
      onMessage('error', 'Failed to load driver credentials');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(page); }, [page]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setPage(1); fetchData(1); };

  const handleAction = async (driverId: string, truckNo: string, action: 'reactivate' | 'deactivate') => {
    setActionLoading(driverId);
    try {
      await apiClient.put(`/driver-credentials/${driverId}/${action}`);
      onMessage('success', `${truckNo} ${action}d successfully`);
      fetchData();
    } catch {
      onMessage('error', 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Trucks"       value={stats.totalDrivers}    icon={Truck}       color="bg-sky-500" />
          <StatCard label="Active Credentials" value={stats.activeDrivers}   icon={Shield}      color="bg-emerald-500" />
          <StatCard label="Active (Last 7d)"   value={stats.recentLogins}    icon={Activity}    color="bg-violet-500" />
          <StatCard label="Inactive"           value={stats.inactiveDrivers} icon={Clock}       color="bg-red-500" />
        </div>
      )}

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by truck number…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">Search</button>
            <button type="button" onClick={() => fetchData(page)} className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {['Truck No', 'Driver Name', 'Status', 'Last Login', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {drivers.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">No driver credentials found</td></tr>
                ) : drivers.map(driver => (
                  <tr key={driver._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{driver.truckNo}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{driver.driverName || <span className="text-gray-400 italic">—</span>}</td>
                    <td className="px-4 py-3">
                      {driver.isActive
                        ? <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">Active</span>
                        : <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium">Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{driver.lastLogin ? new Date(driver.lastLogin).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{new Date(driver.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {driver.isActive ? (
                          <button onClick={() => handleAction(driver._id, driver.truckNo, 'deactivate')} disabled={actionLoading === driver._id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50">
                            {actionLoading === driver._id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Deactivate'}
                          </button>
                        ) : (
                          <button onClick={() => handleAction(driver._id, driver.truckNo, 'reactivate')} disabled={actionLoading === driver._id}
                            className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-50">
                            {actionLoading === driver._id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={LIMIT}
          onPageChange={setPage}
          showItemsPerPage={false}
        />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-TAB 4: PRIVILEGE ELEVATION
// ═════════════════════════════════════════════════════════════════════════════
function PrivilegeSubTab({ onMessage }: { onMessage: (t: 'success' | 'error', m: string) => void }) {
  const [requests, setRequests] = useState<PrivilegeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [denyReason, setDenyReason] = useState('');
  const [denyingId, setDenyingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const res = await apiClient.get('/system-admin/privilege-elevation', { params });
      if (res.data.success) setRequests(res.data.data);
      else onMessage('error', res.data.message);
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(); }, [statusFilter]);

  const handleAction = async (id: string, action: 'approve' | 'deny' | 'revoke', reason?: string) => {
    try {
      const res = await apiClient.post(`/system-admin/privilege-elevation/${id}/${action}`, { reason });
      if (res.data.success) {
        onMessage('success', res.data.message);
        setDenyingId(null);
        setDenyReason('');
        fetchRequests();
      } else {
        onMessage('error', res.data.message);
      }
    } catch (err: any) {
      onMessage('error', err.response?.data?.message || err.message);
    }
  };

  const formatRole = (role: string) => role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const STATUS_OPTIONS = [
    { value: '', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'Active' },
    { value: 'approved', label: 'Approved' },
    { value: 'denied', label: 'Denied' },
    { value: 'expired', label: 'Expired' },
    { value: 'revoked', label: 'Revoked' },
  ];

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const activeCount = requests.filter(r => r.status === 'active').length;

  return (
    <div className="space-y-5">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Requests"   value={requests.length} icon={ShieldPlus}  color="bg-indigo-500" />
        <StatCard label="Pending Approval" value={pendingCount}    icon={Clock}        color="bg-yellow-500" />
        <StatCard label="Currently Active" value={activeCount}     icon={CheckCircle}  color="bg-green-500" />
        <StatCard label="Total Processed"  value={requests.filter(r => ['denied', 'expired', 'revoked'].includes(r.status)).length} icon={XCircle} color="bg-gray-500" />
      </div>

      {/* Filter toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <FilterDropdown label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
          </div>
          <div className="flex items-end">
            <button onClick={fetchRequests}
              className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Request list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <ShieldPlus className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No privilege elevation requests found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {['Requester', 'Elevation', 'Status', 'Duration', 'Requested', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {requests.map(req => {
                  const badge = PRIV_STATUS_BADGES[req.status] || PRIV_STATUS_BADGES.pending;
                  const BadgeIcon = badge.icon;
                  const isActive = req.status === 'active';
                  const isPending = req.status === 'pending';
                  const timeLeft = isActive && req.expiresAt
                    ? Math.max(0, Math.round((new Date(req.expiresAt).getTime() - Date.now()) / 60000)) : 0;

                  return (
                    <tr key={req._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{req.requestedByUsername}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">From: {formatRole(req.currentRole)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-indigo-600 dark:text-indigo-400">{formatRole(req.targetRole)}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-xs truncate">{req.reason}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                          <BadgeIcon className="w-3 h-3" />{req.status}
                        </span>
                        {isActive && timeLeft > 0 && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{timeLeft}min left</p>
                        )}
                        {req.approvedByUsername && <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">By: {req.approvedByUsername}</p>}
                        {req.denialReason && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{req.denialReason}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{req.durationMinutes}min</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(req.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && (
                            <>
                              <button onClick={() => handleAction(req._id, 'approve')}
                                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
                                <UserCheck className="w-3 h-3" /> Approve
                              </button>
                              {denyingId === req._id ? (
                                <div className="flex items-center gap-1">
                                  <input value={denyReason} onChange={(e) => setDenyReason(e.target.value)} placeholder="Reason…"
                                    className="px-2 py-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 w-32" />
                                  <button onClick={() => handleAction(req._id, 'deny', denyReason)}
                                    className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">Deny</button>
                                </div>
                              ) : (
                                <button onClick={() => setDenyingId(req._id)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">
                                  <XCircle className="w-3 h-3" /> Deny
                                </button>
                              )}
                            </>
                          )}
                          {isActive && (
                            <button onClick={() => handleAction(req._id, 'revoke', 'Manually revoked by admin')}
                              className="flex items-center gap-1 px-2.5 py-1 bg-orange-600 text-white rounded-lg text-xs hover:bg-orange-700">
                              <Ban className="w-3 h-3" /> Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MODALS (preserved from original UserManagementTab)
// ═════════════════════════════════════════════════════════════════════════════

// ── Create User Modal ────────────────────────────────────────────────────────
function CreateUserModal({ onClose, onSuccess, onError }: {
  onClose: () => void; onSuccess: () => void; onError: (msg: string) => void;
}) {
  const [formData, setFormData] = useState({
    username: '', email: '', firstName: '', lastName: '',
    role: 'viewer' as UserRole, station: '', yard: '',
  });
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchStations = async () => {
      setLoadingStations(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'}/config/stations`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('fuel_order_token')}` }
        });
        if (response.ok) {
          const result = await response.json();
          const stationsData = result.data || result.stations || result;
          setStations(Array.isArray(stationsData) ? stationsData : []);
        }
      } catch { /* ignore */ } finally { setLoadingStations(false); }
    };
    fetchStations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const submitData: any = {
        username: formData.username, email: formData.email,
        firstName: formData.firstName, lastName: formData.lastName,
        role: formData.role,
      };
      if (['fuel_attendant', 'station_manager'].includes(formData.role) && formData.station)
        submitData.station = formData.station;
      if (formData.role === 'yard_personnel' && formData.yard)
        submitData.yard = formData.yard;
      await usersAPI.create(submitData);
      setSuccess(true);
      setTimeout(() => onSuccess(), 1800);
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to create user');
    } finally { setLoading(false); }
  };

  const requiresStation = ['fuel_attendant', 'station_manager'].includes(formData.role);
  const requiresYard = formData.role === 'yard_personnel';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Create New User</h3>
              <p className="text-sm text-green-100">Password will be sent via email</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {success && (
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">User created successfully!</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Login credentials have been sent to the user's email.</p>
                </div>
              </div>
            )}
            {/* Account info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center"><UserIcon className="w-4 h-4 text-green-600 dark:text-green-400" /></div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Account Information</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-10">
                {[
                  { label: 'Username', key: 'username', type: 'text', placeholder: 'hamdunassor' },
                  { label: 'Email Address', key: 'email', type: 'email', placeholder: 'hamdunassor111@gmail.com' },
                  { label: 'First Name', key: 'firstName', type: 'text', placeholder: 'Hamdu' },
                  { label: 'Last Name', key: 'lastName', type: 'text', placeholder: 'Nassor' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{f.label} <span className="text-red-500">*</span></label>
                    <input type={f.type} required value={(formData as any)[f.key]}
                      onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
                      placeholder={f.placeholder} />
                  </div>
                ))}
              </div>
            </div>
            {/* Role */}
            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"><Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" /></div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Role & Permissions</h4>
              </div>
              <div className="pl-10">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">User Role <span className="text-red-500">*</span></label>
                <select required value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, station: '', yard: '' })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100">
                  {USER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            {/* Station */}
            {requiresStation && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center"><MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" /></div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Station Assignment</h4>
                </div>
                <div className="pl-10">
                  {loadingStations ? (
                    <div className="flex items-center gap-2 text-gray-500 py-2"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span></div>
                  ) : (
                    <select required value={formData.station} onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100">
                      <option value="">Select a station</option>
                      {Array.isArray(stations) && stations.filter(s => s.isActive).map(s => <option key={s._id} value={s.stationName}>{s.stationName}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}
            {/* Yard */}
            {requiresYard && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center"><Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" /></div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Yard Assignment</h4>
                </div>
                <div className="pl-10">
                  <select required value={formData.yard} onChange={(e) => setFormData({ ...formData, yard: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100">
                    <option value="">Select a yard</option>
                    {YARDS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={loading || success || (requiresStation && !formData.station) || (requiresYard && !formData.yard)}
              className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 flex items-center gap-2 font-medium shadow-lg shadow-green-500/30">
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating…' : success ? 'Done!' : 'Create User & Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSuccess, onError }: {
  user: User; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void;
}) {
  const [formData, setFormData] = useState({
    firstName: user.firstName || '', lastName: user.lastName || '',
    email: user.email || '', role: user.role || 'viewer' as UserRole,
    station: user.station || '', yard: user.yard || '',
  });
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStations = async () => {
      setLoadingStations(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'}/config/stations`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('fuel_order_token')}` }
        });
        if (response.ok) {
          const result = await response.json();
          const stationsData = result.data || result.stations || result;
          setStations(Array.isArray(stationsData) ? stationsData : []);
        }
      } catch { /* ignore */ } finally { setLoadingStations(false); }
    };
    fetchStations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const submitData: any = {
        firstName: formData.firstName, lastName: formData.lastName,
        email: formData.email, role: formData.role,
      };
      if (['fuel_attendant', 'station_manager'].includes(formData.role) && formData.station)
        submitData.station = formData.station;
      if (formData.role === 'yard_personnel' && formData.yard)
        submitData.yard = formData.yard;
      await usersAPI.update(user.id, submitData);
      onSuccess();
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to update user');
    } finally { setLoading(false); }
  };

  const requiresStation = ['fuel_attendant', 'station_manager'].includes(formData.role);
  const requiresYard = formData.role === 'yard_personnel';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center"><UserIcon className="w-6 h-6 text-white" /></div>
            <div>
              <h3 className="text-lg font-semibold text-white">Edit User</h3>
              <p className="text-sm text-indigo-100">{user.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Personal info */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center"><UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" /></div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Personal Information</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-10">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">First Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Last Name <span className="text-red-500">*</span></label>
                  <input type="text" required value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email <span className="text-red-500">*</span></label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
                </div>
              </div>
            </div>
            {/* Role */}
            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center"><Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" /></div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Role & Permissions</h4>
              </div>
              <div className="pl-10">
                <select required value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, station: '', yard: '' })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                  {USER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            {/* Station */}
            {requiresStation && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center"><MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" /></div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Station Assignment</h4>
                </div>
                <div className="pl-10">
                  {loadingStations ? (
                    <div className="flex items-center gap-2 text-gray-500 py-2"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Loading…</span></div>
                  ) : (
                    <select required value={formData.station} onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                      <option value="">Select a station</option>
                      {Array.isArray(stations) && stations.filter(s => s.isActive).map(s => <option key={s._id} value={s.stationName}>{s.stationName}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}
            {/* Yard */}
            {requiresYard && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center"><Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" /></div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Yard Assignment</h4>
                </div>
                <div className="pl-10">
                  <select required value={formData.yard} onChange={(e) => setFormData({ ...formData, yard: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100">
                    <option value="">Select a yard</option>
                    {YARDS.map(y => <option key={y.value} value={y.value}>{y.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 font-medium text-gray-700 dark:text-gray-300">Cancel</button>
            <button type="submit" disabled={loading || (requiresStation && !formData.station) || (requiresYard && !formData.yard)}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2 font-medium shadow-lg shadow-indigo-500/30">
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Updating…' : 'Update User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete User Modal ────────────────────────────────────────────────────────
function DeleteUserModal({ user, onClose, onSuccess, onError }: {
  user: User; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const handleDelete = async () => {
    setLoading(true);
    try { await usersAPI.delete(user.id); onSuccess(); }
    catch (error: any) { onError(error.response?.data?.message || 'Failed to delete user'); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"><AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" /></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete User</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          Are you sure you want to delete user <strong>{user.username}</strong> ({user.firstName} {user.lastName})? This will move the user to the trash.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleDelete} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />} Delete User
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ─────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, onSuccess, onError }: {
  user: User; onClose: () => void; onSuccess: (tp: string) => void; onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const result = await usersAPI.resetPassword(user.id);
      setResetComplete(true);
      setEmailSent(result.emailSent || false);
      setTempPassword(result.temporaryPassword || null);
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to reset password');
      onClose();
    } finally { setLoading(false); }
  };

  const handleCopy = () => {
    if (tempPassword) { navigator.clipboard.writeText(tempPassword); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleClose = () => { onSuccess(tempPassword || ''); onClose(); };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center"><Key className="w-6 h-6 text-orange-600 dark:text-orange-400" /></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reset Password</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Generate temporary password</p>
          </div>
        </div>

        {!resetComplete ? (
          <>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Reset password for <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                A temporary password will be generated and sent to <strong>{user.email}</strong>. The user must change it on first login.
              </p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={onClose} disabled={loading} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleReset} disabled={loading} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2">
                {loading && <RefreshCw className="w-4 h-4 animate-spin" />} {loading ? 'Resetting…' : 'Reset Password & Send Email'}
              </button>
            </div>
          </>
        ) : emailSent ? (
          <>
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-900 dark:text-green-100">Password Reset Successfully!</p>
                  <p className="text-sm text-green-800 dark:text-green-200 mt-1">An email has been sent to <strong>{user.email}</strong>.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end"><button onClick={handleClose} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">Done</button></div>
          </>
        ) : (
          <>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900 dark:text-yellow-100">Password Reset – Email Failed</p>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">Please share this password manually.</p>
                </div>
              </div>
            </div>
            {tempPassword && (
              <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Temporary Password</label>
                <div className="flex gap-2">
                  <input type="text" value={tempPassword} readOnly className="flex-1 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-lg font-semibold text-gray-900 dark:text-gray-100" />
                  <button onClick={handleCopy} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                    {copied ? <><Check className="w-4 h-4" />Copied!</> : <><Key className="w-4 h-4" />Copy</>}
                  </button>
                </div>
              </div>
            )}
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800 dark:text-red-200"><strong>Important:</strong> Share this temporary password securely.</p>
            </div>
            <div className="flex justify-end"><button onClick={handleClose} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Done</button></div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Ban User Modal ───────────────────────────────────────────────────────────
function BanUserModal({ user, onClose, onSuccess, onError }: {
  user: User; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleBan = async () => {
    if (!reason.trim()) { onError('Please provide a reason for banning this user'); return; }
    setLoading(true);
    try { await usersAPI.ban(user.id, reason); onSuccess(); }
    catch (error: any) { onError(error.response?.data?.message || 'Failed to ban user'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center"><Ban className="w-6 h-6 text-red-600 dark:text-red-400" /></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ban User</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Prevent system access</p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Ban <strong>{user.username}</strong> ({user.firstName} {user.lastName})? They will be immediately logged out.
        </p>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Reason for Ban *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Enter reason…"
            className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-gray-100" required />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleBan} disabled={loading || !reason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />} Ban User
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Unban User Modal ─────────────────────────────────────────────────────────
function UnbanUserModal({ user, onClose, onSuccess, onError }: {
  user: User; onClose: () => void; onSuccess: () => void; onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const handleUnban = async () => {
    setLoading(true);
    try { await usersAPI.unban(user.id); onSuccess(); }
    catch (error: any) { onError(error.response?.data?.message || 'Failed to unban user'); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-400" /></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Unban User</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Restore user access</p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          Unban <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
        </p>
        {user.bannedReason && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
            <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">Ban Reason:</p>
            <p className="text-sm text-red-700 dark:text-red-300 italic">"{user.bannedReason}"</p>
            {user.bannedBy && <p className="text-xs text-red-600 dark:text-red-400 mt-2">Banned by: {user.bannedBy}{user.bannedAt ? ` on ${new Date(user.bannedAt).toLocaleString()}` : ''}</p>}
          </div>
        )}
        <p className="text-gray-700 dark:text-gray-300 mb-4">The user will be able to log in again.</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          <button onClick={handleUnban} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />} Unban User
          </button>
        </div>
      </div>
    </div>
  );
}
