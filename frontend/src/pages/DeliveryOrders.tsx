import { useState, useEffect, useRef, useMemo } from 'react';
import usePersistedState from '../hooks/usePersistedState';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Download, Edit, FileSpreadsheet, List, BarChart3, FileDown, Ban, RotateCcw, FileEdit, ChevronDown, Check, Calendar } from 'lucide-react';
import { DeliveryOrder, DOWorkbook as DOWorkbookType } from '../types';
import { fuelRecordsAPI, deliveryOrdersAPI, doWorkbookAPI, sdoWorkbookAPI } from '../services/api';
import fuelRecordService from '../services/fuelRecordService';
import DODetailModal from '../components/DODetailModal';
import DOForm from '../components/DOForm';
import BulkDOForm from '../components/BulkDOForm';
import MonthlySummary from '../components/MonthlySummary';
import DOWorkbook from '../components/DOWorkbook';
import CancelDOModal from '../components/CancelDOModal';
import AmendedDOsModal from '../components/AmendedDOsModal';
import { useAmendedDOs } from '../contexts/AmendedDOsContext';
import { cleanDeliveryOrders, isCorruptedDriverName } from '../utils/dataCleanup';
import Pagination from '../components/Pagination';
import { useTruckBatches, getExtraFuelFromBatches } from '../hooks/useTruckBatches';
import { useRoutes, getTotalLitersFromRoutes } from '../hooks/useRoutes';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface DeliveryOrdersProps {
  user?: any;
}

