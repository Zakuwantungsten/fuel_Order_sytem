import { useState } from 'react';
import { Search, CheckCircle, XCircle, Fuel, Truck } from 'lucide-react';

interface StationOrder {
  id: string;
  lpoNumber: string;
  doNo: string;
  truckNo: string;
  liters: number;
  destination: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  date: string;
}

export function StationView({ user }: { user: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'fulfilled'>('all');

  const stationName = user.station || 'LAKE KAPIRI';

  const [orders, setOrders] = useState<StationOrder[]>([
    {
      id: '1',
      lpoNumber: '2356',
      doNo: '6638',
      truckNo: 'T710 EHJ',
      liters: 350,
      destination: 'DAR',
      status: 'pending',
      date: '2025-11-28',
    },
    {
      id: '2',
      lpoNumber: '2356',
      doNo: '6842',
      truckNo: 'T709 EHJ',
      liters: 350,
      destination: 'DAR',
      status: 'pending',
      date: '2025-11-28',
    },
    {
      id: '3',
      lpoNumber: '2356',
      doNo: '6826',
      truckNo: 'T531 DRF',
      liters: 350,
      destination: 'DAR',
      status: 'fulfilled',
      date: '2025-11-28',
    },
  ]);

  const handleMarkFulfilled = (orderId: string) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId ? { ...order, status: 'fulfilled' as const } : order
      )
    );
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.doNo.includes(searchTerm) ||
      order.lpoNumber.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    return matchesSearch && matchesStatus && order.status !== 'cancelled';
  });

  const stats = {
    pending: orders.filter((o) => o.status === 'pending').length,
    fulfilled: orders.filter((o) => o.status === 'fulfilled').length,
    totalLiters: orders
      .filter((o) => o.status === 'pending')
      .reduce((sum, o) => sum + o.liters, 0),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-gray-900 mb-2">{stationName} - Station Orders</h1>
        <p className="text-gray-600">
          {user.role === 'fuel_attendant' ? 'Fuel Attendant View' : 'Station Manager View'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Pending Orders</div>
              <div className="text-2xl text-gray-900 mt-1">{stats.pending}</div>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Fulfilled Today</div>
              <div className="text-2xl text-gray-900 mt-1">{stats.fulfilled}</div>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Pending Liters</div>
              <div className="text-2xl text-gray-900 mt-1">{stats.totalLiters} L</div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Fuel className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by truck number, DO, or LPO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex space-x-2">
            {['all', 'pending', 'fulfilled'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filterStatus === status
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  LPO No.
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  DO No.
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Truck No.
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Liters
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Destination
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {order.lpoNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{order.doNo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      <Truck className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-gray-900">{order.truckNo}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      <Fuel className="w-4 h-4 text-blue-500 mr-2" />
                      <span className="text-gray-900">{order.liters} L</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {order.destination}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        order.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {order.status === 'pending' ? 'Pending' : 'Fulfilled'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {order.status === 'pending' ? (
                      <button
                        onClick={() => handleMarkFulfilled(order.id)}
                        className="flex items-center px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Mark Fulfilled
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No orders found</p>
          </div>
        )}
      </div>

      {/* Important Notice */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm text-blue-900">Station Attendant Instructions</h3>
            <div className="mt-2 text-sm text-blue-800">
              <ul className="list-disc list-inside space-y-1">
                <li>Verify truck number matches the order before fueling</li>
                <li>Check DO number with the driver</li>
                <li>Mark order as fulfilled after completing fuel dispensing</li>
                <li>Report any discrepancies immediately to the manager</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
