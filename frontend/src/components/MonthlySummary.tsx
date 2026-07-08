import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Calendar, Filter, Fuel, DollarSign, ChevronDown, Check, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { DeliveryOrder, FuelRecord, LPOEntry } from '../types';
import { exportToXLSXMultiSheet } from '../utils/csvParser';
import {
  useDOAvailablePeriods,
  useDOSummaryAggregate,
  useAllDeliveryOrders,
  fetchAllDeliveryOrders,
} from '../hooks/useDeliveryOrders';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Jan-2026" -> { dateFrom: "2026-01-01", dateTo: "2026-01-31" }
const monthYearToRange = (monthYear: string): { dateFrom: string; dateTo: string } | null => {
  const [mon, yearStr] = monthYear.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = MONTH_ABBR.indexOf(mon);
  if (monthIdx < 0 || isNaN(year)) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return { dateFrom: `${year}-${mm}-01`, dateTo: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
};

interface MonthlySummaryProps {
  importOrExport?: string;        // 'ALL' | 'IMPORT' | 'EXPORT'
  doType?: 'DO' | 'SDO' | 'ALL';  // Filter by order type
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

const MonthlySummary = ({ importOrExport = 'ALL', doType = 'DO', fuelRecords = [], lpoEntries = [] }: MonthlySummaryProps) => {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [groupBy, setGroupBy] = useState<'none' | 'client' | 'destination'>('none');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Dropdown states
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showGroupByDropdown, setShowGroupByDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);

  // Refs for click-outside detection
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const groupByDropdownRef = useRef<HTMLDivElement>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  const queryDoType = doType === 'ALL' ? undefined : doType;

  // Available periods drive the month/year dropdowns. This is a cheap query
  // that spans ALL months with data (including imported/historical DOs),
  // independent of any loaded rows — so no month is ever missing.
  const { data: availablePeriods = [] } = useDOAvailablePeriods(importOrExport, queryDoType, 'active');

  // Click-outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
      if (groupByDropdownRef.current && !groupByDropdownRef.current.contains(event.target as Node)) {
        setShowGroupByDropdown(false);
      }
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(event.target as Node)) {
        setShowYearDropdown(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        monthDropdownRef.current?.contains(target) ||
        groupByDropdownRef.current?.contains(target) ||
        yearDropdownRef.current?.contains(target)
      ) return;
      setShowMonthDropdown(false);
      setShowGroupByDropdown(false);
      setShowYearDropdown(false);
    };

    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Build the month/year dropdown options from the available periods.
  useEffect(() => {
    if (availablePeriods.length === 0) return;

    const yearSet = new Set<number>();
    const monthList: string[] = [];
    availablePeriods.forEach(p => {
      yearSet.add(p.year);
      const abbr = MONTH_ABBR[p.month - 1];
      if (abbr) monthList.push(`${abbr}-${p.year}`);
    });

    const years = Array.from(yearSet).sort((a, b) => b - a);
    const allMonths = monthList.sort((a, b) => {
      const [monthA, yearA] = a.split('-');
      const [monthB, yearB] = b.split('-');
      const yearDiff = parseInt(yearB) - parseInt(yearA);
      if (yearDiff !== 0) return yearDiff;
      return MONTH_ABBR.indexOf(monthB) - MONTH_ABBR.indexOf(monthA);
    });

    setAvailableYears(years);
    setAvailableMonths(allMonths);

    // Default to the current year if present, else the most recent year.
    setSelectedYears(prev => {
      if (prev.length > 0) return prev;
      const currentYear = new Date().getFullYear();
      return [years.includes(currentYear) ? currentYear : years[0]];
    });
  }, [availablePeriods]);

  // Once a year is selected, default-select its first month.
  useEffect(() => {
    if (availableMonths.length === 0 || selectedMonths.length > 0 || selectedYears.length === 0) return;
    const firstMonthOfSelectedYear = availableMonths.find(m => selectedYears.some(y => m.endsWith(`-${y}`)));
    if (firstMonthOfSelectedYear) setSelectedMonths([firstMonthOfSelectedYear]);
  }, [availableMonths, selectedMonths.length, selectedYears]);

  // The metric cards + client/destination breakdowns are shown for the first
  // selected month. Its date range drives the server-side aggregation.
  const displayMonth = selectedMonths[0];
  const displayRange = displayMonth ? monthYearToRange(displayMonth) : null;

  const { data: aggregate, isFetching: aggFetching } = useDOSummaryAggregate(
    {
      importOrExport,
      doType: queryDoType,
      dateFrom: displayRange?.dateFrom,
      dateTo: displayRange?.dateTo,
    },
    !!displayRange,
  );

  // Detailed-view rows are fetched only for the displayed month, and only when
  // the Detailed view is actually open (keeps payloads bounded).
  const { data: detailedOrders = [], isFetching: detailedFetching } = useAllDeliveryOrders(
    {
      importOrExport,
      doType: queryDoType,
      status: 'active',
      dateFrom: displayRange?.dateFrom,
      dateTo: displayRange?.dateTo,
    },
    viewMode === 'detailed' && !!displayRange,
  );

  const summary = useMemo<SummaryData | null>(() => {
    if (!displayMonth || !aggregate) return null;

    const [month, year] = displayMonth.split('-');

    // Fuel metrics still come from the optional fuel/LPO props passed in.
    const matchesMonthYear = (recordDate: string) => {
      if (recordDate.includes('-')) {
        const parts = recordDate.split('-');
        if (parts.length === 3) {
          const orderYear = parseInt(parts[0], 10);
          const monthNum = parseInt(parts[1], 10);
          const orderMonth = MONTH_ABBR[monthNum - 1];
          return orderMonth === month && orderYear === parseInt(year);
        } else if (parts.length === 2) {
          return parts[1] === month;
        }
      }
      return false;
    };

    const monthFuelRecords = fuelRecords.filter(r => matchesMonthYear(r.date));
    const monthLpoEntries = lpoEntries.filter(l => matchesMonthYear(l.date));
    const totalFuelConsumed = monthFuelRecords.reduce((sum, r) => sum + (r.totalLts || 0) + (r.extra || 0), 0);
    const totalFuelCost = monthLpoEntries.reduce((sum, l) => sum + (l.ltrs * l.pricePerLtr), 0);
    const avgFuelPerOrder = aggregate.totalOrders > 0 ? totalFuelConsumed / aggregate.totalOrders : 0;

    return {
      month: displayMonth,
      totalOrders: aggregate.totalOrders,
      totalImport: aggregate.totalImport,
      totalExport: aggregate.totalExport,
      totalTonnage: aggregate.totalTonnage,
      totalRevenue: aggregate.totalRevenue,
      totalFuelConsumed,
      totalFuelCost,
      avgFuelPerOrder,
      byClient: aggregate.byClient,
      byDestination: aggregate.byDestination,
    };
  }, [displayMonth, aggregate, fuelRecords, lpoEntries]);

  const handleExportSummary = async () => {
    if (selectedMonths.length === 0 || isExporting) return;

    const orderTypeLabel = doType === 'SDO' ? 'SDO' : doType === 'ALL' ? 'All_Orders' : 'DO';
    setIsExporting(true);
    try {
      // Fetch the actual rows for each selected month on demand (bounded).
      const sheets = await Promise.all(
        selectedMonths.map(async monthYear => {
          const range = monthYearToRange(monthYear);
          // Include cancelled DOs too — they're rendered red + struck-through
          // in the sheet (via the _isCancelled marker below).
          const rows = range
            ? await fetchAllDeliveryOrders({
                importOrExport,
                doType: queryDoType,
                status: 'all',
                dateFrom: range.dateFrom,
                dateTo: range.dateTo,
              })
            : [];

          const exportData = rows.map((order, index) => ({
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
            _isCancelled: !!order.isCancelled,
          }));

          return { sheetName: monthYear, data: exportData };
        })
      );

      const monthsLabel = selectedMonths.length === 1
        ? selectedMonths[0].replace('-', '_')
        : selectedMonths.length === availableMonths.filter(m => selectedYears.some(y => m.endsWith(`-${y}`))).length
          ? `All_Months_${selectedYears.join('_')}`
          : `${selectedMonths.length}_Months`;

      exportToXLSXMultiSheet(sheets, `${orderTypeLabel}_Summary_${monthsLabel}.xlsx`, {
        headerColor: '4472C4',
        addBorders: true,
        centerAllCells: true,
        strikethroughCancelledRows: true,
      });
    } catch {
      toast.error('Failed to export summary. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const getGroupedOrders = (): GroupedOrders => {
    const monthOrders = detailedOrders.filter(o => !o.isCancelled);

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

  if (availablePeriods.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No delivery order data available
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {aggFetching ? 'Loading summary...' : 'Select a month to view summary'}
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
                {doType === 'SDO' ? 'SDO' : doType === 'ALL' ? 'All Orders' : 'DO'} Summary - {summary.month}
              </h3>
              {doType !== 'ALL' && (
                <span className={`px-2 py-0.5 text-xs font-semibold rounded ${doType === 'SDO' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'}`}>
                  {doType}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Year Multi-Select */}
            <div className="relative" ref={yearDropdownRef}>
              <button
                type="button"
                onClick={() => setShowYearDropdown(!showYearDropdown)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors flex items-center gap-2"
              >
                <span className="font-medium">
                  {selectedYears.length === 0 
                    ? 'Select Year' 
                    : selectedYears.length === 1 
                      ? selectedYears[0] 
                      : selectedYears.length === availableYears.length 
                        ? 'All Years' 
                        : `${selectedYears.length} years`}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showYearDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showYearDropdown && (
                <div className="absolute z-50 mt-1 w-full min-w-[150px] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-auto">
                  <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                    <button
                      onClick={() => {
                        setSelectedYears([...availableYears]);
                        setShowYearDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    >
                      All Years ({availableYears.length})
                    </button>
                  </div>
                  <div className="p-2">
                    {availableYears.map(year => (
                      <label
                        key={year}
                        className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedYears.includes(year)}
                          onChange={() => {
                            setSelectedYears(prev => {
                              if (prev.includes(year)) {
                                if (prev.length === 1) return prev;
                                return prev.filter(y => y !== year);
                              } else {
                                return [...prev, year].sort((a, b) => b - a);
                              }
                            });
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">{year}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Month Multi-Select */}
            <div className="relative" ref={monthDropdownRef}>
              <button
                type="button"
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors flex items-center gap-2"
              >
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>
                  {selectedMonths.length === 0 
                    ? 'Select Month' 
                    : selectedMonths.length === 1 
                      ? selectedMonths[0] 
                      : selectedMonths.length === availableMonths.length 
                        ? 'All Months' 
                        : `${selectedMonths.length} months`}
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showMonthDropdown && (
                <div className="absolute z-50 mt-1 w-full min-w-[200px] bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-auto">
                  {/* Quick Select Options */}
                  <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                    <button
                      onClick={() => {
                        const monthsForSelectedYears = availableMonths.filter(m => 
                          selectedYears.some(y => m.endsWith(`-${y}`))
                        );
                        setSelectedMonths(monthsForSelectedYears);
                        setShowMonthDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    >
                      All Months ({availableMonths.filter(m => selectedYears.some(y => m.endsWith(`-${y}`))).length})
                    </button>
                    <button
                      onClick={() => {
                        const firstMonth = availableMonths.find(m => selectedYears.some(y => m.endsWith(`-${y}`)));
                        if (firstMonth) setSelectedMonths([firstMonth]);
                        setShowMonthDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    >
                      Clear Selection
                    </button>
                  </div>
                  
                  {/* Month Checkboxes - Only show months from selected years */}
                  <div className="p-2">
                    {availableMonths
                      .filter(monthYear => selectedYears.some(y => monthYear.endsWith(`-${y}`)))
                      .map(monthYear => (
                        <label
                          key={monthYear}
                          className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedMonths.includes(monthYear)}
                            onChange={() => {
                              setSelectedMonths(prev => {
                                if (prev.includes(monthYear)) {
                                  // Don't allow deselecting all months
                                  if (prev.length === 1) return prev;
                                  return prev.filter(m => m !== monthYear);
                                } else {
                                  return [...prev, monthYear].sort((a, b) => {
                                    const [monthA, yearA] = a.split('-');
                                    const [monthB, yearB] = b.split('-');
                                    const yearDiff = parseInt(yearB) - parseInt(yearA);
                                    if (yearDiff !== 0) return yearDiff;
                                    const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                    return monthOrder.indexOf(monthB) - monthOrder.indexOf(monthA);
                                  });
                                }
                              });
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{monthYear}</span>
                        </label>
                      ))}
                  </div>
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
              disabled={isExporting}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {isExporting ? 'Exporting...' : 'Export'}
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
          {detailedFetching && detailedOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading orders...</div>
          ) : detailedOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">No orders for this month</div>
          ) : (
          Object.entries(groupedOrders).map(([groupName, groupOrders]) => (
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
          ))
          )}
        </div>
      )}
    </div>
  );
};

export default MonthlySummary;
