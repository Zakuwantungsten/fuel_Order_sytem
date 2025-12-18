import { useState } from 'react';
import { User } from '../types';
import DOManagement from './DOManagement';
import NotificationBell from './NotificationBell';
import ChangePasswordModal from './ChangePasswordModal';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon, Sun, Moon, Key, X } from 'lucide-react';

interface OfficerPortalProps {
  user: User;
}

/**
 * OfficerPortal - Simplified interface for Import and Export Officers
 * Shows only the DO Management section without sidebar navigation
 */
export function OfficerPortal({ user }: OfficerPortalProps) {
  const { logout, toggleTheme, isDark } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {user.role === 'import_officer' ? 'Import' : 'Export'} Officer Portal
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Delivery Order Management
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Notification Bell */}
              <NotificationBell />

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Profile Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {user.role.replace('_', ' ')}
                    </p>
                  </div>
                </button>

                {/* Profile Dropdown */}
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-2 w-48 max-w-[calc(100vw-20px)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110] max-h-[80vh] overflow-y-auto">
                      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {user.email}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowChangePassword(true);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center"
                      >
                        <Key className="w-4 h-4 mr-3" />
                        <span>Change Password</span>
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          logout();
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - DO Management Only */}
      <div className="p-6">
        {successMessage && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center justify-between">
            <span className="text-green-800 dark:text-green-200">{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <DOManagement user={user} />
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setShowChangePassword(false);
            setSuccessMessage('Password changed successfully!');
            setTimeout(() => setSuccessMessage(null), 5000);
          }}
        />
      )}
    </div>
  );
}

export default OfficerPortal;
