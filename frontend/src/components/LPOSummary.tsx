import { useState, useEffect } from 'react';
import { Download, Calendar, FileSpreadsheet, DollarSign, Fuel, AlertTriangle } from 'lucide-react';
import { LPOEntry, DriverAccountEntry } from '../types';
import { driverAccountAPI } from '../services/api';
import XLSX from 'xlsx-js-style';

// Helper to derive currency from station name
const getCurrencyFromStation = (station: string): 'USD' | 'TZS' => {
  const upper = (station || '').toUpperCase();
  if (upper.startsWith('LAKE') && !upper.includes('TUNDUMA')) return 'USD';
  return 'TZS';
};

// Extended LPO entry type that includes driver account flag
interface ExtendedLPOEntry extends LPOEntry {
  isDriverAccount?: boolean;
  paymentMode?: string;
  paybillOrMobile?: string;
  journeyDirection?: 'going' | 'returning';
  originalDoNo?: string;
}

interface LPOSummaryProps {
  lpoEntries: LPOEntry[];
  selectedStations?: string[];
  dateFrom?: string;
  dateTo?: string;
  onFiltersChange?: (filters: { stations: string[]; dateFrom: string; dateTo: string }) => void;
  includeDriverAccounts?: boolean; // Option to include driver account LPOs
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
  lpoEntries, 
  selectedStations = [], 
  dateFrom = '', 
  dateTo = '', 
  onFiltersChange,
  includeDriverAccounts = true 
}: LPOSummaryProps) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [summary, setSummary] = useState<MonthlySummaryData | null>(null);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
  const [localSelectedStations, setLocalSelectedStations] = useState<string[]>(selectedStations);
  const [localDateFrom, setLocalDateFrom] = useState<string>(dateFrom);
  const [localDateTo, setLocalDateTo] = useState<string>(dateTo);
  const [availableStations, setAvailableStations] = useState<string[]>([]);
  const [driverAccountEntries, setDriverAccountEntries] = useState<ExtendedLPOEntry[]>([]);
  const [loadingDriverAccounts, setLoadingDriverAccounts] = useState(false);

  // Fetch driver account entries
  useEffect(() => {
    if (includeDriverAccounts) {
      fetchDriverAccountEntries();
    }
  }, [selectedYear, includeDriverAccounts]);

  const fetchDriverAccountEntries = async () => {
    setLoadingDriverAccounts(true);
    try {
      const yearNum = parseInt(selectedYear) || new Date().getFullYear();
      const entries = await driverAccountAPI.getAll({ year: yearNum });
      
      // Convert driver account entries to LPO entry format
      const convertedEntries: ExtendedLPOEntry[] = entries.map((entry: DriverAccountEntry, index: number) => {
        // Parse date to match LPO format
        const entryDate = new Date(entry.date);
        const day = entryDate.getDate();
        const month = entryDate.toLocaleDateString('en-US', { month: 'short' });
        
        return {
          id: entry.id || `da-${index}`,
          sn: index + 1,
          date: `${day}-${month}`,
          lpoNo: entry.lpoNo,
          dieselAt: entry.station,
          doSdo: 'NIL', // Driver account LPOs show NIL
          truckNo: entry.truckNo,
          ltrs: entry.liters,
          pricePerLtr: entry.rate,
          destinations: 'NIL (Driver Acc.)', // Mark as driver account
          isDriverAccount: true,
          paymentMode: entry.paymentMode,
          paybillOrMobile: entry.paybillOrMobile,
          journeyDirection: entry.journeyDirection,
          originalDoNo: entry.originalDoNo,
        };
      });
      
      setDriverAccountEntries(convertedEntries);
    } catch (error) {
      console.error('Error fetching driver account entries:', error);
      setDriverAccountEntries([]);
    } finally {
      setLoadingDriverAccounts(false);
    }
  };

  // Combined entries (regular LPOs + driver account LPOs)
  const combinedEntries: ExtendedLPOEntry[] = [
    ...lpoEntries.map(e => ({ ...e, isDriverAccount: false })),
    ...driverAccountEntries
  ];

  // Get current month name
  const getCurrentMonth = () => {
    return new Date().toLocaleDateString('en-US', { month: 'short' });
  };

  useEffect(() => {
    if (combinedEntries.length > 0) {
      // Extract unique months, years, and stations from combined entries
      const months = new Set<string>();
      const years = new Set<string>();
      const stations = new Set<string>();
      
      combinedEntries.forEach(entry => {
        // Extract month from date format like "3-Oct", "15-Nov"
        const parts = entry.date.split('-');
        if (parts.length > 1) {
          months.add(parts[1]); // "Oct", "Nov", etc.
          // For year, we'll use the selectedYear or extract from full date if available
          years.add(selectedYear);
        }
        stations.add(entry.dieselAt);
      });
      
      const monthsArray = Array.from(months).sort((a, b) => {
        const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return monthOrder.indexOf(a) - monthOrder.indexOf(b);
      });
      
      setAvailableMonths(monthsArray);
      setAvailableYears(Array.from(years).sort());
      setAvailableStations(Array.from(stations).sort());
      
      // Only set default month if it hasn't been set yet and we have months available
      if (!selectedMonth && monthsArray.length > 0) {
        const currentMonth = getCurrentMonth();
        if (monthsArray.includes(currentMonth)) {
          setSelectedMonth(currentMonth);
        } else {
          setSelectedMonth(monthsArray[monthsArray.length - 1]); // Latest month
        }
      }
    }
  }, [combinedEntries.length, selectedYear]);

  // Notify parent of filter changes
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        stations: localSelectedStations,
        dateFrom: localDateFrom,
        dateTo: localDateTo
      });
    }
  }, [localSelectedStations, localDateFrom, localDateTo, onFiltersChange]);

  // Calculate summary when relevant data changes
  useEffect(() => {
    if (selectedMonth && combinedEntries.length > 0) {
      let filteredEntries = combinedEntries as ExtendedLPOEntry[];

      // Apply month filter
      if (selectedMonth) {
        filteredEntries = filteredEntries.filter(entry => entry.date.includes(selectedMonth));
      }

      // Apply station filter
      if (localSelectedStations.length > 0) {
        filteredEntries = filteredEntries.filter(entry => 
          localSelectedStations.includes(entry.dieselAt)
        );
      }

      // Apply date range filter (convert date format for comparison)
      if (localDateFrom || localDateTo) {
        filteredEntries = filteredEntries.filter(entry => {
          // Convert "3-Oct" format to a comparable date
          const parts = entry.date.split('-');
          if (parts.length === 2) {
            const day = parseInt(parts[0]);
            const monthName = parts[1];
            const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthIndex = monthOrder.indexOf(monthName);
            
            if (monthIndex !== -1) {
              // Construct date for comparison using selectedYear
              const entryDate = new Date(parseInt(selectedYear), monthIndex, day);
              entryDate.setHours(0, 0, 0, 0); // Normalize to start of day
              
              const fromDate = localDateFrom ? new Date(localDateFrom) : null;
              const toDate = localDateTo ? new Date(localDateTo) : null;
              
              if (fromDate) {
                fromDate.setHours(0, 0, 0, 0);
                if (entryDate < fromDate) return false;
              }
              if (toDate) {
                toDate.setHours(23, 59, 59, 999); // End of day
                if (entryDate > toDate) return false;
              }
            }
          }
          return true;
        });
      }
      
      const totalLiters = filteredEntries.reduce((sum, entry) => sum + entry.ltrs, 0);
      const totalAmount = filteredEntries.reduce((sum, entry) => sum + (entry.ltrs * entry.pricePerLtr), 0);
      const totalAmountTZS = filteredEntries
        .filter(e => getCurrencyFromStation(e.dieselAt) === 'TZS')
        .reduce((sum, e) => sum + (e.ltrs * e.pricePerLtr), 0);
      const totalAmountUSD = filteredEntries
        .filter(e => getCurrencyFromStation(e.dieselAt) === 'USD')
        .reduce((sum, e) => sum + (e.ltrs * e.pricePerLtr), 0);
      const avgPricePerLiter = totalLiters > 0 ? totalAmount / totalLiters : 0;
      const tzsList = filteredEntries.filter(e => getCurrencyFromStation(e.dieselAt) === 'TZS');
      const usdList = filteredEntries.filter(e => getCurrencyFromStation(e.dieselAt) === 'USD');
      const totalLitersTZS = tzsList.reduce((s, e) => s + e.ltrs, 0);
      const totalLitersUSD = usdList.reduce((s, e) => s + e.ltrs, 0);
      const avgPricePerLiterTZS = totalLitersTZS > 0 ? totalAmountTZS / totalLitersTZS : 0;
      const avgPricePerLiterUSD = totalLitersUSD > 0 ? totalAmountUSD / totalLitersUSD : 0;

      // Count driver account vs regular LPOs
      const driverAccountCount = filteredEntries.filter(e => e.isDriverAccount).length;
      const regularLPOCount = filteredEntries.length - driverAccountCount;

      // Group by station
      const byStation: Record<string, { lpos: number; liters: number; amount: number; }> = {};
      filteredEntries.forEach(entry => {
        if (!byStation[entry.dieselAt]) {
          byStation[entry.dieselAt] = { lpos: 0, liters: 0, amount: 0 };
        }
        byStation[entry.dieselAt].lpos += 1;
        byStation[entry.dieselAt].liters += entry.ltrs;
        byStation[entry.dieselAt].amount += (entry.ltrs * entry.pricePerLtr);
      });

      // Group by destination
      const byDestination: Record<string, number> = {};
      filteredEntries.forEach(entry => {
        if (!byDestination[entry.destinations]) {
          byDestination[entry.destinations] = 0;
        }
        byDestination[entry.destinations] += 1;
      });

      setSummary({
        month: selectedMonth,
        totalLPOs: filteredEntries.length,
        totalLiters,
        totalAmount,
        totalAmountTZS,
        totalAmountUSD,
        avgPricePerLiter,
        avgPricePerLiterTZS,
        avgPricePerLiterUSD,
        byStation,
        byDestination,
        entries: filteredEntries,
        driverAccountCount,
        regularLPOCount
      });
    }
  }, [selectedMonth, selectedYear, combinedEntries.length, localSelectedStations, localDateFrom, localDateTo]);  // Helper function to apply borders and center alignment to worksheet
  const applyExcelStyles = (ws: XLSX.WorkSheet) => {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    
    const borderStyle = {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    };

    const cellStyle = {
      border: borderStyle,
      alignment: { horizontal: 'center', vertical: 'center' }
    };

    const headerStyle = {
      border: borderStyle,
      alignment: { horizontal: 'center', vertical: 'center' },
      font: { bold: true },
      fill: { fgColor: { rgb: 'E0E0E0' } }
    };

    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[cellRef]) {
          ws[cellRef] = { v: '', t: 's' };
        }
        ws[cellRef].s = row === 0 ? headerStyle : cellStyle;
      }
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 6 },   // S/N
      { wch: 12 },  // Date
      { wch: 10 },  // LPO No.
      { wch: 15 },  // Diesel At
      { wch: 10 },  // DO/SDO
      { wch: 12 },  // Truck No.
      { wch: 10 },  // Liters
      { wch: 12 },  // Price per Liter
      { wch: 15 },  // Total Amount
      { wch: 12 },  // Destinations
      { wch: 15 },  // Type
      { wch: 12 },  // Payment Mode
      { wch: 15 },  // Paybill/Mobile
    ];
  };

  const handleExportMonth = () => {
    if (!summary) return;

    const exportData = summary.entries.map((entry, index) => ({
      'S/N': index + 1,
      'Date': entry.date,
      'LPO No.': entry.lpoNo,
      'Diesel At': entry.dieselAt,
      'Currency': getCurrencyFromStation(entry.dieselAt),
      'DO/SDO': entry.doSdo,
      'Truck No.': entry.truckNo,
      'Liters': entry.ltrs,
      'Price per Liter': entry.pricePerLtr,
      'Total Amount': entry.ltrs * entry.pricePerLtr,
      'Destinations': entry.destinations,
      'Type': entry.isDriverAccount ? 'DRIVER ACCOUNT' : 'REGULAR',
      'Payment Mode': entry.isDriverAccount ? (entry.paymentMode || 'N/A') : '',
      'Paybill/Mobile': entry.isDriverAccount ? (entry.paybillOrMobile || 'N/A') : ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    applyExcelStyles(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${selectedMonth}_${selectedYear}`);
    XLSX.writeFile(wb, `LPO_Summary_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const handleExportYear = () => {
    if (availableMonths.length === 0) return;

    const wb = XLSX.utils.book_new();

    // Create a sheet for each month
    availableMonths.forEach(month => {
      const monthEntries = combinedEntries.filter(entry => entry.date.includes(month));
      
      if (monthEntries.length > 0) {
        const exportData = monthEntries.map((entry, index) => ({
          'S/N': index + 1,
          'Date': entry.date,
          'LPO No.': entry.lpoNo,
          'Diesel At': entry.dieselAt,
          'Currency': getCurrencyFromStation(entry.dieselAt),
          'DO/SDO': entry.doSdo,
          'Truck No.': entry.truckNo,
          'Liters': entry.ltrs,
          'Price per Liter': entry.pricePerLtr,
          'Total Amount': entry.ltrs * entry.pricePerLtr,
          'Destinations': entry.destinations,
          'Type': entry.isDriverAccount ? 'DRIVER ACCOUNT' : 'REGULAR',
          'Payment Mode': entry.isDriverAccount ? (entry.paymentMode || 'N/A') : '',
          'Paybill/Mobile': entry.isDriverAccount ? (entry.paybillOrMobile || 'N/A') : ''
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        applyExcelStyles(ws);
        XLSX.utils.book_append_sheet(wb, ws, `${month}_${selectedYear}`);
      }
    });

    // Create summary sheet
    const yearSummary = availableMonths.map(month => {
      const monthEntries = combinedEntries.filter(entry => entry.date.includes(month));
      const totalLiters = monthEntries.reduce((sum, entry) => sum + entry.ltrs, 0);
      const totalAmountTZS = monthEntries.filter(e => getCurrencyFromStation(e.dieselAt) === 'TZS').reduce((sum, e) => sum + (e.ltrs * e.pricePerLtr), 0);
      const totalAmountUSD = monthEntries.filter(e => getCurrencyFromStation(e.dieselAt) === 'USD').reduce((sum, e) => sum + (e.ltrs * e.pricePerLtr), 0);
      const totalAmount = totalAmountTZS + totalAmountUSD;
      const driverAccountLPOs = monthEntries.filter(e => e.isDriverAccount).length;
      
      return {
        'Month': month,
        'Total LPOs': monthEntries.length,
        'Regular LPOs': monthEntries.length - driverAccountLPOs,
        'Driver Account LPOs': driverAccountLPOs,
        'Total Liters': totalLiters,
        'Total Amount (TZS)': totalAmountTZS,
        'Total Amount (USD)': totalAmountUSD,
        'Average Price/Liter': totalLiters > 0 ? (totalAmount / totalLiters).toFixed(2) : 0
      };
    });

    const summaryWs = XLSX.utils.json_to_sheet(yearSummary);
    applyExcelStyles(summaryWs);
    XLSX.utils.book_append_sheet(wb, summaryWs, `${selectedYear}_Summary`);

    XLSX.writeFile(wb, `LPO_Summary_${selectedYear}.xlsx`);
  };

  if (!summary) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        {loadingDriverAccounts ? 'Loading driver account entries...' : 
         (availableMonths.length === 0 ? 'No LPO data available' : 'Select a month to view summary')}
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
                onChange={(e) => setSelectedYear(e.target.value)}
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
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Filtered
              </button>
              
              <button
                onClick={handleExportYear}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Year
              </button>
            </div>
          </div>

          {/* Filters Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Station Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Filter by Stations ({localSelectedStations.length} selected)
                </label>
                <div className="max-h-32 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md p-2 bg-gray-50 dark:bg-gray-700 transition-colors">
                  <label className="flex items-center mb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={localSelectedStations.length === availableStations.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setLocalSelectedStations([...availableStations]);
                        } else {
                          setLocalSelectedStations([]);
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="font-medium">Select All</span>
                  </label>
                  {availableStations.map(station => (
                    <label key={station} className="flex items-center mb-1 text-sm">
                      <input
                        type="checkbox"
                        checked={localSelectedStations.includes(station)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setLocalSelectedStations(prev => [...prev, station]);
                          } else {
                            setLocalSelectedStations(prev => prev.filter(s => s !== station));
                          }
                        }}
                        className="mr-2"
                      />
                      {station}
                    </label>
                  ))}
                </div>
              </div>

              {/* Date Range Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Date Range Filter
                </label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={localDateFrom}
                    onChange={(e) => setLocalDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors"
                  />
                  <input
                    type="date"
                    value={localDateTo}
                    onChange={(e) => setLocalDateTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md text-sm transition-colors"
                  />
                </div>
              </div>

              {/* Filter Actions */}
              <div className="flex flex-col justify-end space-y-2">
                <button
                  onClick={() => {
                    setLocalSelectedStations([...availableStations]);
                    setLocalDateFrom('');
                    setLocalDateTo('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear Filters
                </button>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {summary.totalLPOs} of {lpoEntries.filter(e => e.date.includes(selectedMonth)).length} entries
                </div>
              </div>
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
                        {entry.isDriverAccount && entry.paymentMode && (
                          <span className="block text-xs text-red-500 dark:text-red-400 mt-0.5">
                            ({entry.paymentMode.replace('_', ' ')}{entry.paybillOrMobile ? `: ${entry.paybillOrMobile}` : ''})
                          </span>
                        )}
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
        </div>
      )}
    </div>
  );
};

export default LPOSummary;