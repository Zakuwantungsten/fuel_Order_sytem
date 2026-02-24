import React, { useState, useEffect } from 'react';
import usePersistedState from '../hooks/usePersistedState';
import { X, CheckCircle, Clock, Bell, Trash2, Eye } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  status: 'pending' | 'resolved' | 'dismissed';
  isRead: boolean;
  createdAt: string;
  metadata?: any;
}

interface NotificationsPageProps {
  onClose: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

const NotificationsPage: React.FC<NotificationsPageProps> = ({ onClose, onNotificationClick }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = usePersistedState<'all' | 'pending' | 'resolved'>('notif:filter', 'all');

  // Helper function to tailor notification message based on viewer's role
  const getTailoredMessage = (notification: Notification): string => {
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    
    // Only tailor messages for missing configuration notifications
    if (notification.type === 'missing_total_liters' || notification.type === 'missing_extra_fuel' || notification.type === 'both') {
      if (isAdmin) {
        // Admin sees action-oriented message
        const destination = notification.metadata?.destination;
        const truckSuffix = notification.metadata?.truckSuffix;
        const truckNo = notification.metadata?.truckNo;
        
        if (notification.type === 'missing_total_liters') {
          return `Route "${destination}" needs total liters configuration. Please add this route in System Configuration > Routes.`;
        } else if (notification.type === 'missing_extra_fuel') {
          return `Truck ${truckNo} with suffix "${truckSuffix}" needs batch assignment. Please configure it in System Configuration > Truck Batches.`;
        } else if (notification.type === 'both') {
          return `${truckNo} needs both route total liters and truck batch configuration. Please add them in System Configuration.`;
        }
      } else {
        // Fuel order maker sees helpful message
        const destination = notification.metadata?.destination;
        const truckSuffix = notification.metadata?.truckSuffix;
        const truckNo = notification.metadata?.truckNo;
        
        if (notification.type === 'missing_total_liters') {
          return `Route "${destination}" is not configured yet. Please contact admin to add this route, or click to edit the fuel record manually.`;
        } else if (notification.type === 'missing_extra_fuel') {
          return `Truck ${truckNo} (suffix: ${truckSuffix}) needs extra fuel batch assignment. Contact admin to configure it in System Config > Truck Batches, or click to manually edit this fuel record.`;
        } else if (notification.type === 'both') {
          return `${truckNo} needs route configuration and truck batch assignment. Contact admin or click to edit manually.`;
        }
      }
    }
    
    // Return original message for other notification types
    return notification.message;
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await api.get('/notifications', {
        params: { limit: 100 }, // Get more notifications
      });
      setNotifications(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(
        notifications.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/dismiss`);
      setNotifications(
        notifications.map((n) =>
          n._id === id ? { ...n, status: 'dismissed', isRead: true } : n
        )
      );
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  };

  const resolveNotification = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/resolve`);
      setNotifications(
        notifications.map((n) =>
          n._id === id ? { ...n, status: 'resolved' } : n
        )
      );
    } catch (error) {
      console.error('Failed to resolve notification:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'resolved') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else {
      return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      missing_config: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
      unlinked_do: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
      yard_fuel_recorded: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
      truck_pending_linking: 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700',
      truck_entry_rejected: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredNotifications = notifications.filter((n) => {
    // Don't show dismissed notifications in the list
    if (n.status === 'dismissed') return false;
    if (filter === 'all') return true;
    return n.status === filter;
  });

  const stats = {
    total: notifications.filter((n) => n.status !== 'dismissed').length,
    pending: notifications.filter((n) => n.status === 'pending').length,
    resolved: notifications.filter((n) => n.status === 'resolved').length,
    unread: notifications.filter((n) => !n.isRead && n.status !== 'dismissed').length,
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto pt-2 pb-2 sm:pt-6 sm:pb-6 px-2 sm:px-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-700 rounded-t-lg">
          <div className="flex items-center space-x-2">
            <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">All Notifications</h2>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {stats.unread > 0 ? `${stats.unread} unread` : 'All caught up!'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-2 p-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <div className="text-center">
            <div className="text-xl font-bold text-gray-800 dark:text-gray-100">{stats.total}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-600 dark:text-green-400">{stats.resolved}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Resolved</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.unread}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Unread</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-2 p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === 'resolved'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            Resolved ({stats.resolved})
          </button>
        </div>

        {/* Notifications List */}
        <div className="max-h-[52vh] sm:max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-base font-medium">No notifications</p>
              <p className="text-xs mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification._id}
                  onClick={() => {
                    // Handle click for missing config notifications - navigate to fuel record
                    if ((notification.type === 'missing_total_liters' || notification.type === 'missing_extra_fuel' || notification.type === 'both') && notification.metadata?.fuelRecordId && onNotificationClick) {
                      markAsRead(notification._id);
                      onNotificationClick(notification);
                    }
                  }}
                  className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    !notification.isRead ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  } ${(notification.type === 'missing_total_liters' || notification.type === 'missing_extra_fuel' || notification.type === 'both') && notification.metadata?.fuelRecordId ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(notification.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Top row: badge + unread dot + actions (stacks on mobile) */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span
                            className={`inline-block px-2 py-1 rounded text-xs font-medium border max-w-[180px] sm:max-w-none truncate ${getTypeColor(
                              notification.type
                            )}`}
                            title={notification.type.replace(/_/g, ' ').toUpperCase()}
                          >
                            {notification.type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          {!notification.isRead && (
                            <span className="w-2 h-2 flex-shrink-0 bg-blue-600 rounded-full"></span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center space-x-1 flex-shrink-0">
                          {!notification.isRead && (
                            <button
                              onClick={(e) => { e.stopPropagation(); markAsRead(notification._id); }}
                              className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                              title="Mark as read"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {notification.status === 'pending' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); resolveNotification(notification._id); }}
                              className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                              title="Resolve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); dismissNotification(notification._id); }}
                            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                            title="Dismiss"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1 mb-1">
                        {notification.title}
                      </h4>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mb-2 break-words">
                        {getTailoredMessage(notification)}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>{formatDate(notification.createdAt)}</span>
                        {notification.metadata?.truckNo && (
                          <span>Truck: {notification.metadata.truckNo}</span>
                        )}
                        {notification.metadata?.doNumber && (
                          <span>DO: {notification.metadata.doNumber}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex justify-end rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-gray-600 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-700 dark:hover:bg-gray-500 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
