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
      missing_config: 'bg-red-100 text-red-700 border-red-300',
      unlinked_do: 'bg-orange-100 text-orange-700 border-orange-300',
      yard_fuel_recorded: 'bg-blue-100 text-blue-700 border-blue-300',
      truck_pending_linking: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      truck_entry_rejected: 'bg-red-100 text-red-700 border-red-300',
    };
    return colors[type] || 'bg-gray-100 text-gray-700 border-gray-300';
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto pt-10 pb-10">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center space-x-3">
            <Bell className="w-7 h-7 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-800">All Notifications</h2>
              <p className="text-sm text-gray-600 mt-1">
                {stats.unread > 0 ? `${stats.unread} unread` : 'All caught up!'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50 border-b border-gray-200">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-xs text-gray-600">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-xs text-gray-600">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
            <div className="text-xs text-gray-600">Resolved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.unread}</div>
            <div className="text-xs text-gray-600">Unread</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-2 p-4 bg-white border-b border-gray-200">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'pending'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setFilter('resolved')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'resolved'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Resolved ({stats.resolved})
          </button>
        </div>

        {/* Notifications List */}
        <div className="max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">No notifications</p>
              <p className="text-sm mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
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
                  className={`p-4 hover:bg-gray-50 transition-colors ${
                    !notification.isRead ? 'bg-blue-50' : ''
                  } ${(notification.type === 'missing_total_liters' || notification.type === 'missing_extra_fuel' || notification.type === 'both') && notification.metadata?.fuelRecordId ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(notification.status)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-medium border ${getTypeColor(
                                notification.type
                              )}`}
                            >
                              {notification.type.replace(/_/g, ' ').toUpperCase()}
                            </span>
                            {!notification.isRead && (
                              <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                            )}
                          </div>

                          <h4 className="text-sm font-semibold text-gray-900 mb-1">
                            {notification.title}
                          </h4>
                          <p className="text-sm text-gray-700 mb-2">
                            {getTailoredMessage(notification)}
                          </p>

                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <span>{formatDate(notification.createdAt)}</span>
                            {notification.metadata?.truckNo && (
                              <span>Truck: {notification.metadata.truckNo}</span>
                            )}
                            {notification.metadata?.doNumber && (
                              <span>DO: {notification.metadata.doNumber}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1 ml-3">
                          {!notification.isRead && (
                            <button
                              onClick={() => markAsRead(notification._id)}
                              className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                              title="Mark as read"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {notification.status === 'pending' && (
                            <button
                              onClick={() => resolveNotification(notification._id)}
                              className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                              title="Resolve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => dismissNotification(notification._id)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title="Dismiss"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
