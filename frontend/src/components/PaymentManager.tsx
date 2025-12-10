import { useState } from 'react';
import { Search, XCircle, CheckCircle, AlertTriangle, DollarSign } from 'lucide-react';
import Pagination from './Pagination';

interface PaymentOrder {
  id: string;
  lpoNumber: string;
  station: string;
  truckNo: string;
  doNo: string;
  liters: number;
  amount: number;
  status: 'active' | 'cancelled' | 'paid';
  date: string;
  reason?: string;
}

export function PaymentManager({ user: _user }: { user: any }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [orders, setOrders] = useState<PaymentOrder[]>([
    {
      id: '1',
      lpoNumber: '2356',
      station: 'LAKE KAPIRI',
      truckNo: 'T710 EHJ',
      doNo: '6638',
      liters: 350,
      amount: 420,
      status: 'active',
      date: '2025-11-28',
    },
    {
      id: '2',
      lpoNumber: '2356',
      station: 'LAKE KAPIRI',
      truckNo: 'T709 EHJ',
      doNo: '6842',
      liters: 350,
      amount: 420,
      status: 'active',
      date: '2025-11-28',
    },
    {
      id: '3',
      lpoNumber: '2355',
      station: 'LAKE NDOLA',
      truckNo: 'T531 DRF',
      doNo: '6826',
      liters: 50,
      amount: 60,
      status: 'cancelled',
      date: '2025-11-27',
      reason: 'Station out of fuel',
    },
  ]);

  const handleCancelOrder = (orderId: string, reason: string) => {
    setOrders(
      orders.map((order) =>
        order.id === orderId ? { ...order, status: 'cancelled' as const, reason } : order
      )
    );
    setShowCancelModal(false);
    setSelectedOrder(null);
  };

  const handlePayOrder = (orderId: string) => {
    setOrders(
      orders.map((order) => (order.id === orderId ? { ...order, status: 'paid' as const } : order))
    );
  };

  const filteredOrders = orders.filter(
    (order) =>
      order.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.lpoNumber.includes(searchTerm) ||
      order.station.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const stats = {
    active: orders.filter((o) => o.status === 'active').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
    totalAmount: orders.filter((o) => o.status === 'active').reduce((sum, o) => sum + o.amount, 0),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-gray-900 dark:text-gray-100 mb-2">Payment & Order Management</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage fuel orders and handle alternative payments</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Active Orders</div>
              <div className="text-2xl text-gray-900 dark:text-gray-100 mt-1">{stats.active}</div>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Cancelled Orders</div>
              <div className="text-2xl text-gray-900 dark:text-gray-100 mt-1">{stats.cancelled}</div>
            </div>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Pending Amount</div>
              <div className="text-2xl text-gray-900 dark:text-gray-100 mt-1">${stats.totalAmount}</div>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow transition-colors mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
          <input
            type="text"
            placeholder="Search by truck number, LPO, or station..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
          />
        </div>
      </div>

      {/* Orders Table/Cards */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
        {/* Card View - Mobile/Tablet (below lg) */}
        <div className="lg:hidden space-y-3 p-4">
          {paginatedOrders.map((order) => (
            <div
              key={order.id}
              className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    {order.lpoNumber}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{order.station}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    ${order.amount}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{order.liters}L</p>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Truck:</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{order.truckNo}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">DO:</span>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{order.doNo}</p>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    order.status === 'active'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : order.status === 'cancelled'
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                  }`}
                >
                  {order.status.toUpperCase()}
                </span>
                {order.reason && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center" title={order.reason}>
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    See reason
                  </span>
                )}
              </div>

              {/* Actions */}
              {order.status === 'active' && (
                <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <button
                    onClick={() => handlePayOrder(order.id)}
                    className="flex-1 px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 inline-flex items-center justify-center"
                  >
                    <DollarSign className="w-4 h-4 mr-1" />
                    Pay
                  </button>
                  <button
                    onClick={() => {
                      setSelectedOrder(order);
                      setShowCancelModal(true);
                    }}
                    className="flex-1 px-3 py-2 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 inline-flex items-center justify-center"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Cancel
                  </button>
                </div>
              )}
              {order.status === 'cancelled' && order.reason && (
                <div className="text-xs text-gray-500 dark:text-gray-400 italic pt-3 border-t border-gray-200 dark:border-gray-600">
                  Reason: {order.reason}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Table View - Desktop (lg and up) */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  LPO No.
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Station
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Truck No.
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  DO No.
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Liters
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {order.lpoNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{order.station}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{order.truckNo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{order.doNo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{order.liters} L</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">${order.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          order.status === 'active'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : order.status === 'cancelled'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                        }`}
                      >
                        {order.status.toUpperCase()}
                      </span>
                      {order.reason && (
                        <span className="ml-2 text-xs text-gray-500" title={order.reason}>
                          <AlertTriangle className="w-4 h-4 inline" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex space-x-2">
                      {order.status === 'active' && (
                        <>
                          <button
                            onClick={() => handlePayOrder(order.id)}
                            className="flex items-center px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs"
                          >
                            <DollarSign className="w-3 h-3 mr-1" />
                            Pay
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOrder(order);
                              setShowCancelModal(true);
                            }}
                            className="flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Cancel
                          </button>
                        </>
                      )}
                      {order.status === 'cancelled' && order.reason && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{order.reason}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* Cancel Order Modal */}
      {showCancelModal && selectedOrder && (
        <CancelOrderModal
          order={selectedOrder}
          onClose={() => {
            setShowCancelModal(false);
            setSelectedOrder(null);
          }}
          onCancel={handleCancelOrder}
        />
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg transition-colors">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm text-yellow-900 dark:text-yellow-200">Payment Manager Responsibilities</h3>
            <div className="mt-2 text-sm text-yellow-800 dark:text-yellow-300">
              <ul className="list-disc list-inside space-y-1">
                <li>Cancel orders when assigned station is out of fuel</li>
                <li>Arrange alternative payment at other stations</li>
                <li>Update fuel records after cancellation or alternative payment</li>
                <li>Coordinate with station managers for fuel availability</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CancelOrderModal({
  order,
  onClose,
  onCancel,
}: {
  order: PaymentOrder;
  onClose: () => void;
  onCancel: (orderId: string, reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const predefinedReasons = [
    'Station out of fuel',
    'Truck breakdown',
    'Route change',
    'Driver emergency',
    'Payment to alternative station',
    'Other',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = reason === 'Other' ? customReason : reason;
    onCancel(order.id, finalReason);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md transition-colors">
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-gray-900 dark:text-gray-100">Cancel Order</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Order Details:</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">LPO:</span>
                <span className="text-gray-900 dark:text-gray-100">{order.lpoNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Truck:</span>
                <span className="text-gray-900 dark:text-gray-100">{order.truckNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Station:</span>
                <span className="text-gray-900 dark:text-gray-100">{order.station}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                <span className="text-gray-900 dark:text-gray-100">${order.amount}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">Cancellation Reason</label>
              <select
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
              >
                <option value="">Select a reason</option>
                {predefinedReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {reason === 'Other' && (
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">Specify Reason</label>
                <textarea
                  required
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                  rows={3}
                  placeholder="Enter the reason for cancellation..."
                />
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Cancel Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PaymentManager;