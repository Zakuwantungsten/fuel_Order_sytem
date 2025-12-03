import { useState, useEffect } from 'react';
import { Search, Plus, Download, Edit, Trash2, BarChart3, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { FuelRecord, LPOEntry } from '../types';
import { fuelRecordsAPI, lposAPI } from '../services/api';
import FuelRecordForm from '../components/FuelRecordForm';
import FuelAnalytics from '../components/FuelAnalytics';
import FuelRecordDetailsModal from '../components/FuelRecordDetailsModal';
import { exportToXLSX } from '../utils/csvParser';

// Standard fuel allocations - used to highlight extra fuel (fuel exceeding standard allocation)
const STANDARD_ALLOCATIONS = {
  darYard: 550,           // Standard DAR yard allocation (580 for Kisarawe)
  tangaYard: 100,         // Tanga yard to reach Dar
  mbeyaGoing: -450,       // Mbeya going (negative value in records)
  tundumaReturn: -100,    // Tunduma return
  mbeyaReturn: -400,      // Mbeya return
  zambiaReturn: -400,     // Zambia return (total: 50 Ndola + 350 Kapiri)
  moroReturn: -100,       // Morogoro return (for Mombasa-bound)
  tangaReturn: -70,       // Tanga return (for Mombasa-bound)
};

// Check if a fuel value exceeds the standard allocation (more fuel than expected)
const isExtraFuel = (field: string, value: number | undefined): boolean => {
  if (!value || value === 0) return false;
  
  const standard = STANDARD_ALLOCATIONS[field as keyof typeof STANDARD_ALLOCATIONS];
  if (standard === undefined) return false;
  
  // For negative values (fuel consumed), if the value is more negative than standard, it means more fuel was used
  if (standard < 0) {
    return value < standard; // e.g., -500 < -450 means 50 extra liters were used
  }
  
  // For positive values (yard allocations), if value exceeds standard, it's extra
  return value > standard;
};

// Get the extra amount above standard allocation
const getExtraAmount = (field: string, value: number | undefined): number => {
  if (!value || value === 0) return 0;
  
  const standard = STANDARD_ALLOCATIONS[field as keyof typeof STANDARD_ALLOCATIONS];
  if (standard === undefined) return 0;
  
  if (standard < 0) {
    return standard - value; // Returns positive number for extra fuel used
  }
  return value - standard;
};

const FuelRecords = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [lpos, setLpos] = useState<LPOEntry[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FuelRecord | undefined>();
  const [routeFilter, setRouteFilter] = useState('');
  const [viewMode, setViewMode] = useState<'records' | 'analytics'>('records');
  
  // Details modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | number | null>(null);
  
  // Month navigation state - default to current month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    fetchRecords();
    fetchLpos();
  }, []);

  useEffect(() => {
    filterRecords();
  }, [searchTerm, routeFilter, records, selectedMonth]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const data = await fuelRecordsAPI.getAll();
      // Ensure data is always an array
      const records = Array.isArray(data) ? data : [];
      console.log('Fetched fuel records:', records.length, records);
      setRecords(records);
      // Don't set filtered records here - let useEffect handle it
    } catch (error) {
      console.error('Error fetching fuel records:', error);
      setRecords([]);
      setFilteredRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLpos = async () => {
    try {
      const data = await lposAPI.getAll();
      // Ensure data is always an array
      setLpos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching LPOs:', error);
      setLpos([]);
    }
  };

  const filterRecords = () => {
    let filtered = [...records];
    console.log('Filtering records. Total:', records.length, 'Selected Month:', selectedMonth);

    // Filter by selected month first
    if (selectedMonth) {
      filtered = filtered.filter((record) => {
        const recordDate = new Date(record.date);
        const recordMonth = `${recordDate.getFullYear()}-${String(recordDate.getMonth() + 1).padStart(2, '0')}`;
        return recordMonth === selectedMonth;
      });
      console.log('After month filter:', filtered.length, 'records');
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (record) =>
          record.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          record.goingDo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (record.returnDo && record.returnDo.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      console.log('After search filter:', filtered.length, 'records');
    }

    if (routeFilter) {
      filtered = filtered.filter(
        (record) => record.to === routeFilter || record.from === routeFilter
      );
      console.log('After route filter:', filtered.length, 'records');
    }

    console.log('Final filtered records:', filtered.length);
    setFilteredRecords(filtered);
  };

  const handleCreate = () => {
    setSelectedRecord(undefined);
    setIsFormOpen(true);
  };

  const handleEdit = (record: FuelRecord, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    setSelectedRecord(record);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    if (window.confirm('Are you sure you want to delete this fuel record?')) {
      try {
        await fuelRecordsAPI.delete(id);
        fetchRecords();
      } catch (error) {
        console.error('Error deleting fuel record:', error);
      }
    }
  };

  const handleRowClick = (record: FuelRecord) => {
    const recordId = record.id || (record as any)._id;
    if (recordId) {
      setSelectedRecordId(recordId);
      setIsDetailsModalOpen(true);
    }
  };

  const handleSubmit = async (data: Partial<FuelRecord>) => {
    try {
      if (selectedRecord?.id) {
        await fuelRecordsAPI.update(selectedRecord.id, data);
      } else {
        await fuelRecordsAPI.create(data);
      }
      fetchRecords();
    } catch (error) {
      console.error('Error saving fuel record:', error);
    }
  };

  const handleExport = () => {
    // Get the year from selected month
    const year = new Date(selectedMonth + '-01').getFullYear();
    
    // Filter all records for the selected year (yearly export)
    const yearlyRecords = records.filter(record => {
      const recordDate = new Date(record.date);
      return recordDate.getFullYear() === year;
    });
    
    // Prepare data for XLSX export - match FUEL RECORD.csv format exactly
    // Use \n in headers for two-word columns to wrap text (word on top, word on bottom)
    const exportData = yearlyRecords.map((record) => {
      const isCancelled = record.isCancelled === true;
      
      // Format date as d-Mon (e.g., "6-Oct")
      const recordDate = new Date(record.date);
      const formattedDate = `${recordDate.getDate()}-${recordDate.toLocaleDateString('en-US', { month: 'short' })}`;
      
      return {
        'Date': formattedDate,
        'Truck\nNo.': record.truckNo,
        'Going\nDo': record.goingDo,
        'Return\nDo': record.returnDo || '',
        'Start': record.start,
        'From': record.from,
        'To': record.to,
        'Total\nLts': record.totalLts,
        'Extra': record.extra || '',
        'MMSA\nYard': record.mmsaYard || '',
        'Tanga\nYard': record.tangaYard || '',
        'Dar\nYard': record.darYard || '',
        'Dar\nGoing': record.darGoing || '',
        'Moro\nGoing': record.moroGoing || '',
        'Mbeya\nGoing': record.mbeyaGoing || '',
        'Tdm\nGoing': record.tdmGoing || '',
        'Zambia\nGoing': record.zambiaGoing || '',
        'Congo\nFuel': record.congoFuel || '',
        'Zambia\nReturn': record.zambiaReturn || '',
        'Tunduma\nReturn': record.tundumaReturn || '',
        'Mbeya\nReturn': record.mbeyaReturn || '',
        'Moro\nReturn': record.moroReturn || '',
        'Dar\nReturn': record.darReturn || '',
        'Tanga\nReturn': record.tangaReturn || '',
        'Balance': record.balance,
        '_isCancelled': isCancelled, // Hidden field for styling
      };
    });
    
    exportToXLSX(exportData, `FUEL RECORD ${year}.xlsx`, {
      sheetName: 'Fuel Records',
      headerColor: 'FFECD5', // Light orange/peach color for headers
      headerTextColor: '000000', // Black text
      addBorders: true,
      wrapHeader: true,
      centerAllCells: true,
      columnWidths: [8, 10, 8, 8, 6, 8, 10, 8, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 8, 8, 8, 8, 8],
      strikethroughCancelledRows: true, // Custom option for cancelled rows
    });
  };

  // Month navigation helpers
  const getAvailableMonths = () => {
    const months = new Set<string>();
    records.forEach(record => {
      const date = new Date(record.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.add(monthKey);
    });
    const sortedMonths = Array.from(months).sort();
    console.log('Available months:', sortedMonths);
    return sortedMonths;
  };

  // Update selected month if it's not in available months
  useEffect(() => {
    const availableMonths = getAvailableMonths();
    if (availableMonths.length > 0 && !availableMonths.includes(selectedMonth)) {
      // Set to the most recent month
      const latestMonth = availableMonths[availableMonths.length - 1];
      console.log('Selected month not available, switching to:', latestMonth);
      setSelectedMonth(latestMonth);
    }
  }, [records]);

  const goToPreviousMonth = () => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() - 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const goToNextMonth = () => {
    const date = new Date(selectedMonth + '-01');
    date.setMonth(date.getMonth() + 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonth);
  };

  const getMonthName = (monthKey: string) => {
    return new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fuel Records</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Track fuel consumption and usage across all trips
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          {/* View Toggle */}
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('records')}
              className={`px-4 py-2 text-sm font-medium inline-flex items-center ${
                viewMode === 'records'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-4 h-4 mr-2" />
              Records
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-4 py-2 text-sm font-medium border-l dark:border-gray-600 inline-flex items-center ${
                viewMode === 'analytics'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </button>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Record
          </button>
        </div>
      </div>

      {/* Analytics View */}
      {viewMode === 'analytics' ? (
        <FuelAnalytics fuelRecords={records} lpoEntries={lpos} />
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-4 mb-6 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by Truck, DO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">All Routes</option>
            <option value="DAR">DAR</option>
            <option value="Kpm">Kpm</option>
            <option value="Likasi">Likasi</option>
            <option value="Kolwezi">Kolwezi</option>
            <option value="COMIKA">COMIKA</option>
            <option value="ZHANFEI">ZHANFEI</option>
            <option value="TCC">TCC</option>
          </select>
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPreviousMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {getAvailableMonths().map(month => (
                <option key={month} value={month}>
                  {getMonthName(month)}
                </option>
              ))}
            </select>
            <button
              onClick={goToNextMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Next Month"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            Total Records: <span className="ml-2 font-semibold">{filteredRecords.length}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-xs divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-8">SN</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-16">Date</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-20">Truck</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-14">Go DO</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-14">Ret DO</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-12">Start</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-16">From</th>
                <th className="px-2 py-2 text-left font-medium text-gray-500 dark:text-gray-100 uppercase w-16">To</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-12">Total</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Ext</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">MMSA</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Tng Y</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Dar Y</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Dar G</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Mor G</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Mby G</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Tdm G</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Zam G</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Congo</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Zam R</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Tdm R</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Mby R</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Mor R</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Dar R</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-10">Tng R</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-12">Bal</th>
                <th className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-100 uppercase w-14">Act</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={26} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading data...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={26} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No fuel records found for {getMonthName(selectedMonth)}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record, index) => {
                  // Check if record is cancelled
                  const isCancelled = record.isCancelled === true;
                  
                  // Helper to render fuel cell with highlighting for extra fuel
                  const renderFuelCell = (field: string, value: number | undefined) => {
                    const hasExtraFuel = isExtraFuel(field, value);
                    const extraAmount = hasExtraFuel ? getExtraAmount(field, value) : 0;
                    
                    return (
                      <td 
                        className={`px-2 py-2 whitespace-nowrap text-center ${
                          isCancelled 
                            ? 'text-red-500 dark:text-red-400 line-through'
                            : hasExtraFuel 
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 font-semibold relative' 
                              : 'text-gray-600 dark:text-gray-400'
                        }`}
                        title={hasExtraFuel && !isCancelled ? `⚠️ Extra fuel: ${Math.abs(extraAmount)}L above standard allocation` : ''}
                      >
                        {hasExtraFuel && !isCancelled && (
                          <span className="absolute top-0 right-0 text-[8px] text-yellow-600 dark:text-yellow-400">⚠</span>
                        )}
                        {value || '-'}
                      </td>
                    );
                  };

                  const recordId = record.id || (record as any)._id;

                  return (
                    <tr 
                      key={recordId || `record-${index}`} 
                      className={`cursor-pointer transition-colors ${
                        isCancelled 
                          ? 'hover:bg-red-100 dark:hover:bg-red-900/30' 
                          : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                      }`}
                      onClick={() => handleRowClick(record)}
                      title={isCancelled ? 'This fuel record has been cancelled' : 'Click to view full details'}
                    >
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                        {index + 1}
                      </td>
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{new Date(record.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</td>
                      <td className={`px-2 py-2 whitespace-nowrap font-medium ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`} title={record.truckNo}>{record.truckNo}</td>
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`} title={record.goingDo}>{record.goingDo}</td>
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`} title={record.returnDo || 'N/A'}>
                        {isCancelled ? (
                          <span>{record.returnDo || '-'}</span>
                        ) : record.returnDo ? (
                          <span className="text-green-600 dark:text-green-400">{record.returnDo}</span>
                        ) : (
                          <span className="text-orange-500 dark:text-orange-400">-</span>
                        )}
                      </td>
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.start}</td>
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
                        {record.from}
                      </td>
                      <td className={`px-2 py-2 whitespace-nowrap ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>
                        {record.to}
                      </td>
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{record.totalLts.toLocaleString()}</td>
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.extra || '-'}</td>
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.mmsaYard || '-'}</td>
                      {renderFuelCell('tangaYard', record.tangaYard)}
                      {renderFuelCell('darYard', record.darYard)}
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.darGoing || '-'}</td>
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.moroGoing || '-'}</td>
                      {renderFuelCell('mbeyaGoing', record.mbeyaGoing)}
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.tdmGoing || '-'}</td>
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.zambiaGoing || '-'}</td>
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.congoFuel || '-'}</td>
                      {renderFuelCell('zambiaReturn', record.zambiaReturn)}
                      {renderFuelCell('tundumaReturn', record.tundumaReturn)}
                      {renderFuelCell('mbeyaReturn', record.mbeyaReturn)}
                      {renderFuelCell('moroReturn', record.moroReturn)}
                      <td className={`px-2 py-2 whitespace-nowrap text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.darReturn || '-'}</td>
                      {renderFuelCell('tangaReturn', record.tangaReturn)}
                      <td className={`px-2 py-2 whitespace-nowrap text-center font-semibold ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{record.balance.toLocaleString()}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <div className="flex space-x-1 justify-center">
                          {!isCancelled && (
                            <>
                              <button
                                onClick={(e) => handleEdit(record, e)}
                                className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="Edit"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  const id = record.id || (record as any)._id;
                                  if (id) handleDelete(id, e);
                                }}
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      <FuelRecordForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleSubmit}
        initialData={selectedRecord}
      />
      
      <FuelRecordDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedRecordId(null);
        }}
        recordId={selectedRecordId}
      />
    </div>
  );
};

export default FuelRecords;
