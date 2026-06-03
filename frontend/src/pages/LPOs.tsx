import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import usePersistedState from '../hooks/usePersistedState';
import { useSearchParams } from 'react-router-dom';
import { Plus, Download, FileSpreadsheet, List, Grid, BarChart3, Copy, MessageSquare, Image, ChevronDown, FileDown, Wallet, Calendar, Check, Loader2, Truck } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import type { LPOEntry, LPOSummary as LPOSummaryType } from '../types';
import { lpoDocumentsAPI, lpoWorkbookAPI, lposAPI, configAPI } from '../services/api';
import LPODetailForm from '../components/LPODetailForm';
import LPOWorkbook from '../components/LPOWorkbook';
import LPOSummaryComponent from '../components/LPOSummary';
import DriverAccountWorkbook from '../components/DriverAccountWorkbook';
import ReferWorkbook from '../components/ReferWorkbook';
import { PermissionGuard } from '../components/ProtectedRoute';
import { RESOURCES, ACTIONS } from '../utils/permissions';
import { copyLPOImageToClipboard, downloadLPOPDF, downloadLPOImage } from '../utils/lpoImageGenerator';
import { copyLPOForWhatsApp, copyLPOTextToClipboard } from '../utils/lpoTextGenerator';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import Pagination from '../components/Pagination';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';
import {
  lpoKeys,
  periodsToDateRange,
  useLPOList,
  useDriverAccountEntries,
  useLPOWorkbooks,
  useLPOAvailableYears,
  useLPOAvailableFilters,
} from '../hooks/useLPOs';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];


