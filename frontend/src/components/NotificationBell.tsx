import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle2, AlertCircle, Link2, Edit3, Truck } from 'lucide-react';

interface Notification {
  id?: string;
  _id?: string;
  type: 'missing_total_liters' | 'missing_extra_fuel' | 'both' | 'unlinked_export_do' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  relatedModel: string;
  relatedId: string;
  metadata?: {
    fuelRecordId?: string;
    doNumber?: string;
    truckNo?: string;
    destination?: string;
    truckSuffix?: string;
    missingFields?: string[];
    loadingPoint?: string;
    importOrExport?: string;
    deliveryOrderId?: string;
  };
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  isRead: boolean;
}

interface NotificationBellProps {
  onNotificationClick?: (notification: Notification) => void;
  onEditDO?: (doId: string) => void; // Callback to navigate to edit a DO
  onRelinkDO?: (doId: string) => Promise<boolean>; // Callback to attempt re-linking a DO
}

// Helper to get notification ID (handles both id and _id from MongoDB)
const getNotificationId = (notification: Notification): string => {
  return notification.id || notification._id || '';
};

export default function NotificationBell({ onNotificationClick, onEditDO, onRelinkDO }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [relinkingId, setRelinkingId] = useState<string | null>(null);

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('fuel_order_token') || localStorage.getItem('token');
      const response = await fetch('/api/notifications?status=pending', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.data || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('fuel_order_token') || localStorage.getItem('token');
      await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      loadNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      const token = localStorage.getItem('fuel_order_token') || localStorage.getItem('token');
      await fetch(`/api/notifications/${id}/dismiss`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      loadNotifications();
    } catch (error) {
      console.error('Failed to dismiss notification:', error);
    }
  };

  const handleRelinkDO = async (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation();
    const doId = notification.metadata?.deliveryOrderId || notification.relatedId;
    if (!doId) return;

    const notifId = getNotificationId(notification);
    setRelinkingId(notifId);
    try {
      if (onRelinkDO) {
        const success = await onRelinkDO(doId);
        if (success) {
          loadNotifications(); // Refresh to remove resolved notification
        }
      } else {
        // Default behavior: call API directly
        const token = localStorage.getItem('fuel_order_token') || localStorage.getItem('token');
        const response = await fetch(`/api/delivery-orders/${doId}/relink-to-fuel-record`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const result = await response.json();
        if (result.success && result.data?.fuelRecord) {
          alert(`✓ Successfully linked DO-${notification.metadata?.doNumber} to fuel record!`);
          loadNotifications();
        } else {
          alert(`Could not link: ${result.message}\n\nPlease edit the DO to correct the truck number.`);
        }
      }
    } catch (error) {
      console.error('Failed to re-link DO:', error);
      alert('Failed to re-link. Please try again.');
    } finally {
      setRelinkingId(null);
    }
  };

  const handleEditDO = (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation();
    const doId = notification.metadata?.deliveryOrderId || notification.relatedId;
    if (!doId) return;
    
    if (onEditDO) {
      onEditDO(doId);
      setShowDropdown(false);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(getNotificationId(notification));
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
    setShowDropdown(false);
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'both':
      case 'error':
        return 'text-red-500';
      case 'missing_total_liters':
      case 'missing_extra_fuel':
      case 'warning':
        return 'text-yellow-500';
      case 'unlinked_export_do':
        return 'text-orange-500';
      default:
        return 'text-blue-500';
    }
  };

  const getNotificationIcon = (type: string) => {
    if (type === 'unlinked_export_do') {
      return <Truck className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getIconColor(type)}`} />;
    }
    return <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getIconColor(type)}`} />;
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className="relative p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
        title="Notifications"
        type="button"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-[100] pointer-events-auto"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 mt-2 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 z-[110] max-h-[600px] overflow-hidden flex flex-col pointer-events-auto">
            {/* Header */}
            <div className="px-4 py-3 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Notifications
              </h3>
              <button
                onClick={() => setShowDropdown(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  Loading...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>No pending notifications</p>
                  <p className="text-sm mt-1">All caught up!</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const notifId = getNotificationId(notification);
                  return (
                  <div
                    key={notifId}
                    className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                      !notification.isRead ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                    } ${notification.type !== 'unlinked_export_do' ? 'cursor-pointer' : ''}`}
                    onClick={() => notification.type !== 'unlinked_export_do' && handleNotificationClick(notification)}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {getNotificationIcon(notification.type)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {notification.title}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {notification.message}
                          </p>
                          {notification.metadata && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-500 space-y-0.5">
                              {notification.metadata.doNumber && (
                                <div>DO: {notification.metadata.doNumber}</div>
                              )}
                              {notification.metadata.truckNo && (
                                <div>Truck: {notification.metadata.truckNo}</div>
                              )}
                              {notification.metadata.destination && (
                                <div>Destination: {notification.metadata.destination}</div>
                              )}
                              {notification.metadata.loadingPoint && (
                                <div>Loading Point: {notification.metadata.loadingPoint}</div>
                              )}
                              {notification.metadata.truckSuffix && (
                                <div>Suffix: {notification.metadata.truckSuffix}</div>
                              )}
                            </div>
                          )}
                          
                          {/* Action buttons for unlinked EXPORT DO */}
                          {notification.type === 'unlinked_export_do' && (
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                onClick={(e) => handleRelinkDO(e, notification)}
                                disabled={relinkingId === notifId}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded transition-colors"
                                title="Try to link this DO to a fuel record"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                {relinkingId === notifId ? 'Linking...' : 'Try Re-link'}
                              </button>
                              {onEditDO && (
                                <button
                                  onClick={(e) => handleEditDO(e, notification)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                  title="Edit this DO to correct the truck number"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  Edit DO
                                </button>
                              )}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {new Date(notification.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissNotification(notifId);
                          }}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                          title="Dismiss"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    // Navigate to full notifications page if you have one
                  }}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
