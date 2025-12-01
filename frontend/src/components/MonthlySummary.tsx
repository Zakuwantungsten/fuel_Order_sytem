import { useState, useEffect, useMemo } from 'react';
import { Download, Calendar, Filter, Fuel, DollarSign } from 'lucide-react';
import { DeliveryOrder, FuelRecord, LPOEntry } from '../types';
import { exportToCSV } from '../utils/csvParser';

interface MonthlySummaryProps {
  orders: DeliveryOrder[];
  fuelRecords?: FuelRecord[];
  lpoEntries?: LPOEntry[];
}

interface SummaryData {
  month: string;
  totalOrders: number;
  totalImport: number;
  totalExport: number;
  totalTonnage: number;
  totalRevenue: number;
  totalFuelConsumed: number;
  totalFuelCost: number;
  avgFuelPerOrder: number;
  byClient: Record<string, {
    orders: number;
    tonnage: number;
    revenue: number;
  }>;
  byDestination: Record<string, number>;
}

interface GroupedOrders {
  [key: string]: DeliveryOrder[];
}

const MonthlySummary = ({ orders, fuelRecords = [], lpoEntries = [] }: MonthlySummaryProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [groupBy, setGroupBy] = useState<'none' | 'client' | 'destination'>('none');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  useEffect(() => {
    if (orders.length > 0) {
      // Get unique months from orders
      const months = [...new Set(orders.map(o => {
        // Extract month from date (e.g., "3-Oct" -> "Oct")
        const parts = o.date.split('-');
        return parts.length > 1 ? parts[1] : o.date;
      }))];
      
      setAvailableMonths(months);
      
      if (months.length > 0 && !selectedMonth) {
        setSelectedMonth(months[0]);
      }
    }
  }, [orders, selectedMonth]);

  const summary = useMemo(() => {
    if (!selectedMonth || orders.length === 0) return null;
    
    const monthOrders = orders.filter(o => o.date.includes(selectedMonth));
    
    // Calculate fuel metrics for the month
    const monthFuelRecords = fuelRecords.filter(r => r.date.includes(selectedMonth));
    const monthLpoEntries = lpoEntries.filter(l => l.date.includes(selectedMonth));
    
    const totalFuelConsumed = monthFuelRecords.reduce((sum, r) => sum + r.totalLts + (r.extra || 0), 0);
    const totalFuelCost = monthLpoEntries.reduce((sum, l) => sum + (l.ltrs * l.pricePerLtr), 0);
    const avgFuelPerOrder = monthOrders.length > 0 ? totalFuelConsumed / monthOrders.length : 0;
    
    const summaryData: SummaryData = {
      month: selectedMonth,
      totalOrders: monthOrders.length,
      totalImport: monthOrders.filter(o => o.importOrExport === 'IMPORT').length,
      totalExport: monthOrders.filter(o => o.importOrExport === 'EXPORT').length,
      totalTonnage: monthOrders.reduce((sum, o) => sum + o.tonnages, 0),
      totalRevenue: monthOrders.reduce((sum, o) => sum + (o.tonnages * o.ratePerTon), 0),
      totalFuelConsumed,
      totalFuelCost,
      avgFuelPerOrder,
      byClient: {},
      byDestination: {},
    };

    // Group by client
    monthOrders.forEach(order => {
      if (!summaryData.byClient[order.clientName]) {
        summaryData.byClient[order.clientName] = {
          orders: 0,
          tonnage: 0,
          revenue: 0,
        };
      }
      summaryData.byClient[order.clientName].orders += 1;
      summaryData.byClient[order.clientName].tonnage += order.tonnages;
      summaryData.byClient[order.clientName].revenue += (order.tonnages * order.ratePerTon);
    });

    // Group by destination
    monthOrders.forEach(order => {
      if (!summaryData.byDestination[order.destination]) {
        summaryData.byDestination[order.destination] = 0;
      }
      summaryData.byDestination[order.destination] += 1;
    });

    return summaryData;
  }, [selectedMonth, orders, fuelRecords, lpoEntries]);

  const handleExportSummary = () => {
    if (!summary) return;

    const monthOrders = getMonthOrders();
    
    // Export in Excel format similar to DAILY_DO CSV
    const exportData = monthOrders.map((order) => ({
      'S/N': order.doNumber,
      'DATE': order.date,
      'IMPORT OR EXPORT': order.importOrExport,
      'D.O No.': `${order.doType || 'DO'}-${order.doNumber}`,
      'Invoice Nos': order.invoiceNos || '',
      'CLIENT NAME': order.clientName,
      'TRUCK No.': order.truckNo,
      'TRAILER No.': order.trailerNo,
      'CONTAINER No.': order.containerNo || 'LOOSE CARGO',
      'BORDER ENTRY DRC': order.borderEntryDRC || '',
      'LOADING POINT': order.loadingPoint || '',
      'DESTINATION': order.destination,
      'HAULIER': order.haulier || '',
      'TONNAGES': order.tonnages,
      'RATE PER TON': order.ratePerTon,
      'RATE': order.tonnages * order.ratePerTon,
    }));

    exportToCSV(exportData, `DO_Summary_${summary.month}_2025.csv`);
  };

  const getMonthOrders = (): DeliveryOrder[] => {
    return orders.filter(o => o.date.includes(selectedMonth));
  };

  const getGroupedOrders = (): GroupedOrders => {
    const monthOrders = getMonthOrders();
    
    if (groupBy === 'none') {
      return { 'All Orders': monthOrders };
    }
    
    const grouped: GroupedOrders = {};
    
    monthOrders.forEach(order => {
      const key = groupBy === 'client' ? order.clientName : order.destination;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(order);
    });
    
    return grouped;
  };

  if (!summary) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Select a month to view summary
      </div>
    );
  }

  const groupedOrders = getGroupedOrders();

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 p-4 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              DO Summary - {summary.month} 2025
            </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Month Selector */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors"
            >
              {availableMonths.map(month => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('summary')}
                className={`px-4 py-2 text-sm font-medium ${
                  viewMode === 'summary'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                } transition-colors`}
              >
                Summary
              </button>
              <button
                onClick={() => setViewMode('detailed')}
                className={`px-4 py-2 text-sm font-medium border-l border-gray-300 dark:border-gray-600 ${
                  viewMode === 'detailed'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                } transition-colors`}
              >
                Detailed
              </button>
            </div>

            {/* Group By Selector (only in detailed view) */}
            {viewMode === 'detailed' && (
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors"
                >
                  <option value="none">No Grouping</option>
                  <option value="client">Group by Client</option>
                  <option value="destination">Group by Destination</option>
                </select>
              </div>
            )}

            {/* Export Button */}
            <button
              onClick={handleExportSummary}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics - Always visible */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.totalOrders}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-blue-600 dark:text-blue-400">Import</p>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summary.totalImport}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-green-600 dark:text-green-400">Export</p>
          <p className="text-2xl font-bold text-green-900 dark:text-green-100">{summary.totalExport}</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-purple-600 dark:text-purple-400">Total Tonnage</p>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{summary.totalTonnage.toFixed(1)}</p>
        </div>
        <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-primary-600 dark:text-primary-400">Total Revenue</p>
          <p className="text-2xl font-bold text-primary-900 dark:text-primary-100">${summary.totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-orange-600 dark:text-orange-400">Fuel Consumed</p>
            <Fuel className="w-5 h-5 text-orange-400 dark:text-orange-300" />
          </div>
          <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{summary.totalFuelConsumed.toLocaleString()} L</p>
          <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Avg: {summary.avgFuelPerOrder.toFixed(0)} L/order</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-yellow-600 dark:text-yellow-400">Fuel Cost</p>
            <DollarSign className="w-5 h-5 text-yellow-400 dark:text-yellow-300" />
          </div>
          <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">TZS {summary.totalFuelCost.toLocaleString()}</p>
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
            {summary.totalFuelConsumed > 0 && `${(summary.totalFuelCost / summary.totalFuelConsumed).toFixed(2)} per L`}
          </p>
        </div>
      </div>

      {/* Summary View */}
      {viewMode === 'summary' && (
        <>
          {/* Client Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Summary by Client</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Client Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Orders
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Tonnage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Revenue
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(summary.byClient)
                    .sort((a, b) => b[1].revenue - a[1].revenue)
                    .map(([client, data]) => (
                      <tr key={client} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {client}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {data.orders}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {data.tonnage.toFixed(1)} tons
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-primary-600 dark:text-primary-400">
                          ${data.revenue.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Destination Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orders by Destination</h4>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(summary.byDestination)
                  .sort((a, b) => b[1] - a[1])
                  .map(([destination, count]) => (
                    <div key={destination} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg transition-colors">
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{destination}</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{count} orders</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detailed View - Excel-like Table */}
      {viewMode === 'detailed' && (
        <div className="space-y-4">
          {Object.entries(groupedOrders).map(([groupName, groupOrders]) => (
            <div key={groupName} className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
              {groupBy !== 'none' && (
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {groupName} ({groupOrders.length} orders)
                  </h4>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        S/N
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Import/Export
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        D.O No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Client Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Truck No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Trailer No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Container No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Loading Point
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Destination
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Haulier
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Tonnages
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Rate/Ton
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {groupOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {order.doNumber}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.date}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            order.importOrExport === 'IMPORT' 
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' 
                              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {order.importOrExport}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {order.doType || 'DO'}-{order.doNumber}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {order.clientName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.truckNo}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.trailerNo}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.containerNo || 'LOOSE CARGO'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.loadingPoint || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.destination}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {order.haulier || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                          {order.tonnages}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                          ${order.ratePerTon}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-primary-600 dark:text-primary-400">
                          ${(order.tonnages * order.ratePerTon).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {/* Group Totals */}
                    <tr className="bg-gray-50 dark:bg-gray-700 font-semibold">
                      <td colSpan={11} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                        Subtotal:
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {groupOrders.reduce((sum, o) => sum + o.tonnages, 0).toFixed(1)}
                      </td>
                      <td className="px-4 py-3"></td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-primary-600 dark:text-primary-400">
                        ${groupOrders.reduce((sum, o) => sum + (o.tonnages * o.ratePerTon), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MonthlySummary;
