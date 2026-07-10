import { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Calendar, FileSpreadsheet, DollarSign, Fuel, AlertTriangle, ChevronDown, Check, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { LPOEntry } from '../types';
import { lposAPI } from '../services/api';
import { useLPOAvailableFilters, useLPOSummaryAggregate, useLPOSummaryEntries } from '../hooks/useLPOs';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthAbbrToRange = (monthAbbr: string, yearStr: string): { dateFrom: string; dateTo: string } | null => {
  const year = parseInt(yearStr, 10);
  const monthIdx = MONTH_ABBR.indexOf(monthAbbr);
  if (monthIdx < 0 || isNaN(year)) return null;
  const mm = String(monthIdx + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return { dateFrom: `${year}-${mm}-01`, dateTo: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
};

// Helper to derive currency from station name
const getCurrencyFromStation = (station: string): 'USD' | 'TZS' => {
  const upper = (station || '').toUpperCase();
  if (upper.startsWith('LAKE') && !upper.includes('TUNDUMA')) return 'USD';
  return 'TZS';
};

interface ExtendedLPOEntry extends LPOEntry {
  isDriverAccount?: boolean;
  journeyDirection?: 'going' | 'returning';
  originalDoNo?: string;
}

interface LPOSummaryProps {
  /** @deprecated Summary loads its own full-month data; kept optional for callers */
  lpoEntries?: LPOEntry[];
  selectedStations?: string[];
  dateFrom?: string;
  dateTo?: string;
  onFiltersChange?: (filters: { stations: string[]; dateFrom: string; dateTo: string }) => void;
}

interface MonthlySummaryData {
  month: string;
  totalLPOs: number;
  totalLiters: number;
  totalAmount: number;
  totalAmountTZS: number;
  totalAmountUSD: number;
  avgPricePerLiter: number;
  avgPricePerLiterTZS: number;
  avgPricePerLiterUSD: number;
  byStation: Record<string, {
    lpos: number;
    liters: number;
    amount: number;
  }>;
  byDestination: Record<string, number>;
  entries: ExtendedLPOEntry[];
  driverAccountCount: number;
  regularLPOCount: number;
}

const LPOSummary = ({ 
  selectedStations = [], 
  dateFrom = '', 
  dateTo = '', 
  onFiltersChange,
}: LPOSummaryProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [localSelectedStations, setLocalSelectedStations] = useState<string[]>(selectedStations);
  const [localDateFrom, setLocalDateFrom] = useState<string>(dateFrom);
  const [localDateTo, setLocalDateTo] = useState<string>(dateTo);
  const [showStationDropdown, setShowStationDropdown] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const stationsInitialized = useRef(false);

  // Global periods (all months with data) — same pattern as DO Summary
  const { data: filtersData, isLoading: filtersLoading } = useLPOAvailableFilters();
  const availablePeriods = filtersData?.periods ?? [];

  const availableYears = useMemo(() => {
    const years = [...new Set(availablePeriods.map(p => String(p.year)))];
    return years.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  }, [availablePeriods]);

  const availableMonths = useMemo(() => {
    if (!selectedYear) return [];
    const yearNum = parseInt(selectedYear, 10);
    return availablePeriods
      .filter(p => p.year === yearNum)
      .map(p => MONTH_ABBR[p.month - 1])
      .filter(Boolean)
      .sort((a, b) => MONTH_ABBR.indexOf(a) - MONTH_ABBR.indexOf(b));
  }, [availablePeriods, selectedYear]);

  // Default year / month once periods load
  useEffect(() => {
    if (availableYears.length === 0) return;
    setSelectedYear(prev => {
      if (prev && availableYears.includes(prev)) return prev;
      const current = String(new Date().getFullYear());
      return availableYears.includes(current) ? current : availableYears[0];
    });
  }, [availableYears]);

  useEffect(() => {
    if (availableMonths.length === 0) return;
    setSelectedMonth(prev => {
      if (prev && availableMonths.includes(prev)) return prev;
      const current = new Date().toLocaleDateString('en-US', { month: 'short' });
      return availableMonths.includes(current) ? current : availableMonths[availableMonths.length - 1];
    });
  }, [availableMonths]);

  const monthRange = selectedMonth && selectedYear
    ? monthAbbrToRange(selectedMonth, selectedYear)
    : null;

  // Tighten with optional local date filters
  const fetchRange = useMemo(() => {
    if (!monthRange) return null;
    let { dateFrom: from, dateTo: to } = monthRange;
    if (localDateFrom && localDateFrom > from) from = localDateFrom;
    if (localDateTo && localDateTo < to) to = localDateTo;
    return { dateFrom: from, dateTo: to };
  }, [monthRange, localDateFrom, localDateTo]);

  const stationList = useMemo(() => {
    if (
      localSelectedStations.length === 0 ||
      (filtersData?.stations?.length && localSelectedStations.length === filtersData.stations.length)
    ) {
      return undefined;
    }
    return localSelectedStations;
  }, [localSelectedStations, filtersData?.stations]);

  // Server aggregate for metric cards (no row download)
  const { data: aggregate, isFetching: aggFetching } = useLPOSummaryAggregate(
    {
      dateFrom: fetchRange?.dateFrom,
      dateTo: fetchRange?.dateTo,
      stations: stationList,
    },
    !!fetchRange
  );

  // Detailed rows only when Detailed view is open
  const { data: monthEntries = [], isFetching: monthFetching } = useLPOSummaryEntries(
    {
      dateFrom: fetchRange?.dateFrom,
      dateTo: fetchRange?.dateTo,
      stations: stationList,
    },
    viewMode === 'detailed' && !!fetchRange
  );

  // Stations for dropdown: prefer filter API list for selected month range
  const { data: stationFilters } = useLPOAvailableFilters(fetchRange ?? undefined);
  const availableStations = useMemo(() => {
    const fromApi = stationFilters?.stations ?? filtersData?.stations ?? [];
    return fromApi.length > 0 ? [...fromApi].sort() : [];
  }, [stationFilters, filtersData]);

  // Default-select all stations once available
  useEffect(() => {
    if (stationsInitialized.current || availableStations.length === 0) return;
    if (localSelectedStations.length === 0) {
      setLocalSelectedStations([...availableStations]);
    }
    stationsInitialized.current = true;
  }, [availableStations, localSelectedStations.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setShowStationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        stations: localSelectedStations,
        dateFrom: localDateFrom,
        dateTo: localDateTo
      });
    }
  }, [localSelectedStations, localDateFrom, localDateTo, onFiltersChange]);

  const summary = useMemo<MonthlySummaryData | null>(() => {
    if (!selectedMonth || !fetchRange || !aggregate) return null;

    return {
      month: selectedMonth,
      totalLPOs: aggregate.totalLPOs,
      totalLiters: aggregate.totalLiters || 0,
      totalAmount: aggregate.totalAmount || 0,
      totalAmountTZS: aggregate.totalAmountTZS || 0,
      totalAmountUSD: aggregate.totalAmountUSD || 0,
      avgPricePerLiter: aggregate.avgPricePerLiter || 0,
      avgPricePerLiterTZS: aggregate.avgPricePerLiterTZS || 0,
      avgPricePerLiterUSD: aggregate.avgPricePerLiterUSD || 0,
      byStation: aggregate.byStation || {},
      byDestination: aggregate.byDestination || {},
      entries: (monthEntries as ExtendedLPOEntry[]) || [],
      driverAccountCount: aggregate.driverAccountCount || 0,
      regularLPOCount: aggregate.regularLPOCount || 0,
    };
  }, [selectedMonth, fetchRange, aggregate, monthEntries]);

  const resolveExportStations = (): string[] | undefined => {
    if (
      localSelectedStations.length === 0 ||
      (availableStations.length > 0 && localSelectedStations.length === availableStations.length)
    ) {
      return undefined;
    }
    return localSelectedStations;
  };

  const handleExportMonth = async () => {
    if (!selectedMonth || !selectedYear || isExporting) return;

    setIsExporting(true);
    try {
      await lposAPI.exportSummaryMonth({
        year: selectedYear,
        month: selectedMonth,
        stations: resolveExportStations(),
        dateFrom: localDateFrom || undefined,
        dateTo: localDateTo || undefined,
      });
    } catch {
      toast.error('Failed to export LPO summary. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportYear = async () => {
    if (!selectedYear || isExporting) return;

    setIsExporting(true);
    try {
      await lposAPI.exportSummaryYear({
        year: selectedYear,
        stations: resolveExportStations(),
        dateFrom: localDateFrom || undefined,
        dateTo: localDateTo || undefined,
      });
    } catch {
      toast.error('Failed to export year summary. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (filtersLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading periods...
      </div>
    );
  }

  if (availableYears.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No LPO data available
      </div>
    );
  }

  if (!summary && (aggFetching || monthFetching)) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 mr-2 animate-spin" />
        Loading {selectedMonth} {selectedYear}...
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {availableMonths.length === 0 ? 'No LPO data for this year' : 'Select a month to view summary'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 p-4 transition-colors">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center space-x-3">
              <Calendar className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  LPO Summary - {summary.month} {selectedYear}
                </h3>
                {/* LPO type breakdown */}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {summary.regularLPOCount} Regular
                  </span>
                  {summary.driverAccountCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {summary.driverAccountCount} Driver Acc.
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Year Selector */}
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setSelectedMonth(''); // re-default from availableMonths for new year
                }}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>

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
                }`}
              >
                Detailed
              </button>
            </div>

              {/* Export Buttons */}
              <button
                onClick={handleExportMonth}
                disabled={isExporting}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Export Filtered
              </button>
              
              <button
                onClick={handleExportYear}
                disabled={isExporting}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                Export Year
              </button>
            </div>
          </div>

          {/* Filters Section - inline row like list view */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Station Filter Dropdown */}
              <div className="relative" ref={stationDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowStationDropdown(!showStationDropdown)}
                  className="w-full min-w-[200px] px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
                >
                  <span>
                    {localSelectedStations.length === 0
                      ? 'No Stations'
                      : localSelectedStations.length === availableStations.length
                        ? 'All Stations'
                        : `${localSelectedStations.length} Station${localSelectedStations.length > 1 ? 's' : ''}`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showStationDropdown && (
                  <div className="absolute z-50 mt-1 w-56 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                    <button
                      type="button"
                      onClick={() => {
                        if (localSelectedStations.length === availableStations.length) {
                          setLocalSelectedStations([]);
                        } else {
                          setLocalSelectedStations([...availableStations]);
                        }
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span className="font-medium">Select All</span>
                      {localSelectedStations.length === availableStations.length && <Check className="w-4 h-4 text-primary-600" />}
                    </button>
                    {availableStations.map((station) => (
                      <button
                        key={station}
                        type="button"
                        onClick={() => {
                          if (localSelectedStations.includes(station)) {
                            setLocalSelectedStations(prev => prev.filter(s => s !== station));
                          } else {
                            setLocalSelectedStations(prev => [...prev, station]);
                          }
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{station}</span>
                        {localSelectedStations.includes(station) && <Check className="w-4 h-4 text-primary-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Date From */}
              <input
                type="date"
                value={localDateFrom}
                onChange={(e) => setLocalDateFrom(e.target.value)}
                className="min-w-[170px] px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              {/* Date To */}
              <input
                type="date"
                value={localDateTo}
                onChange={(e) => setLocalDateTo(e.target.value)}
                className="min-w-[170px] px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />

              {/* Clear Filters */}
              <button
                onClick={() => {
                  setLocalSelectedStations([...availableStations]);
                  setLocalDateFrom('');
                  setLocalDateTo('');
                }}
                className="inline-flex items-center justify-center min-w-[130px] px-5 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>

              <span className="text-sm text-gray-500 dark:text-gray-400">
                {summary.totalLPOs} entries
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total LPOs</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.totalLPOs}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-blue-600 dark:text-blue-400">Total Liters</p>
            <Fuel className="w-5 h-5 text-blue-400 dark:text-blue-300" />
          </div>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summary.totalLiters.toLocaleString()}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-green-600 dark:text-green-400">Total Amount</p>
            <DollarSign className="w-5 h-5 text-green-400 dark:text-green-300" />
          </div>
          {summary.totalAmountTZS > 0 && (
            <p className="text-xl font-bold text-green-900 dark:text-green-100">TZS {summary.totalAmountTZS.toLocaleString()}</p>
          )}
          {summary.totalAmountUSD > 0 && (
            <p className="text-xl font-bold text-green-700 dark:text-green-200">$ {summary.totalAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          )}
          {summary.totalAmountTZS === 0 && summary.totalAmountUSD === 0 && (
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">—</p>
          )}
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg shadow dark:shadow-gray-700/30 transition-colors">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">Avg Price/Liter</p>
          {summary.avgPricePerLiterTZS > 0 && (
            <p className="text-xl font-bold text-yellow-900 dark:text-yellow-100">TZS {summary.avgPricePerLiterTZS.toFixed(2)}</p>
          )}
          {summary.avgPricePerLiterUSD > 0 && (
            <p className="text-xl font-bold text-yellow-700 dark:text-yellow-200">$ {summary.avgPricePerLiterUSD.toFixed(4)}</p>
          )}
          {summary.avgPricePerLiterTZS === 0 && summary.avgPricePerLiterUSD === 0 && (
            <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">—</p>
          )}
        </div>
      </div>

      {/* Summary View */}
      {viewMode === 'summary' && (
        <>
          {/* Station Summary */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Summary by Station</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Station
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      LPOs
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Total Liters
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Total Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Avg Price/Liter
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {Object.entries(summary.byStation)
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .map(([station, data]) => (
                      <tr key={station} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {station}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {data.lpos}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {data.liters.toLocaleString()} L
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-primary-600 dark:text-primary-400">
                          {getCurrencyFromStation(station) === 'USD'
                            ? `$ ${data.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : `TZS ${data.amount.toLocaleString()}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {getCurrencyFromStation(station) === 'USD'
                            ? `$ ${(data.amount / data.liters).toFixed(4)}`
                            : `TZS ${(data.amount / data.liters).toFixed(2)}`}
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
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">LPOs by Destination</h4>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(summary.byDestination)
                  .sort((a, b) => b[1] - a[1])
                  .map(([destination, count]) => (
                    <div key={destination} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg transition-colors">
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{destination}</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{count} LPOs</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detailed View */}
      {viewMode === 'detailed' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Detailed LPO Entries - {summary.month} {selectedYear} ({summary.totalLPOs} entries)
            </h4>
          </div>
          {monthFetching && summary.entries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading detailed entries...
            </div>
          ) : (
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
                    LPO No.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Diesel At
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    DO/SDO
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Truck No.
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Liters
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Price/Liter
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                    Destinations
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {summary.entries
                  .sort((a, b) => a.sn - b.sn)
                  .map((entry, index) => (
                    <tr 
                      key={entry.id || `entry-${index}`} 
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                        entry.isDriverAccount ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {entry.date}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <span className={entry.isDriverAccount ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}>
                          {entry.lpoNo}
                        </span>
                        {entry.isDriverAccount && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                            DA
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {entry.dieselAt}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {entry.isDriverAccount ? (
                          <span className="text-red-600 dark:text-red-400 italic">
                            NIL
                            {entry.originalDoNo && (
                              <span className="text-xs ml-1 text-gray-400">(ref: {entry.originalDoNo})</span>
                            )}
                          </span>
                        ) : entry.doSdo}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {entry.truckNo}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {entry.ltrs.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                        {getCurrencyFromStation(entry.dieselAt) === 'USD'
                          ? `$ ${entry.pricePerLtr.toFixed(4)}`
                          : `TZS ${entry.pricePerLtr.toFixed(2)}`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-primary-600 dark:text-primary-400">
                        {getCurrencyFromStation(entry.dieselAt) === 'USD'
                          ? `$ ${(entry.ltrs * entry.pricePerLtr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `TZS ${(entry.ltrs * entry.pricePerLtr).toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {entry.destinations}
                      </td>
                    </tr>
                  ))}
                {/* Month Totals */}
                <tr className="bg-gray-50 dark:bg-gray-700 font-semibold">
                  <td colSpan={6} className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                    Month Total:
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 dark:text-gray-100">
                    {summary.totalLiters.toLocaleString()}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-primary-600 dark:text-primary-400">
                    {summary.totalAmountTZS > 0 && <div>TZS {summary.totalAmountTZS.toLocaleString()}</div>}
                    {summary.totalAmountUSD > 0 && <div>$ {summary.totalAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                  </td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LPOSummary;