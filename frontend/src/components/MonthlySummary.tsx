import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Calendar, Filter, Fuel, DollarSign, ChevronDown, Check } from 'lucide-react';
import { DeliveryOrder, FuelRecord, LPOEntry } from '../types';
import { exportToXLSX } from '../utils/csvParser';

interface MonthlySummaryProps {
  orders: DeliveryOrder[];
  fuelRecords?: FuelRecord[];
  lpoEntries?: LPOEntry[];
  doType?: 'DO' | 'SDO' | 'ALL'; // Filter by order type
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

const MonthlySummary = ({ orders, fuelRecords = [], lpoEntries = [], doType = 'DO' }: MonthlySummaryProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [groupBy, setGroupBy] = useState<'none' | 'client' | 'destination'>('none');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);

  // Dropdown states
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);

  // Refs for click-outside detection
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const groupByDropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
      if (groupByDropdownRef.current && !groupByDropdownRef.current.contains(event.target as Node)) {
        setShowGroupByDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter orders by doType
  const filteredOrders = useMemo(() => {
    if (doType === 'ALL') return orders;
    return orders.filter(o => o.doType === doType);
  }, [orders, doType]);

  useEffect(() => {
    if (filteredOrders.length > 0) {
      // Get unique months from orders
      const months = [...new Set(filteredOrders.map(o => {
        // Extract month from date (e.g., "3-Oct" -> "Oct")
        const parts = o.date.split('-');
        return parts.length > 1 ? parts[1] : o.date;
      }))];
      
      setAvailableMonths(months);
      
      if (months.length > 0 && !selectedMonth) {
        setSelectedMonth(months[0]);
      }
    }
  }, [filteredOrders, selectedMonth]);

  const summary = useMemo(() => {
    if (!selectedMonth || filteredOrders.length === 0) return null;
    
    const monthOrders = filteredOrders.filter(o => o.date.includes(selectedMonth) && !o.isCancelled);
    
    // Calculate fuel metrics for the month
    const monthFuelRecords = fuelRecords.filter(r => r.date.includes(selectedMonth));
    const monthLpoEntries = lpoEntries.filter(l => l.date.includes(selectedMonth));
    
    const totalFuelConsumed = monthFuelRecords.reduce((sum, r) => sum + (r.totalLts || 0) + (r.extra || 0), 0);
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
  }, [selectedMonth, filteredOrders, fuelRecords, lpoEntries]);

  const handleExportSummary = () => {
    if (!summary) return;

    const monthOrders = getMonthOrders();
    
    // Export in Excel format similar to DAILY_DO CSV
    const exportData = monthOrders.map((order, index) => ({
      'S/N': index + 1,
      'DATE': order.date,
      'IMPORT OR EXPORT': order.importOrExport,
      'D.O No.': order.doNumber,
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

    const orderTypeLabel = doType === 'SDO' ? 'SDO' : doType === 'ALL' ? 'All_Orders' : 'DO';
    const sheetLabel = doType === 'SDO' ? 'SDO Summary' : doType === 'ALL' ? 'All Orders Summary' : 'DO Summary';

    exportToXLSX(exportData, `${orderTypeLabel}_Summary_${summary.month}_2025.xlsx`, {
      sheetName: `${sheetLabel} ${summary.month}`,
      headerColor: '4472C4',
      addBorders: true,
    });
  };

  const getMonthOrders = (): DeliveryOrder[] => {
    return filteredOrders.filter(o => o.date.includes(selectedMonth) && !o.isCancelled);
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
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {doType === 'SDO' ? 'SDO' : doType === 'ALL' ? 'All Orders' : 'DO'} Summary - {summary.month} 2025
              </h3>
              {doType !== 'ALL' && (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${doType === 'SDO' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'}`}>
                  {doType}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Month Selector */}
            <div className="relative" ref={monthDropdownRef}>
              <button
                type="button"
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors flex items-center gap-2"
              >
                <span>{selectedMonth}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showMonthDropdown && (
                <div className="absolute z-50 mt-1 w-full min-w-[120px] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                  {availableMonths.map(month => (
                    <button
                      key={month}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(month);
                        setShowMonthDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>{month}</span>
                      {selectedMonth === month && <Check className="w-4 h-4 text-primary-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                <div className="relative" ref={groupByDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowGroupByDropdown(!showGroupByDropdown)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors flex items-center gap-2"
                  >
                    <span>
                      {groupBy === 'none' ? 'No Grouping' : 
                       groupBy === 'client' ? 'Group by Client' : 
                       'Group by Destination'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  {showGroupByDropdown && (
                    <div className="absolute z-50 mt-1 w-full min-w-[180px] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                      {[{value: 'none', label: 'No Grouping'}, {value: 'client', label: 'Group by Client'}, {value: 'destination', label: 'Group by Destination'}].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setGroupBy(option.value as any);
                            setShowGroupByDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                        >
                          <span>{option.label}</span>
                          {groupBy === option.value && <Check className="w-4 h-4 text-primary-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
      <div className={`grid grid-cols-1 md:grid-cols-3 ${doType === 'SDO' ? 'lg:grid-cols-5' : 'lg:grid-cols-7'} gap-4`}>
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
        {doType !== 'SDO' && (
          <React.Fragment key="fuel-metrics">
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
          </React.Fragment>
        )}
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
                <table className="min-w-full text-sm border border-gray-300 dark:border-gray-600">
                  <thead>
                    <tr className="bg-primary-600 dark:bg-primary-700">
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        S/N
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Import/Export
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        D.O No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Client Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Truck No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Trailer No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Container No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Loading Point
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Destination
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Haulier
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Tonnages
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Rate/Ton
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-white uppercase tracking-wider border border-gray-300 dark:border-gray-500">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800">
                    {groupOrders.map((order, index) => (
                      <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                          {index + 1}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.date}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm border border-gray-300 dark:border-gray-600">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            order.importOrExport === 'IMPORT' 
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' 
                              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {order.importOrExport}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                          {order.doNumber}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                          {order.clientName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.truckNo}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.trailerNo}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.containerNo || 'LOOSE CARGO'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.loadingPoint || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.destination}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600">
                          {order.haulier || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                          {order.tonnages}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                          ${order.ratePerTon}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-primary-600 dark:text-primary-400 border border-gray-300 dark:border-gray-600">
                          ${(order.tonnages * order.ratePerTon).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {/* Group Totals */}
                    <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
                      <td colSpan={11} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                        Subtotal:
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600">
                        {groupOrders.reduce((sum, o) => sum + o.tonnages, 0).toFixed(1)}
                      </td>
                      <td className="px-4 py-3 border border-gray-300 dark:border-gray-600"></td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-primary-600 dark:text-primary-400 border border-gray-300 dark:border-gray-600">
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
