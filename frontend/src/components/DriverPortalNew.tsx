import { useState, useEffect } from 'react';
import { MapPin, Fuel, Bell, Truck, Clock, Navigation, Info, ArrowRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../services/api';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface DriverNotification {
  id: string;
  type: 'import' | 'export' | 'return' | 'info';
  message: string;
  timestamp: string;
  read: boolean;
  doNo?: string;
  loadingPoint?: string;
  offloadingPoint?: string;
  destination?: string;
  station?: string;
  liters?: number;
}

interface FuelOrder {
  id: string;
  station: string;
  liters: number;
  status: 'pending' | 'completed';
  lpoNumber?: string;
  doNo?: string;
  createdAt: string;
}

interface DriverPortalProps {
  user: any;
}

export function DriverPortal({ user }: DriverPortalProps) {
  const location = useLocation();
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [fuelOrders, setFuelOrders] = useState<FuelOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [truckNo, setTruckNo] = useState<string>('');

  useEffect(() => {
    // Get truck number from state or localStorage or user profile
    const selectedTruck = location.state?.truckNo || localStorage.getItem('driverTruckNo') || user?.truckNo;
    setTruckNo(selectedTruck);
    
    if (selectedTruck) {
      fetchDriverData(selectedTruck);
      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => fetchDriverData(selectedTruck), 30000);
      return () => clearInterval(interval);
    }
  }, [location.state, user]);

  const fetchDriverData = async (truck: string) => {
    try {
      setLoading(true);
      // Fetch delivery orders for this truck
      const doResponse = await api.get(`/delivery-orders/truck/${truck}`);
      const deliveryOrders = doResponse.data.data || [];

      // Fetch fuel records for this truck
      const fuelResponse = await api.get(`/fuel-records?truckNo=${truck}`);
      const fuelRecords = fuelResponse.data.data?.items || [];

      // Convert delivery orders to notifications
      const doNotifications: DriverNotification[] = deliveryOrders.slice(0, 10).map((order: any) => {
        let type: 'import' | 'export' | 'return' | 'info' = 'info';
        let message = '';

        if (order.importOrExport === 'IMPORT') {
          type = 'import';
          message = `IMPORT: Load at ${order.loadingPoint}, deliver to ${order.destination}`;
        } else if (order.importOrExport === 'EXPORT') {
          type = 'export';
          message = `EXPORT: Load at ${order.loadingPoint}, deliver to ${order.destination}`;
        }

        // Check for return DO (offloading point differs from destination)
        if (order.offloadingPoint && order.offloadingPoint !== order.destination) {
          type = 'return';
          message = `RETURN: Offload at ${order.offloadingPoint}, then reload and proceed to ${order.destination}`;
        }

        return {
          id: order._id,
          type,
          message,
          timestamp: order.date,
          read: false,
          doNo: order.doNumber,
          loadingPoint: order.loadingPoint,
          offloadingPoint: order.offloadingPoint || order.destination,
          destination: order.destination,
        };
      });

      // Convert fuel records to fuel orders
      const orders: FuelOrder[] = fuelRecords.map((record: any) => ({
        id: record._id,
        station: record.fuelStation,
        liters: record.liters,
        status: record.status === 'completed' ? 'completed' : 'pending',
        lpoNumber: record.lpoNumber,
        doNo: record.doNo,
        createdAt: record.date,
      }));

      setNotifications(doNotifications);
      setFuelOrders(orders);
    } catch (error: any) {
      console.error('Failed to fetch driver data:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(['delivery_orders', 'fuel_records'], () => {
    if (truckNo) fetchDriverData(truckNo);
  });

  const markNotificationRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading your orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 transition-colors">
      {/* Header - Mobile Optimized */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-4 py-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur">
              <Truck className="w-7 h-7" />
            </div>
            <div>
              <div className="text-sm opacity-90">Your Truck</div>
              <div className="text-2xl font-bold">{truckNo || 'Not Selected'}</div>
            </div>
          </div>
          {unreadCount > 0 && (
            <div className="relative">
              <Bell className="w-7 h-7" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            </div>
          )}
        </div>
        <p className="text-sm opacity-90">
          Welcome! Check your orders and notifications below.
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Notifications Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden transition-colors">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 px-4 py-3 border-b dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center text-lg">
              <Bell className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
              Delivery Orders
              {unreadCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {unreadCount} New
                </span>
              )}
            </h3>
          </div>
          <div className="divide-y dark:divide-gray-700">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Info className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No delivery orders yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => markNotificationRead(notification.id)}
                  className={`p-4 transition-colors ${
                    notification.read ? 'bg-white dark:bg-gray-800' : 'bg-blue-50 dark:bg-blue-900/20'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        notification.type === 'import'
                          ? 'bg-green-100 dark:bg-green-900/30'
                          : notification.type === 'export'
                          ? 'bg-blue-100 dark:bg-blue-900/30'
                          : notification.type === 'return'
                          ? 'bg-orange-100 dark:bg-orange-900/30'
                          : 'bg-gray-100 dark:bg-gray-700'
                      }`}
                    >
                      {notification.type === 'import' || notification.type === 'export' ? (
                        <Navigation
                          className={`w-5 h-5 ${
                            notification.type === 'import' ? 'text-green-600' : 'text-blue-600'
                          }`}
                        />
                      ) : notification.type === 'return' ? (
                        <ArrowRight className="w-5 h-5 text-orange-600" />
                      ) : (
                        <Info className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            notification.type === 'import'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : notification.type === 'export'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                              : notification.type === 'return'
                              ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                          }`}
                        >
                          {notification.type.toUpperCase()}
                        </span>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                        )}
                      </div>
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mb-2">
                        {notification.message}
                      </p>
                      {notification.doNo && (
                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                          DO: <span className="font-semibold">{notification.doNo}</span>
                        </div>
                      )}
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(notification.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Fuel Orders Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden transition-colors">
          <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/30 dark:to-yellow-900/30 px-4 py-3 border-b dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center text-lg">
              <Fuel className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
              Fuel Orders at Stations
            </h3>
          </div>
          <div className="divide-y dark:divide-gray-700">
            {fuelOrders.length === 0 ? (
              <div className="p-8 text-center">
                <Fuel className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">No fuel orders available</p>
              </div>
            ) : (
              fuelOrders.map((order) => (
                <div key={order.id} className="p-4 dark:bg-gray-800">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 text-base">
                          {order.station}
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            order.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                          }`}
                        >
                          {order.status === 'completed' ? 'Completed' : 'Pending'}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-2">
                        {order.liters} Liters
                      </div>
                      <div className="space-y-1">
                        {order.lpoNumber && (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            LPO: <span className="font-semibold">{order.lpoNumber}</span>
                          </div>
                        )}
                        {order.doNo && (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            DO: <span className="font-semibold">{order.doNo}</span>
                          </div>
                        )}
                        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                          <Clock className="w-3 h-3 mr-1" />
                          {new Date(order.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl p-4 border border-blue-200 dark:border-blue-800 transition-colors">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <p className="font-semibold mb-1">Information</p>
              <p>
                This page shows your delivery orders and fuel station orders. No action needed
                - just follow the instructions for loading and offloading points.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DriverPortal;