const LPOs = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = usePersistedState('lpo:searchTerm', '');
  // selectedYear — priority: URL params (deep-links) > localStorage > current year
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const url = new URL(window.location.href);
    const yearParam = url.searchParams.get('year');

    if (yearParam) {
      const year = parseInt(yearParam);
      if (!isNaN(year)) return year;
    }

    try {
      const stored = localStorage.getItem('fuel-order:lpo:selectedYear');
      if (stored) return JSON.parse(stored) as number;
    } catch { /* ignore */ }

    return new Date().getFullYear();
  });

  // Keep selectedYear persisted whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('fuel-order:lpo:selectedYear', JSON.stringify(selectedYear));
    } catch { /* ignore */ }
  }, [selectedYear]);
  const [isDetailFormOpen, setIsDetailFormOpen] = useState(false);
  const [autoDownloadLPOPdf, setAutoDownloadLPOPdf] = useState(true);

  useEffect(() => {
    configAPI.getJourneyConfig()
      .then((cfg) => setAutoDownloadLPOPdf(cfg.autoDownloadLPOPdf ?? true))
      .catch(() => {/* keep default true */});
  }, []);
  const [stationFilter, setStationFilter] = usePersistedState('lpo:stationFilter', '');
  const [statusFilter, setStatusFilter] = usePersistedState('lpo:statusFilter', 'all');
  const [dateFilter, setDateFilter] = usePersistedState('lpo:dateFilter', '');
  // Period filter — {year, month} pairs, same as DO management
  const [selectedPeriods, setSelectedPeriods] = usePersistedState<Array<{year: number; month: number}>>(
    'lpo:selectedPeriods',
    [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]
  );

  // Reset to current month when a new month starts and the persisted value
  // still points entirely at previous months.
  useEffect(() => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const includesCurrent = selectedPeriods.some(
      p => p.year === curYear && p.month === curMonth
    );
    if (!includesCurrent && selectedPeriods.length > 0) {
      setSelectedPeriods([{ year: curYear, month: curMonth }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [_searchParams] = useSearchParams();
  const VIEW_MODES = ['list', 'workbook', 'summary', 'driver_account', 'refer'] as const;
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

  // --- React Query hooks (server-side pagination + caching) ---
  const dateRange = periodsToDateRange(selectedPeriods);
  const lpoQuery = useLPOList({
    page: currentPage,
    limit: itemsPerPage,
    search: searchTerm || undefined,
    station: stationFilter || undefined,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
    sort: 'createdAt',
    order: 'desc',
    status: statusFilter !== 'all' ? statusFilter : undefined,
  });
  const { data: driverEntries = [] } = useDriverAccountEntries();
  const lpoEntries: LPOEntry[] = lpoQuery.data?.lpos ?? [];

  // Separate query to discover all stations for the current search term,
  // without the station filter so the dropdown stays fully populated even
  // after the user picks a station.
  const stationDiscoveryQuery = useLPOList(
    {
      page: 1,
      limit: 1000,
      search: searchTerm || undefined,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
      sort: 'createdAt',
      order: 'desc',
    },
    !!searchTerm
  );
  const discoveryEntries: LPOEntry[] = stationDiscoveryQuery.data?.lpos ?? [];
  // Merge server-paginated LPO entries with cached driver account entries
  // Apply client-side search, date range, station and status filters to driver account entries
  const orders = useMemo(() => {
    let filteredDriverEntries = driverEntries;

    // Mirror the server-side search: filter by truckNo, lpoNo, dieselAt, or doSdo
    if (searchTerm) {
      const term = searchTerm.trim().toLowerCase();
      filteredDriverEntries = filteredDriverEntries.filter(e =>
        (e.truckNo || '').toLowerCase().startsWith(term) ||
        (e.lpoNo || '').toLowerCase().startsWith(term) ||
        (e.dieselAt || '').toLowerCase().startsWith(term) ||
        (e.doSdo || '').toLowerCase().startsWith(term)
      );
    }

    // Respect the selected period so driver entries from other months don't bleed in
    if (dateRange.dateFrom || dateRange.dateTo) {
      const from = dateRange.dateFrom ? new Date(dateRange.dateFrom).getTime() : 0;
      const to = dateRange.dateTo ? new Date(dateRange.dateTo).getTime() : Infinity;
      filteredDriverEntries = filteredDriverEntries.filter(e => {
        const ts = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        return ts >= from && ts <= to;
      });
    }

    if (stationFilter) {
      filteredDriverEntries = filteredDriverEntries.filter(
        e => (e.dieselAt || '').trim().toUpperCase() === stationFilter.trim().toUpperCase()
      );
    }
    if (statusFilter === 'active') {
      filteredDriverEntries = filteredDriverEntries.filter(e => !e.isCancelled);
    } else if (statusFilter === 'cancelled') {
      filteredDriverEntries = filteredDriverEntries.filter(e => e.isCancelled);
    }

    // Guard against stale placeholder data: enforce station filter client-side on
    // lpoEntries too, since placeholderData keeps the previous query's results
    // visible while a new station-filtered fetch is in flight.
    const filteredLpoEntries = stationFilter
      ? lpoEntries.filter(e => (e.dieselAt || '').trim().toUpperCase() === stationFilter.trim().toUpperCase())
      : lpoEntries;

    return [...filteredLpoEntries, ...filteredDriverEntries];
  }, [lpoEntries, driverEntries, stationFilter, statusFilter, searchTerm, dateRange.dateFrom, dateRange.dateTo]);
  const totalItems = (lpoQuery.data?.pagination?.total ?? 0) + driverEntries.length;
  const totalPages = lpoQuery.data?.pagination?.totalPages ?? 1;
  const loading = lpoQuery.isLoading;
  const isFetching = lpoQuery.isFetching;

  const { data: workbooks = [] } = useLPOWorkbooks();
  const { data: hookYears = [] } = useLPOAvailableYears();
  const { data: filtersData } = useLPOAvailableFilters(dateRange);

  const availablePeriods = useMemo(() => {
    return (filtersData?.periods ?? []).sort((a: {year: number; month: number}, b: {year: number; month: number}) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );
  }, [filtersData]);

  const availableStations: string[] = useMemo(() => {
    if (searchTerm) {
      // Narrow to stations that actually appear in the search results.
      // Uses the station-less discovery query so the list stays complete
      // even after the user selects a station.
      const term = searchTerm.trim().toLowerCase();
      const lpoStations = discoveryEntries
        .map(e => (e.dieselAt || '').trim().toUpperCase())
        .filter(Boolean);
      const driverStations = driverEntries
        .filter(e =>
          (e.truckNo || '').toLowerCase().startsWith(term) ||
          (e.lpoNo || '').toLowerCase().startsWith(term) ||
          (e.dieselAt || '').toLowerCase().startsWith(term) ||
          (e.doSdo || '').toLowerCase().startsWith(term)
        )
        .map(e => (e.dieselAt || '').trim().toUpperCase())
        .filter(Boolean);
      return [...new Set([...lpoStations, ...driverStations])].sort();
    }
    const serverStations = filtersData?.stations ?? [];
    // Include stations from driver account entries so they appear in the filter
    const driverStations = driverEntries
      .map(e => (e.dieselAt || '').trim().toUpperCase())
      .filter(Boolean);
    return [...new Set([...serverStations, ...driverStations])].sort();
  }, [filtersData, driverEntries, discoveryEntries, searchTerm]);

  const availableYears = useMemo(() => {
    const yearsFromPeriods = availablePeriods.map((p: {year: number}) => p.year);
    return [...new Set([...hookYears, ...yearsFromPeriods])].sort((a, b) => b - a);
  }, [hookYears, availablePeriods]);

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
        console.log('Current selectedPeriods:', selectedPeriods);

        // Reset to list view so the highlighted record is visible
        setViewMode('list');

        // Clear any persisted content filters that could hide the target LPO.
        // The deep-link only carries year/month, so a leftover search term,
        // station, status, or date filter would otherwise exclude the LPO from
        // the query and the highlight would silently fail.
        setSearchTerm('');
        setStationFilter('');
        setStatusFilter('all');
        setDateFilter('');
        setCurrentPage(1);

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

  // Separate effect to handle highlight after a highlight is requested.
  // The list is server-side paginated, so the LPO may live on a page other than
  // the current one. Fetch ALL LPOs for the selected period, find the record's
  // position, jump to its page, then scroll/highlight it.
  useEffect(() => {
    if (!pendingHighlight) return;
    let cancelled = false;

    const locateAndHighlight = async () => {
      // Driver-account entries are merged into the list client-side and rendered
      // on EVERY page (they aren't part of server pagination), so the row is
      // already in the DOM on the current page — just scroll to it. They also
      // won't appear in the server LPO query below, so checking here avoids a
      // false "not found" that would clear the highlight.
      const isDriverEntry = driverEntries.some((e: any) => e.lpoNo === pendingHighlight);
      if (isDriverEntry) {
        setTimeout(() => scrollToAndHighlightLPO(pendingHighlight), 400);
        return;
      }

      try {
        const response = await lposAPI.getAll({
          limit: 10000,
          sort: 'createdAt',
          order: 'desc',
          ...(dateRange.dateFrom ? { dateFrom: dateRange.dateFrom } : {}),
          ...(dateRange.dateTo ? { dateTo: dateRange.dateTo } : {}),
        });
        if (cancelled) return;

        const allLpos = response.data || [];
        const recordIndex = allLpos.findIndex((l: any) => l.lpoNo === pendingHighlight);
        if (recordIndex < 0) {
          console.log('LPO not found for highlight:', pendingHighlight);
          clearLPOHighlight();
          return;
        }

        const targetPage = Math.floor(recordIndex / itemsPerPage) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
          // Wait for the page change + DOM update before scrolling
          setTimeout(() => scrollToAndHighlightLPO(pendingHighlight), 1000);
        } else {
          setTimeout(() => scrollToAndHighlightLPO(pendingHighlight), 400);
        }
      } catch (error) {
        console.error('❌ Error finding LPO position:', error);
        if (!cancelled) clearLPOHighlight();
      }
    };

    locateAndHighlight();
    return () => { cancelled = true; };
    // Only re-run when a new highlight is requested; currentPage/itemsPerPage are
    // read as the latest values inside the async closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHighlight]);
  
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

  // React Query handles filtering server-side; reset page on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stationFilter, dateFilter, selectedPeriods]);

  // Auto-clear station filter when it's no longer valid for the selected period(s)
  useEffect(() => {
    if (stationFilter && availableStations.length > 0 && !availableStations.includes(stationFilter)) {
      setStationFilter('');
    }
  }, [availableStations]);

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

  // Realtime sync — invalidate React Query cache instead of full refetch
  useRealtimeSync(['lpo_summaries'], () => {
    queryClient.invalidateQueries({ queryKey: lpoKeys.lists() });
    queryClient.invalidateQueries({ queryKey: lpoKeys.availableFilters() });
    queryClient.invalidateQueries({ queryKey: lpoKeys.workbooks() });
  });

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
    const sameLoEntries = orders.filter(entry => entry.lpoNo === lpo.lpoNo);
    
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

  // Auto-fallback: if the default current period (today's year+month) has no data,
  // automatically switch to the most recent period that does.
  useEffect(() => {
    if (loading || !filtersInitialized) return;
    const now = new Date();
    const defYear = now.getFullYear(), defMonth = now.getMonth() + 1;
    if (selectedPeriods.length !== 1 || selectedPeriods[0].year !== defYear || selectedPeriods[0].month !== defMonth) return;
    if (orders.length === 0 && availablePeriods.length > 0) {
      // Skip the current month (backend always includes it even if empty)
      const fallback = availablePeriods.find(p => !(p.year === defYear && p.month === defMonth));
      if (fallback) setSelectedPeriods([fallback]);
    }
  }, [orders, loading, filtersInitialized, availablePeriods]);

  // Assign serial numbers to LPOs — always continuous across all entries/months
  const lposWithMonthlySerialNumbers = useMemo(() => {
    const sorted = [...orders].sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });
    const pageOffset = (currentPage - 1) * itemsPerPage;
    return sorted.map((lpo, index) => ({
      ...lpo,
      sn: pageOffset + index + 1,
    }));
  }, [orders, currentPage, itemsPerPage]);

  // Server already paginates — use the serial-numbered list directly
  const paginatedLpos = lposWithMonthlySerialNumbers;

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
      const createdLpo = await lpoDocumentsAPI.create(data);
      
      setIsDetailFormOpen(false);

      // Reset month filter to current month so the newly created LPO is visible
      const now = new Date();
      setSelectedPeriods([{ year: now.getFullYear(), month: now.getMonth() + 1 }]);

      queryClient.invalidateQueries({ queryKey: lpoKeys.lists() });
      queryClient.invalidateQueries({ queryKey: lpoKeys.workbooks() });
      queryClient.invalidateQueries({ queryKey: lpoKeys.availableFilters() });
      queryClient.invalidateQueries({ queryKey: lpoKeys.availableYears() });
      queryClient.invalidateQueries({ queryKey: lpoKeys.referEntries() });

      // Auto-download PDF for the created LPO (only if enabled in config)
      if (autoDownloadLPOPdf) {
        const pdfToastId = toast.loading(`Preparing PDF — LPO ${createdLpo.lpoNo}...`, {
          style: { background: '#0284c7', color: '#fff' },
        });
        try {
          await downloadLPOPDF(createdLpo, undefined, user?.username);
          toast.update(pdfToastId, {
            render: `LPO ${createdLpo.lpoNo} created — PDF downloaded`,
            type: 'success',
            isLoading: false,
            autoClose: 4000,
            style: undefined,
          });
        } catch (pdfErr: any) {
          console.error('Error downloading PDF:', pdfErr);
          toast.update(pdfToastId, {
            render: `LPO ${createdLpo.lpoNo} created, but PDF download failed`,
            type: 'warning',
            isLoading: false,
            autoClose: 6000,
            style: undefined,
          });
        }
      } else {
        toast.success(`LPO ${createdLpo.lpoNo} created`);
      }
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
    try {
      // Fetch the LPO document to get its year (works for both regular and driver account LPOs
      // since driver account creation also creates an LPOSummary document)
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
    queryClient.invalidateQueries({ queryKey: lpoKeys.lists() });
    queryClient.invalidateQueries({ queryKey: lpoKeys.workbooks() });
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
  const totalLiters = orders.reduce((sum, lpo) => sum + lpo.ltrs, 0);
  const totalAmountTZS = orders
    .filter(lpo => { const u = (lpo.dieselAt || '').toUpperCase(); return !(u.startsWith('LAKE') && !u.includes('TUNDUMA')); })
    .reduce((sum, lpo) => sum + (lpo.ltrs * lpo.pricePerLtr), 0);
  const totalAmountUSD = orders
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

  // Show refer workbook view if selected
  if (viewMode === 'refer') {
    return (
      <div>
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Refer Trucks</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Track fuel entries for partner/third-party trucks
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
                className="px-2.5 py-1.5 text-sm font-medium border-t border-b bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Wallet className="w-4 h-4 mr-1 inline" />
                Driver Acc
              </button>
              <button
                onClick={() => setViewMode('refer')}
                className="px-2.5 py-1.5 text-sm font-medium rounded-r-md border bg-orange-600 text-white border-orange-600"
              >
                <Truck className="w-4 h-4 mr-1 inline" />
                Refer
              </button>
            </div>
          </div>
        </div>
        <ReferWorkbook onNavigateToSheet={handleNavigateToSheet} />
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
                className="px-2.5 py-1.5 text-sm font-medium border-t border-b bg-blue-600 text-white border-blue-600"
              >
                <Wallet className="w-4 h-4 mr-1 inline" />
                Driver Acc
              </button>
              <button
                onClick={() => setViewMode('refer')}
                className="px-2.5 py-1.5 text-sm font-medium rounded-r-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Truck className="w-4 h-4 mr-1 inline" />
                Refer
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
                className="px-2.5 py-1.5 text-sm font-medium border-t border-b bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Wallet className="w-4 h-4 mr-1 inline" />
                Driver Acc
              </button>
              <button
                onClick={() => setViewMode('refer')}
                className="px-2.5 py-1.5 text-sm font-medium rounded-r-md border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Truck className="w-4 h-4 mr-1 inline" />
                Refer
              </button>
            </div>
          </div>
        </div>
        <LPOSummaryComponent 
          lpoEntries={orders} 
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
              className={`px-3 py-2 text-sm font-medium border-t border-b ${
                (viewMode as ViewMode) === 'driver_account'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Wallet className="w-4 h-4 mr-1 inline" />
              Driver Acc
            </button>
            <button
              onClick={() => setViewMode('refer')}
              className={`px-3 py-2 text-sm font-medium rounded-r-md border ${
                (viewMode as ViewMode) === 'refer'
                  ? 'bg-orange-600 text-white border-orange-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Truck className="w-4 h-4 mr-1 inline" />
              Refer
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
              className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white"
              style={{ background: '#2563EB' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#1D4ED8')}
              onMouseLeave={e => (e.currentTarget.style.background = '#2563EB')}
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
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2 min-w-[150px]"
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
                        {selectedYear === year && <Check className="w-4 h-4 text-blue-600" />}
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
      <div className="hidden md:grid md:grid-cols-3 gap-3 mb-4">
        <div className="shadow rounded-lg p-3" style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' }}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-blue-100">Total Entries</div>
            <FileSpreadsheet className="w-4 h-4 text-blue-200" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{totalItems}</div>
        </div>
        <div className="shadow rounded-lg p-3" style={{ background: 'linear-gradient(135deg, #0891B2 0%, #0E7490 100%)' }}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-cyan-100">Total Liters</div>
            <BarChart3 className="w-4 h-4 text-cyan-200" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{totalLiters.toLocaleString()}</div>
        </div>
        <div className="shadow rounded-lg p-3" style={{ background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)' }}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-green-100">Total Amount</div>
            <Wallet className="w-4 h-4 text-green-200" />
          </div>
          {totalAmountTZS > 0 && (
            <div className="text-lg font-bold text-white mt-1">
              TZS {totalAmountTZS.toLocaleString()}
            </div>
          )}
          {totalAmountUSD > 0 && (
            <div className="text-base font-bold text-green-100">
              $ {totalAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
          {totalAmountTZS === 0 && totalAmountUSD === 0 && (
            <div className="text-2xl font-bold text-white mt-1">—</div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-3 mb-6 transition-colors">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="col-span-2 md:col-span-1">
            <input
              type="text"
              placeholder="Search by LPO#, Truck, DO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          
          {/* Month Multi-Select Dropdown */}
          <div ref={monthDropdownRef} className="month-dropdown-container relative">
            <button
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="w-full flex items-center justify-between px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
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
              className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
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
                  {stationFilter === '' && <Check className="w-4 h-4 text-blue-600" />}
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
                    {stationFilter === station && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          />
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={() => {
              setSearchTerm('');
              setStationFilter('');
              setDateFilter('');
              setStatusFilter('all');
              setSelectedPeriods(
                availablePeriods.length > 0
                  ? [availablePeriods[0]]
                  : [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]
              );
            }}
            className="col-span-2 md:col-span-1 w-full inline-flex items-center justify-center px-3 h-[34px] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg transition-colors">
        {loading || isFetching ? (
          <UnifiedTabLoader label="Loading LPO entries..." />
        ) : orders.length === 0 ? (
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
                    className={`border rounded-xl p-4 transition-all cursor-pointer ${
                      lpo.isCancelled
                        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">#{lpo.sn}</span>
                          <span className={`text-sm font-bold ${lpo.isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>{lpo.lpoNo}</span>
                          {lpo.isCancelled && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{lpo.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {lpo.currency === 'USD'
                            ? `$ ${(lpo.ltrs * lpo.pricePerLtr).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : `TZS ${(lpo.ltrs * lpo.pricePerLtr).toLocaleString()}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {lpo.currency === 'USD'
                            ? `${lpo.ltrs.toLocaleString()}L @ $${(lpo.pricePerLtr ?? 0).toFixed(2)}`
                            : `${lpo.ltrs.toLocaleString()}L @ TZS ${(lpo.pricePerLtr ?? 0).toLocaleString()}`}
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
                        className={`cursor-pointer transition-colors ${
                          lpo.isCancelled
                            ? 'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                        onClick={() => handleRowClick(lpo)}
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100">
                          {lpo.sn}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                          {lpo.date}
                        </td>
                        <td className="px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 underline">
                          <span className={lpo.isCancelled ? 'line-through text-red-500 dark:text-red-400' : ''}>{lpo.lpoNo}</span>
                          {lpo.isCancelled && <span className="ml-1 px-1 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">CANCELLED</span>}
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
                          {(lpo.pricePerLtr ?? 0).toFixed(2)}
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
        {!loading && orders.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
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
