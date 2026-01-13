import { useState, useEffect } from 'react';
import { Bell, X, CheckCircle2, AlertCircle, Link2, Edit3, Truck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Notification {
  id?: string;
  _id?: string;
  type: 'missing_total_liters' | 'missing_extra_fuel' | 'both' | 'unlinked_export_do' | 'yard_fuel_recorded' | 'truck_pending_linking' | 'truck_entry_rejected' | 'info' | 'warning' | 'error';
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
    yardFuelDispenseId?: string;
    yard?: string;
    liters?: number;
    enteredBy?: string;
    rejectionReason?: string;
    rejectedBy?: string;
  };
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
  isRead: boolean;
}

interface NotificationBellProps {
  onNotificationClick?: (notification: Notification) => void;
  onEditDO?: (doId: string) => void; // Callback to navigate to edit a DO
  onRelinkDO?: (doId: string) => Promise<boolean>; // Callback to attempt re-linking a DO
  onViewPendingYardFuel?: () => void; // Callback to open pending yard fuel modal
  onViewAllNotifications?: () => void; // Callback to open all notifications page
}

// Helper to get notification ID (handles both id and _id from MongoDB)
const getNotificationId = (notification: Notification): string => {
  return notification.id || notification._id || '';
};

export default function NotificationBell({ onNotificationClick, onEditDO, onRelinkDO, onViewPendingYardFuel, onViewAllNotifications }: NotificationBellProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [relinkingId, setRelinkingId] = useState<string | null>(null);
  const [pendingYardFuelCount, setPendingYardFuelCount] = useState(0);

  // Helper function to tailor notification message based on viewer's role
  const getTailoredMessage = (notification: Notification): string => {
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    
    // Only tailor messages for missing configuration notifications
    if (notification.type === 'missing_total_liters' || notification.type === 'missing_extra_fuel' || notification.type === 'both') {
      if (isAdmin) {
        // Admin sees action-oriented message
        const destination = notification.metadata?.destination;
        const truckSuffix = notification.metadata?.truckSuffix;
        
        if (notification.type === 'missing_total_liters') {
          return `Route "${destination}" needs configuration. Add it in System Config > Routes.`;
        } else if (notification.type === 'missing_extra_fuel') {
          return `Truck suffix "${truckSuffix}" needs batch assignment. Go to System Config > Truck Batches.`;
        } else if (notification.type === 'both') {
          return `Add route total liters and truck batch in System Configuration.`;
        }
      }
    }
    
    // Return original message for non-admins or other notification types
    return notification.message;
  };

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const response = await api.get('/notifications', {
        params: { status: 'pending' }
      });
      
      setNotifications(response.data.data || []);
      setUnreadCount(response.data.unreadCount || 0);
      
      // Count pending yard fuel notifications
      const pendingCount = (response.data.data || []).filter(
        (n: Notification) => n.type === 'truck_pending_linking'
      ).length;
      setPendingYardFuelCount(pendingCount);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      loadNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const dismissNotification = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/dismiss`);
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
        const response = await api.post(`/delivery-orders/${doId}/relink-to-fuel-record`);
        
        if (response.data.success && response.data.data?.fuelRecord) {
          alert(`✓ Successfully linked DO-${notification.metadata?.doNumber} to fuel record!`);
          loadNotifications();
        } else {
          alert(`Could not link: ${response.data.message}\n\nPlease edit the DO to correct the truck number.`);
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
    
    // If it's a yard fuel notification, open the pending yard fuel modal
    if ((notification.type === 'yard_fuel_recorded' || notification.type === 'truck_pending_linking') && onViewPendingYardFuel) {
      setShowDropdown(false);
      onViewPendingYardFuel();
      return;
    }
    
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
    setShowDropdown(false);
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'both':
      case 'error':
      case 'truck_entry_rejected':
        return 'text-red-500';
      case 'missing_total_liters':
      case 'missing_extra_fuel':
      case 'warning':
      case 'truck_pending_linking':
        return 'text-yellow-500';
      case 'unlinked_export_do':
        return 'text-orange-500';
      case 'yard_fuel_recorded':
        return 'text-green-500';
      default:
        return 'text-blue-500';
    }
  };

  const getNotificationIcon = (type: string) => {
    if (type === 'unlinked_export_do' || type === 'truck_pending_linking') {
      return <Truck className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getIconColor(type)}`} />;
    }
    if (type === 'yard_fuel_recorded') {
      return <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${getIconColor(type)}`} />;
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
          <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-20px)] bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 z-[110] max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto">
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

            {/* Pending Yard Fuel Button */}
            {pendingYardFuelCount > 0 && onViewPendingYardFuel && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border-b dark:border-gray-700">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropdown(false);
                    onViewPendingYardFuel();
                  }}
                  className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Truck className="w-4 h-4" />
                  View {pendingYardFuelCount} Pending Yard Fuel {pendingYardFuelCount === 1 ? 'Entry' : 'Entries'}
                </button>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-2 text-center">
                  Trucks awaiting DO linkage - Review and reject incorrect entries
                </p>
              </div>
            )}

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
                            {getTailoredMessage(notification)}
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
                    onViewAllNotifications?.();
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