const DeliveryOrders = ({ user }: DeliveryOrdersProps = {}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = usePersistedState('do:searchTerm', '');
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = usePersistedState('do:filterType', 'ALL');
  const [filterDoType, setFilterDoType] = usePersistedState<'ALL' | 'DO' | 'SDO'>('do:filterDoType', 'DO');
  const [filterStatus, setFilterStatus] = usePersistedState<'all' | 'active' | 'cancelled'>('do:filterStatus', 'all');
  // Period filter — each entry is a {year, month} pair so Jan 2025 ≠ Jan 2026
  const [selectedPeriods, setSelectedPeriods] = usePersistedState<Array<{year: number; month: number}>>(
    'do:selectedPeriods',
    [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1 }]
  );
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkFormOpen, setIsBulkFormOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isAmendedDOsModalOpen, setIsAmendedDOsModalOpen] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<DeliveryOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null);
  const [activeTab, setActiveTab] = usePersistedState<'list' | 'summary' | 'workbook'>('do:activeTab', 'list');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistedState('do:itemsPerPage', 25);
  
  // Amended DOs context for session tracking
  const { addAmendedDO, count: amendedDOsCount } = useAmendedDOs();
  
  // React Query hooks - Replace localStorage with API
  const { data: truckBatches } = useTruckBatches();
  const { data: routes } = useRoutes();
  
  // Workbook state
  const [workbooks, setWorkbooks] = useState<DOWorkbookType[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | number | null>(null);
  const [previousFilterDoType, setPreviousFilterDoType] = useState<'ALL' | 'DO' | 'SDO'>('DO'); // Remember filter before opening workbook
  const [exportingYear, setExportingYear] = useState<number | null>(null);

  // Filter dropdown states
  const [showWorkbookYearDropdown, setShowWorkbookYearDropdown] = useState(false);
  const [showDoTypeDropdown, setShowDoTypeDropdown] = useState(false);
  const [showFilterTypeDropdown, setShowFilterTypeDropdown] = useState(false);
  const [showFilterStatusDropdown, setShowFilterStatusDropdown] = useState(false);

  // Refs for click-outside detection
  const workbookYearDropdownRef = useRef<HTMLDivElement>(null);
  const doTypeDropdownRef = useRef<HTMLDivElement>(null);
  const filterTypeDropdownRef = useRef<HTMLDivElement>(null);
  const filterStatusDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);

  // Ref to track if we've processed a highlight to avoid re-processing
  const highlightProcessedRef = useRef<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);

  // Click-outside detection for filter dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (workbookYearDropdownRef.current && !workbookYearDropdownRef.current.contains(event.target as Node)) {
        setShowWorkbookYearDropdown(false);
      }
      if (doTypeDropdownRef.current && !doTypeDropdownRef.current.contains(event.target as Node)) {
        setShowDoTypeDropdown(false);
      }
      if (filterTypeDropdownRef.current && !filterTypeDropdownRef.current.contains(event.target as Node)) {
        setShowFilterTypeDropdown(false);
      }
      if (filterStatusDropdownRef.current && !filterStatusDropdownRef.current.contains(event.target as Node)) {
        setShowFilterStatusDropdown(false);
      }
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
    };

    const handleScroll = () => {
      setShowWorkbookYearDropdown(false);
      setShowDoTypeDropdown(false);
      setShowFilterTypeDropdown(false);
      setShowFilterStatusDropdown(false);
      setShowMonthDropdown(false);
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
    loadOrders();
    fetchWorkbooks();
    fetchAvailableYears();
    
    // Listen for URL changes from EnhancedDashboard
    const handleUrlChange = () => {
      // Force re-read of search params
      const url = new URL(window.location.href);
      const editId = url.searchParams.get('edit');
      const actionParam = url.searchParams.get('action');
      const highlightId = url.searchParams.get('highlight');
      const yearParam = url.searchParams.get('year');
      const monthParam = url.searchParams.get('month');
      
      if (editId) {
        // Manually trigger the edit flow
        deliveryOrdersAPI.getById(editId).then(order => {
          if (order) {
            console.log('Fetched DO for edit from URL change event:', order.doNumber);
            setEditingOrder(order);
            setIsFormOpen(true);
            // Clear the query param
            url.searchParams.delete('edit');
            window.history.replaceState({}, '', url.toString());
          }
        }).catch(err => {
          console.error('Failed to fetch DO for edit:', err);
        });
      } else if (actionParam === 'create-do') {
        console.log('Quick Action: Opening Create DO form');
        setEditingOrder(null);
        setIsFormOpen(true);
        // Clear the action param
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
      } else if (actionParam === 'bulk-create') {
        console.log('Quick Action: Opening Bulk Create DO modal');
        setIsBulkFormOpen(true);
        // Clear the action param
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
      } else if (highlightId && highlightId !== highlightProcessedRef.current) {
        // Mark as processed to avoid re-processing
        highlightProcessedRef.current = highlightId;
        console.log('Processing highlight for DO:', highlightId, 'Year:', yearParam, 'Month:', monthParam);
        
        // Set year if provided
        if (yearParam) {
          const year = parseInt(yearParam);
          if (!isNaN(year)) {
            console.log('Setting year to:', year);
            setSelectedYear(year);
          }
        }
        
        // Set month if provided
        if (monthParam) {
          const month = parseInt(monthParam);
          if (!isNaN(month) && month >= 1 && month <= 12) {
            const hlYear = (yearParam && !isNaN(parseInt(yearParam)))
              ? parseInt(yearParam)
              : new Date().getFullYear();
            console.log('Setting period filter to:', hlYear, month);
            setSelectedPeriods([{ year: hlYear, month }]);
          }
        }
        
        // Trigger highlight after a brief delay to let filters apply
        setTimeout(() => setPendingHighlight(highlightId), 100);
      }
    };
    
    window.addEventListener('urlchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    handleUrlChange(); // Check on mount
    
    return () => {
      window.removeEventListener('urlchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [filterType, filterDoType]);

  // Separate effect to handle highlight after orders are loaded
  useEffect(() => {
    if (pendingHighlight && orders.length > 0) {
      console.log('%c=== DO HIGHLIGHT SEARCH ===', 'background: #3b82f6; color: white; padding: 4px;');
      console.log('Pending Highlight:', pendingHighlight);
      console.log('Total orders:', orders.length);
      console.log('Selected Periods:', selectedPeriods);
      
      // Find in filtered orders (after period filter applied)
      const filteredList = orders.filter(order => {
        if (selectedPeriods.length === 0) return true;
        const orderYear = parseDateYearSafe(order.date);
        const orderMonth = getMonthFromDate(order.date);
        return selectedPeriods.some(p => p.year === orderYear && p.month === orderMonth);
      });
      
      console.log('Filtered orders count:', filteredList.length);
      const recordIndex = filteredList.findIndex(o => o.doNumber === pendingHighlight);
      
      if (recordIndex >= 0) {
        console.log('Found DO at index:', recordIndex, 'in filtered list');
        const targetPage = Math.floor(recordIndex / itemsPerPage) + 1;
        console.log('Target page:', targetPage, 'Current page:', currentPage);
        
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
          // Wait longer for page change and DOM update
          setTimeout(() => scrollToAndHighlightDO(pendingHighlight), 1000);
        } else {
          // Already on correct page
          setTimeout(() => scrollToAndHighlightDO(pendingHighlight), 500);
        }
      } else {
        console.log('DO not found in filtered orders:', pendingHighlight);
        clearDOHighlight();
      }
    }
  }, [pendingHighlight, orders, selectedPeriods, itemsPerPage, currentPage]);
  
  // Helper function to scroll and highlight
  const scrollToAndHighlightDO = (doNumber: string) => {
    console.log('=== DO HIGHLIGHT ATTEMPT ===');
    console.log('DO Number:', doNumber);
    
    // Find all elements with this DO number
    const allElements = document.querySelectorAll(`[data-do-number="${doNumber}"]`);
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
      
      // Apply subtle highlight with faint blue
      element.style.transition = 'all 0.3s ease-in-out';
      element.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3), 0 0 15px rgba(59, 130, 246, 0.2)';
      element.style.border = '2px solid rgba(59, 130, 246, 0.4)';
      element.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
      element.style.transform = 'scale(1.01)';
      element.style.zIndex = '1000';
      
      console.log('✅ Applied DO highlight');
      
      setTimeout(() => {
        element.style.boxShadow = originalStyles.boxShadow;
        element.style.border = originalStyles.border;
        element.style.backgroundColor = originalStyles.backgroundColor;
        element.style.transform = originalStyles.transform;
        element.style.transition = originalStyles.transition;
        element.style.zIndex = '';
        console.log('❌ Removed DO highlight');
        clearDOHighlight();
      }, 3000);
    } else {
      console.error('❌ DO Element not found:', doNumber);
      clearDOHighlight();
    }
  };
  
  // Helper to clear highlight
  const clearDOHighlight = () => {
    highlightProcessedRef.current = null;
    setPendingHighlight(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('highlight');
    url.searchParams.delete('year');
    url.searchParams.delete('month');
    window.history.replaceState({}, '', url.toString());
  };

  // Handle edit query parameter (e.g., from notification click)
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && orders.length > 0) {
      // Find the order to edit
      const orderToEdit = orders.find(o => 
        (o.id && String(o.id) === editId) || 
        ((o as any)._id && String((o as any)._id) === editId)
      );
      
      if (orderToEdit) {
        console.log('Opening DO for edit from URL param:', orderToEdit.doNumber);
        setEditingOrder(orderToEdit);
        setIsFormOpen(true);
        // Clear the query param to prevent re-opening on refresh
        setSearchParams({});
      } else {
        // Order not found in current filter, try to fetch it directly
        deliveryOrdersAPI.getById(editId).then(order => {
          if (order) {
            console.log('Fetched DO for edit:', order.doNumber);
            setEditingOrder(order);
            setIsFormOpen(true);
            setSearchParams({});
          }
        }).catch(err => {
          console.error('Failed to fetch DO for edit:', err);
          setSearchParams({});
        });
      }
    }
  }, [searchParams, orders]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await deliveryOrdersAPI.getAll({
        importOrExport: filterType,
        doType: filterDoType === 'ALL' ? undefined : filterDoType,
        limit: 10000, // Fetch all for client-side filtering
      });
      // Extract data from new API response format
      const rawOrders = Array.isArray(response.data) ? response.data : [];
      
      // Clean corrupted data and log any issues found
      const cleanedOrders = cleanDeliveryOrders(rawOrders);
      const corruptedCount = rawOrders.filter(order => isCorruptedDriverName(order.driverName)).length;
      
      if (corruptedCount > 0) {
        console.warn(`Found and cleaned ${corruptedCount} delivery orders with corrupted driver names`);
      }
      
      setOrders(cleanedOrders);
    } catch (error) {
      console.error('Failed to load delivery orders:', error);
      setOrders([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('delivery_orders', loadOrders);

  const fetchWorkbooks = async () => {
    try {
      // Fetch workbooks based on current filter
      if (filterDoType === 'ALL') {
        // Fetch both DO and SDO workbooks
        const [doData, sdoData] = await Promise.all([
          doWorkbookAPI.getAll().catch((err) => { console.error('DO workbook fetch error:', err); return []; }),
          sdoWorkbookAPI.getAll().catch((err) => { console.error('SDO workbook fetch error:', err); return []; })
        ]);
        console.log('Raw DO data:', doData);
        console.log('Raw SDO data:', sdoData);
        const allWorkbooks = [
          ...(Array.isArray(doData) ? doData.map(w => ({ ...w, type: 'DO' as const })) : []),
          ...(Array.isArray(sdoData) ? sdoData.map(w => ({ ...w, type: 'SDO' as const })) : [])
        ].sort((a, b) => (b.year || 0) - (a.year || 0)); // Sort by year descending
        setWorkbooks(allWorkbooks);
        console.log('Fetched ALL workbooks (DO + SDO):', allWorkbooks);
        console.log('DO workbooks count:', allWorkbooks.filter(w => w.type === 'DO').length);
        console.log('SDO workbooks count:', allWorkbooks.filter(w => w.type === 'SDO').length);
      } else {
        const data = filterDoType === 'SDO' 
          ? await sdoWorkbookAPI.getAll()
          : await doWorkbookAPI.getAll();
        const typedData = Array.isArray(data) ? data.map(w => ({ ...w, type: filterDoType as 'DO' | 'SDO' })) : [];
        setWorkbooks(typedData);
        console.log(`Fetched ${filterDoType} workbooks:`, typedData);
      }
    } catch (error) {
      console.error('Error fetching workbooks:', error);
      setWorkbooks([]);
    }
  };

  const fetchAvailableYears = async () => {
    try {
      // Fetch years based on current filter
      if (filterDoType === 'ALL') {
        // Fetch years from both DO and SDO
        const [doYears, sdoYears] = await Promise.all([
          doWorkbookAPI.getAvailableYears().catch(() => []),
          sdoWorkbookAPI.getAvailableYears().catch(() => [])
        ]);
        const allYears = [...new Set([...doYears, ...sdoYears])].sort((a, b) => b - a);
        console.log('Available ALL years:', allYears);
        if (allYears.length > 0) {
          setAvailableYears(allYears);
          setSelectedYear(allYears[0]);
        } else {
          const currentYear = new Date().getFullYear();
          setAvailableYears([currentYear]);
          setSelectedYear(currentYear);
        }
      } else {
        const years = filterDoType === 'SDO'
          ? await sdoWorkbookAPI.getAvailableYears()
          : await doWorkbookAPI.getAvailableYears();
        console.log(`Available ${filterDoType} years:`, years);
        if (years.length > 0) {
          setAvailableYears(years);
          setSelectedYear(years[0]); // Most recent year
        } else {
          const currentYear = new Date().getFullYear();
          setAvailableYears([currentYear]);
          setSelectedYear(currentYear);
        }
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      const currentYear = new Date().getFullYear();
      setAvailableYears([currentYear]);
      setSelectedYear(currentYear);
    }
  };

  // Merge years derived from the loaded orders into availableYears.
  // This ensures that imported DOs (which have no workbook) still appear in the year dropdown.
  useEffect(() => {
    if (orders.length === 0) return;
    const yearsFromData = [...new Set(
      orders.map(o => {
        const iso = o.date?.match(/^(\d{4})-\d{2}-\d{2}/);
        if (iso) return parseInt(iso[1]);
        const dmy = o.date?.match(/^\d{1,2}[\-\/\s][A-Za-z]+[\-\/\s](\d{4})$/);
        if (dmy) return parseInt(dmy[1]);
        const d = new Date(o.date ?? '');
        return isNaN(d.getTime()) ? null : d.getFullYear();
      }).filter((y): y is number => y !== null)
    )].sort((a, b) => b - a);
    if (yearsFromData.length === 0) return;
    setAvailableYears(prev => {
      const merged = [...new Set([...prev, ...yearsFromData])].sort((a, b) => b - a);
      return merged.join(',') === prev.join(',') ? prev : merged;
    });
  }, [orders]);

  const handleExportWorkbook = async (year: number, workbookType?: string) => {
    try {
      setExportingYear(year);
      // Determine which API to use
      const type = workbookType || filterDoType;
      
      if (type === 'SDO') {
        await sdoWorkbookAPI.exportWorkbook(year);
        alert(`✓ SDO Workbook SDO_${year}.xlsx downloaded successfully!`);
      } else {
        await doWorkbookAPI.exportWorkbook(year);
        alert(`✓ Workbook DELIVERY_ORDERS_${year}.xlsx downloaded successfully!`);
      }
    } catch (error: any) {
      console.error('Error exporting workbook:', error);
      const type = workbookType || filterDoType;
      if (error.response?.status === 404) {
        alert(`No ${type === 'SDO' ? 'SDO' : 'delivery'} orders found for year ${year}`);
      } else {
        alert('Failed to export workbook. Please try again.');
      }
    } finally {
      setExportingYear(null);
    }
  };

  const handleExportMonthlySummaries = async (year: number, workbookType?: string) => {
    try {
      setExportingYear(year);
      // Determine which API to use
      const type = workbookType || filterDoType;
      
      if (type === 'SDO') {
        await sdoWorkbookAPI.exportYearlyMonthlySummaries(year);
        alert(`✓ SDO Monthly Summaries SDO_Monthly_Summaries_${year}.xlsx downloaded successfully!`);
      } else {
        await doWorkbookAPI.exportYearlyMonthlySummaries(year);
        alert(`✓ Monthly Summaries DO_Monthly_Summaries_${year}.xlsx downloaded successfully!`);
      }
    } catch (error: any) {
      console.error('Error exporting monthly summaries:', error);
      const type = workbookType || filterDoType;
      if (error.response?.status === 404) {
        alert(`No ${type === 'SDO' ? 'SDO' : 'delivery'} orders found for year ${year}`);
      } else {
        alert('Failed to export monthly summaries. Please try again.');
      }
    } finally {
      setExportingYear(null);
    }
  };

  const handleOpenWorkbook = (year: number, workbookType?: string) => {
    setSelectedYear(year);
    setSelectedWorkbookId(year);
    // Remember current filter so we can restore it when closing
    setPreviousFilterDoType(filterDoType);
    // Store workbook type if provided for proper data fetching in DOWorkbook
    // This ensures the DOWorkbook component uses the correct API
    if (workbookType && (workbookType === 'DO' || workbookType === 'SDO')) {
      setFilterDoType(workbookType);
    }
  };

  const handleCloseWorkbook = () => {
    setSelectedWorkbookId(null);
    // Restore previous filter type
    setFilterDoType(previousFilterDoType);
    setActiveTab('list');
    fetchWorkbooks(); // Refresh workbooks list
  };

  // Helper: parse year from a date string in any of our stored formats
  const parseDateYearSafe = (dateStr: string): number | null => {
    if (!dateStr) return null;
    // ISO "YYYY-MM-DD"
    const iso = dateStr.match(/^(\d{4})-\d{2}-\d{2}/);
    if (iso) return parseInt(iso[1]);
    // "DD-Mon-YYYY" e.g. "15-Jan-2025"
    const dmy = dateStr.match(/^\d{1,2}[\-\/\s][A-Za-z]+[\-\/\s](\d{4})$/);
    if (dmy) return parseInt(dmy[1]);
    // Native JS fallback
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d.getFullYear();
  };

  // Helper to get month from date string (supports YYYY-MM-DD, DD-Mon-YYYY, D-Mon formats)
  const getMonthFromDate = (dateStr: string): number | null => {
    if (!dateStr) return null;
    try {
      // ISO "YYYY-MM-DD"
      const iso = dateStr.match(/^\d{4}-(\d{2})-\d{2}/);
      if (iso) return parseInt(iso[1], 10);
      // "DD-Mon-YYYY" or "D-Mon-YYYY"  e.g. "15-Jan-2025"
      const dmy = dateStr.match(/^\d{1,2}[\-\/\s]([A-Za-z]{3})[\-\/\s]\d{4}$/i);
      if (dmy) {
        const MON: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
        return MON[dmy[1].toLowerCase()] ?? null;
      }
      // Native fallback
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) return date.getMonth() + 1;
    } catch { /* ignore */ }
    return null;
  };

  // Build the list of year-month pairs that actually have data, newest first
  const availablePeriods = useMemo(() => {
    const seen = new Map<string, { year: number; month: number }>();
    orders.forEach(order => {
      if (!order.date) return;
      const year = parseDateYearSafe(order.date);
      const month = getMonthFromDate(order.date);
      if (year !== null && month !== null) {
        const key = `${year}-${month}`;
        if (!seen.has(key)) seen.set(key, { year, month });
      }
    });
    return Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : a.month - b.month
    );
  }, [orders]);

  // Auto-fallback: if the default current-month has no data, step back one month
  useEffect(() => {
    if (loading || orders.length === 0) return;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    // Only auto-fallback when still on the initial default selection
    if (selectedPeriods.length !== 1 ||
        selectedPeriods[0].year !== currentYear ||
        selectedPeriods[0].month !== currentMonth) return;
    const hasData = availablePeriods.some(p => p.year === currentYear && p.month === currentMonth);
    if (!hasData && availablePeriods.length > 0) {
      // Pick the most recent period that exists
      setSelectedPeriods([availablePeriods[0]]);
    }
  }, [availablePeriods, loading]);

  // Toggle a year-month period on/off
  const togglePeriod = (year: number, month: number) => {
    setSelectedPeriods(prev => {
      const exists = prev.some(p => p.year === year && p.month === month);
      if (exists) {
        if (prev.length === 1) return prev; // keep at least one selected
        return prev.filter(p => !(p.year === year && p.month === month));
      }
      return [...prev, { year, month }].sort((a, b) =>
        b.year !== a.year ? b.year - a.year : a.month - b.month
      );
    });
  };

  // Display text for the period picker button
  const getMonthsDisplayText = (): string => {
    if (selectedPeriods.length === 0) return 'Select Period';
    if (selectedPeriods.length === 1) {
      const p = selectedPeriods[0];
      return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
    }
    if (selectedPeriods.length === availablePeriods.length && availablePeriods.length > 0) return 'All Periods';
    return `${selectedPeriods.length} periods`;
  };

  // Filter orders by search term, status, and months
  const filteredOrders = Array.isArray(orders) ? orders.filter(order => {
    // Search filter
    const matchesSearch = order.doNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.truckNo.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Status filter
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && !order.isCancelled) ||
      (filterStatus === 'cancelled' && order.isCancelled);
    
    // Period filter — match any selected year-month pair
    let matchesPeriod = true;
    if (selectedPeriods.length > 0 && selectedPeriods.length < availablePeriods.length) {
      const orderYear = parseDateYearSafe(order.date);
      const orderMonth = getMonthFromDate(order.date);
      matchesPeriod = selectedPeriods.some(p => p.year === orderYear && p.month === orderMonth);
    }
    
    return matchesSearch && matchesStatus && matchesPeriod;
  }) : [];

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  // Reset page when search or filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (value: 'all' | 'active' | 'cancelled') => {
    setFilterStatus(value);
    setCurrentPage(1);
  };

  const handleViewOrder = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  const handlePrintOrder = () => {
    window.print();
  };

  const handleNewDO = () => {
    console.log('=== handleNewDO clicked ===');
    console.log('Filter DO type:', filterDoType);
    setEditingOrder(null);
    setIsFormOpen(true);
    console.log('Form should now be open');
  };

  const handleEditOrder = (order: DeliveryOrder) => {
    console.log('Editing order:', order);
    console.log('Order ID:', order.id, 'Order _id:', (order as any)._id);
    setEditingOrder(order);
    setIsFormOpen(true);
  };

  const handleSaveOrder = async (orderData: Partial<DeliveryOrder>): Promise<DeliveryOrder | void> => {
    try {
      console.log('=== handleSaveOrder START ===');
      console.log('Order data received:', orderData);
      console.log('editingOrder:', editingOrder);
      console.log('editingOrder?.id:', editingOrder?.id);
      
      // Save the DO first
      let savedOrder: DeliveryOrder;
      let fieldsChanged: string[] = [];
      
      // Check for id in multiple formats
      const orderId = editingOrder?.id || (editingOrder as any)?._id;
      console.log('Determined orderId:', orderId);
      
      if (orderId) {
        console.log('=== UPDATE MODE ===');
        // Track which fields changed for amended DOs tracking
        const originalOrder = editingOrder!;
        const editableFields = ['truckNo', 'trailerNo', 'destination', 'loadingPoint', 'tonnages', 'ratePerTon', 'driverName', 'clientName', 'haulier', 'containerNo', 'invoiceNos', 'cargoType'];
        
        editableFields.forEach(field => {
          const oldValue = originalOrder[field as keyof DeliveryOrder];
          const newValue = orderData[field as keyof DeliveryOrder];
          if (oldValue !== newValue && newValue !== undefined) {
            fieldsChanged.push(field);
          }
        });
        
        // Update existing DO - now returns { order, cascadeResults }
        const result = await deliveryOrdersAPI.update(orderId, orderData);
        savedOrder = result.order;
        
        // Add to amended DOs session list if any fields changed
        if (fieldsChanged.length > 0) {
          addAmendedDO(savedOrder, fieldsChanged);
          console.log(`DO ${savedOrder.doNumber} added to amended list. Changed fields:`, fieldsChanged);
        }
        
        // Log cascade results if any
        if (result.cascadeResults) {
          console.log('Cascade update results:', result.cascadeResults);
          if (result.cascadeResults.fuelRecordUpdated) {
            console.log('Fuel record updated with changes:', result.cascadeResults.fuelRecordChanges);
          }
          if (result.cascadeResults.lpoEntriesUpdated > 0) {
            console.log(`${result.cascadeResults.lpoEntriesUpdated} LPO entries updated`);
          }
        }

        // Check if this is an EXPORT DO with truck number changed - try to re-link to fuel record
        if (savedOrder.doType === 'DO' && 
            savedOrder.importOrExport === 'EXPORT' && 
            fieldsChanged.includes('truckNo')) {
          console.log('Truck number changed for EXPORT DO, attempting to re-link to fuel record...');
          try {
            const relinkResult = await deliveryOrdersAPI.relinkToFuelRecord(orderId);
            if (relinkResult.success && relinkResult.data.fuelRecord) {
              if (relinkResult.data.wasAlreadyLinked) {
                console.log('DO was already linked to fuel record');
              } else {
                // Show detailed message about fuel updates
                let message = `✓ Successfully linked DO-${savedOrder.doNumber} to fuel record for truck ${savedOrder.truckNo}.`;
                
                if (relinkResult.data.fuelUpdates) {
                  const { originalTotalLts, exportRouteLiters, newTotalLts } = relinkResult.data.fuelUpdates;
                  message += `\n\nFuel Updated:\n` +
                    `  Before: ${originalTotalLts}L\n` +
                    `  Added: +${exportRouteLiters}L (export route)\n` +
                    `  After: ${newTotalLts}L`;
                }
                
                message += '\n\nNotification resolved.';
                alert(message);
              }
            } else {
              console.log('Re-link result:', relinkResult.message);
              // Still unlinked - notification remains
            }
          } catch (relinkError) {
            console.error('Failed to re-link EXPORT DO to fuel record:', relinkError);
          }
        }
      } else {
        // Create new DO
        console.log('=== CREATE MODE ===');
        console.log('Calling deliveryOrdersAPI.create with:', orderData);
        savedOrder = await deliveryOrdersAPI.create(orderData);
        console.log('API returned saved order:', savedOrder);
        
        // Handle fuel record creation/update ONLY for DO type (not SDO)
        // SDO orders are standalone and don't interact with fuel records
        if (savedOrder.doType === 'DO') {
          if (savedOrder.importOrExport === 'IMPORT') {
            // IMPORT = Going journey = Create new fuel record
            await handleCreateFuelRecordForImport(savedOrder);
          } else if (savedOrder.importOrExport === 'EXPORT') {
            // EXPORT = Return journey = Update existing fuel record
            await handleUpdateFuelRecordForExport(savedOrder);
          }
        } else {
          console.log(`SDO ${savedOrder.doNumber} created - skipping fuel record operations`);
        }
      }
      
      console.log('Reloading orders...');
      loadOrders();
      console.log('=== handleSaveOrder END - SUCCESS ===');
      return savedOrder;
    } catch (error) {
      console.error('=== handleSaveOrder END - ERROR ===');
      console.error('Failed to save order:', error);
      alert('Failed to save delivery order. Error: ' + (error as any).message);
      throw error;
    }
  };

  // Cancel DO handler
  const handleOpenCancelModal = (order: DeliveryOrder) => {
    setCancellingOrder(order);
    setIsCancelModalOpen(true);
  };

  const handleCloseCancelModal = () => {
    setIsCancelModalOpen(false);
    setCancellingOrder(null);
  };

  const handleConfirmCancel = async () => {
    const orderId = cancellingOrder?.id || (cancellingOrder as any)?._id;
    if (!orderId) return;
    
    setIsCancelling(true);
    try {
      const result = await deliveryOrdersAPI.cancel(orderId);
      
      console.log('DO cancelled:', result.order.doNumber);
      console.log('Cascade results:', result.cascadeResults);
      
      // Add cancelled DO to the amended DOs session list for download
      addAmendedDO(result.order, ['status']); // Mark 'status' as the changed field
      console.log(`Cancelled DO ${result.order.doNumber} added to amended/cancelled list for download`);
      
      // Show success message with cascade info
      let message = `Delivery Order ${result.order.doType}-${result.order.doNumber} has been cancelled.`;
      if (result.cascadeResults) {
        if (result.cascadeResults.fuelRecordCancelled) {
          message += '\n• Associated fuel record cancelled';
        }
        if (result.cascadeResults.lpoEntriesCancelled > 0) {
          message += `\n• ${result.cascadeResults.lpoEntriesCancelled} LPO entries cancelled`;
        }
      }
      
      alert(message);
      handleCloseCancelModal();
      loadOrders();
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      const errorMessage = error.response?.data?.message || 'Failed to cancel delivery order';
      alert(errorMessage);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCreateFuelRecordForImport = async (deliveryOrder: DeliveryOrder) => {
    try {
      console.log('  → Generating fuel record for DO:', deliveryOrder.doNumber);
      
      // Check if truck already has an open fuel record (without returnDo)
      // This validation only applies to IMPORT DOs (going journey)
      const response = await fuelRecordsAPI.getAll({ limit: 10000 });
      const allRecords = response.data;
      const activeRecord = allRecords.find(
        (record: any) => record.truckNo === deliveryOrder.truckNo && record.journeyStatus === 'active'
      );
      
      if (activeRecord && !activeRecord.returnDo) {
        // Show info message instead of blocking - journey will be queued
        const queuedCount = allRecords.filter(
          (record: any) => record.truckNo === deliveryOrder.truckNo && record.journeyStatus === 'queued'
        ).length;
        
        const position = queuedCount + 1;
        const message = `ℹ️ Truck ${deliveryOrder.truckNo} has an active journey (DO: ${activeRecord.goingDo}). This new journey will be queued (position #${position}) and will automatically activate when the current journey completes.`;
        console.log(message);
        // Show alert but don't block
        if (confirm(message + '\n\nDo you want to proceed with creating this queued journey?')) {
          // Continue with fuel record creation - backend will handle queuing
        } else {
          throw new Error('Journey creation cancelled by user');
        }
      }
      
      // Get total liters from API data (NOT localStorage)
      const destinationMatch = getTotalLitersFromRoutes(routes, deliveryOrder.destination);
      let totalLiters: number | null = destinationMatch.matched ? destinationMatch.liters : null;
      let missingTotalLiters = !destinationMatch.matched;
      
      console.log(`  → POL: ${deliveryOrder.loadingPoint || 'N/A'}, Destination: ${deliveryOrder.destination}`);
      console.log(`  → Match Type: ${destinationMatch.matchType}`);
      
      if (missingTotalLiters) {
        console.log(`  ⚠️ Route "${deliveryOrder.destination}" not configured - will notify admin`);
      } else {
        console.log(`  → Total Liters: ${totalLiters}L`);
      }
      
      // Check truck batch configuration for extra fuel from API data (NOT localStorage)
      // Pass destination to support destination-based fuel rules
      const truckBatchInfo = getExtraFuelFromBatches(
        deliveryOrder.truckNo,
        truckBatches,
        deliveryOrder.destination
      );
      let extraFuel: number | null = truckBatchInfo.matched ? truckBatchInfo.extraFuel : null;
      let missingExtraFuel = !truckBatchInfo.matched && truckBatchInfo.truckSuffix !== '';
      
      console.log(`  → Truck: ${deliveryOrder.truckNo}, Suffix: ${truckBatchInfo.truckSuffix.toUpperCase()}`);
      
      if (missingExtraFuel) {
        console.log(`  ⚠️ Truck suffix "${truckBatchInfo.truckSuffix}" not configured - will notify admin`);
      } else {
        const overrideInfo = truckBatchInfo.destinationOverride 
          ? ` (destination override for ${deliveryOrder.destination})` 
          : ` (${truckBatchInfo.batchName})`;
        console.log(`  → Extra fuel: ${extraFuel}L${overrideInfo}`);
      }
      
      // Log info message if any configuration is missing (no alert in bulk mode)
      if (missingTotalLiters || missingExtraFuel) {
        console.log('  ⚠️ Missing configuration detected:');
        if (missingTotalLiters) {
          console.log(`  - Route "${deliveryOrder.destination}" needs total liters`);
        }
        if (missingExtraFuel) {
          console.log(`  - Truck suffix "${truckBatchInfo.truckSuffix.toUpperCase()}" needs batch assignment`);
        }
        console.log('  → Fuel record will be created but LOCKED until admin configures these values');
      }
      
      // For now, use default loading point. Later, this can come from a configuration dialog
      const loadingPoint: 'DAR_YARD' | 'KISARAWE' | 'DAR_STATION' = 'DAR_YARD';
      console.log('  → Loading point:', loadingPoint);
      
      // Generate fuel record (checkpoints will be empty until LPOs are created)
      const { fuelRecord, lposToGenerate, isLocked, missingFields } = fuelRecordService.createFuelRecordFromDO(
        deliveryOrder,
        loadingPoint,
        totalLiters,
        extraFuel
      );
      
      console.log('  → Fuel record to create:', JSON.stringify(fuelRecord, null, 2));
      console.log('  → Is Locked:', isLocked);
      console.log('  → Missing Fields:', missingFields);
      console.log('  → LPOs to generate:', lposToGenerate.length);
      
      // Create the fuel record (even if locked)
      const createdRecord = await fuelRecordsAPI.create(fuelRecord);
      console.log('  ✓ Created fuel record with ID:', createdRecord.id);
      
      if (isLocked) {
        console.log(`  🔒 Fuel record LOCKED - pending admin configuration for: ${missingFields.join(', ')}`);
      }
      
      // Note: LPOs will be created manually as fuel is ordered, not automatically
      if (lposToGenerate.length > 0) {
        console.log(`  → ${lposToGenerate.length} LPOs can be generated when fuel is ordered`);
      } else {
        console.log('  → Fuel record created with empty checkpoints (ready for fuel orders)');
      }
      
      console.log(`  ✓✓ Fuel record created successfully for DO-${deliveryOrder.doNumber}`);
    } catch (error: any) {
      console.error('  ✗ Failed to create fuel record:', error);
      console.error('  ✗ Error details:', error.response?.data);
      throw error; // Re-throw to be caught by parent
    }
  };

  const handleUpdateFuelRecordForExport = async (deliveryOrder: DeliveryOrder) => {
    try {
      // Find the matching going record for this truck
      const response = await fuelRecordsAPI.getAll({ limit: 10000 });
      const allRecords = response.data;
      const matchingRecord = fuelRecordService.findMatchingGoingRecord(
        deliveryOrder.truckNo,
        allRecords
      );
      
      if (!matchingRecord) {
        console.warn('No matching going record found for truck:', deliveryOrder.truckNo);
        
        // Create notification for admin about unlinked EXPORT DO
        try {
          const doId = deliveryOrder.id || (deliveryOrder as any)._id;
          if (doId) {
            await deliveryOrdersAPI.notifyUnlinkedExport({
              deliveryOrderId: String(doId),
              doNumber: deliveryOrder.doNumber,
              truckNo: deliveryOrder.truckNo,
              destination: deliveryOrder.destination,
              loadingPoint: deliveryOrder.loadingPoint,
            });
            console.log('✓ Notification created for unlinked EXPORT DO');
          }
        } catch (notifyError) {
          console.error('Failed to create notification for unlinked DO:', notifyError);
        }
        
        alert(`⚠️ Warning: No fuel record found for truck ${deliveryOrder.truckNo}.\n\nReturn DO-${deliveryOrder.doNumber} has been saved, but could not be linked to a fuel record.\n\nA notification has been created. Please check the truck number - if incorrect, edit the DO and it will attempt to re-link automatically.`);
        return;
      }
      
      // Use the service function to properly update returnDo, from, and to fields
      // This now includes fuel difference calculation logic
      const { updatedRecord, additionalFuelInfo } = await fuelRecordService.updateFuelRecordWithReturnDO(
        matchingRecord,
        deliveryOrder
      );
      
      // Update the fuel record with proper from/to reversal
      // MongoDB returns _id but we need to check for both id and _id
      const recordId = matchingRecord.id || (matchingRecord as any)._id;
      
      if (!recordId) {
        console.error('❌ No ID found on fuel record:', matchingRecord);
        throw new Error('Fuel record has no ID');
      }
      
      console.log('→ Updating fuel record ID:', recordId);
      await fuelRecordsAPI.update(recordId, updatedRecord);
      console.log('✓ Updated fuel record with return DO:', deliveryOrder.doNumber);
      console.log('  - Updated from:', updatedRecord.from);
      console.log('  - Updated to:', updatedRecord.to);
      console.log('  - Return DO:', updatedRecord.returnDo);
      
      // Display fuel information
      if (additionalFuelInfo) {
        const messages = [];
        
        // Show export route liters that were added
        if (additionalFuelInfo.exportRouteLiters > 0) {
          messages.push(`✓ Added export route fuel: +${additionalFuelInfo.exportRouteLiters}L\n` +
            `  Route: ${additionalFuelInfo.returnLoadingPoint} → ${additionalFuelInfo.finalDestination}`);
        }
        
        // Note: All fuel extras are now configured via database RouteConfig
        
        // Show total update
        messages.push(`\nTotal Liters Updated:\n` +
          `  Before: ${additionalFuelInfo.originalTotalLiters}L\n` +
          `  Added: +${additionalFuelInfo.totalAdditionalFuel}L\n` +
          `  After: ${additionalFuelInfo.newTotalLiters}L`);
        
        // Show success message
        const fullMessage = `✓ Fuel record updated with return DO-${deliveryOrder.doNumber}\n\n` + messages.join('\n\n');
        alert(fullMessage);
      } else {
        alert(`Fuel record updated with return DO-${deliveryOrder.doNumber}`);
      }
    } catch (error) {
      console.error('❌ Failed to update fuel record:', error);
      alert('Delivery order saved, but fuel record update failed. Please update manually.');
    }
  };

  const handleSaveBulkOrders = async (
    orders: Partial<DeliveryOrder>[], 
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<{ success: boolean; createdOrders: Partial<DeliveryOrder>[] }> => {
    console.log('=== Starting Bulk DO Creation ===');
    console.log(`Total orders to create: ${orders.length}`);
    const createdOrders: DeliveryOrder[] = [];
    const skippedOrders: Array<{ order: Partial<DeliveryOrder>; reason: string }> = [];
    const failedOrders: Array<{ order: Partial<DeliveryOrder>; error: string }> = [];
    
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      console.log(`\n[${i + 1}/${orders.length}] Creating DO:`, order.doNumber, order.importOrExport);
      
      try {
        // Update progress
        if (onProgress) {
          onProgress(i + 1, orders.length, `Creating ${order.doType}-${order.doNumber}...`);
        }
        
        const savedOrder = await deliveryOrdersAPI.create(order);
        console.log(`✓ DO ${savedOrder.doNumber} saved successfully with ID:`, savedOrder.id);
        createdOrders.push(savedOrder);
        
        // Handle fuel record creation/update ONLY for DO type (not SDO)
        if (savedOrder.doType === 'DO') {
          try {
            if (savedOrder.importOrExport === 'IMPORT') {
              console.log(`→ Creating fuel record for IMPORT DO ${savedOrder.doNumber}`);
              if (onProgress) {
                onProgress(i + 1, orders.length, `Creating fuel record for ${order.doType}-${order.doNumber}...`);
              }
              await handleCreateFuelRecordForImport(savedOrder);
              console.log(`✓ Fuel record created for DO ${savedOrder.doNumber}`);
            } else if (savedOrder.importOrExport === 'EXPORT') {
              console.log(`→ Updating fuel record for EXPORT DO ${savedOrder.doNumber}`);
              if (onProgress) {
                onProgress(i + 1, orders.length, `Updating fuel record for ${order.doType}-${order.doNumber}...`);
              }
              await handleUpdateFuelRecordForExport(savedOrder);
              console.log(`✓ Fuel record updated for DO ${savedOrder.doNumber}`);
            }
          } catch (fuelError: any) {
            // Log the fuel record error but don't fail the entire batch
            const fuelErrorMsg = fuelError.message || 'Unknown fuel record error';
            console.warn(`⚠️ Fuel record operation failed for DO ${savedOrder.doNumber}:`, fuelErrorMsg);
            
            // If it's an "already has open fuel record" error, track it as skipped
            if (fuelErrorMsg.includes('already has an open fuel record')) {
              skippedOrders.push({
                order: savedOrder,
                reason: `Truck ${savedOrder.truckNo} has open fuel record`
              });
              console.log(`→ Skipped fuel record for DO ${savedOrder.doNumber} - truck has open record`);
            } else {
              // Other fuel errors - log but continue
              console.warn(`→ DO ${savedOrder.doNumber} created but fuel record failed: ${fuelErrorMsg}`);
            }
          }
        } else {
          console.log(`✓ SDO ${savedOrder.doNumber} created - skipping fuel record operations`);
        }
      } catch (doError: any) {
        // DO creation itself failed - track and continue
        const doErrorMsg = doError.response?.data?.message || doError.message || 'Unknown error';
        console.error(`✗ Failed to create DO ${order.doNumber}:`, doErrorMsg);
        failedOrders.push({
          order,
          error: doErrorMsg
        });
      }
    }
    
    console.log('\n=== Reloading orders list ===');
    if (onProgress) {
      onProgress(orders.length, orders.length, 'Refreshing data...');
    }
    await loadOrders();
    
    // Show summary of results
    console.log(`\n=== Bulk Creation Summary ===`);
    console.log(`✓ Successfully created: ${createdOrders.length}`);
    console.log(`⚠️ Skipped (open fuel records): ${skippedOrders.length}`);
    console.log(`✗ Failed: ${failedOrders.length}`);
    
    // Create notification for skipped/failed orders (runs in background)
    if (skippedOrders.length > 0 || failedOrders.length > 0) {
      try {
        const skippedReasons = skippedOrders.map(({ order, reason }) => ({
          truck: `${order.doType}-${order.doNumber} (${order.truckNo})`,
          reason
        }));
        
        const failedReasons = failedOrders.map(({ order, error }) => ({
          truck: `${order.doType}-${order.doNumber} (${order.truckNo})`,
          reason: error
        }));
        
        await deliveryOrdersAPI.createBulkFailureNotification({
          totalAttempted: orders.length,
          successCount: createdOrders.length,
          skippedCount: skippedOrders.length,
          failedCount: failedOrders.length,
          skippedReasons,
          failedReasons
        });
        console.log('✓ Notification created for bulk creation issues');
      } catch (notifError) {
        console.warn('Failed to create notification:', notifError);
      }
    }
    
    // Show user-friendly summary
    if (skippedOrders.length > 0 || failedOrders.length > 0) {
      let summaryMsg = `Bulk Creation Complete:\n\n`;
      summaryMsg += `✓ Successfully created: ${createdOrders.length} DOs\n`;
      
      if (skippedOrders.length > 0) {
        summaryMsg += `\n⚠️ Skipped ${skippedOrders.length} DOs (trucks with open fuel records):\n`;
        skippedOrders.forEach(({ order }) => {
          summaryMsg += `  • ${order.doType}-${order.doNumber} - ${order.truckNo}\n`;
        });
        summaryMsg += `\nThese trucks must complete their return journey (EXPORT DO) first.`;
      }
      
      if (failedOrders.length > 0) {
        summaryMsg += `\n\n✗ Failed to create ${failedOrders.length} DOs:\n`;
        failedOrders.forEach(({ order, error }) => {
          summaryMsg += `  • ${order.doType}-${order.doNumber} - ${error.substring(0, 50)}...\n`;
        });
      }
      
      summaryMsg += `\n\nℹ️ Check the notification bell for details.`;
      alert(summaryMsg);
    }
    
    // Return success flag and list of actually created orders
    return {
      success: createdOrders.length > 0,
      createdOrders: createdOrders
    };
  };

  // Helper function to calculate S/N based on month
  const calculateSerialNumber = (order: DeliveryOrder, index: number): number => {
    const orderMonth = getMonthFromDate(order.date);
    if (!orderMonth) return index + 1;
    
    // Count how many orders come before this one in the same month
    let sn = 1;
    for (let i = 0; i < index; i++) {
      const prevOrderMonth = getMonthFromDate(filteredOrders[i].date);
      if (prevOrderMonth === orderMonth) {
        sn++;
      }
    }
    return sn;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Delivery Orders</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage all delivery orders and transportation records
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 sm:gap-3">
          <button 
            onClick={() => handleExportWorkbook(new Date().getFullYear())}
            disabled={exportingYear !== null}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {exportingYear ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export
              </>
            )}
          </button>
          <button 
            onClick={() => setIsAmendedDOsModalOpen(true)}
            className="relative inline-flex items-center px-3 py-1.5 border border-orange-300 dark:border-orange-600 rounded-md shadow-sm text-sm font-medium text-orange-700 dark:text-orange-200 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40"
            title="Download amended/cancelled DOs as PDF"
          >
            <FileEdit className="w-4 h-4 mr-2" />
            Amended/Cancelled DOs
            {amendedDOsCount > 0 && (
              <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">
                {amendedDOsCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setIsBulkFormOpen(true)}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Bulk Create
          </button>
          <button 
            onClick={handleNewDO}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            {filterDoType === 'SDO' ? 'New SDO' : 'New DO'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6 overflow-x-auto">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
          <button
            onClick={() => setActiveTab('list')}
            className={`${
              activeTab === 'list'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <List className="w-4 h-4 mr-2" />
            All Orders
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`${
              activeTab === 'summary'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Monthly Summary
          </button>
          <button
            onClick={() => setActiveTab('workbook')}
            className={`${
              activeTab === 'workbook'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Workbook
          </button>
        </nav>
      </div>

      {/* Conditional Content */}
      {activeTab === 'workbook' ? (
        selectedWorkbookId ? (
          <div className="h-[calc(100vh-200px)]">
            <DOWorkbook 
              workbookId={selectedWorkbookId}
              workbookType={filterDoType === 'SDO' ? 'SDO' : 'DO'}
              onClose={handleCloseWorkbook}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-6 transition-colors">
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {filterDoType === 'SDO' ? 'SDO Workbooks by Year' : filterDoType === 'ALL' ? 'All Workbooks by Year' : 'DO Workbooks by Year'}
                </h2>
                {filterDoType === 'SDO' && (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                    Special Delivery Orders
                  </span>
                )}
                {filterDoType === 'DO' && (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                    Delivery Orders
                  </span>
                )}
                {filterDoType === 'ALL' && (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      DO
                    </span>
                    <span className="text-gray-400">+</span>
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                      SDO
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {filterDoType === 'ALL'
                  ? 'Viewing all delivery order and special delivery order workbooks'
                  : filterDoType === 'SDO' 
                    ? 'Each workbook contains individual sheets for each special delivery order' 
                    : 'Each workbook contains individual sheets for each delivery order'}
              </p>
            </div>
            
            {/* Year Selection for Export */}
            {filterDoType !== 'ALL' && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Export Workbook</h3>
                <div className="flex items-center gap-4">
                  <div className="relative" ref={workbookYearDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowWorkbookYearDropdown(!showWorkbookYearDropdown)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2 min-w-[200px]"
                    >
                      <span>{filterDoType === 'SDO' ? `SDO ${selectedYear}` : `DELIVERY ORDERS ${selectedYear}`}</span>
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
                            <span>{filterDoType === 'SDO' ? `SDO ${year}` : `DELIVERY ORDERS ${year}`}</span>
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
            )}
            
            {/* Render workbooks grouped by type when ALL is selected */}
            {filterDoType === 'ALL' ? (
              <>
                {/* DO Workbooks Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">Delivery Order Workbooks</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      {workbooks.filter(w => w.type === 'DO').length}
                    </span>
                  </div>
                  {workbooks.filter(w => w.type === 'DO').length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {workbooks.filter(w => w.type === 'DO').map((workbook) => (
                        <div
                          key={`${workbook.type || filterDoType}-${workbook.id || workbook.year}`}
                          className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-1" />
                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {workbook.name}
                                </h3>
                              </div>
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <p>{workbook.sheetCount || 0} delivery orders</p>
                                <p>Year: {workbook.year}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleOpenWorkbook(workbook.year, workbook.type)}
                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => handleExportWorkbook(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download individual DO sheets"
                              >
                                {exportingYear === workbook.year ? '...' : 'DOs'}
                              </button>
                              <button
                                onClick={() => handleExportMonthlySummaries(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download monthly summaries"
                              >
                                {exportingYear === workbook.year ? '...' : 'Months'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      <p className="text-sm text-gray-500 dark:text-gray-400">No DO workbooks yet</p>
                    </div>
                  )}
                </div>
                
                {/* SDO Workbooks Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">Special Delivery Order Workbooks</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                      {workbooks.filter(w => w.type === 'SDO').length}
                    </span>
                  </div>
                  {workbooks.filter(w => w.type === 'SDO').length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {workbooks.filter(w => w.type === 'SDO').map((workbook) => (
                        <div
                          key={`${workbook.type || filterDoType}-${workbook.id || workbook.year}`}
                          className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-1" />
                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {workbook.name}
                                </h3>
                              </div>
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <p>{workbook.sheetCount || 0} SDO orders</p>
                                <p>Year: {workbook.year}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleOpenWorkbook(workbook.year, workbook.type)}
                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => handleExportWorkbook(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download individual SDO sheets"
                              >
                                {exportingYear === workbook.year ? '...' : 'SDOs'}
                              </button>
                              <button
                                onClick={() => handleExportMonthlySummaries(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download monthly summaries"
                              >
                                {exportingYear === workbook.year ? '...' : 'Months'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-purple-50 dark:bg-purple-900/10 rounded-lg border-2 border-dashed border-purple-200 dark:border-purple-800">
                      <FileSpreadsheet className="w-8 h-8 text-purple-300 dark:text-purple-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">No SDO workbooks yet</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">Create SDO orders using the filter dropdown above</p>
                    </div>
                  )}
                </div>
                
                {workbooks.length === 0 && (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No workbooks found</p>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workbooks.map((workbook) => (
                  <div
                    key={`${workbook.type || filterDoType}-${workbook.id || workbook.year}`}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className={`w-5 h-5 ${workbook.type === 'SDO' ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'} mr-1`} />
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {workbook.name}
                          </h3>
                        </div>
                        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <p>{workbook.sheetCount || 0} {workbook.type === 'SDO' ? 'SDO orders' : 'delivery orders'}</p>
                          <p>Year: {workbook.year}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleOpenWorkbook(workbook.year, workbook.type)}
                          className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleExportWorkbook(workbook.year, workbook.type)}
                          disabled={exportingYear === workbook.year}
                          className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                          title={`Download individual ${workbook.type === 'SDO' ? 'SDO' : 'DO'} sheets`}
                        >
                          {exportingYear === workbook.year ? '...' : (workbook.type === 'SDO' ? 'SDOs' : 'DOs')}
                        </button>
                        <button
                          onClick={() => handleExportMonthlySummaries(workbook.year, workbook.type)}
                          disabled={exportingYear === workbook.year}
                          className="px-3 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                          title="Download monthly summaries"
                        >
                          {exportingYear === workbook.year ? '...' : 'Months'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {workbooks.length === 0 && (
                  <div className="col-span-full text-center py-8">
                    <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No workbooks found</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      {filterDoType === 'SDO' 
                        ? 'Workbooks are generated automatically from your SDO orders' 
                        : 'Workbooks are generated automatically from your delivery orders'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      ) : activeTab === 'list' ? (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-3 mb-6 transition-colors">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="relative col-span-2 md:col-span-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by DO#, Truck, Client..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              
              {/* Month Multi-Select Dropdown */}
              <div className="relative" ref={monthDropdownRef}>
                <button
                  onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  <span className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                    {getMonthsDisplayText()}
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
                            setCurrentPage(1);
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
                          setCurrentPage(1);
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
                        // Group periods by year for visual clarity
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
                                    onChange={() => {
                                      togglePeriod(Number(yearStr), monthNum);
                                      setCurrentPage(1);
                                    }}
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
              
              <div className="relative" ref={doTypeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowDoTypeDropdown(!showDoTypeDropdown)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
                >
                  <span className="truncate min-w-0">
                    {filterDoType === 'DO' ? 'DO - Delivery Orders' : 
                     filterDoType === 'SDO' ? 'SDO - Special Delivery Orders' : 
                     'All Order Types'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showDoTypeDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                    {[{value: 'DO', label: 'DO - Delivery Orders'}, {value: 'SDO', label: 'SDO - Special Delivery Orders'}, {value: 'ALL', label: 'All Order Types'}].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setFilterDoType(option.value as 'ALL' | 'DO' | 'SDO');
                          setCurrentPage(1);
                          setShowDoTypeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {filterDoType === option.value && <Check className="w-4 h-4 text-primary-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" ref={filterTypeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowFilterTypeDropdown(!showFilterTypeDropdown)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
                >
                  <span className="truncate min-w-0">
                    {filterType === 'ALL' ? 'All Types' : 
                     filterType === 'IMPORT' ? 'Import' : 
                     'Export'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showFilterTypeDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                    {[{value: 'ALL', label: 'All Types'}, {value: 'IMPORT', label: 'Import'}, {value: 'EXPORT', label: 'Export'}].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setFilterType(option.value);
                          setShowFilterTypeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {filterType === option.value && <Check className="w-4 h-4 text-primary-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" ref={filterStatusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowFilterStatusDropdown(!showFilterStatusDropdown)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
                >
                  <span className="truncate min-w-0">
                    {filterStatus === 'all' ? 'All Status' : 
                     filterStatus === 'active' ? 'Active' : 
                     'Cancelled'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showFilterStatusDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                    {[{value: 'all', label: 'All Status'}, {value: 'active', label: 'Active'}, {value: 'cancelled', label: 'Cancelled'}].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          handleFilterStatusChange(option.value as 'all' | 'active' | 'cancelled');
                          setShowFilterStatusDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {filterStatus === option.value && <Check className="w-4 h-4 text-primary-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('ALL');
                  setFilterStatus('all');
                  setSelectedMonths([new Date().getMonth() + 1]); // Reset to current month
                  setCurrentPage(1);
                }}
                className="col-span-2 md:col-span-1 w-full inline-flex items-center justify-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg overflow-hidden transition-colors">
            {loading ? (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm sm:text-base">Loading delivery orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
                <p className="text-sm sm:text-base">No delivery orders found</p>
              </div>
            ) : (
              <>
                {/* Card View - Mobile/Tablet (below lg) */}
                <div className="lg:hidden space-y-3 p-4">
                  {paginatedOrders.map((order) => (
                    <div
                      key={order.id || `order-${order.doNumber}`}
                      data-do-number={order.doNumber}
                      onClick={() => handleViewOrder(order)}
                      className={`border rounded-xl p-4 transition-all cursor-pointer ${
                        order.isCancelled
                          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                          : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 hover:shadow-md'
                      }`}
                    >
                      {/* Header with S/N and DO number */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-semibold">
                            {calculateSerialNumber(order, paginatedOrders.indexOf(order))}
                          </div>
                          <div>
                            <h3 className={`text-base font-bold ${
                              order.isCancelled
                                ? 'text-gray-400 dark:text-gray-500 line-through'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}>
                              {order.doType}-{order.doNumber}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{order.date}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full text-center ${
                            order.isCancelled
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                              : order.importOrExport === 'IMPORT'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          }`}>
                            {order.importOrExport}
                          </span>
                          {order.isCancelled ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 inline-flex items-center justify-center">
                              <Ban className="w-3 h-3 mr-1" />
                              Cancelled
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 text-center">
                              Active
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Order Details */}
                      <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Client:</span>
                          <p className={`font-medium ${order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {order.clientName}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Truck:</span>
                          <p className={`font-medium ${order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {order.truckNo}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Destination:</span>
                          <p className={`font-medium ${order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {order.destination}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Tonnage:</span>
                          <p className={`font-medium ${order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {order.tonnages ?? 0} tons
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                        {!order.isCancelled && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditOrder(order);
                              }}
                              className="flex-1 px-3 py-2 text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/30 inline-flex items-center justify-center"
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              Edit
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCancelModal(order);
                              }}
                              className="flex-1 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 inline-flex items-center justify-center"
                            >
                              <Ban className="w-4 h-4 mr-1" />
                              Cancel
                            </button>
                          </>
                        )}
                        {order.isCancelled && order.cancellationReason && (
                          <div className="flex-1 text-xs text-gray-500 dark:text-gray-400 italic">
                            Reason: {order.cancellationReason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table View - Desktop (lg and up) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">S/N</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">DO#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Status</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Client</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Truck</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Dest.</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Tons / Rate</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {paginatedOrders.map((order) => (
                        <tr
                          key={order.id || `order-${order.doNumber}`}
                          data-do-number={order.doNumber}
                          onClick={() => handleViewOrder(order)}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                            order.isCancelled ? 'bg-red-50 dark:bg-red-900/10' : ''
                          }`}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-semibold text-gray-900 dark:text-gray-100">
                            {calculateSerialNumber(order, paginatedOrders.indexOf(order))}
                          </td>
                          <td className={`px-3 py-2 text-xs font-medium ${
                            order.isCancelled
                              ? 'text-gray-400 dark:text-gray-500 line-through'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {order.doType}-{order.doNumber}
                          </td>
                          <td className={`px-3 py-2 text-xs ${
                            order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {order.date}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              order.isCancelled
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                : order.importOrExport === 'IMPORT'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                  : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                            }`}>
                              {order.importOrExport}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {order.isCancelled ? (
                              <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                                <Ban className="w-3 h-3 mr-1" />
                                Cancelled
                              </span>
                            ) : (
                              <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                                Active
                              </span>
                            )}
                          </td>
                          <td className={`px-3 py-2 text-xs ${
                            order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {order.clientName}
                          </td>
                          <td className={`px-3 py-2 text-xs ${
                            order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {order.truckNo}
                          </td>
                          <td className={`px-3 py-2 text-xs ${
                            order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {order.destination}
                          </td>
                          <td className={`px-3 py-2 text-xs ${
                            order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {order.tonnages ?? 0} tons
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium">
                            {!order.isCancelled && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditOrder(order);
                                  }}
                                  className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300 mr-3"
                                  title="Edit"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenCancelModal(order);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                                  title="Cancel DO"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {order.isCancelled && order.cancellationReason && (
                              <span
                                className="text-gray-400 dark:text-gray-500 cursor-help"
                                title={`Cancelled: ${order.cancellationReason}`}
                              >
                                <RotateCcw className="w-4 h-4 inline" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          
          {/* Pagination */}
          {!loading && filteredOrders.length > 0 && (
            <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg transition-colors mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredOrders.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </div>
          )}
        </>
      ) : activeTab === 'summary' ? (
        <MonthlySummary orders={orders} doType={filterDoType} />
      ) : null}

      {/* DO Detail Modal */}
      {selectedOrder && (
        <DODetailModal
          order={selectedOrder}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onEdit={() => {
            handleCloseModal();
            handleEditOrder(selectedOrder);
          }}
        />
      )}

      {/* DO Form for Create/Edit */}
      <DOForm
        order={editingOrder || undefined}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveOrder}
        defaultDoType={filterDoType === 'SDO' ? 'SDO' : 'DO'}
        user={user}
      />

      {/* Bulk DO Form */}
      <BulkDOForm
        isOpen={isBulkFormOpen}
        onClose={() => setIsBulkFormOpen(false)}
        onSave={handleSaveBulkOrders}
        user={user}
      />

      {/* Cancel DO Modal */}
      {cancellingOrder && (
        <CancelDOModal
          order={cancellingOrder}
          isOpen={isCancelModalOpen}
          onClose={handleCloseCancelModal}
          onConfirm={handleConfirmCancel}
          isLoading={isCancelling}
        />
      )}

      {/* Amended DOs Modal */}
      <AmendedDOsModal
        isOpen={isAmendedDOsModalOpen}
        onClose={() => setIsAmendedDOsModalOpen(false)}
      />
    </div>
  );
};

export default DeliveryOrders;
