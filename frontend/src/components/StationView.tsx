import { useState } from 'react';
import { Search, CheckCircle, XCircle, Fuel, Truck, MapPin } from 'lucide-react';
import Pagination from './Pagination';

interface StationOrder {
  id: string;
  lpoNumber: string;
  doNo: string;
  truckNo: string;
  liters: number;
  destination: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  date: string;
  driverName?: string;
  estimatedArrival?: string;
}

interface StationViewProps {
  user: any;
}

export function StationView({ user }: StationViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'fulfilled'>('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

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
      driverName: 'John Mwanza',
      estimatedArrival: '14:30',
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
      driverName: 'Peter Banda',
      estimatedArrival: '15:45',
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
      driverName: 'James Sikombe',
      estimatedArrival: '12:00',
    },
    {
      id: '4',
      lpoNumber: '2357',
      doNo: '6830',
      truckNo: 'T699 DXY',
      liters: 400,
      destination: 'KOLWEZI',
      status: 'pending',
      date: '2025-11-28',
      driverName: 'Michael Tembo',
      estimatedArrival: '16:30',
    },
  ]);

  const handleMarkFulfilled = (orderId: string) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId ? { ...order, status: 'fulfilled' as const } : order
      )
    );
  };

  const handleCancelOrder = (orderId: string) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId ? { ...order, status: 'cancelled' as const } : order
      )
    );
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.doNo.includes(searchTerm) ||
      order.lpoNumber.includes(searchTerm) ||
      order.driverName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
    return matchesSearch && matchesStatus && order.status !== 'cancelled';
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (value: 'all' | 'pending' | 'fulfilled') => {
    setFilterStatus(value);
    setCurrentPage(1);
  };

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">{stationName} - Station Orders</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {user.role === 'fuel_attendant' ? 'Fuel Attendant View' : 'Station Manager View'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Pending Orders</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.pending}</div>
            </div>
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Fulfilled Today</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.fulfilled}</div>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Liters Pending</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalLiters}L</div>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Fuel className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by truck, DO, LPO, or driver..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
          </div>
          <div className="flex space-x-2">
            <select
              value={filterStatus}
              onChange={(e) => handleFilterStatusChange(e.target.value as 'all' | 'pending' | 'fulfilled')}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="fulfilled">Fulfilled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fuel Orders</h3>
        </div>
        
        {/* Table View - Desktop/Laptop (md and up) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Truck Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Order Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Driver & ETA
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Fuel Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                        <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{order.truckNo}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                          <MapPin className="w-3 h-3 mr-1" />
                          {order.destination}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">DO: {order.doNo}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">LPO: {order.lpoNumber}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-gray-100">{order.driverName}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">ETA: {order.estimatedArrival}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Fuel className="w-4 h-4 text-blue-500 dark:text-blue-400 mr-1" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{order.liters}L</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        order.status === 'fulfilled'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          : order.status === 'pending'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                      }`}
                    >
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {order.status === 'pending' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleMarkFulfilled(order.id)}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Fulfill
                        </button>
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Card View - Mobile/Tablet (below md) */}
        <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
          {paginatedOrders.map((order) => (
            <div key={order.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="space-y-3">
                {/* Header: Truck Number & Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                      <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.truckNo}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-0.5">
                        <MapPin className="w-3 h-3 mr-1" />
                        {order.destination}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${
                      order.status === 'fulfilled'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                        : order.status === 'pending'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                    }`}
                  >
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>

                {/* Order Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">DO Number</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{order.doNo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">LPO Number</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{order.lpoNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Driver Name</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{order.driverName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">ETA</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{order.estimatedArrival}</p>
                  </div>
                </div>

                {/* Fuel Amount */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center">
                    <Fuel className="w-4 h-4 text-blue-500 dark:text-blue-400 mr-1.5" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{order.liters}L</span>
                  </div>

                  {/* Actions */}
                  {order.status === 'pending' && (
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleMarkFulfilled(order.id)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Fulfill
                      </button>
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Pagination */}
        {filteredOrders.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredOrders.length}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        )}
      </div>
    </div>
  );
}

export default StationView;