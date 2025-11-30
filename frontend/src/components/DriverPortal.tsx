import { useState, useEffect } from 'react';
import { MapPin, Fuel, Bell, CheckCircle, Navigation, Clock, ArrowRight, Info } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../services/api';

interface DriverOrder {
  id: string;
  station: string;
  liters: number;
  status: 'pending' | 'completed' | 'upcoming';
  distance: string;
  eta: string;
  lpoNumber?: string;
  doNo?: string;
}

interface DriverNotification {
  id: string;
  type: 'import' | 'export' | 'return' | 'fuel' | 'info';
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

interface DriverPortalProps {
  user: any;
}

export function DriverPortal({ user }: DriverPortalProps) {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [notifications, setNotifications] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const [driverData, setDriverData] = useState({
    truckNo: user.truckNo || 'N/A',
    doNo: user.currentDO || 'N/A',
    currentLocation: 'N/A',
    loadingPoint: 'N/A',
    offloadingPoint: 'N/A',
    destination: 'N/A',
    totalFuel: 0,
    extraFuel: 0,
    usedFuel: 0,
    remainingFuel: 0,
  });

  const [currentOrders, setCurrentOrders] = useState<DriverOrder[]>([]);
  const [completedOrders, setCompletedOrders] = useState<DriverOrder[]>([]);

  const fetchDriverData = async (truck: string) => {
    try {
      setLoading(true);

      // Fetch delivery orders for this truck
      const doResponse = await api.get(`/delivery-orders/truck/${truck}`);
      const deliveryOrders = doResponse.data.data || [];

      // Fetch fuel records for this truck
      const fuelResponse = await api.get(`/fuel-records?truckNo=${truck}&limit=100`);
      const fuelRecords = fuelResponse.data.data?.items || [];

      // Check if driver has any assignments
      if (deliveryOrders.length === 0 && fuelRecords.length === 0) {
        // No assignments yet
        setNotifications([{
          id: 'no-assignment',
          type: 'info',
          message: 'You have not been assigned any trips yet. Please check back later or contact dispatch.',
          timestamp: new Date().toISOString(),
          read: false,
        }]);
        setCurrentOrders([]);
        setCompletedOrders([]);
        setDriverData({
          truckNo: truck,
          doNo: 'N/A',
          currentLocation: 'N/A',
          loadingPoint: 'N/A',
          offloadingPoint: 'N/A',
          destination: 'N/A',
          totalFuel: 0,
          extraFuel: 0,
          usedFuel: 0,
          remainingFuel: 0,
        });
        setLoading(false);
        return;
      }

      // Process delivery orders into notifications
      const doNotifications: DriverNotification[] = deliveryOrders.slice(0, 10).map((order: any) => {
        let type: 'import' | 'export' | 'return' | 'info' = 'info';
        let message = '';

        if (order.importOrExport === 'IMPORT') {
          type = 'import';
          message = `🟢 IMPORT: Load at ${order.loadingPoint}, deliver to ${order.destination}`;
        } else if (order.importOrExport === 'EXPORT') {
          type = 'export';
          message = `🔵 EXPORT: Load at ${order.loadingPoint}, deliver to ${order.destination}`;
        }

        // Check for return DO (if there's a border entry or specific offloading point)
        if (order.borderEntryDRC || (order.offloadingPoint && order.offloadingPoint !== order.destination)) {
          type = 'return';
          const offloadPoint = order.offloadingPoint || order.borderEntryDRC || 'border';
          message = `🟠 RETURN: Offload at ${offloadPoint}, then reload and proceed to ${order.destination}`;
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

      // Process fuel records into notifications and orders
      const fuelNotifications: DriverNotification[] = fuelRecords.slice(0, 5).map((record: any) => ({
        id: `fuel-${record._id}`,
        type: 'fuel' as const,
        message: `⛽ Fuel Order: ${record.liters}L at ${record.fuelStation}`,
        timestamp: record.date,
        read: false,
        station: record.fuelStation,
        liters: record.liters,
        doNo: record.doNo,
      }));

      // Combine and sort notifications by date
      const allNotifications = [...doNotifications, ...fuelNotifications].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setNotifications(allNotifications);

      // Process fuel orders for current/history tabs
      const currentFuelOrders: DriverOrder[] = fuelRecords
        .filter((r: any) => r.status !== 'completed')
        .map((record: any) => ({
          id: record._id,
          station: record.fuelStation,
          liters: record.liters,
          status: 'upcoming' as const,
          distance: 'N/A',
          eta: 'En route',
          lpoNumber: record.lpoNumber,
          doNo: record.doNo,
        }));

      const completedFuelOrders: DriverOrder[] = fuelRecords
        .filter((r: any) => r.status === 'completed')
        .map((record: any) => ({
          id: record._id,
          station: record.fuelStation,
          liters: record.liters,
          status: 'completed' as const,
          distance: '0 km',
          eta: 'Completed',
          lpoNumber: record.lpoNumber,
          doNo: record.doNo,
        }));

      setCurrentOrders(currentFuelOrders);
      setCompletedOrders(completedFuelOrders);

      // Update driver data from latest DO
      if (deliveryOrders.length > 0) {
        const latestDO = deliveryOrders[0];
        
        // Calculate fuel data from fuel records
        const totalFuel = fuelRecords.reduce((sum: number, r: any) => sum + (r.liters || 0), 0);
        const usedFuel = fuelRecords
          .filter((r: any) => r.status === 'completed')
          .reduce((sum: number, r: any) => sum + (r.liters || 0), 0);

        setDriverData({
          truckNo: truck,
          doNo: latestDO.doNumber,
          currentLocation: latestDO.loadingPoint,
          loadingPoint: latestDO.loadingPoint,
          offloadingPoint: latestDO.destination,
          destination: latestDO.destination,
          totalFuel: totalFuel,
          extraFuel: 0,
          usedFuel: usedFuel,
          remainingFuel: totalFuel - usedFuel,
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch driver data:', error);
      toast.error('Failed to load driver information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const activeTruckNo = user.truckNo;
    
    if (activeTruckNo) {
      fetchDriverData(activeTruckNo);
      // Auto-refresh every 30 seconds
      const interval = setInterval(() => fetchDriverData(activeTruckNo), 30000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [user.truckNo]);

  const markNotificationRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Check if truck number is missing
  if (!user.truckNo) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="text-center">
            <Info className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Truck Number Required</h3>
            <p className="text-gray-600 mb-4">
              Your account doesn't have a truck number assigned. Please contact your supervisor to set up your truck number.
            </p>
            <div className="text-sm text-gray-500">
              User: {user.firstName} {user.lastName}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading && notifications.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your information...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Driver Portal</h1>
        <p className="text-gray-600">Welcome back! Here's your journey information.</p>
      </div>

      {/* Truck Info Card */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm opacity-90">Your Truck</div>
            <div className="text-2xl font-bold">{driverData.truckNo}</div>
            <div className="text-sm opacity-75">DO: {driverData.doNo}</div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Destination</div>
            <div className="text-xl font-bold">{driverData.destination}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-indigo-400">
          <div>
            <div className="text-xs opacity-75">Loading Point</div>
            <div className="text-sm">{driverData.loadingPoint}</div>
          </div>
          <div>
            <div className="text-xs opacity-75">Offloading Point</div>
            <div className="text-sm">{driverData.offloadingPoint}</div>
          </div>
        </div>
      </div>

      {/* Fuel Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Total Fuel</div>
              <div className="text-xl font-bold text-gray-900">{driverData.totalFuel}L</div>
            </div>
            <Fuel className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Extra Fuel</div>
              <div className="text-xl font-bold text-gray-900">{driverData.extraFuel}L</div>
            </div>
            <Fuel className="w-8 h-8 text-green-500" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Used Fuel</div>
              <div className="text-xl font-bold text-gray-900">{driverData.usedFuel}L</div>
            </div>
            <Fuel className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Remaining</div>
              <div className="text-xl font-bold text-gray-900">{driverData.remainingFuel}L</div>
            </div>
            <Fuel className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Bell className="w-5 h-5 mr-2 text-indigo-600" />
            Notifications & Orders
            {unreadCount > 0 && (
              <span className="ml-3 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                {unreadCount} New
              </span>
            )}
          </h3>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Info className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No notifications yet</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => markNotificationRead(notification.id)}
                className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 ${
                  notification.read ? 'bg-white' : 'bg-blue-50'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      notification.type === 'import'
                        ? 'bg-green-100'
                        : notification.type === 'export'
                        ? 'bg-blue-100'
                        : notification.type === 'return'
                        ? 'bg-orange-100'
                        : notification.type === 'fuel'
                        ? 'bg-yellow-100'
                        : 'bg-gray-100'
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
                    ) : notification.type === 'fuel' ? (
                      <Fuel className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <Info className="w-5 h-5 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded ${
                          notification.type === 'import'
                            ? 'bg-green-100 text-green-800'
                            : notification.type === 'export'
                            ? 'bg-blue-100 text-blue-800'
                            : notification.type === 'return'
                            ? 'bg-orange-100 text-orange-800'
                            : notification.type === 'fuel'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {notification.type.toUpperCase()}
                      </span>
                      {!notification.read && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-900 font-medium mb-1">
                      {notification.message}
                    </p>
                    {notification.doNo && (
                      <div className="text-xs text-gray-600 mb-1">
                        DO: <span className="font-semibold">{notification.doNo}</span>
                      </div>
                    )}
                    <div className="flex items-center text-xs text-gray-500">
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

      {/* Orders Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('current')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'current'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Current Orders ({currentOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              History ({completedOrders.length})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'current' && (
            <div className="space-y-4">
              {currentOrders.map((order) => (
                <div key={order.id} className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                        <MapPin className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{order.station}</div>
                        <div className="text-sm text-gray-600">{order.liters} liters • LPO: {order.lpoNumber}</div>
                        <div className="text-xs text-gray-500">DO: {order.doNo}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">{order.distance}</div>
                      <div className="text-xs text-gray-600 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        ETA: {order.eta}
                      </div>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mt-1">
                        Upcoming
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {completedOrders.map((order) => (
                <div key={order.id} className="bg-gray-50 p-4 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{order.station}</div>
                        <div className="text-sm text-gray-600">{order.liters} liters • LPO: {order.lpoNumber}</div>
                        <div className="text-xs text-gray-500">DO: {order.doNo}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Completed
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DriverPortal;