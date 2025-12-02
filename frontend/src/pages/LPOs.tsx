import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Download, Trash2, FileSpreadsheet, List, Grid, BarChart3, Copy, MessageSquare, Image, ChevronDown, FileDown, Wallet, Calendar } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import type { LPOEntry, LPOSummary as LPOSummaryType, LPOWorkbook as LPOWorkbookType } from '../types';
import { lposAPI, lpoDocumentsAPI, lpoWorkbookAPI } from '../services/api';
import LPODetailForm from '../components/LPODetailForm';
import LPOWorkbook from '../components/LPOWorkbook';
import LPOSummaryComponent from '../components/LPOSummary';
import DriverAccountWorkbook from '../components/DriverAccountWorkbook';
import { PermissionGuard } from '../components/ProtectedRoute';
import { RESOURCES, ACTIONS } from '../utils/permissions';
import { copyLPOImageToClipboard, downloadLPOPDF, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import { useAuth } from '../contexts/AuthContext';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];


const LPOs = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [lpos, setLpos] = useState<LPOEntry[]>([]);
  const [filteredLpos, setFilteredLpos] = useState<LPOEntry[]>([]);
  const [workbooks, setWorkbooks] = useState<LPOWorkbookType[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [isDetailFormOpen, setIsDetailFormOpen] = useState(false);
  const [stationFilter, setStationFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  // Month filter - default to current month (1-indexed)
  const [selectedMonths, setSelectedMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const VIEW_MODES = ['list', 'workbook', 'summary', 'driver_account'] as const;
  type ViewMode = typeof VIEW_MODES[number];
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | number | null>(null);
  const [summaryFilters, setSummaryFilters] = useState({
    stations: [] as string[],
    dateFrom: '',
    dateTo: ''
  });
  const [openDropdowns, setOpenDropdowns] = useState<{[key: string | number]: boolean}>({});
  const [dropdownPosition, setDropdownPosition] = useState<{top: number, left: number}>({top: 0, left: 0});
  const [exportingYear, setExportingYear] = useState<number | null>(null);
  const [selectedLpoNo, setSelectedLpoNo] = useState<string | null>(null);

  useEffect(() => {
    fetchLpos();
    fetchWorkbooks();
    fetchAvailableYears();
  }, []);

  useEffect(() => {
    filterLpos();
  }, [searchTerm, stationFilter, dateFilter, selectedMonths, lpos]);

  // Helper to parse date from various formats (e.g., "2-Dec", "1-Dec", "2025-12-02")
  const getMonthFromDate = (dateStr: string): number | null => {
    if (!dateStr) return null;
    
    // Try parsing "D-MMM" format (e.g., "2-Dec")
    const shortMonthMatch = dateStr.match(/^\d{1,2}-(\w{3})$/i);
    if (shortMonthMatch) {
      const monthAbbr = shortMonthMatch[1].toLowerCase();
      const monthMap: { [key: string]: number } = {
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
      };
      return monthMap[monthAbbr] || null;
    }
    
    // Try parsing ISO format "YYYY-MM-DD"
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      return parseInt(isoMatch[2], 10);
    }
    
    // Try parsing as Date object
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.getMonth() + 1;
    }
    
    return null;
  };

  // Get unique stations from the data
  const availableStations = useMemo(() => {
    const stations = new Set<string>();
    lpos.forEach(lpo => {
      if (lpo.dieselAt && lpo.dieselAt.trim()) {
        stations.add(lpo.dieselAt.trim().toUpperCase());
      }
    });
    return Array.from(stations).sort();
  }, [lpos]);

  // Get months that have data
  const availableMonths = useMemo(() => {
    const months = new Set<number>();
    lpos.forEach(lpo => {
      const month = getMonthFromDate(lpo.date);
      if (month !== null) {
        months.add(month);
      }
    });
    return Array.from(months).sort((a, b) => a - b);
  }, [lpos]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target as Element).closest('.relative')) {
        closeAllDropdowns();
      }
      // Close month dropdown if clicking outside
      if (!(event.target as Element).closest('.month-dropdown-container')) {
        setShowMonthDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchLpos = async () => {
    try {
      setLoading(true);
      const data = await lposAPI.getAll();
      // Ensure data is always an array
      const lposData = Array.isArray(data) ? data : [];
      setLpos(lposData);
      setFilteredLpos(lposData);
    } catch (error) {
      console.error('Error fetching LPOs:', error);
      setLpos([]);
      setFilteredLpos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkbooks = async () => {
    try {
      const data = await lpoWorkbookAPI.getAll();
      // Ensure data is always an array
      setWorkbooks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching workbooks:', error);
      setWorkbooks([]);
    }
  };

  const fetchAvailableYears = async () => {
    try {
      const years = await lpoWorkbookAPI.getAvailableYears();
      if (years.length > 0) {
        setAvailableYears(years);
        setSelectedYear(years[0]); // Most recent year
      } else {
        // Default to current year if no years available
        const currentYear = new Date().getFullYear();
        setAvailableYears([currentYear]);
        setSelectedYear(currentYear);
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      const currentYear = new Date().getFullYear();
      setAvailableYears([currentYear]);
      setSelectedYear(currentYear);
    }
  };

  const handleExportWorkbook = async (year: number) => {
    try {
      setExportingYear(year);
      await lpoWorkbookAPI.exportWorkbook(year);
      alert(`✓ Workbook LPOS_${year}.xlsx downloaded successfully!`);
    } catch (error: any) {
      console.error('Error exporting workbook:', error);
      if (error.response?.status === 404) {
        alert(`No LPO documents found for year ${year}`);
      } else {
        alert('Failed to export workbook. Please try again.');
      }
    } finally {
      setExportingYear(null);
    }
  };

  // Convert LPO entry to LPOSummary format for image generation
  // Groups all entries with the same LPO number
  const convertToLPOSummary = (lpo: LPOEntry): LPOSummaryType => {
    // Find all entries with the same LPO number
    const sameLoEntries = filteredLpos.filter(entry => entry.lpoNo === lpo.lpoNo);
    
    const entries = sameLoEntries.map(entry => ({
      doNo: entry.doSdo || 'NIL',
      truckNo: entry.truckNo,
      liters: entry.ltrs,
      rate: entry.pricePerLtr,
      amount: entry.ltrs * entry.pricePerLtr,
      dest: entry.destinations || 'NIL'
    }));
    
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    
    return {
      lpoNo: lpo.lpoNo,
      date: lpo.date,
      station: lpo.dieselAt,
      orderOf: 'TAHMEED', // Default value, can be made configurable
      entries: entries,
      total: total
    };
  };

  // Handle copy LPO image to clipboard
  const handleCopyImageToClipboard = async (lpo: LPOEntry) => {
    closeAllDropdowns();
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      const success = await copyLPOImageToClipboard(lpoSummary, user?.username);
      
      if (success) {
        alert('✓ LPO image copied to clipboard successfully!\nYou can now paste it anywhere.');
      } else {
        alert('Failed to copy LPO image to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying image to clipboard:', error);
      alert('Failed to copy LPO image to clipboard. Your browser may not support this feature.');
    }
  };

  // Handle download LPO as PDF
  const handleDownloadPDF = async (lpo: LPOEntry) => {
    closeAllDropdowns();
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      await downloadLPOPDF(lpoSummary, undefined, user?.username);
      alert('✓ LPO PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Failed to download LPO as PDF. Please try again.');
    }
  };

  // Handle download LPO as Image
  const handleDownloadImage = async (lpo: LPOEntry) => {
    closeAllDropdowns();
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      await downloadLPOImage(lpoSummary, undefined, user?.username);
      alert('✓ LPO image downloaded successfully!');
    } catch (error) {
      console.error('Error downloading image:', error);
      alert('Failed to download LPO as image. Please try again.');
    }
  };

  // Handle copy LPO text for WhatsApp
  const handleCopyWhatsAppText = async (lpo: LPOEntry) => {
    closeAllDropdowns();
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      const success = await copyLPOForWhatsApp(lpoSummary);
      
      if (success) {
        alert('✓ LPO text for WhatsApp copied to clipboard successfully!\nYou can now paste it in WhatsApp.');
      } else {
        alert('Failed to copy LPO text to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying WhatsApp text to clipboard:', error);
      alert('Failed to copy LPO text to clipboard.');
    }
  };

  // Handle copy LPO as CSV text
  const handleCopyCsvText = async (lpo: LPOEntry) => {
    closeAllDropdowns();
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      const success = await copyLPOTextToClipboard(lpoSummary);
      
      if (success) {
        alert('✓ LPO CSV text copied to clipboard successfully!');
      } else {
        alert('Failed to copy LPO CSV text to clipboard. Please try again.');
      }
    } catch (error) {
      console.error('Error copying CSV text to clipboard:', error);
      alert('Failed to copy LPO CSV text to clipboard.');
    }
  };

  // Toggle dropdown menu with position calculation
  const toggleDropdown = (lpoId: string | number, event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      // Position dropdown below button, aligned to right edge
      setDropdownPosition({
        top: rect.bottom + 4,
        left: Math.max(10, rect.right - 224) // 224 = dropdown width (w-56 = 14rem = 224px)
      });
    }
    setOpenDropdowns(prev => ({
      ...prev,
      [lpoId]: !prev[lpoId]
    }));
  };

  // Close all dropdowns when clicking outside
  const closeAllDropdowns = () => {
    setOpenDropdowns({});
  };

  // Toggle month selection
  const toggleMonth = (month: number) => {
    setSelectedMonths(prev => {
      if (prev.includes(month)) {
        // Don't allow deselecting all months
        if (prev.length === 1) return prev;
        return prev.filter(m => m !== month);
      } else {
        return [...prev, month].sort((a, b) => a - b);
      }
    });
  };

  // Get display text for selected months
  const getMonthsDisplayText = (): string => {
    if (selectedMonths.length === 0) return 'Select Month';
    if (selectedMonths.length === 1) return MONTH_NAMES[selectedMonths[0] - 1];
    if (selectedMonths.length === availableMonths.length && availableMonths.length > 0) return 'All Months';
    return `${selectedMonths.length} months`;
  };

  const filterLpos = () => {
    let filtered = [...lpos];

    // Filter by selected months
    if (selectedMonths.length > 0 && selectedMonths.length < 12) {
      filtered = filtered.filter((lpo) => {
        const lpoMonth = getMonthFromDate(lpo.date);
        return lpoMonth !== null && selectedMonths.includes(lpoMonth);
      });
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (lpo) =>
          lpo.lpoNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lpo.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
          lpo.doSdo.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (stationFilter) {
      filtered = filtered.filter((lpo) => lpo.dieselAt === stationFilter);
    }

    if (dateFilter) {
      filtered = filtered.filter((lpo) => lpo.date === dateFilter);
    }

    setFilteredLpos(filtered);
  };

  const handleCreateDetailed = () => {
    setIsDetailFormOpen(true);
  };

  const handleDelete = async (id: string | number) => {
    if (window.confirm('Are you sure you want to delete this LPO entry?')) {
      try {
        await lposAPI.delete(id);
        fetchLpos();
      } catch (error) {
        console.error('Error deleting LPO:', error);
      }
    }
  };

  const handleDetailSubmit = async (data: Partial<LPOSummaryType>) => {
    try {
      // Create the LPO document - workbook is auto-created based on year
      await lpoDocumentsAPI.create(data);
      
      // Create summary entry for the LPO table (for legacy list view)
      if (data.entries && data.entries.length > 0) {
        // Convert date format from YYYY-MM-DD to D-MMM
        const formatDate = (dateStr: string) => {
          const date = new Date(dateStr);
          const day = date.getDate();
          const month = date.toLocaleDateString('en-US', { month: 'short' });
          return `${day}-${month}`;
        };
        
        // Create entries for each DO in the LPO
        for (let i = 0; i < data.entries.length; i++) {
          const entry = data.entries[i];
          const summaryEntry = {
            sn: lpos.length + i + 1,
            date: formatDate(data.date!),
            lpoNo: data.lpoNo!,
            dieselAt: data.station!,
            doSdo: entry.doNo,
            truckNo: entry.truckNo,
            ltrs: entry.liters,
            pricePerLtr: entry.rate,
            destinations: entry.dest
          };
          await lposAPI.create(summaryEntry);
        }
      }
      
      alert('LPO Document created successfully! Sheet added to workbook.');
      setIsDetailFormOpen(false);
      fetchLpos();
      fetchWorkbooks();
      fetchAvailableYears();
    } catch (error: any) {
      console.error('Error saving LPO document:', error);
      console.error('Error response:', error.response?.data);
      
      let errorMessage = 'Unknown error';
      if (error.response?.data) {
        const data = error.response.data;
        if (data.errors && Array.isArray(data.errors)) {
          // Express-validator format
          errorMessage = data.errors
            .map((e: any) => `${e.field || e.param || ''}: ${e.message || e.msg}`)
            .filter((m: string) => m.trim())
            .join('\n');
        } else if (data.message) {
          errorMessage = data.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(`Error creating LPO document:\n${errorMessage}`);
    }
  };

  const handleOpenWorkbook = (year: number) => {
    setSelectedYear(year);
    setSelectedWorkbookId(year);
    setViewMode('workbook');
  };

  // Handle row click to open LPO sheet
  const handleRowClick = (lpo: LPOEntry) => {
    // Extract year from date (format: "D-MMM" or "YYYY-MM-DD")
    let year = new Date().getFullYear();
    if (lpo.date.includes('-')) {
      const parts = lpo.date.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        // YYYY-MM-DD format
        year = parseInt(parts[0]);
      }
    }
    setSelectedLpoNo(lpo.lpoNo);
    setSelectedYear(year);
    setSelectedWorkbookId(year);
    setViewMode('workbook');
  };

  const handleCloseWorkbook = () => {
    setSelectedWorkbookId(null);
    setSelectedLpoNo(null);
    setViewMode('list');
    fetchWorkbooks(); // Refresh workbooks list
    fetchLpos(); // Refresh LPO entries to show updated values
  };

  const handleExport = () => {
    // Create worksheet data with headers
    const headers = ['S/No', 'Date', 'LPO No.', 'Station', 'DO/SDO', 'Truck No.', 'Ltrs', 'Price/Ltr', 'Dest.', 'Amount'];
    
    const data = filteredLpos.map((lpo) => [
      lpo.sn,
      lpo.date,
      lpo.lpoNo,
      lpo.dieselAt,
      lpo.doSdo,
      lpo.truckNo,
      lpo.ltrs,
      lpo.pricePerLtr,
      lpo.destinations,
      lpo.ltrs * lpo.pricePerLtr
    ]);

    // Create worksheet with headers
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

    // Set column widths
    ws['!cols'] = [
      { wch: 6 },   // S/No
      { wch: 12 },  // Date
      { wch: 10 },  // LPO No.
      { wch: 15 },  // Station
      { wch: 10 },  // DO/SDO
      { wch: 12 },  // Truck No.
      { wch: 8 },   // Ltrs
      { wch: 10 },  // Price/Ltr
      { wch: 12 },  // Dest.
      { wch: 15 },  // Amount
    ];

    // Define border and center alignment styles
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

    // Get the range of the worksheet
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    // Apply styles to all cells
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[cellRef]) {
          ws[cellRef] = { v: '' };
        }
        // Apply header style to first row, cell style to others
        ws[cellRef].s = row === 0 ? headerStyle : cellStyle;
      }
    }

    // Create workbook and add worksheet
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LPOs');

    // Generate filename with current date
    const filename = `LPOs_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Write file
    XLSX.writeFile(wb, filename);
  };

  // Calculate totals for display
  const totalLiters = filteredLpos.reduce((sum, lpo) => sum + lpo.ltrs, 0);
  const totalAmount = filteredLpos.reduce((sum, lpo) => sum + (lpo.ltrs * lpo.pricePerLtr), 0);

  // Show workbook view if selected
  if (viewMode === 'workbook' && selectedWorkbookId) {
    return (
      <div className="h-screen">
        <LPOWorkbook 
          workbookId={selectedWorkbookId} 
          onClose={handleCloseWorkbook}
          initialLpoNo={selectedLpoNo || undefined}
        />
      </div>
    );
  }

  // Show driver account workbook view if selected
  if (viewMode === 'driver_account') {
    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Driver's Account Workbook</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Track fuel entries charged to driver accounts
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-md shadow-sm">
              <button
                onClick={() => setViewMode('list')}
                className="px-3 py-2 text-sm font-medium rounded-l-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <List className="w-4 h-4 mr-1 inline" />
                List
              </button>
              <button
                onClick={() => setViewMode('summary' as ViewMode)}
                className="px-3 py-2 text-sm font-medium border-t border-b bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <BarChart3 className="w-4 h-4 mr-1 inline" />
                Summary
              </button>
              <button
                onClick={() => setViewMode('workbook')}
                className="px-3 py-2 text-sm font-medium border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Grid className="w-4 h-4 mr-1 inline" />
                Workbook
              </button>
              <button
                onClick={() => setViewMode('driver_account')}
                className="px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b bg-blue-600 text-white border-blue-600"
              >
                <Wallet className="w-4 h-4 mr-1 inline" />
                Driver Acc
              </button>
            </div>
          </div>
        </div>
        <DriverAccountWorkbook />
      </div>
    );
  }

  // Show summary view if selected
  if (viewMode === 'summary') {
    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">LPO Monthly Summary</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              View fuel purchase summaries grouped by month
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-md shadow-sm">
              <button
                onClick={() => setViewMode('list')}
                className="px-3 py-2 text-sm font-medium rounded-l-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <List className="w-4 h-4 mr-1 inline" />
                List
              </button>
            <button
              onClick={() => setViewMode('summary' as ViewMode)}
              className="px-3 py-2 text-sm font-medium border-t border-b bg-blue-600 text-white border-blue-600"
              >
                <BarChart3 className="w-4 h-4 mr-1 inline" />
                Summary
              </button>
              <button
                onClick={() => setViewMode('workbook')}
                className="px-3 py-2 text-sm font-medium border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Grid className="w-4 h-4 mr-1 inline" />
                Workbook
              </button>
              <button
                onClick={() => setViewMode('driver_account')}
                className="px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Wallet className="w-4 h-4 mr-1 inline" />
                Driver Acc
              </button>
            </div>
          </div>
        </div>
        <LPOSummaryComponent 
          lpoEntries={lpos} 
          selectedStations={summaryFilters.stations}
          dateFrom={summaryFilters.dateFrom}
          dateTo={summaryFilters.dateTo}
          onFiltersChange={setSummaryFilters}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Local Purchase Orders (LPOs)</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage fuel purchase orders and diesel supplies
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-3">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md shadow-sm">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 text-sm font-medium rounded-l-md border ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-4 h-4 mr-1 inline" />
              List
            </button>
            <button
              onClick={() => setViewMode('summary' as ViewMode)}
              className={`px-3 py-2 text-sm font-medium border-t border-b ${
                (viewMode as ViewMode) === 'summary'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4 mr-1 inline" />
              Summary
            </button>
            <button
              onClick={() => setViewMode('workbook')}
              className={`px-3 py-2 text-sm font-medium border ${
                viewMode === 'workbook'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Grid className="w-4 h-4 mr-1 inline" />
              Workbook
            </button>
            <button
              onClick={() => setViewMode('driver_account')}
              className={`px-3 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                (viewMode as ViewMode) === 'driver_account'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Wallet className="w-4 h-4 mr-1 inline" />
              Driver Acc
            </button>
          </div>
          
          <PermissionGuard resource={RESOURCES.LPOS} action={ACTIONS.EXPORT}>
            <button
              onClick={handleExport}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </PermissionGuard>
          <PermissionGuard resource={RESOURCES.LPOS} action={ACTIONS.CREATE}>
            <button
              onClick={handleCreateDetailed}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create LPO Document
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Workbook Management Section */}
      {viewMode === 'workbook' && (
        <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-6 mb-6 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">LPO Workbooks by Year</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Each workbook contains LPO sheets for a specific year</p>
          </div>
          
          {/* Year Selection for Export */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Export Workbook</h3>
            <div className="flex items-center gap-4">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>LPOS {year}</option>
                ))}
              </select>
              <button
                onClick={() => handleExportWorkbook(selectedYear)}
                disabled={exportingYear !== null}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
              >
                {exportingYear === selectedYear ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4 mr-2" />
                    Download Excel
                  </>
                )}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workbooks.map((workbook) => (
              <div
                key={workbook.id || workbook.year}
                className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {workbook.name}
                      </h3>
                    </div>
                    <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <p>{workbook.sheetCount || 0} LPO sheets</p>
                      <p>Year: {workbook.year}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenWorkbook(workbook.year)}
                      className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    >
                      Open
                    </button>
                    <button
                      onClick={() => handleExportWorkbook(workbook.year)}
                      disabled={exportingYear === workbook.year}
                      className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                    >
                      {exportingYear === workbook.year ? '...' : 'Export'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {workbooks.length === 0 && (
              <div className="col-span-full text-center py-8">
                <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-2">No workbooks found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">Workbooks are created automatically when you create LPO documents</p>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <>
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Entries</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{filteredLpos.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Liters</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalLiters.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Amount</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            TZS {totalAmount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <input
              type="text"
              placeholder="Search by LPO#, Truck, DO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          
          {/* Month Multi-Select Dropdown */}
          <div className="month-dropdown-container relative">
            <button
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                {getMonthsDisplayText()}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showMonthDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto">
                {/* Quick Select Options */}
                <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                  {availableMonths.includes(new Date().getMonth() + 1) && (
                    <button
                      onClick={() => {
                        setSelectedMonths([new Date().getMonth() + 1]);
                        setShowMonthDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    >
                      Current Month ({MONTH_NAMES[new Date().getMonth()]})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedMonths(availableMonths.length > 0 ? [...availableMonths] : [new Date().getMonth() + 1]);
                      setShowMonthDropdown(false);
                    }}
                    className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  >
                    All Months ({availableMonths.length})
                  </button>
                </div>
                
                {/* Month Checkboxes - Only show months that have data */}
                <div className="p-2">
                  {availableMonths.length > 0 ? (
                    availableMonths.map((monthNum) => (
                      <label
                        key={monthNum}
                        className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMonths.includes(monthNum)}
                          onChange={() => toggleMonth(monthNum)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{MONTH_NAMES[monthNum - 1]}</span>
                      </label>
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                      No data available
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">All Stations</option>
            {availableStations.map((station) => (
              <option key={station} value={station}>
                {station}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={() => {
              setSearchTerm('');
              setStationFilter('');
              setDateFilter('');
              setSelectedMonths([new Date().getMonth() + 1]); // Reset to current month
            }}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg transition-colors" style={{ overflow: 'visible' }}>
        <div className="overflow-x-auto" style={{ overflow: 'auto' }}>
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  S/No
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  LPO No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Station
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  DO/SDO
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Truck No.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Liters
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Price/Ltr
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Dest.
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading data...
                  </td>
                </tr>
              ) : filteredLpos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No LPO entries found
                  </td>
                </tr>
              ) : (
                filteredLpos.map((lpo, index) => {
                  const rowKey = lpo.id ?? `lpo-${index}`;
                  return (
                  <tr 
                    key={rowKey} 
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                    onClick={() => handleRowClick(lpo)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.sn}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400 underline">
                      {lpo.lpoNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.dieselAt}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.doSdo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.truckNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.ltrs.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.pricePerLtr.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {lpo.destinations}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {(lpo.ltrs * lpo.pricePerLtr).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400" onClick={(e) => e.stopPropagation()}>
                      <div className="flex space-x-2 relative">
                        {/* Copy/Download Dropdown */}
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleDropdown(rowKey, e); }}
                            className="flex items-center px-2 py-1 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            title="Copy/Download LPO"
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          
                          {openDropdowns[rowKey] && (
                            <div 
                              className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-xl z-[9999]"
                              style={{
                                top: `${dropdownPosition.top}px`,
                                left: `${dropdownPosition.left}px`
                              }}
                            >
                              <div className="py-1">
                                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                                  Copy Options
                                </div>
                                <button
                                  onClick={() => handleCopyImageToClipboard(lpo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Image className="w-4 h-4 mr-2" />
                                  Copy as Image
                                </button>
                                <button
                                  onClick={() => handleCopyWhatsAppText(lpo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Copy for WhatsApp
                                </button>
                                <button
                                  onClick={() => handleCopyCsvText(lpo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                                  Copy as CSV Text
                                </button>
                                
                                <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
                                
                                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                                  Download Options
                                </div>
                                <button
                                  onClick={() => handleDownloadPDF(lpo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <FileDown className="w-4 h-4 mr-2 text-red-600" />
                                  Download as PDF
                                </button>
                                <button
                                  onClick={() => handleDownloadImage(lpo)}
                                  className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  <Download className="w-4 h-4 mr-2 text-green-600" />
                                  Download as Image
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <PermissionGuard resource={RESOURCES.LPOS} action={ACTIONS.DELETE}>
                          <button
                            onClick={(e) => { e.stopPropagation(); lpo.id && handleDelete(lpo.id); }}
                            className="text-red-600 hover:text-red-900"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </PermissionGuard>
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

      <LPODetailForm
        isOpen={isDetailFormOpen}
        onClose={() => setIsDetailFormOpen(false)}
        onSubmit={handleDetailSubmit}
      />
        </>
      )}
    </div>
  );
};

export default LPOs;
