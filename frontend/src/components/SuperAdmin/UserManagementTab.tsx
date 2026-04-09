import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Search, 
  Edit2, 
  Trash2, 
  RefreshCw, 
  Eye, 
  EyeOff,
  X,
  Check,
  AlertTriangle,
  Key,
  User as UserIcon,
  Briefcase,
  MapPin,
  Truck,
  Filter,
  ChevronDown,
  Ban,
  ShieldOff,
  ShieldCheck,
  LogOut,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import { usersAPI, systemAdminAPI } from '../../services/api';
import type { User, UserRole } from '../../types';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { useUserDetail } from './UserManagement/hooks/useUserDetail';
import UserDetailDrawer from './UserManagement/components/UserDetailDrawer';

interface UserManagementTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

const USER_ROLES = [
  { value: 'super_admin', label: 'Super Admin', color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-900/30' },
  { value: 'admin', label: 'Admin', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
  { value: 'super_manager', label: 'Super Manager', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
  { value: 'boss', label: 'Boss', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-900/30' },
  { value: 'fuel_order_maker', label: 'Fuel Order Maker', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-900/30' },
  { value: 'payment_manager', label: 'Payment Manager', color: 'text-yellow-600', bgColor: 'bg-yellow-50 dark:bg-yellow-900/30' },
  { value: 'import_officer', label: 'Import Officer', color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
  { value: 'export_officer', label: 'Export Officer', color: 'text-sky-600', bgColor: 'bg-sky-50 dark:bg-sky-900/30' },
  { value: 'yard_personnel', label: 'Yard Personnel', color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-900/30' },
  { value: 'fuel_attendant', label: 'Fuel Attendant', color: 'text-teal-600', bgColor: 'bg-teal-50 dark:bg-teal-900/30' },
  { value: 'station_manager', label: 'Station Manager', color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-900/30' },
  { value: 'viewer', label: 'Viewer', color: 'text-gray-600', bgColor: 'bg-gray-50 dark:bg-gray-900/30' },
];

const YARDS = [
  { value: 'DAR YARD', label: 'DAR YARD' },
  { value: 'TANGA YARD', label: 'TANGA YARD' },
  { value: 'MMSA YARD', label: 'MMSA YARD' },
];

export default function UserManagementTab({ onMessage }: UserManagementTabProps) {
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
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 15;

  // Stats (separate full-dataset fetch for accurate counts)
  const [statsData, setStatsData] = useState({ total: 0, active: 0, inactive: 0, banned: 0 });

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkResetModal, setShowBulkResetModal] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Import
  const [showImportModal, setShowImportModal] = useState(false);

  // Detail drawer (full tabbed drawer)
  const drawer = useUserDetail();

  const handleDrawerAction = useCallback((action: string, userId: string) => {
    const user = users.find(u => String(u.id || (u as any)._id) === userId);
    if (!user) return;
    switch (action) {
      case 'reset_password': handleResetPassword(user); break;
      case 'force_logout': handleForceLogout(user); break;
      case 'ban': handleBanUser(user); break;
      case 'unban': handleUnbanUser(user); break;
      case 'toggle_status': handleToggleStatus(user); break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // Filter dropdown states
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Refs for click-outside detection
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        roleDropdownRef.current?.contains(target) ||
        statusDropdownRef.current?.contains(target)
      ) return;
      setShowRoleDropdown(false);
      setShowStatusDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [filterRole, filterStatus]);

  const loadStats = useCallback(async () => {
    try {
      const all = await usersAPI.getAll();
      setStatsData({
        total: all.length,
        active: all.filter((u: any) => u.isActive && !u.isBanned).length,
        inactive: all.filter((u: any) => !u.isActive && !u.isBanned).length,
        banned: all.filter((u: any) => u.isBanned).length,
      });
    } catch { /* silent */ }
  }, []);

  const loadUsers = async (page: number = 1) => {
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const params: any = { page, limit: ITEMS_PER_PAGE };
      if (filterRole) params.role = filterRole;
      if (filterStatus === 'active') params.isActive = 'true';
      if (filterStatus === 'inactive') params.isActive = 'false';
      if (filterStatus === 'banned') params.isBanned = 'true';
      if (searchQuery.trim()) params.q = searchQuery.trim();
      const result = await usersAPI.getPaginated(params);
      setUsers(result.data);
      setTotalPages(result.pagination.totalPages);
      setTotalCount(result.pagination.total);
      setCurrentPage(page);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('users', () => { loadUsers(1); loadStats(); });

  // Stats on mount
  useEffect(() => { loadStats(); }, [loadStats]);

  // Reload table on filter change (reset to page 1)
  useEffect(() => { loadUsers(1); }, [filterRole, filterStatus]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => loadUsers(1), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleCreateUser = () => {
    setShowCreateModal(true);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setShowEditModal(true);
  };

  const handleDeleteUser = (user: User) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setShowResetPasswordModal(true);
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await usersAPI.toggleStatus(user.id);
      onMessage('success', `User ${user.isActive ? 'deactivated' : 'activated'} successfully`);
      loadUsers(currentPage);
      loadStats();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleBanUser = (user: User) => {
    setSelectedUser(user);
    setShowBanModal(true);
  };

  const handleUnbanUser = (user: User) => {
    setSelectedUser(user);
    setShowUnbanModal(true);
  };

  const handleForceLogout = (user: User) => {
    setSelectedUser(user);
    setShowForceLogoutModal(true);
  };

  const confirmForceLogout = async () => {
    if (!selectedUser) return;
    try {
      const userId = selectedUser.id || (selectedUser as any)._id;
      if (!userId) {
        onMessage('error', 'User ID not found');
        return;
      }
      const response = await systemAdminAPI.forceLogout(String(userId));
      setShowForceLogoutModal(false);
      setSelectedUser(null);
      onMessage('success', response.message || `User ${selectedUser.username} has been logged out successfully`);
      loadUsers(currentPage);
    } catch (error: any) {
      setShowForceLogoutModal(false);
      setSelectedUser(null);
      onMessage('error', error.response?.data?.message || 'Failed to force logout user');
    }
  };

  // Bulk select helpers
  const allCurrentIds = users.map(u => String(u.id || (u as any)._id));
  const allSelected = allCurrentIds.length > 0 && allCurrentIds.every(id => selectedIds.has(id));

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allCurrentIds));
    }
  };

  const handleSelectOne = (userId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const confirmBulkDelete = async () => {
    setBulkLoading(true);
    try {
      await usersAPI.bulkDelete(Array.from(selectedIds));
      onMessage('success', `${selectedIds.size} user(s) deleted successfully`);
      setShowBulkDeleteModal(false);
      setSelectedIds(new Set());
      loadUsers(1);
      loadStats();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Bulk delete failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const confirmBulkReset = async () => {
    setBulkLoading(true);
    try {
      const result = await usersAPI.bulkResetPasswords(Array.from(selectedIds));
      onMessage('success', `Passwords reset: ${result.success} succeeded, ${result.failed} failed`);
      setShowBulkResetModal(false);
      setSelectedIds(new Set());
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Bulk reset failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const params: any = {};
      if (filterRole) params.role = filterRole;
      if (filterStatus) params.isActive = filterStatus;
      if (searchQuery.trim()) params.q = searchQuery.trim();
      const blob = await usersAPI.exportCSV(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      onMessage('error', 'Failed to export users');
    }
  };

  const handleViewDetail = (user: User) => {
    drawer.openDrawer(user.id || (user as any)._id);
  };

  const getRoleInfo = (role: string) => {
    return USER_ROLES.find(r => r.value === role) || USER_ROLES[USER_ROLES.length - 1];
  };



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            User Management
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 text-sm"
            title="Export users to CSV"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 text-sm"
            title="Import users from CSV"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button
            onClick={handleCreateUser}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <button
          onClick={() => { setFilterStatus(''); setFilterRole(''); }}
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white shadow-md hover:from-blue-600 hover:to-blue-700 transition-all text-left w-full"
          title="Clear all filters"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Total Users</p>
              <p className="text-3xl font-bold mt-1">{statsData.total}</p>
            </div>
            <Users className="w-10 h-10 text-blue-100 opacity-80" />
          </div>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === 'active' ? '' : 'active')}
          className={`bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white shadow-md hover:from-green-600 hover:to-green-700 transition-all text-left w-full${filterStatus === 'active' ? ' ring-2 ring-white ring-offset-2 ring-offset-green-600' : ''}`}
          title="Filter active users"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Active</p>
              <p className="text-3xl font-bold mt-1">{statsData.active}</p>
            </div>
            <Check className="w-10 h-10 text-green-100 opacity-80" />
          </div>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === 'inactive' ? '' : 'inactive')}
          className={`bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-4 text-white shadow-md hover:from-orange-600 hover:to-orange-700 transition-all text-left w-full${filterStatus === 'inactive' ? ' ring-2 ring-white ring-offset-2 ring-offset-orange-600' : ''}`}
          title="Filter inactive users"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm">Inactive</p>
              <p className="text-3xl font-bold mt-1">{statsData.inactive}</p>
            </div>
            <EyeOff className="w-10 h-10 text-orange-100 opacity-80" />
          </div>
        </button>

        <button
          onClick={() => setFilterStatus(filterStatus === 'banned' ? '' : 'banned')}
          className={`bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-4 text-white shadow-md hover:from-red-600 hover:to-red-700 transition-all text-left w-full${filterStatus === 'banned' ? ' ring-2 ring-white ring-offset-2 ring-offset-red-600' : ''}`}
          title="Filter banned users"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Banned</p>
              <p className="text-3xl font-bold mt-1">{statsData.banned}</p>
            </div>
            <Ban className="w-10 h-10 text-red-100 opacity-80" />
          </div>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by username, email, name, department, truck..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Refresh */}
          <button
            onClick={() => loadUsers(currentPage)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Filter Options */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t dark:border-gray-600">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Filter by Role
              </label>
              <div className="relative" ref={roleDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 flex items-center justify-between"
                >
                  <span>{filterRole ? USER_ROLES.find(r => r.value === filterRole)?.label : 'All Roles'}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showRoleDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterRole('');
                        setShowRoleDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>All Roles</span>
                      {filterRole === '' && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                    {USER_ROLES.map(role => (
                      <button
                        key={role.value}
                        type="button"
                        onClick={() => {
                          setFilterRole(role.value);
                          setShowRoleDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{role.label}</span>
                        {filterRole === role.value && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Filter by Status
              </label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 flex items-center justify-between"
                >
                  <span>
                    {filterStatus === '' ? 'All Status' :
                     filterStatus === 'active' ? 'Active' :
                     'Inactive'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showStatusDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg">
                    {[{value: '', label: 'All Status'}, {value: 'active', label: 'Active'}, {value: 'inactive', label: 'Inactive'}].map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setFilterStatus(option.value);
                          setShowStatusDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {filterStatus === option.value && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {selectedIds.size} user{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkResetModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
            >
              <Key className="w-3.5 h-3.5" />
              Reset Passwords
            </button>
            <button
              onClick={() => setShowBulkDeleteModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr key="header">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    checked={allSelected}
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Department/Station
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <>
                  {[...Array(6)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3 w-10"><div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                          <div className="space-y-1.5">
                            <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-28" />
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" /></td>
                      <td className="px-4 py-3"><div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-36" /></td>
                      <td className="px-4 py-3"><div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-24" /></td>
                      <td className="px-4 py-3"><div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-24" /></td>
                      <td className="px-4 py-3 text-right"><div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-24 ml-auto" /></td>
                    </tr>
                  ))}
                </>
              ) : users.length === 0 ? (
                <tr key="no-users">
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map(user => {
                  const roleInfo = getRoleInfo(user.role);
                  const userId = String(user.id || (user as any)._id);
                  return (
                    <tr key={userId} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors${selectedIds.has(userId) ? ' bg-blue-50 dark:bg-blue-900/10' : ''}`}>
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                          checked={selectedIds.has(userId)}
                          onChange={() => handleSelectOne(userId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                            {(user.firstName || user.lastName) ? (
                              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase select-none">
                                {(user.firstName?.[0] || '')}{(user.lastName?.[0] || '')}
                              </span>
                            ) : (
                              <UserIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {user.firstName} {user.lastName}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              @{user.username}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${roleInfo.bgColor} ${roleInfo.color}`}>
                          <Shield className="w-3 h-3" />
                          {roleInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {user.department && (
                            <div className="flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-gray-400" />
                              {user.department}
                            </div>
                          )}
                          {user.station && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              {user.station}
                            </div>
                          )}
                          {!user.department && !user.station && (
                            <span className="text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            {user.isBanned && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                <Ban className="w-3 h-3" />
                                Banned
                              </span>
                            )}
                            <button
                              onClick={() => handleToggleStatus(user)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                                user.isActive
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {user.isActive ? (
                                <><Eye className="w-3 h-3" />Active</>
                              ) : (
                                <><EyeOff className="w-3 h-3" />Inactive</>
                              )}
                            </button>
                          </div>
                          {user.isBanned && user.bannedReason && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                              {user.bannedReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(user)}
                            className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="View details"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Edit user"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(user)}
                            className="p-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                            title="Reset password"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleForceLogout(user)}
                            className="p-2 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/30 rounded-lg transition-colors"
                            title="Force logout"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
                          {user.isBanned ? (
                            <button
                              onClick={() => handleUnbanUser(user)}
                              className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                              title="Unban user"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBanUser(user)}
                              className="p-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                              title="Ban user"
                            >
                              <ShieldOff className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteUser(user)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-sm">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Page {currentPage} of {totalPages} &mdash; {totalCount} total
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadUsers(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="p-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[60px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => loadUsers(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="p-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <SuperAdminCreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadUsers(1);
            loadStats();
            onMessage('success', 'User created successfully');
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

      {showEditModal && selectedUser && (
        <EditUserModal
          user={selectedUser}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedUser(null);
            loadUsers();
            onMessage('success', 'User updated successfully');
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

      {showDeleteModal && selectedUser && (
        <DeleteUserModal
          user={selectedUser}
          onClose={() => {
            setShowDeleteModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowDeleteModal(false);
            setSelectedUser(null);
            loadUsers(1);
            loadStats();
            onMessage('success', 'User deleted successfully');
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

      {showResetPasswordModal && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => {
            setShowResetPasswordModal(false);
            setSelectedUser(null);
          }}
          onSuccess={(tempPassword) => {
            setShowResetPasswordModal(false);
            setSelectedUser(null);
            onMessage('success', `Password reset! Temporary password: ${tempPassword}`);
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

      {showBanModal && selectedUser && (
        <BanUserModal
          user={selectedUser}
          onClose={() => {
            setShowBanModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowBanModal(false);
            setSelectedUser(null);
            loadUsers(1);
            loadStats();
            onMessage('success', 'User banned successfully');
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

      {showUnbanModal && selectedUser && (
        <UnbanUserModal
          user={selectedUser}
          onClose={() => {
            setShowUnbanModal(false);
            setSelectedUser(null);
          }}
          onSuccess={() => {
            setShowUnbanModal(false);
            setSelectedUser(null);
            loadUsers(1);
            loadStats();
            onMessage('success', 'User unbanned successfully');
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

      {showBulkDeleteModal && (
        <BulkDeleteConfirmModal
          count={selectedIds.size}
          loading={bulkLoading}
          onConfirm={confirmBulkDelete}
          onClose={() => setShowBulkDeleteModal(false)}
        />
      )}

      {showBulkResetModal && (
        <BulkResetConfirmModal
          count={selectedIds.size}
          loading={bulkLoading}
          onConfirm={confirmBulkReset}
          onClose={() => setShowBulkResetModal(false)}
        />
      )}

      {showImportModal && (
        <ImportCSVModal
          onClose={() => setShowImportModal(false)}
          onSuccess={(result) => {
            onMessage('success', `Import done: ${result.created} created, ${result.skipped} skipped`);
            loadUsers(1);
            loadStats();
          }}
          onError={(msg) => onMessage('error', msg)}
        />
      )}

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

      {showForceLogoutModal && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
                <LogOut className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Force Logout User
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Terminate active session
                </p>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                This will immediately log out <strong>{selectedUser.username}</strong> and clear their active session. 
                They will need to log in again to access the system.
              </p>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">User:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedUser.firstName} {selectedUser.lastName}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Username:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedUser.username}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Last Login:</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleString() : 'Never'}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowForceLogoutModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmForceLogout}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
              >
                Force Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Create User Modal Component
export function SuperAdminCreateUserModal({ 
  onClose, 
  onSuccess, 
  onError,
  restrictedRoles = [],
}: { 
  onClose: () => void; 
  onSuccess: () => void; 
  onError: (msg: string) => void;
  restrictedRoles?: string[];
}) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    role: 'viewer' as UserRole,
    station: '',
    yard: '',
    department: '',
  });
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Fetch stations on mount
  useEffect(() => {
    const fetchStations = async () => {
      setLoadingStations(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'}/config/stations`, {
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`
          }
        });
        if (response.ok) {
          const result = await response.json();
          const stationsData = result.data || result.stations || result;
          setStations(Array.isArray(stationsData) ? stationsData : []);
        }
      } catch (error) {
        console.error('Failed to fetch stations:', error);
      } finally {
        setLoadingStations(false);
      }
    };
    fetchStations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData: any = {
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
      };

      if (formData.department.trim()) {
        submitData.department = formData.department.trim();
      }

      // Only include station if role requires it
      if (['fuel_attendant', 'station_manager'].includes(formData.role) && formData.station) {
        submitData.station = formData.station;
      }

      // Only include yard if role requires it
      if (formData.role === 'yard_personnel' && formData.yard) {
        submitData.yard = formData.yard;
      }

      await usersAPI.create(submitData);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const requiresStation = ['fuel_attendant', 'station_manager'].includes(formData.role);
  const requiresYard = formData.role === 'yard_personnel';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 transform scale-[0.9] origin-center">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Create New User
              </h3>
              <p className="text-sm text-green-100">Password will be sent via email</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Success Banner */}
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

            {/* Account Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Account Information</h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-10">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="hamdunassor"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="hamdunassor111@gmail.com"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Login credentials will be sent to this email
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="Hamdu"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="Nassor"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="e.g. Finance, Operations, Logistics"
                  />
                </div>
              </div>
            </div>

            {/* Role & Permissions Section */}
            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Role & Permissions</h4>
              </div>
              
              <div className="pl-10">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  User Role <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, station: '', yard: '' })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-700"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                >
                  {USER_ROLES.filter(role => !restrictedRoles.includes(role.value)).map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Defines user's access level and permissions within the system
                </p>
              </div>
            </div>

            {/* Station Assignment Section (Conditional) */}
            {requiresStation && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Station Assignment</h4>
                </div>
                
                <div className="pl-10">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Assigned Station <span className="text-red-500">*</span>
                  </label>
                  {loadingStations ? (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading stations...</span>
                    </div>
                  ) : (
                    <>
                      <select
                        required={requiresStation}
                        value={formData.station}
                        onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-700"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                      >
                        <option value="">Select a station</option>
                        {Array.isArray(stations) && stations.filter(s => s.isActive).map(station => (
                          <option key={station._id} value={station.stationName}>
                            {station.stationName}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        Fuel station where this user will be assigned to work
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Yard Assignment Section (Conditional) */}
            {requiresYard && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                    <Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Yard Assignment</h4>
                </div>
                
                <div className="pl-10">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Assigned Yard <span className="text-red-500">*</span>
                  </label>
                  <select
                    required={requiresYard}
                    value={formData.yard}
                    onChange={(e) => setFormData({ ...formData, yard: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-700"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                  >
                    <option value="">Select a yard</option>
                    {YARDS.map(yard => (
                      <option key={yard.value} value={yard.value}>
                        {yard.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Yard location where this personnel will be assigned
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || success || (requiresStation && !formData.station) || (requiresYard && !formData.yard)}
              className="px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg shadow-green-500/30"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating User...' : success ? 'Done!' : 'Create User & Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit User Modal (similar structure)
function EditUserModal({ 
  user,
  onClose, 
  onSuccess, 
  onError 
}: { 
  user: User;
  onClose: () => void; 
  onSuccess: () => void; 
  onError: (msg: string) => void;
}) {
  const [formData, setFormData] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    role: user.role || 'viewer' as UserRole,
    station: user.station || '',
    yard: user.yard || '',
    department: user.department || '',
  });
  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch stations on mount
  useEffect(() => {
    const fetchStations = async () => {
      setLoadingStations(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'}/config/stations`, {
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('fuel_order_token')}`
          }
        });
        if (response.ok) {
          const result = await response.json();
          // Handle both array and object responses
          const stationsData = result.data || result.stations || result;
          setStations(Array.isArray(stationsData) ? stationsData : []);
        }
      } catch (error) {
        console.error('Failed to fetch stations:', error);
      } finally {
        setLoadingStations(false);
      }
    };
    fetchStations();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        role: formData.role,
        department: formData.department.trim() || undefined,
      };
      
      // Only include station if role requires it
      if (['fuel_attendant', 'station_manager'].includes(formData.role) && formData.station) {
        submitData.station = formData.station;
      }
      
      // Only include yard if role requires it
      if (formData.role === 'yard_personnel' && formData.yard) {
        submitData.yard = formData.yard;
      }

      await usersAPI.update(user.id, submitData);
      onSuccess();
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const requiresStation = ['fuel_attendant', 'station_manager'].includes(formData.role);
  const requiresYard = formData.role === 'yard_personnel';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <UserIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Edit User
              </h3>
              <p className="text-sm text-blue-100">{user.username}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Personal Information Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <UserIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Personal Information</h4>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-10">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="Enter first name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="Enter last name"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="user@example.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Department
                  </label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all"
                    placeholder="e.g. Finance, Operations, Logistics"
                  />
                </div>
              </div>
            </div>

            {/* Role & Permissions Section */}
            <div className="space-y-4 pt-4 border-t dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Shield className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold uppercase tracking-wide">Role & Permissions</h4>
              </div>
              
              <div className="pl-10">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  User Role <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, station: '', yard: '' })}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-700"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                >
                  {USER_ROLES.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Defines user's access level and permissions within the system
                </p>
              </div>
            </div>

            {/* Station Assignment Section (Conditional) */}
            {requiresStation && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-teal-100 dark:bg-teal-900/30 rounded-lg flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Station Assignment</h4>
                </div>
                
                <div className="pl-10">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Assigned Station <span className="text-red-500">*</span>
                  </label>
                  {loadingStations ? (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 py-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading stations...</span>
                    </div>
                  ) : (
                    <>
                      <select
                        required={requiresStation}
                        value={formData.station}
                        onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-700"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                      >
                        <option value="">Select a station</option>
                        {Array.isArray(stations) && stations.filter(s => s.isActive).map(station => (
                          <option key={station._id} value={station.stationName}>
                            {station.stationName}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        Fuel station where this user will be assigned to work
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Yard Assignment Section (Conditional) */}
            {requiresYard && (
              <div className="space-y-4 pt-4 border-t dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-medium">
                  <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                    <Truck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h4 className="text-sm font-semibold uppercase tracking-wide">Yard Assignment</h4>
                </div>
                
                <div className="pl-10">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Assigned Yard <span className="text-red-500">*</span>
                  </label>
                  <select
                    required={requiresYard}
                    value={formData.yard}
                    onChange={(e) => setFormData({ ...formData, yard: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100 transition-all appearance-none bg-white dark:bg-gray-700"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.25rem' }}
                  >
                    <option value="">Select a yard</option>
                    {YARDS.map(yard => (
                      <option key={yard.value} value={yard.value}>
                        {yard.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Yard location where this personnel will be assigned
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 border-t dark:border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (requiresStation && !formData.station) || (requiresYard && !formData.yard)}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg shadow-indigo-500/30"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? 'Updating...' : 'Update User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete User Modal
function DeleteUserModal({ 
  user,
  onClose, 
  onSuccess, 
  onError 
}: { 
  user: User;
  onClose: () => void; 
  onSuccess: () => void; 
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await usersAPI.delete(user.id);
      onSuccess();
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Delete User
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This action cannot be undone
              </p>
            </div>
          </div>

          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Are you sure you want to delete user <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
            This will move the user to the trash.
          </p>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Delete User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reset Password Modal
function ResetPasswordModal({ 
  user,
  onClose, 
  onSuccess, 
  onError 
}: { 
  user: User;
  onClose: () => void; 
  onSuccess: (tempPassword: string) => void; 
  onError: (msg: string) => void;
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
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    if (tempPassword) {
      onSuccess(tempPassword);
    } else {
      onSuccess('');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <Key className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Reset Password
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Generate temporary password
              </p>
            </div>
          </div>

          {!resetComplete ? (
            <>
              <p className="text-gray-700 dark:text-gray-300 mb-4">
                Reset password for <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  ✉️ A temporary password will be generated and sent to <strong>{user.email}</strong>. 
                  The user must change it on their first login.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReset}
                  disabled={loading}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {loading ? 'Resetting...' : 'Reset Password & Send Email'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Success - Email Sent */}
              {emailSent ? (
                <>
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <Check className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-green-900 dark:text-green-100">
                          Password Reset Successfully!
                        </p>
                        <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                          An email with the temporary password has been sent to <strong>{user.email}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-6">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      📧 The user will receive the credentials via email. They must change the password on first login.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleClose}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                /* Fallback - Email Failed, Show Password */
                <>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-yellow-900 dark:text-yellow-100">
                          Password Reset - Email Failed
                        </p>
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                          Password was reset but email notification failed. Please share this password manually.
                        </p>
                      </div>
                    </div>
                  </div>

                  {tempPassword && (
                    <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Temporary Password
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={tempPassword}
                          readOnly
                          className="flex-1 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-mono text-lg font-semibold text-gray-900 dark:text-gray-100"
                        />
                        <button
                          onClick={handleCopy}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                        >
                          {copied ? (
                            <>
                              <Check className="w-4 h-4" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Key className="w-4 h-4" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      <strong>Important:</strong> Share this temporary password securely with the user via another channel (phone, secure message, etc.).
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleClose}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Ban User Modal
function BanUserModal({ 
  user,
  onClose, 
  onSuccess, 
  onError 
}: { 
  user: User;
  onClose: () => void; 
  onSuccess: () => void; 
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');

  const handleBan = async () => {
    if (!reason.trim()) {
      onError('Please provide a reason for banning this user');
      return;
    }

    setLoading(true);
    try {
      await usersAPI.ban(user.id, reason);
      onSuccess();
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to ban user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <Ban className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Ban User
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This will prevent user from accessing the system
              </p>
            </div>
          </div>

          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Are you sure you want to ban <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
            The user will be immediately logged out and cannot log in again until unbanned.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reason for Ban *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Enter reason for banning this user..."
              className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-gray-100"
              required
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBan}
              disabled={loading || !reason.trim()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Ban User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Unban User Modal
function UnbanUserModal({ 
  user,
  onClose, 
  onSuccess, 
  onError 
}: { 
  user: User;
  onClose: () => void; 
  onSuccess: () => void; 
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleUnban = async () => {
    setLoading(true);
    try {
      await usersAPI.unban(user.id);
      onSuccess();
    } catch (error: any) {
      onError(error.response?.data?.message || 'Failed to unban user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Unban User
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Restore user access
              </p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              Unban <strong>{user.username}</strong> ({user.firstName} {user.lastName})?
            </p>
            {user.bannedReason && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-3">
                <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-1">
                  Ban Reason:
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 italic">
                  "{user.bannedReason}"
                </p>
                {user.bannedBy && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Banned by: {user.bannedBy} on {user.bannedAt ? new Date(user.bannedAt).toLocaleString() : 'Unknown'}
                  </p>
                )}
              </div>
            )}
            <p className="text-gray-700 dark:text-gray-300">
              The user will be able to log in and access the system again.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUnban}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              Unban User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Bulk Delete Confirm Modal
function BulkDeleteConfirmModal({
  count,
  loading,
  onConfirm,
  onClose,
}: {
  count: number;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bulk Delete Users</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">This cannot be undone</p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          Are you sure you want to delete <strong>{count} user{count > 1 ? 's' : ''}</strong>? They will be moved to the trash.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            Delete {count} User{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// Bulk Reset Passwords Confirm Modal
function BulkResetConfirmModal({
  count,
  loading,
  onConfirm,
  onClose,
}: {
  count: number;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
            <Key className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bulk Reset Passwords</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">New passwords will be emailed to each user</p>
          </div>
        </div>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          Reset passwords for <strong>{count} user{count > 1 ? 's' : ''}</strong>? Each user will receive a temporary password via email and must change it on next login.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            Reset {count} Password{count > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// Import CSV Modal
function ImportCSVModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (result: { created: number; skipped: number; errors: any[] }) => void;
  onError: (msg: string) => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number; errors: any[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText((ev.target?.result as string) || '');
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) { onError('No CSV content to import'); return; }
    setLoading(true);
    try {
      const res = await usersAPI.importCSV(csvText);
      setResult(res);
    } catch (error: any) {
      onError(error.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <Upload className="w-6 h-6 text-white" />
            <h3 className="text-lg font-semibold text-white">Import Users from CSV</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Expected CSV format (first row = header):</p>
                <p className="font-mono text-xs">username,email,firstName,lastName,role,station,yard,department</p>
              </div>
              <div>
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleFileChange} className="hidden" />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-gray-700 dark:text-gray-300"
                >
                  <Upload className="w-4 h-4" />
                  Choose CSV File
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Or paste CSV content</label>
                <textarea
                  rows={8}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={'username,email,firstName,lastName,role,station,yard,department\njdoe,jdoe@example.com,John,Doe,viewer,,,Finance'}
                  className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg text-sm font-mono dark:bg-gray-700 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={onClose} className="px-4 py-2 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={loading || !csvText.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {loading ? 'Importing...' : 'Import Users'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-4">
                <div className="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{result.created}</p>
                  <p className="text-sm text-green-600 dark:text-green-500">Created</p>
                </div>
                <div className="flex-1 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{result.skipped}</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-500">Skipped</p>
                </div>
                <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-700 dark:text-red-400">{result.errors.length}</p>
                  <p className="text-sm text-red-600 dark:text-red-500">Errors</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Row Errors:</p>
                  {result.errors.map((err: any, i: number) => (
                    <p key={i} className="text-xs text-red-700 dark:text-red-400">Row {err.row}: {err.reason}</p>
                  ))}
                </div>
              )}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { onSuccess(result); onClose(); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

