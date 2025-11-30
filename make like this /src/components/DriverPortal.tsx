import { useState } from 'react';
import { MapPin, Fuel, Bell, CheckCircle, AlertCircle, Navigation } from 'lucide-react';

interface DriverOrder {
  id: string;
  station: string;
  liters: number;
  status: 'pending' | 'completed' | 'upcoming';
  distance: string;
  eta: string;
}

export function DriverPortal({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // Sample driver data
  const driverData = {
    truckNo: 'T699 DXY',
    doNo: '6038',
    currentLocation: 'Dar es Salaam',
    loadingPoint: 'TCC Container Terminal',
    offloadingPoint: 'Kolwezi, DRC',
    destination: 'KOLWEZI',
    totalFuel: 2400,
    extraFuel: 100,
    usedFuel: 1100,
    remainingFuel: 1400,
  };

  const currentOrders: DriverOrder[] = [
    {
      id: '1',
      station: 'LAKE KAPIRI',
      liters: 350,
      status: 'upcoming',
      distance: '420 km',
      eta: '5 hours',
    },
    {
      id: '2',
      station: 'LAKE NDOLA',
      liters: 50,
      status: 'upcoming',
      distance: '470 km',
      eta: '6 hours',
    },
  ];

  const completedOrders: DriverOrder[] = [
    {
      id: '3',
      station: 'DAR YARD',
      liters: 550,
      status: 'completed',
      distance: '0 km',
      eta: 'Completed',
    },
    {
      id: '4',
      station: 'MBEYA',
      liters: 450,
      status: 'completed',
      distance: '0 km',
      eta: 'Completed',
    },
  ];

  const notifications = [
    { id: '1', message: 'Fuel order ready at LAKE KAPIRI', time: '2 hours ago', read: false },
    { id: '2', message: 'Route update: Use alternative route via Mpika', time: '5 hours ago', read: true },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-gray-900 mb-2">Driver Portal</h1>
        <p className="text-gray-600">Welcome back! Here's your journey information.</p>
      </div>

      {/* Truck Info Card */}
      <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-lg p-6 text-white mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm opacity-90">Your Truck</div>
            <div className="text-2xl">{driverData.truckNo}</div>
            <div className="text-sm opacity-75">DO: {driverData.doNo}</div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Destination</div>
            <div className="text-xl">{driverData.destination}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fuel Status */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-gray-900 mb-4">Fuel Status</h2>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Allocated</div>
                <div className="text-xl text-gray-900">{driverData.totalFuel + driverData.extraFuel} L</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Used</div>
                <div className="text-xl text-gray-900">{driverData.usedFuel} L</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Remaining</div>
                <div className="text-xl text-gray-900">{driverData.remainingFuel} L</div>
              </div>
            </div>

            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div className="text-xs text-gray-600">Fuel Progress</div>
                <div className="text-xs text-gray-600">
                  {Math.round((driverData.usedFuel / (driverData.totalFuel + driverData.extraFuel)) * 100)}%
                </div>
              </div>
              <div className="overflow-hidden h-2 text-xs flex rounded bg-gray-200">
                <div
                  style={{
                    width: `${(driverData.usedFuel / (driverData.totalFuel + driverData.extraFuel)) * 100}%`,
                  }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500"
                ></div>
              </div>
            </div>
          </div>

          {/* Orders Tabs */}
          <div className="bg-white rounded-lg shadow">
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('current')}
                  className={`flex-1 px-6 py-4 text-sm ${
                    activeTab === 'current'
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Upcoming Orders
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 px-6 py-4 text-sm ${
                    activeTab === 'history'
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Completed Orders
                </button>
              </div>
            </div>

            <div className="p-6">
              {activeTab === 'current' ? (
                <div className="space-y-4">
                  {currentOrders.map((order, idx) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3 mt-1">
                            {idx + 1}
                          </div>
                          <div>
                            <h3 className="text-gray-900">{order.station}</h3>
                            <div className="text-sm text-gray-500 mt-1">
                              <Fuel className="w-4 h-4 inline mr-1" />
                              {order.liters} Liters
                            </div>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                          Upcoming
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 rounded p-3">
                        <div className="flex items-center">
                          <Navigation className="w-4 h-4 mr-2" />
                          {order.distance}
                        </div>
                        <div>ETA: {order.eta}</div>
                      </div>

                      <button className="w-full mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
                        View Order Details
                      </button>
                    </div>
                  ))}

                  {currentOrders.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No upcoming fuel orders</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {completedOrders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center">
                        <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                        <div>
                          <div className="text-sm text-gray-900">{order.station}</div>
                          <div className="text-xs text-gray-500">{order.liters} Liters</div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">Completed</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Notifications */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-900">Notifications</h2>
              <Bell className="w-5 h-5 text-gray-400" />
            </div>

            <div className="space-y-3">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3 rounded-lg border ${
                    notif.read ? 'border-gray-200 bg-white' : 'border-indigo-200 bg-indigo-50'
                  }`}
                >
                  <div className="text-sm text-gray-900 mb-1">{notif.message}</div>
                  <div className="text-xs text-gray-500">{notif.time}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-gray-900 mb-4">Quick Actions</h2>

            <div className="space-y-2">
              <button className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-left text-sm">
                <MapPin className="w-4 h-4 inline mr-2" />
                View Route Map
              </button>
              <button className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-left text-sm">
                <Fuel className="w-4 h-4 inline mr-2" />
                Request Emergency Fuel
              </button>
              <button className="w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 text-left text-sm">
                <Bell className="w-4 h-4 inline mr-2" />
                Report Issue
              </button>
            </div>
          </div>

          {/* Journey Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-gray-900 mb-4">Journey Info</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Current Location</span>
                <span className="text-gray-900">{driverData.currentLocation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">DO Number</span>
                <span className="text-gray-900">{driverData.doNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Truck Number</span>
                <span className="text-gray-900">{driverData.truckNo}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
