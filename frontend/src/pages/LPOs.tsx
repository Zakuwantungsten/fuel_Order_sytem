import React, { useState, useEffect, useMemo, useRef } from 'react';
import usePersistedState from '../hooks/usePersistedState';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, FileSpreadsheet, List, Grid, BarChart3, Copy, MessageSquare, Image, ChevronDown, FileDown, Wallet, Calendar, Check, Loader2 } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import type { LPOEntry, LPOSummary as LPOSummaryType, LPOWorkbook as LPOWorkbookType } from '../types';
import { lposAPI, lpoDocumentsAPI, lpoWorkbookAPI, driverAccountAPI } from '../services/api';
import LPODetailForm from '../components/LPODetailForm';
import LPOWorkbook from '../components/LPOWorkbook';
import LPOSummaryComponent from '../components/LPOSummary';
import DriverAccountWorkbook from '../components/DriverAccountWorkbook';
import { PermissionGuard } from '../components/ProtectedRoute';
import { RESOURCES, ACTIONS } from '../utils/permissions';
import { copyLPOImageToClipboard, downloadLPOPDF, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/Pagination';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];


const LPOs = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = usePersistedState('lpo:searchTerm', '');
  const [lpos, setLpos] = useState<LPOEntry[]>([]);
  const [filteredLpos, setFilteredLpos] = useState<LPOEntry[]>([]);
  const [workbooks, setWorkbooks] = useState<LPOWorkbookType[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  // selectedYear — priority: URL params (deep-links) > localStorage > current year
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const url = new URL(window.location.href);
    const yearParam = url.searchParams.get('year');

    if (yearParam) {
      const year = parseInt(yearParam);
      if (!isNaN(year)) {
        console.log('Initializing selectedYear from URL params:', year);
        return year;
      }
    }

    // Fall back to persisted value
    try {
      const stored = localStorage.getItem('fuel-order:lpo:selectedYear');
      if (stored) return JSON.parse(stored) as number;
    } catch { /* ignore */ }

    // Default to current year
    return new Date().getFullYear();
  });

  // Keep selectedYear persisted whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('fuel-order:lpo:selectedYear', JSON.stringify(selectedYear));
    } catch { /* ignore */ }
  }, [selectedYear]);
  const [loading, setLoading] = useState(true);
  const [isDetailFormOpen, setIsDetailFormOpen] = useState(false);
  const [stationFilter, setStationFilter] = usePersistedState('lpo:stationFilter', '');
  const [dateFilter, setDateFilter] = usePersistedState('lpo:dateFilter', '');
  // Period filter — {year, month} pairs, same as DO management
  const [selectedPeriods, setSelectedPeriods] = usePersistedState<Array<{year: number; month: number}>>(
    'lpo:selectedPeriods',
    [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]
  );
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [searchParams] = useSearchParams();
  const VIEW_MODES = ['list', 'workbook', 'summary', 'driver_account'] as const;
  type ViewMode = typeof VIEW_MODES[number];
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('lpo:viewMode', 'list');
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | number | null>(null);
  const [summaryFilters, setSummaryFilters] = usePersistedState('lpo:summaryFilters', {
    stations: [] as string[],
    dateFrom: '',
    dateTo: ''
  });
  const [openDropdowns, setOpenDropdowns] = useState<{[key: string | number]: boolean}>({});
  const [dropdownPosition, setDropdownPosition] = useState<{top?: number, bottom?: number, left: number}>({top: 0, left: 0});
  const [exportingYear, setExportingYear] = useState<number | null>(null);
  const [selectedLpoNo, setSelectedLpoNo] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<string | number | null>(null);
  const [downloadingImage, setDownloadingImage] = useState<string | number | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistedState('lpo:itemsPerPage', 25);

  // Filter dropdown states
  const [showWorkbookYearDropdown, setShowWorkbookYearDropdown] = useState(false);
  const [showStationDropdown, setShowStationDropdown] = useState(false);

  // Refs for click-outside detection
  const workbookYearDropdownRef = useRef<HTMLDivElement>(null);
  const stationDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  
  // Ref to track if we've processed a highlight
  const highlightProcessedRef = useRef<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  // Click-outside detection for filter dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workbookYearDropdownRef.current && !workbookYearDropdownRef.current.contains(event.target as Node)) {
        setShowWorkbookYearDropdown(false);
      }
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setShowStationDropdown(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        monthDropdownRef.current?.contains(target) ||
        workbookYearDropdownRef.current?.contains(target) ||
        stationDropdownRef.current?.contains(target)
      ) return;
      setShowMonthDropdown(false);
      setShowWorkbookYearDropdown(false);
      setShowStationDropdown(false);
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

  useEffect(() => {
    fetchLpos();
    fetchWorkbooks();
    fetchAvailableYears();
  }, []);

  // Handle highlight from URL parameter
  useEffect(() => {
    const handleUrlChange = () => {
      const url = new URL(window.location.href);
      const actionParam = url.searchParams.get('action');
      const highlightId = url.searchParams.get('highlight');
      const yearParam = url.searchParams.get('year');
      const monthParam = url.searchParams.get('month');
      
      if (actionParam === 'create-lpo') {
        console.log('Quick Action: Opening LPO creation form');
        setIsDetailFormOpen(true);
        // Clear the action param
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
        setFiltersInitialized(true);
      } else if (highlightId && highlightId !== highlightProcessedRef.current) {
        highlightProcessedRef.current = highlightId;
        console.log('%c=== LPO URL HANDLER ===', 'background: #f59e0b; color: white; padding: 4px;');
        console.log('Highlight ID:', highlightId);
        console.log('Year Param:', yearParam);
        console.log('Month Param:', monthParam);
        console.log('Current selectedYear:', selectedYear);
        console.log('Current selectedMonths:', selectedMonths);
        
        // Set year if provided (used for workbook display)
        let urlFilterYear = new Date().getFullYear();
        if (yearParam) {
          const year = parseInt(yearParam);
          if (!isNaN(year)) {
            setSelectedYear(year);
            urlFilterYear = year;
          }
        }
        
        // Set period filter if month provided
        if (monthParam) {
          const month = parseInt(monthParam);
          if (!isNaN(month) && month >= 1 && month <= 12) {
            setSelectedPeriods([{ year: urlFilterYear, month }]);
          }
        }
        
        // Set flag to allow filtering with the correct year/month
        setFiltersInitialized(true);
        
        // Trigger highlight after a brief delay to let filters apply
        console.log('Will trigger highlight in 200ms');
        setTimeout(() => {
          console.log('Triggering highlight now');
          setPendingHighlight(highlightId);
        }, 200);
      } else {
        // No highlight, just initialize
        setFiltersInitialized(true);
      }
    };
    
    window.addEventListener('urlchange', handleUrlChange);
    handleUrlChange(); // Check on mount
    
    return () => window.removeEventListener('urlchange', handleUrlChange);
  }, []); // Remove selectedYear dependency to avoid re-triggering

  // Separate effect to handle highlight after LPOs are loaded and filtered
  useEffect(() => {
    if (pendingHighlight && filteredLpos.length > 0) {
      console.log('Attempting to find and highlight LPO:', pendingHighlight, 'in', filteredLpos.length, 'filtered LPOs');
      
      // Find in filtered list (after year/month filters applied)
      const recordIndex = filteredLpos.findIndex(l => l.lpoNo === pendingHighlight);
      
      if (recordIndex >= 0) {
        console.log('Found LPO at filtered index:', recordIndex);
        const targetPage = Math.floor(recordIndex / itemsPerPage) + 1;
        console.log('Target page:', targetPage, 'Current page:', currentPage);
        
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
          // Wait for page change
          setTimeout(() => scrollToAndHighlightLPO(pendingHighlight), 800);
        } else {
          // Already on correct page
          setTimeout(() => scrollToAndHighlightLPO(pendingHighlight), 300);
        }
      } else {
        console.log('LPO not found in filtered results');
        clearLPOHighlight();
      }
    }
  }, [pendingHighlight, filteredLpos, itemsPerPage, currentPage]);
  
  // Helper function to scroll and highlight
  const scrollToAndHighlightLPO = (lpoNo: string) => {
    console.log('=== LPO HIGHLIGHT ATTEMPT ===');
    console.log('LPO Number:', lpoNo);
    
    // Find all elements with this LPO number
    const allElements = document.querySelectorAll(`[data-lpo-number="${lpoNo}"]`);
    console.log('Total elements found:', allElements.length);
    
    // Find visible element (mobile or desktop depending on screen size)
    const visibleElements = Array.from(allElements).filter(el => {
      return (el as HTMLElement).offsetParent !== null; // offsetParent is null for hidden elements
    });
    console.log('Visible elements:', visibleElements.length);
    
    // Prefer visible element, fall back to first element
    let element = visibleElements[0] as HTMLElement;
    if (!element && allElements.length > 0) {
      element = allElements[0] as HTMLElement;
    }
    
    console.log('Element found:', !!element);
    console.log('Element is visible:', element?.offsetParent !== null);
    
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Store original styles
      const originalStyles = {
        boxShadow: element.style.boxShadow,
        border: element.style.border,
        backgroundColor: element.style.backgroundColor,
        transform: element.style.transform,
        transition: element.style.transition
      };
      
      // Apply subtle highlight with faint purple
      element.style.transition = 'all 0.3s ease-in-out';
      element.style.boxShadow = '0 0 0 3px rgba(168, 85, 247, 0.3), 0 0 15px rgba(168, 85, 247, 0.2)';
      element.style.border = '2px solid rgba(168, 85, 247, 0.4)';
      element.style.backgroundColor = 'rgba(168, 85, 247, 0.08)';
      element.style.transform = 'scale(1.01)';
      element.style.zIndex = '1000';
      
      console.log('✅ Applied LPO highlight');
      
      setTimeout(() => {
        element.style.boxShadow = originalStyles.boxShadow;
        element.style.border = originalStyles.border;
        element.style.backgroundColor = originalStyles.backgroundColor;
        element.style.transform = originalStyles.transform;
        element.style.transition = originalStyles.transition;
        element.style.zIndex = '';
        console.log('❌ Removed LPO highlight');
        clearLPOHighlight();
      }, 3000);
    } else {
      console.error('❌ LPO Element not found:', lpoNo);
      clearLPOHighlight();
    }
  };
  
  // Helper to clear highlight
  const clearLPOHighlight = () => {
    highlightProcessedRef.current = null;
    setPendingHighlight(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('highlight');
    url.searchParams.delete('year');
    url.searchParams.delete('month');
    window.history.replaceState({}, '', url.toString());
  };

  useEffect(() => {
    if (filtersInitialized) {
      filterLpos();
    }
  }, [searchTerm, stationFilter, dateFilter, selectedPeriods, lpos, filtersInitialized]);

  // Helper to parse date from various formats (e.g., "2-Dec", "1-Dec", "2025-12-02")
  const getMonthFromDate = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const MON: Record<string, number> = {
      jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
      jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    };
    // ISO "YYYY-MM-DD"
    const iso = dateStr.match(/^\d{4}-(\d{2})-\d{2}/);
    if (iso) return parseInt(iso[1], 10);
    // "DD-Mon-YYYY" or "DD-Mon"
    const dmon = dateStr.match(/^\d{1,2}[\-\/\s]([A-Za-z]{3,})/i);
    if (dmon) return MON[dmon[1].toLowerCase().substring(0, 3)] ?? null;
    // Native JS fallback
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.getMonth() + 1;
  };

  // Extract year from a stored date string (ISO or DD-Mon-YYYY)
  const getYearFromDate = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const iso = dateStr.match(/^(\d{4})-\d{2}-\d{2}/);
    if (iso) return parseInt(iso[1]);
    const dmy = dateStr.match(/^\d{1,2}[\-\/\s][A-Za-z]+[\-\/\s](\d{4})$/);
    if (dmy) return parseInt(dmy[1]);
    return null;
  };

  // Get the effective year for an LPO record.
  // Imported data: year is embedded in the ISO date ("2025-12-15" → 2025).
  // Manually-created data: date is "DD-Mon" (no year) → fall back to createdAt year.
  const getEffectiveYear = (lpo: LPOEntry): number => {
    const fromDate = getYearFromDate(lpo.date);
    if (fromDate !== null) return fromDate;
    if (lpo.createdAt) return new Date(lpo.createdAt).getFullYear();
    return new Date().getFullYear();
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

  // All year+month periods that have LPO data — used for the period picker dropdown.
  // getEffectiveYear handles both ISO dates (imported) and DD-Mon dates (manually created).
  const availablePeriods = useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    lpos.forEach(lpo => {
      const year = getEffectiveYear(lpo);
      const month = getMonthFromDate(lpo.date);
      if (month !== null) {
        const key = `${year}-${month}`;
        if (!seen.has(key)) seen.set(key, { year, month });
      }
    });
    // Sort: most recent year first, most recent month first within each year
    return Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );
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
      const [response, driverEntries] = await Promise.all([
        lposAPI.getAll({ limit: 10000 }),
        driverAccountAPI.getAll().catch(() => [] as any[])
      ]);
      // Extract data from new API response format
      const lposData = Array.isArray(response.data) ? response.data : [];
      
      // Convert driver account entries to LPOEntry format and merge
      const driverLpos: LPOEntry[] = (driverEntries || []).map((entry: any, idx: number) => {
        // Extract numeric portion of lpoNo for proper sequential sorting
        const numMatch = String(entry.lpoNo || '').match(/(\d+)/);
        const numericSn = numMatch ? parseInt(numMatch[1], 10) : idx + 1;
        return {
          id: `da-${entry.id || entry._id}`,
          sn: numericSn,
          date: entry.date,
          lpoNo: entry.lpoNo,
          dieselAt: entry.station,
          doSdo: 'NIL',
          truckNo: entry.truckNo,
          ltrs: entry.liters,
          pricePerLtr: entry.rate,
          destinations: 'NIL',
          createdAt: entry.createdAt,
        };
      });
      
      const mergedData = [...lposData, ...driverLpos];
      setLpos(mergedData);
      setFilteredLpos(mergedData);
    } catch (error) {
      console.error('Error fetching LPOs:', error);
      setLpos([]);
      setFilteredLpos([]);
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(['lpo_entries', 'lpo_summaries'], fetchLpos);

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
      // Check if there's a year parameter in the URL first
      const url = new URL(window.location.href);
      const yearParam = url.searchParams.get('year');
      const urlYear = yearParam ? parseInt(yearParam) : null;
      
      const years = await lpoWorkbookAPI.getAvailableYears();
      if (years.length > 0) {
        setAvailableYears(years);
        // If URL has a valid year param, use it; otherwise use most recent year
        if (urlYear && !isNaN(urlYear) && years.includes(urlYear)) {
          setSelectedYear(urlYear);
        } else {
          setSelectedYear(years[0]); // Most recent year
        }
      } else {
        // Default to current year if no years available
        const currentYear = new Date().getFullYear();
        setAvailableYears([currentYear]);
        setSelectedYear(urlYear && !isNaN(urlYear) ? urlYear : currentYear);
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      const url = new URL(window.location.href);
      const yearParam = url.searchParams.get('year');
      const urlYear = yearParam ? parseInt(yearParam) : null;
      const currentYear = new Date().getFullYear();
      setAvailableYears([currentYear]);
      setSelectedYear(urlYear && !isNaN(urlYear) ? urlYear : currentYear);
    }
  };

  // Merge all unique years (via getEffectiveYear) into availableYears so that
  // the workbook export year picker shows all years including imported historical data.
  useEffect(() => {
    if (lpos.length === 0) return;
    const yearsFromData = [...new Set(lpos.map(lpo => getEffectiveYear(lpo)))].sort((a, b) => b - a);
    setAvailableYears(prev => {
      const merged = [...new Set([...prev, ...yearsFromData])].sort((a, b) => b - a);
      return merged.join(',') === prev.join(',') ? prev : merged;
    });
  }, [lpos]);

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
    const lpoKey = lpo.id || lpo.lpoNo;
    setDownloadingPdf(lpoKey);
    const toastId = toast.loading(`Preparing PDF — LPO ${lpo.lpoNo}...`, {
      style: { background: '#0284c7', color: '#fff' },
    });
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      await downloadLPOPDF(lpoSummary, undefined, user?.username);
      toast.update(toastId, {
        render: `PDF downloaded: LPO ${lpo.lpoNo}`,
        type: 'success',
        isLoading: false,
        autoClose: 4000,
        style: undefined,
      });
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      toast.update(toastId, {
        render: `PDF download failed: ${error?.message || 'Unknown error'}`,
        type: 'error',
        isLoading: false,
        autoClose: 6000,
        style: undefined,
      });
    } finally {
      setDownloadingPdf(null);
    }
  };

  // Handle download LPO as Image
  const handleDownloadImage = async (lpo: LPOEntry) => {
    closeAllDropdowns();
    const lpoKey = lpo.id || lpo.lpoNo;
    setDownloadingImage(lpoKey);
    const toastId = toast.loading(`Preparing image — LPO ${lpo.lpoNo}...`, {
      style: { background: '#0284c7', color: '#fff' },
    });
    try {
      const lpoSummary = convertToLPOSummary(lpo);
      await downloadLPOImage(lpoSummary, undefined, user?.username);
      toast.update(toastId, {
        render: `Image downloaded: LPO ${lpo.lpoNo}`,
        type: 'success',
        isLoading: false,
        autoClose: 4000,
        style: undefined,
      });
    } catch (error: any) {
      console.error('Error downloading image:', error);
      toast.update(toastId, {
        render: `Image download failed: ${error?.message || 'Unknown error'}`,
        type: 'error',
        isLoading: false,
        autoClose: 6000,
        style: undefined,
      });
    } finally {
      setDownloadingImage(null);
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
      const DROPDOWN_HEIGHT = 300;
      const DROPDOWN_WIDTH = 224;
      const spaceBelow = window.innerHeight - rect.bottom;
      const left = Math.max(10, Math.min(rect.right - DROPDOWN_WIDTH, window.innerWidth - DROPDOWN_WIDTH - 10));
      if (spaceBelow >= DROPDOWN_HEIGHT) {
        // enough room below — open downward
        setDropdownPosition({ top: rect.bottom + 4, bottom: undefined, left });
      } else {
        // not enough room — open upward by anchoring bottom to button top
        setDropdownPosition({ top: undefined, bottom: window.innerHeight - rect.top + 4, left });
      }
    }
    setOpenDropdowns(prev => ({
      ...prev,
      [lpoId]: !prev[lpoId]
    }));
  };

  // Close all dropdowns when clicking outside or scrolling
  const closeAllDropdowns = () => {
    setOpenDropdowns({});
  };

  // Close dropdowns on scroll so they don't float away from their buttons
  useEffect(() => {
    const handleScroll = () => setOpenDropdowns({});
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  // Toggle a year+month period on/off (at least one must remain selected)
  const togglePeriod = (year: number, month: number) => {
    setSelectedPeriods(prev => {
      const exists = prev.some(p => p.year === year && p.month === month);
      if (exists) {
        if (prev.length === 1) return prev; // keep at least one selected
        return prev.filter(p => !(p.year === year && p.month === month));
      }
      return [...prev, { year, month }].sort((a, b) =>
        b.year !== a.year ? b.year - a.year : b.month - a.month
      );
    });
  };

  // Display text for the period picker button
  const getPeriodsDisplayText = (): string => {
    if (selectedPeriods.length === 0) return 'Select Period';
    if (selectedPeriods.length === 1) {
      const p = selectedPeriods[0];
      return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
    }
    if (selectedPeriods.length === availablePeriods.length && availablePeriods.length > 0) return 'All Periods';
    return `${selectedPeriods.length} periods`;
  };

  const filterLpos = () => {
    let filtered = [...lpos];

    // Period filter — match (year, month) pairs exactly, same as DO management.
    // getEffectiveYear correctly handles both ISO imported dates and DD-Mon legacy dates.
    if (selectedPeriods.length > 0) {
      filtered = filtered.filter((lpo) => {
        const lpoYear = getEffectiveYear(lpo);
        const lpoMonth = getMonthFromDate(lpo.date);
        if (lpoMonth === null) return true; // no month info — keep
        return selectedPeriods.some(p => p.year === lpoYear && p.month === lpoMonth);
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
      // dateFilter is ISO "YYYY-MM-DD"; LPO dates may be ISO or legacy "D-Mon"
      try {
        const d = new Date(dateFilter);
        const legacy = `${d.getDate()}-${d.toLocaleDateString('en-US', { month: 'short' })}`; // "13-Jan"
        filtered = filtered.filter((lpo) => lpo.date === dateFilter || lpo.date === legacy);
      } catch (error) {
        console.error('Error parsing date filter:', error);
      }
    }

    setFilteredLpos(filtered);
    setCurrentPage(1); // Reset to page 1 when filters change
  };

  // Auto-fallback: if the default current period (today's year+month) has no data,
  // automatically switch to the most recent period that does.
  useEffect(() => {
    if (loading || lpos.length === 0 || !filtersInitialized) return;
    const now = new Date();
    const defYear = now.getFullYear(), defMonth = now.getMonth() + 1;
    // Only auto-switch when still on the initial default selection
    if (selectedPeriods.length !== 1 || selectedPeriods[0].year !== defYear || selectedPeriods[0].month !== defMonth) return;
    if (filteredLpos.length === 0 && availablePeriods.length > 0) {
      setSelectedPeriods([availablePeriods[0]]);
    }
  }, [filteredLpos, loading, filtersInitialized, availablePeriods]);

  // Add month-based serial numbers to LPOs
  const lposWithMonthlySerialNumbers = useMemo(() => {
    // Group LPOs by month and year
    const groupedByMonth: { [key: string]: LPOEntry[] } = {};
    
    filteredLpos.forEach(lpo => {
      const month = getMonthFromDate(lpo.date);
      const year = getEffectiveYear(lpo); // ISO date year OR createdAt year for DD-Mon records
      const key = `${year}-${month}`; // e.g., "2025-10" for October 2025
      
      if (!groupedByMonth[key]) {
        groupedByMonth[key] = [];
      }
      groupedByMonth[key].push(lpo);
    });
    
    // Assign serial numbers within each month group
    const lposWithSN: LPOEntry[] = [];
    Object.keys(groupedByMonth).forEach(monthKey => {
      const monthLpos = groupedByMonth[monthKey];
      // Sort by original sn (includes numeric lpoNo for driver account entries)
      monthLpos.sort((a, b) => {
        const aSn = a.sn || 0;
        const bSn = b.sn || 0;
        if (aSn !== bSn) return aSn - bSn;
        // Fallback: sort by lpoNo numeric part
        const aNum = parseInt((String(a.lpoNo).match(/(\d+)/) || ['0','0'])[1]);
        const bNum = parseInt((String(b.lpoNo).match(/(\d+)/) || ['0','0'])[1]);
        return aNum - bNum;
      });
      
      monthLpos.forEach((lpo, index) => {
        lposWithSN.push({
          ...lpo,
          sn: index + 1 // Reset to 1 for each month
        });
      });
    });
    
    // Sort back to original order (by createdAt or original sn)
    lposWithSN.sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate; // Most recent first
    });
    
    return lposWithSN;
  }, [filteredLpos]);

  // Pagination calculations
  const totalPages = Math.ceil(lposWithMonthlySerialNumbers.length / itemsPerPage);
  const paginatedLpos = lposWithMonthlySerialNumbers.slice(
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

  const handleCreateDetailed = () => {
    setIsDetailFormOpen(true);
  };



  const handleDetailSubmit = async (data: Partial<LPOSummaryType>) => {
    try {
      // Create the LPO document - workbook is auto-created based on year
      // The backend's syncLPOEntriesToList will automatically create the LPOEntry records
      // for the list view, so we don't need to create them separately here
      await lpoDocumentsAPI.create(data);
      
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
  const handleRowClick = async (lpo: LPOEntry) => {
    // Driver account entries have id starting with 'da-'
    const isDriverAccount = typeof lpo.id === 'string' && lpo.id.startsWith('da-');
    
    if (isDriverAccount) {
      // For driver account entries, derive year from the entry date
      const entryDate = new Date(lpo.date);
      const year = !isNaN(entryDate.getTime()) ? entryDate.getFullYear() : new Date().getFullYear();
      setSelectedLpoNo(lpo.lpoNo);
      setSelectedYear(year);
      setSelectedWorkbookId(year);
      setViewMode('workbook');
      return;
    }
    
    try {
      // Fetch the LPO document to get its year
      const lpoDoc = await lpoDocumentsAPI.getByLpoNo(lpo.lpoNo);
      const year = lpoDoc.year || new Date().getFullYear();
      
      setSelectedLpoNo(lpo.lpoNo);
      setSelectedYear(year);
      setSelectedWorkbookId(year);
      setViewMode('workbook');
    } catch (error) {
      console.error('Error fetching LPO details:', error);
      // Fallback to current year if fetch fails
      const year = new Date().getFullYear();
      setSelectedLpoNo(lpo.lpoNo);
      setSelectedYear(year);
      setSelectedWorkbookId(year);
      setViewMode('workbook');
    }
  };

  const handleCloseWorkbook = () => {
    setSelectedWorkbookId(null);
    setSelectedLpoNo(null);
    setViewMode('list');
    fetchWorkbooks(); // Refresh workbooks list
    fetchLpos(); // Refresh LPO entries (includes driver account) to show updated values
  };

  // Navigate to workbook sheet view from driver account tab
  const handleNavigateToSheet = (lpoNo: string, year: number) => {
    setSelectedLpoNo(lpoNo);
    setSelectedYear(year);
    setSelectedWorkbookId(year);
    setViewMode('workbook');
  };

  const handleExport = () => {
    // Create worksheet data with headers
    const headers = ['S/No', 'Date', 'LPO No.', 'Station', 'DO/SDO', 'Truck No.', 'Ltrs', 'Price/Ltr', 'Dest.', 'Amount'];
    
    // Use lposWithMonthlySerialNumbers instead of filteredLpos to get correct serial numbers
    const data = lposWithMonthlySerialNumbers.map((lpo) => [
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
  const totalAmountTZS = filteredLpos
    .filter(lpo => { const u = (lpo.dieselAt || '').toUpperCase(); return !(u.startsWith('LAKE') && !u.includes('TUNDUMA')); })
    .reduce((sum, lpo) => sum + (lpo.ltrs * lpo.pricePerLtr), 0);
  const totalAmountUSD = filteredLpos
    .filter(lpo => { const u = (lpo.dieselAt || '').toUpperCase(); return u.startsWith('LAKE') && !u.includes('TUNDUMA'); })
    .reduce((sum, lpo) => sum + (lpo.ltrs * lpo.pricePerLtr), 0);

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
                className="px-2.5 py-1.5 text-sm font-medium rounded-l-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <List className="w-4 h-4 mr-1 inline" />
                List
              </button>
              <button
                onClick={() => setViewMode('summary' as ViewMode)}
                className="px-2.5 py-1.5 text-sm font-medium border-t border-b bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <BarChart3 className="w-4 h-4 mr-1 inline" />
                Summary
              </button>
              <button
                onClick={() => setViewMode('workbook')}
                className="px-2.5 py-1.5 text-sm font-medium border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Grid className="w-4 h-4 mr-1 inline" />
                Workbook
              </button>
              <button
                onClick={() => setViewMode('driver_account')}
                className="px-2.5 py-1.5 text-sm font-medium rounded-r-md border-t border-r border-b bg-blue-600 text-white border-blue-600"
              >
                <Wallet className="w-4 h-4 mr-1 inline" />
                Driver Acc
              </button>
            </div>
          </div>
        </div>
        <DriverAccountWorkbook onNavigateToSheet={handleNavigateToSheet} />
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
                className="px-2.5 py-1.5 text-sm font-medium rounded-l-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <List className="w-4 h-4 mr-1 inline" />
                List
              </button>
            <button
              onClick={() => setViewMode('summary' as ViewMode)}
              className="px-2.5 py-1.5 text-sm font-medium border-t border-b bg-blue-600 text-white border-blue-600"
              >
                <BarChart3 className="w-4 h-4 mr-1 inline" />
                Summary
              </button>
              <button
                onClick={() => setViewMode('workbook')}
                className="px-2.5 py-1.5 text-sm font-medium border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Grid className="w-4 h-4 mr-1 inline" />
                Workbook
              </button>
              <button
                onClick={() => setViewMode('driver_account')}
                className="px-2.5 py-1.5 text-sm font-medium rounded-r-md border-t border-r border-b bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 sm:gap-3">
          {/* View Mode Toggle */}
          <div className="inline-flex rounded-md shadow-sm overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 text-sm font-medium rounded-l-md border ${
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
              className={`px-2.5 py-1.5 text-sm font-medium border-t border-b ${
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
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </PermissionGuard>
          <PermissionGuard resource={RESOURCES.LPOS} action={ACTIONS.CREATE}>
            <button
              onClick={handleCreateDetailed}
              className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
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
              <div className="relative" ref={workbookYearDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowWorkbookYearDropdown(!showWorkbookYearDropdown)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2 min-w-[150px]"
                >
                  <span>LPOS {selectedYear}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showWorkbookYearDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                    {availableYears.map((year) => (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          setSelectedYear(year);
                          setShowWorkbookYearDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>LPOS {year}</span>
                        {selectedYear === year && <Check className="w-4 h-4 text-primary-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 transition-colors">
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Entries</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{filteredLpos.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 transition-colors">
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Liters</div>
          <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{totalLiters.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 transition-colors">
          <div className="text-xs text-gray-600 dark:text-gray-400">Total Amount</div>
          {totalAmountTZS > 0 && (
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              TZS {totalAmountTZS.toLocaleString()}
            </div>
          )}
          {totalAmountUSD > 0 && (
            <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
              $ {totalAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          {totalAmountTZS === 0 && totalAmountUSD === 0 && (
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">—</div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 mb-6 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <input
              type="text"
              placeholder="Search by LPO#, Truck, DO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          
          {/* Month Multi-Select Dropdown */}
          <div className="month-dropdown-container relative">
            <button
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <span className="flex items-center">
                <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                {getPeriodsDisplayText()}
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showMonthDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-64 overflow-y-auto left-0 right-0">
                {/* Quick Select Options */}
                <div className="p-2 border-b border-gray-200 dark:border-gray-600">
                  {availablePeriods.some(p => p.year === new Date().getFullYear() && p.month === new Date().getMonth() + 1) && (
                    <button
                      onClick={() => {
                        setSelectedPeriods([{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]);
                        setShowMonthDropdown(false);
                      }}
                      className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                    >
                      Current Month ({MONTH_NAMES[new Date().getMonth()]} {new Date().getFullYear()})
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setSelectedPeriods(availablePeriods.length > 0 ? [...availablePeriods] : [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]);
                      setShowMonthDropdown(false);
                    }}
                    className="w-full text-left px-2 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                  >
                    All Periods ({availablePeriods.length})
                  </button>
                </div>

                {/* Period checkboxes — grouped by year */}
                <div className="p-2">
                  {availablePeriods.length > 0 ? (() => {
                    const byYear = availablePeriods.reduce<Record<number, number[]>>((acc, p) => {
                      if (!acc[p.year]) acc[p.year] = [];
                      acc[p.year].push(p.month);
                      return acc;
                    }, {});
                    return Object.entries(byYear)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([yearStr, months]) => (
                        <div key={yearStr}>
                          <div className="px-2 pt-2 pb-0.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{yearStr}</div>
                          {months.map(monthNum => (
                            <label
                              key={`${yearStr}-${monthNum}`}
                              className="flex items-center px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={selectedPeriods.some(p => p.year === Number(yearStr) && p.month === monthNum)}
                                onChange={() => { togglePeriod(Number(yearStr), monthNum); setCurrentPage(1); }}
                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{MONTH_NAMES[monthNum - 1]}</span>
                            </label>
                          ))}
                        </div>
                      ));
                  })() : (
                    <div className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                      No data available
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="relative" ref={stationDropdownRef}>
            <button
              type="button"
              onClick={() => setShowStationDropdown(!showStationDropdown)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
            >
              <span>{stationFilter || 'All Stations'}</span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showStationDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    setStationFilter('');
                    setShowStationDropdown(false);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                >
                  <span>All Stations</span>
                  {stationFilter === '' && <Check className="w-4 h-4 text-primary-600" />}
                </button>
                {availableStations.map((station) => (
                  <button
                    key={station}
                    type="button"
                    onClick={() => {
                      setStationFilter(station);
                      setShowStationDropdown(false);
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                  >
                    <span>{station}</span>
                    {stationFilter === station && <Check className="w-4 h-4 text-primary-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={() => {
              setSearchTerm('');
              setStationFilter('');
              setDateFilter('');
              setSelectedPeriods(
                availablePeriods.length > 0
                  ? [availablePeriods[0]]
                  : [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]
              );
            }}
            className="inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg transition-colors">
        {loading ? (
          <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
            <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm sm:text-base">Loading LPO entries...</p>
          </div>
        ) : filteredLpos.length === 0 ? (
          <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm sm:text-base">No LPO entries found</p>
          </div>
        ) : (
          <>
            {/* Card View - Mobile/Tablet (below lg) */}
            <div className="lg:hidden space-y-3 p-4">
              {paginatedLpos.map((lpo, index) => {
                const rowKey = lpo.id ?? `lpo-${index}`;
                return (
                  <div
                    key={rowKey}
                    data-lpo-number={lpo.lpoNo}
                    onClick={() => handleRowClick(lpo)}
                    className="border border-gray-200 dark:border-gray-600 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-all cursor-pointer"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">#{lpo.sn}</span>
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{lpo.lpoNo}</span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{lpo.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          ${(lpo.ltrs * lpo.pricePerLtr).toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {lpo.ltrs.toLocaleString()}L @ ${lpo.pricePerLtr.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Station:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{lpo.dieselAt}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">DO/SDO:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{lpo.doSdo}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Truck:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{lpo.truckNo}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Destination:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{lpo.destinations}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleDropdown(rowKey, e); }}
                          className="w-full px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 inline-flex items-center justify-center"
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy/Download
                          <ChevronDown className="w-3 h-3 ml-1" />
                        </button>
                        
                        {openDropdowns[rowKey] && (
                          <div 
                            className="fixed w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-xl z-[9999]"
                            style={{
                              top: dropdownPosition.top !== undefined ? `${dropdownPosition.top}px` : 'auto',
                              bottom: dropdownPosition.bottom !== undefined ? `${dropdownPosition.bottom}px` : 'auto',
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
                                disabled={downloadingPdf === (lpo.id || lpo.lpoNo)}
                                className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {downloadingPdf === (lpo.id || lpo.lpoNo) ? (
                                  <Loader2 className="w-4 h-4 mr-2 text-red-600 animate-spin" />
                                ) : (
                                  <FileDown className="w-4 h-4 mr-2 text-red-600" />
                                )}
                                {downloadingPdf === (lpo.id || lpo.lpoNo) ? 'Downloading...' : 'Download as PDF'}
                              </button>
                              <button
                                onClick={() => handleDownloadImage(lpo)}
                                disabled={downloadingImage === (lpo.id || lpo.lpoNo)}
                                className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {downloadingImage === (lpo.id || lpo.lpoNo) ? (
                                  <Loader2 className="w-4 h-4 mr-2 text-green-600 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4 mr-2 text-green-600" />
                                )}
                                {downloadingImage === (lpo.id || lpo.lpoNo) ? 'Downloading...' : 'Download as Image'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      

                    </div>
                  </div>
                );
              })}
            </div>

            {/* Table View - Desktop (lg and up) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      S/N
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      LPO#
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Station
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      DO/SDO
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Truck
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Liters
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      $/L
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Destination
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedLpos.map((lpo, index) => {
                    const rowKey = lpo.id ?? `lpo-${index}`;
                    return (
                      <tr 
                        key={rowKey}
                        data-lpo-number={lpo.lpoNo}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                        onClick={() => handleRowClick(lpo)}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                          {lpo.sn}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.date}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 underline">
                          {lpo.lpoNo}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.dieselAt}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.doSdo}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.truckNo}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.ltrs.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.pricePerLtr.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.destinations}
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {(lpo.ltrs * lpo.pricePerLtr).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400" onClick={(e) => e.stopPropagation()}>
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
                                    top: dropdownPosition.top !== undefined ? `${dropdownPosition.top}px` : 'auto',
                                    bottom: dropdownPosition.bottom !== undefined ? `${dropdownPosition.bottom}px` : 'auto',
                                    left: `${dropdownPosition.left}px`,
                                    maxWidth: 'calc(100vw - 20px)'
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
                            

                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        
        {/* Pagination */}
        {!loading && filteredLpos.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredLpos.length}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        )}
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
