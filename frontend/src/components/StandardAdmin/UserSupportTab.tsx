import { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Key,
  ToggleLeft,
  ToggleRight,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { usersAPI } from '../../services/api';
import { User } from '../../types';
import Pagination from '../Pagination';
import CreateUserModal from '../CreateUserModal';

interface UserSupportTabProps {
  user: any;
  showMessage: (type: 'success' | 'error', message: string) => void;
}

export default function UserSupportTab({ showMessage }: UserSupportTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [showCreateUser, setShowCreateUser] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await usersAPI.getAll();
      // Filter out admin roles - admin can only manage non-admin users
      const nonAdminUsers = data.filter((u: User) => 
        !['super_admin', 'system_admin', 'admin', 'boss'].includes(u.role)
      );
      setUsers(nonAdminUsers);
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId: string) => {
    try {
      await usersAPI.toggleStatus(userId);
      await loadUsers();
      showMessage('success', 'User status updated successfully');
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to update user status');
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Are you sure you want to reset this user\'s password?')) return;
    
    try {
      const result = await usersAPI.resetPassword(userId);
      showMessage('success', `Password reset. Temporary password: ${result.temporaryPassword}`);
    } catch (err: any) {
      showMessage('error', err.response?.data?.message || 'Failed to reset password');
    }
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      filter === '' ||
      u.username?.toLowerCase().includes(filter.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(filter.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(filter.toLowerCase()) ||
      u.email?.toLowerCase().includes(filter.toLowerCase());
    
    const matchesRole = !roleFilter || u.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const uniqueRoles = [...new Set(users.map(u => u.role))].sort();

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">Limited User Management</h4>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              You can manage non-admin users only (drivers, clerks, fuel attendants, etc.). 
              You cannot create or modify admin, boss, or super admin accounts.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setShowCreateUser(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <UserPlus className="w-4 h-4" />
          Create User
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={filter}
                onChange={e => {
                  setFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <select
            value={roleFilter}
            onChange={e => {
              setRoleFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Roles</option>
            {uniqueRoles.map(role => (
              <option key={role} value={role}>
                {role.replace(/_/g, ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">Loading users...</p>
          </div>
        ) : paginatedUsers.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No users found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Department</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {paginatedUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                            <span className="text-indigo-600 dark:text-indigo-400 font-medium text-sm">
                              {u.firstName?.[0]}{u.lastName?.[0]}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs capitalize">
                          {u.role?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {u.department || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          u.isActive
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}>
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleStatus(String(u.id))}
                            className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                            title={u.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {u.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={() => handleResetPassword(String(u.id))}
                            className="p-1 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
                            title="Reset Password"
                          >
                            <Key className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t dark:border-gray-700 p-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={(newSize) => {
                  setItemsPerPage(newSize);
                  setCurrentPage(1);
                }}
                totalItems={filteredUsers.length}
              />
            </div>
          </>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateUser && (
        <CreateUserModal
          isOpen={showCreateUser}
          onClose={() => setShowCreateUser(false)}
          onUserCreated={() => {
            loadUsers();
            setShowCreateUser(false);
          }}
          restrictedRoles={['super_admin', 'system_admin', 'admin', 'boss']}
        />
      )}
    </div>
  );
}
