import React, { useState, useEffect } from 'react';
import { 
  Plus, X, FileSpreadsheet, Trash2, 
  Copy, User, AlertTriangle, FileDown, Search,
  Calendar, Fuel, DollarSign, ChevronDown, Truck, MapPin, CreditCard, Image, Download
} from 'lucide-react';
import type { DriverAccountEntry, DriverAccountWorkbook, PaymentMode, LPOSummary, FuelStationConfig } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { driverAccountAPI, deliveryOrdersAPI } from '../services/api';
import { configService } from '../services/configService';
import { copyLPOImageToClipboard, downloadLPOPDF, downloadLPOImage } from '../utils/lpoImageGenerator';
import XLSX from 'xlsx-js-style';

interface DriverAccountWorkbookProps {
  initialYear?: number;
  onClose?: () => void;
}

const DriverAccountWorkbookComponent: React.FC<DriverAccountWorkbookProps> = ({ 
  initialYear = new Date().getFullYear(),
  onClose 
}) => {
  const { user } = useAuth();
  const [workbook, setWorkbook] = useState<DriverAccountWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string | number>>(new Set());
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [dateFilter, setDateFilter] = useState({ from: '', to: '' });
  const [openEntryDropdown, setOpenEntryDropdown] = useState<string | number | null>(null);
  const [entryDropdownPosition, setEntryDropdownPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);

  // Current year for reference
  const currentYear = new Date().getFullYear();

  // Fetch available years from API
  useEffect(() => {
    const fetchAvailableYears = async () => {
      try {
        const years = await driverAccountAPI.getAvailableYears();
        // Always include current year, sort descending (newest first)
        const yearsSet = new Set([...years, currentYear]);
        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        setAvailableYears(sortedYears);
      } catch (error) {
        console.error('Error fetching available years:', error);
        // Fallback to current year only
        setAvailableYears([currentYear]);
      }
    };
    fetchAvailableYears();
  }, [currentYear]);

  // Load workbook from API
  useEffect(() => {
    loadWorkbook();
  }, [selectedYear]);

  // Close entry dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openEntryDropdown !== null && !(event.target as Element).closest('.relative')) {
        setOpenEntryDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openEntryDropdown]);

  const loadWorkbook = async () => {
    setLoading(true);
    try {
      const data = await driverAccountAPI.getByYear(selectedYear);
      
      if (data) {
        setWorkbook(data);
      } else {
        // Create empty workbook for display
        const newWorkbook: DriverAccountWorkbook = {
          id: `da-${selectedYear}`,
          year: selectedYear,
          name: `DRIVER ACCOUNTS ${selectedYear}`,
          entries: [],
          totalLiters: 0,
          totalAmount: 0,
          createdAt: new Date().toISOString()
        };
        setWorkbook(newWorkbook);
      }
    } catch (error) {
      console.error('Error loading driver account workbook:', error);
      // Set empty workbook on error
      setWorkbook({
        id: `da-${selectedYear}`,
        year: selectedYear,
        name: `DRIVER ACCOUNTS ${selectedYear}`,
        entries: [],
        totalLiters: 0,
        totalAmount: 0,
        createdAt: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const addEntry = async (entry: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!workbook) return;

    try {
      await driverAccountAPI.create({
        ...entry,
        createdBy: user?.username || 'Unknown'
      } as any);
      
      // Reload workbook to get updated data
      await loadWorkbook();
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding entry:', error);
      alert('Failed to add entry. Please try again.');
    }
  };

  const addBatchEntries = async (entries: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'createdBy'>[]) => {
    if (!workbook || entries.length === 0) return;

    try {
      await driverAccountAPI.createBatch(entries.map(entry => ({
        ...entry,
        createdBy: user?.username || 'Unknown'
      } as any)));
      
      // Reload workbook to get updated data
      await loadWorkbook();
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding batch entries:', error);
      alert('Failed to add entries. Please try again.');
    }
  };

  const deleteEntry = async (entryId: string | number) => {
    if (!workbook || !window.confirm('Are you sure you want to delete this entry?')) return;

    try {
      await driverAccountAPI.delete(String(entryId));
      await loadWorkbook();
      setSelectedEntries(prev => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const deleteSelectedEntries = async () => {
    if (!workbook || selectedEntries.size === 0) return;
    if (!window.confirm(`Delete ${selectedEntries.size} selected entries?`)) return;

    try {
      for (const entryId of selectedEntries) {
        await driverAccountAPI.delete(String(entryId));
      }
      await loadWorkbook();
      setSelectedEntries(new Set());
    } catch (error) {
      console.error('Error deleting entries:', error);
      alert('Failed to delete some entries. Please try again.');
    }
  };

  // Filter entries
  const filteredEntries = workbook?.entries.filter(entry => {
    const matchesSearch = !searchTerm || 
      entry.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.driverName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.lpoNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.notes?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDateFrom = !dateFilter.from || entry.date >= dateFilter.from;
    const matchesDateTo = !dateFilter.to || entry.date <= dateFilter.to;

    return matchesSearch && matchesDateFrom && matchesDateTo;
  }) || [];

  // Helper function to apply borders and center alignment to worksheet
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
      { wch: 12 },  // Truck No
      { wch: 15 },  // Driver Name
      { wch: 12 },  // Original DO
      { wch: 10 },  // Liters
      { wch: 10 },  // Rate
      { wch: 15 },  // Amount
      { wch: 15 },  // Station
      { wch: 10 },  // Status
      { wch: 10 },  // LPO No
      { wch: 12 },  // Created By (Prepared By)
      { wch: 15 },  // Approved By
      { wch: 20 },  // Notes
    ];
  };

  // Export functions
  const exportToExcel = () => {
    if (!workbook || filteredEntries.length === 0) return;

    const data = filteredEntries.map((entry, index) => ({
      'S/N': index + 1,
      'Date': entry.date,
      'Truck No': entry.truckNo,
      'Driver Name': entry.driverName || 'N/A',
      'Original DO': entry.originalDoNo || entry.doNo || 'N/A',
      'Liters': entry.liters,
      'Rate': entry.rate,
      'Amount': entry.amount,
      'Station': entry.station,
      'Status': entry.status || 'pending',
      'LPO No': entry.lpoNo,
      'Prepared By': entry.createdBy || 'N/A',
      'Approved By': entry.approvedBy || 'N/A',
      'Notes': entry.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    applyExcelStyles(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Driver Accounts ${selectedYear}`);
    XLSX.writeFile(wb, `DRIVER_ACCOUNTS_${selectedYear}.xlsx`);
  };

  const copyToClipboard = async (format: 'text' | 'whatsapp') => {
    if (!workbook || filteredEntries.length === 0) return;

    let text = '';
    
    if (format === 'whatsapp') {
      text = `*DRIVER ACCOUNTS ${selectedYear}*\n\n`;
      filteredEntries.forEach((entry, index) => {
        text += `${index + 1}. *${entry.truckNo}*\n`;
        text += `   📅 ${entry.date}\n`;
        text += `   ⛽ ${entry.liters}L @ ${entry.rate}\n`;
        text += `   💰 Amount: ${entry.amount.toLocaleString()}\n`;
        text += `   📍 ${entry.station}\n`;
        text += `   ⚠️ ${entry.notes || 'Driver Account'}\n\n`;
      });
      text += `*TOTAL: ${workbook.totalLiters}L - ${workbook.totalAmount.toLocaleString()}*`;
    } else {
      text = `DRIVER ACCOUNTS ${selectedYear}\n`;
      text += `${'='.repeat(50)}\n\n`;
      filteredEntries.forEach((entry, index) => {
        text += `${index + 1}. ${entry.truckNo} - ${entry.date}\n`;
        text += `   ${entry.liters}L @ ${entry.rate} = ${entry.amount}\n`;
        text += `   Station: ${entry.station} | Status: ${entry.status || 'pending'}\n\n`;
      });
      text += `\nTOTAL: ${workbook.totalLiters}L - ${workbook.totalAmount.toLocaleString()}`;
    }

    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
    setShowCopyDropdown(false);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Convert driver account entry to LPO Summary format for image/PDF generation
  const convertToLPOSummary = (entry: DriverAccountEntry): LPOSummary => {
    // Parse date for formatting
    const entryDate = new Date(entry.date);
    const formattedDate = entryDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    return {
      lpoNo: entry.lpoNo,
      date: formattedDate,
      station: entry.station,
      orderOf: 'DRIVER ACCOUNT',
      entries: [{
        doNo: 'NIL',
        truckNo: entry.truckNo,
        liters: entry.liters,
        rate: entry.rate,
        amount: entry.amount,
        dest: 'NIL',
        isDriverAccount: true
      }],
      total: entry.amount
    };
  };

  // Handle copy as image for a single entry
  const handleCopyEntryAsImage = async (entry: DriverAccountEntry) => {
    try {
      const lpoSummary = convertToLPOSummary(entry);
      const success = await copyLPOImageToClipboard(lpoSummary, user?.username, entry.approvedBy);
      
      if (success) {
        alert('✓ Driver Account LPO image copied to clipboard!\nYou can now paste it anywhere.');
      } else {
        alert('Failed to copy image to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying image:', error);
      alert('Failed to copy image. Your browser may not support this feature.');
    }
  };

  // Handle download as PDF for a single entry
  const handleDownloadEntryPDF = async (entry: DriverAccountEntry) => {
    try {
      const lpoSummary = convertToLPOSummary(entry);
      await downloadLPOPDF(lpoSummary, undefined, user?.username, entry.approvedBy);
      alert('✓ Driver Account LPO PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download PDF. Please try again.');
    }
  };

  // Handle download as Image for a single entry  
  const handleDownloadEntryImage = async (entry: DriverAccountEntry) => {
    try {
      const lpoSummary = convertToLPOSummary(entry);
      await downloadLPOImage(lpoSummary, undefined, user?.username, entry.approvedBy);
      alert('✓ Driver Account LPO image downloaded successfully!');
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download image. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="border-b dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <User className="w-6 h-6 text-red-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Driver's Account
            </h1>
            {/* Year Filter */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm font-medium"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-full">
              {workbook?.entries.length || 0} entries
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Copy/Download Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Copy className="w-4 h-4 mr-2" />
                Export
                <ChevronDown className="w-4 h-4 ml-1" />
              </button>
              
              {showCopyDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => copyToClipboard('text')}
                    className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy as Text
                  </button>
                  <button
                    onClick={() => copyToClipboard('whatsapp')}
                    className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Copy for WhatsApp
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-600"></div>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <FileDown className="w-4 h-4 mr-2 text-green-600" />
                    Export to Excel
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </button>

            {selectedEntries.size > 0 && (
              <button
                onClick={deleteSelectedEntries}
                className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedEntries.size})
              </button>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by truck, driver, LPO, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateFilter.from}
              onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateFilter.to}
              onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Entries</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {filteredEntries.length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Fuel className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Liters</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(filteredEntries.reduce((sum, e) => sum + e.liters, 0))}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Amount</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(filteredEntries.reduce((sum, e) => sum + e.amount, 0))}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg per Entry</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {filteredEntries.length > 0 
                    ? formatCurrency(filteredEntries.reduce((sum, e) => sum + e.liters, 0) / filteredEntries.length)
                    : 0}L
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-gray-300 dark:border-gray-600">
            <div className="grid grid-cols-12 gap-0">
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                <input
                  type="checkbox"
                  checked={selectedEntries.size === filteredEntries.length && filteredEntries.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedEntries(new Set(filteredEntries.map(e => e.id!)));
                    } else {
                      setSelectedEntries(new Set());
                    }
                  }}
                  className="w-4 h-4"
                />
              </div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">Date</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 col-span-2">Truck No</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">DO (Ref)</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 text-right">Liters</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 text-right">Rate</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 text-right">Amount</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">Station</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 col-span-2">Reason</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 text-center">Actions</div>
            </div>
          </div>

          {/* Table Body */}
          {filteredEntries.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
              <User className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-medium">No driver account entries</p>
              <p className="text-sm mt-1">Add entries for fuel given due to misuse or theft</p>
            </div>
          ) : (
            filteredEntries.map((entry, index) => (
              <div 
                key={entry.id || `${entry.lpoNo}-${entry.date}-${entry.truckNo}-${index}`} 
                className={`border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  selectedEntries.has(entry.id!) ? 'bg-red-50 dark:bg-red-900/10' : ''
                }`}
              >
                <div className="grid grid-cols-12 gap-0">
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedEntries.has(entry.id!)}
                      onChange={(e) => {
                        setSelectedEntries(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.add(entry.id!);
                          } else {
                            next.delete(entry.id!);
                          }
                          return next;
                        });
                      }}
                      className="w-4 h-4"
                    />
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                    {entry.date}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 col-span-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {entry.truckNo}
                    {entry.driverName && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">{entry.driverName}</span>
                    )}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-orange-600 dark:text-orange-400">
                    NIL
                    <span className="text-xs text-gray-400 dark:text-gray-500 block">({entry.originalDoNo || entry.doNo || 'N/A'})</span>
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-right text-gray-900 dark:text-gray-100">
                    {entry.liters}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-right text-gray-700 dark:text-gray-300">
                    {entry.rate}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(entry.amount)}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                    {entry.station}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 col-span-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      entry.status === 'settled' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                      entry.status === 'disputed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>
                      {entry.status?.toUpperCase() || 'PENDING'}
                    </span>
                    {entry.notes && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1">{entry.notes}</span>
                    )}
                  </div>
                  <div className="px-3 py-2 text-center relative">
                    <div className="flex items-center justify-center space-x-1">
                      {/* Actions dropdown */}
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setEntryDropdownPosition({
                              top: rect.bottom + 4,
                              left: rect.right - 192 // 192px = w-48
                            });
                            setOpenEntryDropdown(openEntryDropdown === entry.id ? null : entry.id!);
                          }}
                          className="p-1 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                          title="More actions"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        
                        {openEntryDropdown === entry.id && (
                          <div 
                            className="fixed w-48 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50"
                            style={{ top: entryDropdownPosition.top, left: entryDropdownPosition.left }}
                          >
                            <button
                              onClick={() => {
                                handleCopyEntryAsImage(entry);
                                setOpenEntryDropdown(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                              <Image className="w-4 h-4 mr-2 text-green-600" />
                              Copy as Image
                            </button>
                            <button
                              onClick={() => {
                                handleDownloadEntryPDF(entry);
                                setOpenEntryDropdown(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                              <Download className="w-4 h-4 mr-2 text-blue-600" />
                              Download PDF
                            </button>
                            <button
                              onClick={() => {
                                handleDownloadEntryImage(entry);
                                setOpenEntryDropdown(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                              <FileDown className="w-4 h-4 mr-2 text-purple-600" />
                              Download Image
                            </button>
                            <div className="border-t border-gray-200 dark:border-gray-600"></div>
                            <button
                              onClick={() => {
                                deleteEntry(entry.id!);
                                setOpenEntryDropdown(null);
                              }}
                              className="flex items-center w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete Entry
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      {showAddForm && (
        <AddDriverAccountEntryModal
          onClose={() => setShowAddForm(false)}
          onSubmit={addEntry}
          onSubmitBatch={addBatchEntries}
        />
      )}
    </div>
  );
};

// Add Entry Modal Component with multiple trucks support
interface AddDriverAccountEntryModalProps {
  onClose: () => void;
  onSubmit: (entry: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'createdBy'>) => void;
  onSubmitBatch?: (entries: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'createdBy'>[]) => void;
}

interface TruckEntry {
  truckNo: string;
  driverName: string;
  liters: number;
  originalDoNo: string;
}

const AddDriverAccountEntryModal: React.FC<AddDriverAccountEntryModalProps> = ({ onClose, onSubmit, onSubmitBatch }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    station: '',
    lpoNo: '',
    rate: 1.2,
    journeyDirection: 'going' as 'going' | 'returning',
    paymentMode: 'CASH' as PaymentMode,
    paybillOrMobile: '',
    approvedBy: '',
    notes: ''
  });

  // Multiple trucks support
  const [trucks, setTrucks] = useState<TruckEntry[]>([
    { truckNo: '', driverName: '', liters: 0, originalDoNo: '' }
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingLPO, setIsFetchingLPO] = useState(false);
  const [isFetchingDO, setIsFetchingDO] = useState<number | null>(null);
  
  // Dynamic stations
  const [availableStations, setAvailableStations] = useState<FuelStationConfig[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);

  // Load stations from database
  useEffect(() => {
    const loadStations = async () => {
      try {
        setLoadingStations(true);
        const stations = await configService.getActiveStations();
        setAvailableStations(stations);
      } catch (error) {
        console.error('Failed to load stations:', error);
      } finally {
        setLoadingStations(false);
      }
    };
    loadStations();
  }, []);

  // Fetch next LPO number on mount
  useEffect(() => {
    const fetchNextLPO = async () => {
      setIsFetchingLPO(true);
      try {
        const nextLpoNo = await driverAccountAPI.getNextLPONumber();
        setFormData(prev => ({ ...prev, lpoNo: nextLpoNo }));
      } catch (error) {
        console.error('Error fetching next LPO number:', error);
      } finally {
        setIsFetchingLPO(false);
      }
    };
    fetchNextLPO();
  }, []);

  // Fetch DO for a truck
  const fetchDOForTruck = async (index: number, truckNo: string) => {
    if (!truckNo || truckNo.length < 4) return;
    
    setIsFetchingDO(index);
    try {
      // Fetch all DOs for this truck
      const allDOs = await deliveryOrdersAPI.getAll({ truckNo });
      
      if (allDOs && allDOs.length > 0) {
        // Get the most recent DO based on journey direction
        const relevantDOs = formData.journeyDirection === 'going'
          ? allDOs.filter(d => d.importOrExport === 'IMPORT')
          : allDOs.filter(d => d.importOrExport === 'EXPORT');
        
        if (relevantDOs.length > 0) {
          // Sort by date descending and get the most recent
          const sortedDOs = relevantDOs.sort((a, b) => 
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );
          const latestDO = sortedDOs[0];
          
          setTrucks(prev => prev.map((t, i) => 
            i === index ? { ...t, originalDoNo: latestDO.doNumber } : t
          ));
        }
      }
    } catch (error) {
      console.error('Error fetching DO for truck:', error);
    } finally {
      setIsFetchingDO(null);
    }
  };

  const addTruck = () => {
    setTrucks(prev => [...prev, { truckNo: '', driverName: '', liters: 0, originalDoNo: '' }]);
  };

  const removeTruck = (index: number) => {
    if (trucks.length === 1) return;
    setTrucks(prev => prev.filter((_, i) => i !== index));
  };

  const updateTruck = (index: number, field: keyof TruckEntry, value: string | number) => {
    setTrucks(prev => prev.map((t, i) => 
      i === index ? { ...t, [field]: value } : t
    ));
    
    // Auto-fetch DO when truck number changes
    if (field === 'truckNo' && typeof value === 'string' && value.length >= 4) {
      fetchDOForTruck(index, value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Filter out empty trucks
      const validTrucks = trucks.filter(t => t.truckNo && t.liters > 0);
      
      if (validTrucks.length === 0) {
        alert('Please add at least one truck with liters');
        setIsLoading(false);
        return;
      }

      if (validTrucks.length === 1) {
        // Single entry
        const truck = validTrucks[0];
        onSubmit({
          date: formData.date,
          truckNo: truck.truckNo.toUpperCase(),
          driverName: truck.driverName,
          liters: truck.liters,
          rate: formData.rate,
          amount: truck.liters * formData.rate,
          station: formData.station,
          lpoNo: formData.lpoNo,
          journeyDirection: formData.journeyDirection,
          originalDoNo: truck.originalDoNo,
          paymentMode: formData.paymentMode,
          paybillOrMobile: formData.paybillOrMobile,
          approvedBy: formData.approvedBy,
          notes: formData.notes,
        });
      } else if (onSubmitBatch) {
        // Multiple entries
        const entries = validTrucks.map(truck => ({
          date: formData.date,
          truckNo: truck.truckNo.toUpperCase(),
          driverName: truck.driverName,
          liters: truck.liters,
          rate: formData.rate,
          amount: truck.liters * formData.rate,
          station: formData.station,
          lpoNo: formData.lpoNo,
          journeyDirection: formData.journeyDirection,
          originalDoNo: truck.originalDoNo,
          paymentMode: formData.paymentMode,
          paybillOrMobile: formData.paybillOrMobile,
          approvedBy: formData.approvedBy,
          notes: formData.notes,
        }));
        onSubmitBatch(entries);
      }
      
      onClose();
    } catch (error) {
      console.error('Error submitting driver account entry:', error);
      alert('Failed to create entry. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Build stations list: dynamic stations from database + CASH
  const stations = [
    ...availableStations.map(s => s.stationName),
    'CASH',  // Always include CASH option
  ];

  const paymentModes: { value: PaymentMode; label: string }[] = [
    { value: 'TIGO_LIPA', label: 'Tigo Lipa' },
    { value: 'VODA_LIPA', label: 'Voda Lipa' },
    { value: 'SELCOM', label: 'Selcom' },
    { value: 'CASH', label: 'Cash' },
  ];

  const totalAmount = trucks.reduce((sum, t) => sum + (t.liters * formData.rate), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Create Driver Account LPO
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Warning Banner */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-red-800 dark:text-red-300">Driver's Account LPO</h4>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                This creates an LPO for Driver's Account. DO and destination will show as NIL in exports. 
                This entry will NOT update fuel records.
              </p>
            </div>
          </div>

          {/* Header Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">LPO No *</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.lpoNo}
                  onChange={(e) => setFormData(prev => ({ ...prev, lpoNo: e.target.value }))}
                  required
                  placeholder="Auto-fetched"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                {isFetchingLPO && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Station *</label>
              <select
                value={formData.station}
                onChange={(e) => setFormData(prev => ({ ...prev, station: e.target.value }))}
                required
                disabled={loadingStations}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">{loadingStations ? 'Loading stations...' : 'Select Station'}</option>
                {stations.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rate per Liter *</label>
              <input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Journey Direction - for DO reference */}
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div>
              <label className="block text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Journey Direction *
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="journeyDirection"
                    value="going"
                    checked={formData.journeyDirection === 'going'}
                    onChange={() => setFormData(prev => ({ ...prev, journeyDirection: 'going' }))}
                    className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Going</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="journeyDirection"
                    value="returning"
                    checked={formData.journeyDirection === 'returning'}
                    onChange={() => setFormData(prev => ({ ...prev, journeyDirection: 'returning' }))}
                    className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Returning</span>
                </label>
              </div>
            </div>
          </div>

          {/* Payment Section */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3 flex items-center">
              <CreditCard className="w-4 h-4 mr-2" />
              Payment Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                  Payment Mode *
                </label>
                <select
                  value={formData.paymentMode}
                  onChange={(e) => setFormData(prev => ({ ...prev, paymentMode: e.target.value as PaymentMode, paybillOrMobile: e.target.value === 'CASH' ? '' : prev.paybillOrMobile }))}
                  required
                  className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  {paymentModes.map(pm => (
                    <option key={pm.value} value={pm.value}>{pm.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                  {formData.paymentMode === 'CASH' ? 'Paybill / Mobile (N/A for Cash)' : (
                    formData.paymentMode === 'TIGO_LIPA' ? 'Tigo Pesa Paybill Number *' :
                    formData.paymentMode === 'VODA_LIPA' ? 'Vodacom M-Pesa Paybill Number *' :
                    formData.paymentMode === 'SELCOM' ? 'Selcom Paybill Number *' :
                    'Paybill / Mobile Number *'
                  )}
                </label>
                <input
                  type="text"
                  value={formData.paybillOrMobile}
                  onChange={(e) => setFormData(prev => ({ ...prev, paybillOrMobile: e.target.value }))}
                  placeholder={
                    formData.paymentMode === 'CASH' ? 'Not required for cash payment' :
                    formData.paymentMode === 'TIGO_LIPA' ? 'Enter Tigo Lipa paybill (e.g., 0711234567)' :
                    formData.paymentMode === 'VODA_LIPA' ? 'Enter M-Pesa paybill (e.g., 123456)' :
                    formData.paymentMode === 'SELCOM' ? 'Enter Selcom paybill number' :
                    'Enter paybill or mobile number'
                  }
                  disabled={formData.paymentMode === 'CASH'}
                  required={formData.paymentMode !== 'CASH'}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 ${
                    formData.paymentMode === 'CASH' 
                      ? 'bg-gray-100 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  }`}
                />
                {formData.paymentMode !== 'CASH' && !formData.paybillOrMobile && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Please enter the paybill number for {formData.paymentMode.replace('_', ' ')} payment
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Approved By Section */}
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-3 flex items-center">
              <User className="w-4 h-4 mr-2" />
              Approval Information (for LPO document)
            </h4>
            <div>
              <label className="block text-sm font-medium text-green-800 dark:text-green-300 mb-2">
                Approved By *
              </label>
              <input
                type="text"
                value={formData.approvedBy}
                onChange={(e) => setFormData(prev => ({ ...prev, approvedBy: e.target.value }))}
                placeholder="Enter name of approver"
                required
                className="w-full px-3 py-2 border border-green-300 dark:border-green-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                This name will appear on the LPO document when copied as image or downloaded as PDF
              </p>
            </div>
          </div>

          {/* Trucks Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center">
                <Truck className="w-5 h-5 mr-2" />
                Trucks ({trucks.length})
              </h3>
              <button
                type="button"
                onClick={addTruck}
                className="flex items-center px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Truck
              </button>
            </div>

            <div className="space-y-3">
              {trucks.map((truck, index) => (
                <div key={index} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Truck #{index + 1}
                    </span>
                    {trucks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTruck(index)}
                        className="p-1 text-red-600 hover:text-red-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Truck No *</label>
                      <input
                        type="text"
                        value={truck.truckNo}
                        onChange={(e) => updateTruck(index, 'truckNo', e.target.value.toUpperCase())}
                        required
                        placeholder="e.g., T530 DRF"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Driver Name</label>
                      <input
                        type="text"
                        value={truck.driverName}
                        onChange={(e) => updateTruck(index, 'driverName', e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        DO Reference
                        {isFetchingDO === index && <span className="ml-1 text-blue-500">(fetching...)</span>}
                      </label>
                      <input
                        type="text"
                        value={truck.originalDoNo}
                        onChange={(e) => updateTruck(index, 'originalDoNo', e.target.value)}
                        placeholder="Auto-fetched"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Liters *</label>
                      <input
                        type="number"
                        value={truck.liters || ''}
                        onChange={(e) => updateTruck(index, 'liters', parseFloat(e.target.value) || 0)}
                        required
                        min="0"
                        step="0.01"
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                  </div>
                  
                  {truck.liters > 0 && (
                    <div className="mt-2 text-right text-sm text-gray-600 dark:text-gray-400">
                      Amount: <span className="font-medium text-gray-900 dark:text-gray-100">
                        {(truck.liters * formData.rate).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Additional notes (optional)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Total Amount */}
          <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center text-lg">
              <span className="font-medium text-gray-700 dark:text-gray-300">Total Amount:</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {totalAmount.toLocaleString()} ({trucks.filter(t => t.liters > 0).length} truck{trucks.filter(t => t.liters > 0).length !== 1 ? 's' : ''})
              </span>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center"
            >
              {isLoading && <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>}
              Create Driver Account LPO
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DriverAccountWorkbookComponent;
