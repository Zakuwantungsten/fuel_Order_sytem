import { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import usePersistedState from '../hooks/usePersistedState';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Download, Edit, FileSpreadsheet, List, BarChart3, FileDown, Ban, RotateCcw, FileEdit, ChevronDown, Check, Calendar, Link2, Clock } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI, doWorkbookAPI, sdoWorkbookAPI, resourceLockAPI, fuelRecordsAPI } from '../services/api';
import DODetailModal from '../components/DODetailModal';
import DOForm from '../components/DOForm';
import BulkDOForm from '../components/BulkDOForm';
import MonthlySummary from '../components/MonthlySummary';
import DOWorkbook from '../components/DOWorkbook';
import CancelDOModal from '../components/CancelDOModal';
import AmendedDOsModal from '../components/AmendedDOsModal';
import ExportLinkModal from '../components/ExportLinkModal';
import PendingDoFollowUpModal from '../components/PendingDoFollowUpModal';
import { useAmendedDOs } from '../contexts/AmendedDOsContext';
import Pagination from '../components/Pagination';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';
import QueryErrorState from '../components/QueryErrorState';
import { useTruckBatches } from '../hooks/useTruckBatches';
import { useRoutes } from '../hooks/useRoutes';
import { useRealtimeSync, isOwnDataChange } from '../hooks/useRealtimeSync';
import { useEditLockSync } from '../hooks/useEditLockSync';
import { useNewRecordsPill } from '../hooks/useNewRecordsPill';
import { NewRecordsPill } from '../components/NewRecordsPill';
import { countRelevantNewRecords } from '../utils/realtimeRelevance';
import { useAuth } from '../contexts/AuthContext';
import ConflictModal from '../components/ConflictModal';
import EditLockBadge from '../components/EditLockBadge';
import { replaceUrlPreservingState } from '../utils/historyState';
import {
  deliveryOrderKeys,
  periodsToDateRange,
  useDeliveryOrdersList,
  useDOWorkbooks,
  useDOAvailableYears,
  useDOAvailablePeriods,
} from '../hooks/useDeliveryOrders';
import { fuelRecordKeys } from '../hooks/useFuelRecords';
import { toast } from 'react-toastify';

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface DeliveryOrdersProps {
  user?: any;
}

const DeliveryOrders = ({ user }: DeliveryOrdersProps = {}) => {
  const queryClient = useQueryClient();
  const { isDark, user: authUser } = useAuth();
  // Manual EXPORT-DO → fuel-record linking is only exposed to admins + the fuel
  // order maker (used when the doExportUpdate automation is off, e.g. imported data).
  const canLinkExportDO = ['super_admin', 'admin', 'fuel_order_maker'].includes(
    (authUser?.role || user?.role || '') as string
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = usePersistedState('do:searchTerm', '');
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
  const [showPendingDoModal, setShowPendingDoModal] = useState(false);
  const [pendingDoStats, setPendingDoStats] = useState({ total: 0, goingPending: 0, returnPending: 0 });
  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null);
  const [linkingExportOrder, setLinkingExportOrder] = useState<DeliveryOrder | null>(null);
  const [conflictData, setConflictData] = useState<{ currentRecord: any; pendingData: any } | null>(null);
  const [activeTab, setActiveTab] = usePersistedState<'list' | 'summary' | 'workbook'>('do:activeTab', 'list');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistedState('do:itemsPerPage', 25);
  
  // Amended DOs context for session tracking
  const { addAmendedDO, count: amendedDOsCount } = useAmendedDOs();
  
  // React Query hooks - Replace localStorage with API
  useTruckBatches();
  useRoutes();

  // --- React Query: server-side paginated orders ---
  const dateRange = periodsToDateRange(selectedPeriods);
  const { data: ordersData, isLoading: loading, isFetching, isError, refetch: refetchOrders } = useDeliveryOrdersList({
    page: currentPage,
    limit: itemsPerPage,
    search: searchTerm || undefined,
    importOrExport: filterType,
    doType: filterDoType === 'ALL' ? undefined : filterDoType,
    status: filterStatus,
    dateFrom: dateRange.dateFrom,
    dateTo: dateRange.dateTo,
  });
  const orders = ordersData?.orders ?? [];
  const totalItems = ordersData?.pagination?.total ?? 0;
  const totalPages = ordersData?.pagination?.totalPages ?? 1;

  // --- React Query: available periods for the month picker ---
  const { data: availablePeriods = [] } = useDOAvailablePeriods(
    filterType,
    filterDoType === 'ALL' ? undefined : filterDoType,
    filterStatus,
  );


  // --- React Query: workbooks & available years ---
  const { data: workbooks = [] } = useDOWorkbooks(filterDoType);
  const { data: yearsFromWorkbooks = [new Date().getFullYear()] } = useDOAvailableYears(filterDoType);

  // Merge workbook-based years with data-based years from the available periods
  const availableYears = useMemo(() => {
    const yearsFromPeriods = [...new Set(availablePeriods.map(p => p.year))];
    const merged = [...new Set([...yearsFromWorkbooks, ...yearsFromPeriods])].sort((a, b) => b - a);
    return merged.length ? merged : [new Date().getFullYear()];
  }, [yearsFromWorkbooks, availablePeriods]);
  
  // Workbook UI state
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | number | null>(null);
  const [previousFilterDoType, setPreviousFilterDoType] = useState<'ALL' | 'DO' | 'SDO'>('DO');
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

  // Pending DO follow-up counts
  useEffect(() => {
    let cancelled = false;
    fuelRecordsAPI.getPendingDoStats()
      .then((s) => { if (!cancelled) setPendingDoStats(s); })
      .catch(() => { /* non-blocking */ });
    return () => { cancelled = true; };
  }, []);

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

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        workbookYearDropdownRef.current?.contains(target) ||
        doTypeDropdownRef.current?.contains(target) ||
        filterTypeDropdownRef.current?.contains(target) ||
        filterStatusDropdownRef.current?.contains(target) ||
        monthDropdownRef.current?.contains(target)
      ) return;
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
            replaceUrlPreservingState(url.toString());
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
        replaceUrlPreservingState(url.toString());
      } else if (actionParam === 'bulk-create') {
        console.log('Quick Action: Opening Bulk Create DO modal');
        setIsBulkFormOpen(true);
        // Clear the action param
        url.searchParams.delete('action');
        replaceUrlPreservingState(url.toString());
      } else if (highlightId && highlightId !== highlightProcessedRef.current) {
        // Mark as processed to avoid re-processing
        highlightProcessedRef.current = highlightId;
        console.log('Processing highlight for DO:', highlightId, 'Year:', yearParam, 'Month:', monthParam);

        // Reset to list view so the highlighted record is visible
        setActiveTab('list');

        // Clear any persisted content filters that could hide the target record.
        // The deep-link only carries year/month, so a leftover search term, type,
        // DO/SDO, or status filter would otherwise exclude the DO from the query
        // and the highlight would silently fail.
        setSearchTerm('');
        setFilterType('ALL');
        setFilterDoType('ALL');
        setFilterStatus('all');
        setCurrentPage(1);

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
  }, []);

  // Separate effect to handle highlight after a highlight is requested.
  // The list is server-side paginated, so the DO may live on a page other than
  // the current one. Fetch ALL orders for the selected period, find the record's
  // position, jump to its page, then scroll/highlight it.
  useEffect(() => {
    if (!pendingHighlight) return;
    let cancelled = false;

    const locateAndHighlight = async () => {
      try {
        const response = await deliveryOrdersAPI.getAll({
          limit: 10000,
          sort: 'date',
          order: 'desc',
          ...(dateRange.dateFrom ? { dateFrom: dateRange.dateFrom } : {}),
          ...(dateRange.dateTo ? { dateTo: dateRange.dateTo } : {}),
        });
        if (cancelled) return;

        const allOrders = response.data || [];
        const recordIndex = allOrders.findIndex((o: any) => o.doNumber === pendingHighlight);
        if (recordIndex < 0) {
          clearDOHighlight();
          return;
        }

        const targetPage = Math.floor(recordIndex / itemsPerPage) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
        // scrollToAndHighlightDO polls for the row, so it tolerates the
        // page-change refetch finishing whenever it does — no fixed guess needed.
        scrollToAndHighlightDO(pendingHighlight);
      } catch (error) {
        console.error('❌ Error finding DO position:', error);
        if (!cancelled) clearDOHighlight();
      }
    };

    locateAndHighlight();
    return () => { cancelled = true; };
    // Only re-run when a new highlight is requested; currentPage/itemsPerPage are
    // read as the latest values inside the async closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingHighlight]);
  
  // Helper function to scroll and highlight.
  // The target row may not be in the DOM yet when a page/period change triggers
  // a fresh server fetch (common for older records that need an extra refetch).
  // Instead of guessing a single delay, poll for the element to appear and only
  // give up after a max number of attempts.
  const scrollToAndHighlightDO = (doNumber: string, attempt = 0) => {
    const MAX_ATTEMPTS = 20; // ~3s total at 150ms intervals
    const RETRY_DELAY = 150;

    // Find all elements with this DO number
    const allElements = document.querySelectorAll(`[data-do-number="${doNumber}"]`);

    // Find visible element (mobile or desktop depending on screen size)
    const visibleElements = Array.from(allElements).filter(el => {
      return (el as HTMLElement).offsetParent !== null; // offsetParent is null for hidden elements
    });

    // Prefer visible element, fall back to first element
    let element = visibleElements[0] as HTMLElement;
    if (!element && allElements.length > 0) {
      element = allElements[0] as HTMLElement;
    }

    // Row not rendered yet (still fetching/paginating) — retry until it appears
    if (!element) {
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => scrollToAndHighlightDO(doNumber, attempt + 1), RETRY_DELAY);
        return;
      }
      console.error('❌ DO Element not found after retries:', doNumber);
      clearDOHighlight();
      return;
    }

    {
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
    replaceUrlPreservingState(url.toString());
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

  // New-records pill for created DOs relevant to the current list view.
  const doPillResetKey = `${searchTerm}|${filterType}|${filterDoType}|${filterStatus}|${JSON.stringify(selectedPeriods)}|${currentPage}|${itemsPerPage}|${activeTab}`;
  const { pendingCount: pendingNewDOs, addPending: addPendingDOs, clearPending: clearPendingDOs } = useNewRecordsPill(doPillResetKey);

  const loadNewDOs = () => {
    clearPendingDOs();
    refetchOrders();
  };

  const doPeriodSet = useMemo(
    () => new Set(selectedPeriods.map(p => `${p.year}-${String(p.month).padStart(2, '0')}`)),
    [selectedPeriods],
  );

  // Real-time sync. Remote updates and cancellations (soft updates carrying the
  // full DO payload) are patched into the list in place by the hook. Creates are
  // deferred (no auto-refetch): if a new DO would land in the current filtered +
  // paginated list view we bump the pill; the year-workbook rollups still refresh
  // so the workbook tab stays correct. ('delete' never happens — DOs are cancelled.)
  useRealtimeSync('delivery_orders', (event) => {
    if (event?.action !== 'create') return;
    queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks('ALL') });
    queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks('DO') });
    queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks('SDO') });
    if (activeTab !== 'list') return; // pill only applies to the list table
    // Creator already refreshed on mutation success — don't offer "click to load".
    if (isOwnDataChange(event, authUser?.id)) return;
    const relevant = countRelevantNewRecords(
      event,
      { visibleRows: orders, sortField: 'date', sortOrder: 'desc', page: currentPage, totalPages },
      {
        dateField: 'date',
        matchesFilters: (rec) => {
          if (filterStatus === 'cancelled') return false; // new DOs are active
          if (filterType !== 'ALL' && rec?.importOrExport !== filterType) return false;
          if (filterDoType !== 'ALL' && rec?.doType !== filterDoType) return false;
          if (doPeriodSet.size > 0 && !doPeriodSet.has(String(rec?.date ?? '').slice(0, 7))) return false;
          return true;
        },
        matchesBulk: (meta) => {
          if (filterStatus === 'cancelled') return false;
          if (filterType !== 'ALL' && !(meta.importOrExport ?? []).includes(filterType)) return false;
          if (filterDoType !== 'ALL' && !(meta.doType ?? []).includes(filterDoType)) return false;
          if (doPeriodSet.size > 0) {
            const lo = meta.dateMin?.slice(0, 7);
            const hi = meta.dateMax?.slice(0, 7);
            if (lo && hi) {
              const hit = [...doPeriodSet].some(ym => ym >= lo && ym <= hi);
              if (!hit) return false;
            }
          }
          return true;
        },
      },
    );
    addPendingDOs(relevant);
  }, { id: 'rt-delivery-orders', deferCreates: true });

  // Live-update the "Editing: …" badge without refetching the list.
  useEditLockSync('delivery_orders');

  // Creation lock: only one DO creation (single-form OR bulk) may be in progress
  // at a time, globally. We acquire a 'do_create' resource lock whenever a create
  // UI is open (editing an existing DO uses the per-document lock instead, so it's
  // excluded) and release it when the UI closes. A held lock blocks the new flow.
  const doCreateActive = (isFormOpen && !editingOrder) || isBulkFormOpen;
  useEffect(() => {
    if (!doCreateActive) return;
    let cancelled = false;
    resourceLockAPI.acquire('do_create').catch((err: any) => {
      if (err?.response?.status === 423) {
        const holder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`DO creation is currently in use by ${holder}. Please try again shortly.`);
        if (!cancelled) {
          setIsFormOpen(false);
          setEditingOrder(null);
          setIsBulkFormOpen(false);
        }
      }
      // Other errors: fail open — don't block creation on a lock-service hiccup.
    });
    return () => {
      cancelled = true;
      resourceLockAPI.release('do_create').catch(() => { /* idempotent / not holder */ });
    };
  }, [doCreateActive]);

  const handleExportWorkbook = async (year: number, workbookType?: string) => {
    try {
      setExportingYear(year);
      // Determine which API to use
      const type = workbookType || filterDoType;
      
      if (type === 'SDO') {
        await sdoWorkbookAPI.exportWorkbook(year);
        toast.success(`SDO Workbook SDO_${year}.xlsx downloaded successfully!`);
      } else {
        await doWorkbookAPI.exportWorkbook(year);
        toast.success(`Workbook DELIVERY_ORDERS_${year}.xlsx downloaded successfully!`);
      }
    } catch (error: any) {
      console.error('Error exporting workbook:', error);
      const type = workbookType || filterDoType;
      if (error.response?.status === 404) {
        toast.warn(`No ${type === 'SDO' ? 'SDO' : 'delivery'} orders found for year ${year}`);
      } else {
        toast.error('Failed to export workbook. Please try again.');
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
        toast.success(`SDO Monthly Summaries SDO_Monthly_Summaries_${year}.xlsx downloaded successfully!`);
      } else {
        await doWorkbookAPI.exportYearlyMonthlySummaries(year);
        toast.success(`Monthly Summaries DO_Monthly_Summaries_${year}.xlsx downloaded successfully!`);
      }
    } catch (error: any) {
      console.error('Error exporting monthly summaries:', error);
      const type = workbookType || filterDoType;
      if (error.response?.status === 404) {
        toast.warn(`No ${type === 'SDO' ? 'SDO' : 'delivery'} orders found for year ${year}`);
      } else {
        toast.error('Failed to export monthly summaries. Please try again.');
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
    queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.workbooks(previousFilterDoType) });
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

  // Auto-fallback: if the default current-month has no data, step back one month
  useEffect(() => {
    if (loading || availablePeriods.length === 0) return;
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    // Only auto-fallback when still on the initial default selection
    if (selectedPeriods.length !== 1 ||
        selectedPeriods[0].year !== currentYear ||
        selectedPeriods[0].month !== currentMonth) return;
    const hasData = availablePeriods.some(p => p.year === currentYear && p.month === currentMonth);
    if (!hasData && availablePeriods.length > 0) {
      // Pick the most recent period that exists (highest year, then highest month)
      const mostRecent = availablePeriods.reduce((best, p) =>
        p.year > best.year || (p.year === best.year && p.month > best.month) ? p : best
      );
      setSelectedPeriods([mostRecent]);
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

  // Server-side pagination — orders already filtered and paginated by useDeliveryOrdersList
  const paginatedOrders = orders;

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
    if (order.isPendingDo) {
      toast.info(`Pending ${order.pendingKind === 'return' ? 'return' : 'going'} DO ${order.doNumber} — it will be replaced when the real DO is created or linked.`);
      return;
    }
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  const handleNewDO = () => {
    console.log('=== handleNewDO clicked ===');
    console.log('Filter DO type:', filterDoType);
    setEditingOrder(null);
    setIsFormOpen(true);
    console.log('Form should now be open');
  };

  const handleEditOrder = async (order: DeliveryOrder) => {
    if (order.isPendingDo) {
      // Pending rows are fuel-record backed — no DO edit lock
      setEditingOrder(order);
      setIsFormOpen(true);
      return;
    }
    console.log('Editing order:', order);
    console.log('Order ID:', order.id, 'Order _id:', (order as any)._id);
    const orderId = order.id || (order as any)._id;
    if (orderId) {
      try {
        await deliveryOrdersAPI.acquireLock(orderId);
      } catch (err: any) {
        if (err.response?.status === 423) {
          const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
          toast.error(`This delivery order is being edited by ${lockHolder}.`);
        } else {
          toast.error('Could not acquire edit lock. Please try again.');
        }
        return;
      }
    }
    setEditingOrder(order);
    setIsFormOpen(true);
  };

  const handleCloseForm = async () => {
    if (editingOrder) {
      const orderId = editingOrder.id || (editingOrder as any)?._id;
      if (orderId) {
        try { await deliveryOrdersAPI.releaseLock(orderId); } catch { /* ignore */ }
      }
    }
    setEditingOrder(null);
    setIsFormOpen(false);
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

      // Pending DO rows sync to the fuel record (not DeliveryOrder collection)
      if (editingOrder?.isPendingDo && editingOrder.fuelRecordId) {
        console.log('=== PENDING DO UPDATE MODE ===');
        const res = await fuelRecordsAPI.updatePendingDo(editingOrder.fuelRecordId, {
          truckNo: orderData.truckNo,
          date: orderData.date,
          from: orderData.loadingPoint,
          to: orderData.destination,
          start: orderData.loadingPoint,
          trailerNo: orderData.trailerNo,
        });
        const fr = res?.data?.fuelRecord || res?.fuelRecord;
        savedOrder = {
          ...editingOrder,
          truckNo: fr?.truckNo || orderData.truckNo || editingOrder.truckNo,
          date: fr?.date || orderData.date || editingOrder.date,
          loadingPoint: fr?.from || orderData.loadingPoint || editingOrder.loadingPoint,
          destination: fr?.to || orderData.destination || editingOrder.destination,
          trailerNo: orderData.trailerNo || editingOrder.trailerNo,
        };
        toast.success(`Pending DO ${editingOrder.doNumber} updated (fuel record synced)`);
        queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
        queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
        try {
          const s = await fuelRecordsAPI.getPendingDoStats();
          setPendingDoStats(s);
        } catch { /* non-blocking */ }
        setEditingOrder(null);
        setIsFormOpen(false);
        console.log('=== handleSaveOrder END - PENDING OK ===');
        return savedOrder;
      }
      
      if (orderId) {
        console.log('=== UPDATE MODE ===');
        // Track which fields changed for amended DOs tracking
        const originalOrder = editingOrder!;
        const editableFields = [
          'truckNo', 'trailerNo', 'destination', 'loadingPoint', 'tonnages', 'ratePerTon',
          'driverName', 'clientName', 'haulier', 'containerNo', 'invoiceNos', 'cargoType',
          'importOrExport', 'rateType', 'borderEntryDRC'
        ];
        
        editableFields.forEach(field => {
          const oldValue = originalOrder[field as keyof DeliveryOrder];
          const newValue = orderData[field as keyof DeliveryOrder];
          if (oldValue !== newValue && newValue !== undefined) {
            fieldsChanged.push(field);
          }
        });
        
        // Update existing DO - now returns { order, cascadeResults }
        // Include clientUpdatedAt for optimistic locking
        const updatePayload = {
          ...orderData,
          clientUpdatedAt: (editingOrder as any)?.updatedAt || (editingOrder as any)?.createdAt,
        };
        const result = await deliveryOrdersAPI.update(orderId, updatePayload);
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

        const manualFlipSteps = result.cascadeResults?.importExportFlip?.manualSteps as string[] | undefined;
        if (manualFlipSteps?.length) {
          toast.warn(
            `DO ${savedOrder.doType}-${savedOrder.doNumber} updated. Manual fuel steps required:\n• ${manualFlipSteps.join('\n• ')}`,
            { autoClose: 12000 }
          );
        } else if (result.message && result.message !== 'Delivery order updated successfully') {
          toast.info(result.message, { autoClose: 8000 });
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
                toast.success(message);
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
        // Create new DO. The backend creates/updates the linked fuel record
        // server-side (IMPORT → new going-journey record, EXPORT → return-leg
        // update), gated by the Journey Config fuel-automation toggles. SDO orders
        // are standalone and never touch fuel records. Nothing to do client-side.
        console.log('=== CREATE MODE ===');
        console.log('Calling deliveryOrdersAPI.create with:', orderData);
        savedOrder = await deliveryOrdersAPI.create(orderData);
        console.log('API returned saved order:', savedOrder);

        // Reset month filter to current month so the newly created DO is visible,
        // but only if the current month isn't already selected (avoids a new query key
        // and an unnecessary full loading state).
        const now = new Date();
        const currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 };
        const alreadyOnCurrentMonth = selectedPeriods.some(
          p => p.year === currentPeriod.year && p.month === currentPeriod.month
        );
        if (!alreadyOnCurrentMonth) {
          setSelectedPeriods([currentPeriod]);
        }
      }
      
      // Show success toast
      if (orderId) {
        toast.success(`Delivery order ${savedOrder.doType}-${savedOrder.doNumber} updated successfully`);
      } else {
        toast.success(`Delivery order ${savedOrder.doType}-${savedOrder.doNumber} created successfully`);
      }

      // Invalidate React Query cache to refetch
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.availablePeriods({}) });
      // Also invalidate fuel records cache so FuelRecords page shows new/updated records
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
      clearPendingDOs(); // creator already sees the fresh list — no pill needed
      console.log('=== handleSaveOrder END - SUCCESS ===');
      return savedOrder;
    } catch (error: any) {
      console.error('=== handleSaveOrder END - ERROR ===');
      console.error('Failed to save order:', error);
      if (error.response?.status === 409) {
        setConflictData({ currentRecord: error.response?.data?.data?.current, pendingData: orderData });
        queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
      } else if (error.response?.status === 423) {
        const lockHolder = error.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`This delivery order is being edited by ${lockHolder}. Please try again later.`);
      } else {
        toast.error('Failed to save delivery order. Error: ' + (error.response?.data?.message || error.message));
      }
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
      
      toast.success(message);
      handleCloseCancelModal();
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
      queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.availablePeriods({}) });
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      const errorMessage = error.response?.data?.message || 'Failed to cancel delivery order';
      toast.error(errorMessage);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSaveBulkOrders = async (
    orders: Partial<DeliveryOrder>[],
    onProgress?: (current: number, total: number, status: string) => void
  ): Promise<{ success: boolean; createdOrders: Partial<DeliveryOrder>[] }> => {
    console.log('=== Starting Bulk DO Creation ===');
    console.log(`Total orders to create: ${orders.length}`);

    // Single backend request creates all DOs + their fuel records server-side.
    // Replaces the old per-truck loop (~4 round-trips each) for a large speedup.
    if (onProgress) {
      onProgress(0, orders.length, `Creating ${orders.length} delivery orders...`);
    }

    let createdOrders: DeliveryOrder[] = [];
    let summary: Awaited<ReturnType<typeof deliveryOrdersAPI.createBulk>>['summary'] | null = null;

    try {
      const result = await deliveryOrdersAPI.createBulk(orders);
      createdOrders = result.createdOrders || [];
      summary = result.summary;
      console.log(`✓ Bulk creation done: ${createdOrders.length}/${orders.length} created`, summary);
    } catch (error: any) {
      const msg = error.response?.data?.message || error.message || 'Unknown error';
      console.error('✗ Bulk creation request failed:', msg);
      toast.error(`Failed to create delivery orders. ${msg}`);
      return { success: false, createdOrders: [] };
    }

    // Refresh cached lists so the new DOs / fuel records show up immediately
    if (onProgress) {
      onProgress(createdOrders.length, orders.length, 'Refreshing data...');
    }
    await queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
    queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.availablePeriods({}) });
    queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
    clearPendingDOs(); // creator already sees the fresh list — no pill needed

    // Show a summary only when something needs attention. The backend already
    // creates the notification-bell entry for failures/unlinked exports.
    const failedReasons = summary?.failedReasons || [];
    const unlinkedExports = summary?.unlinkedExports || [];
    const queuedCount = summary?.queuedCount || 0;

    if (failedReasons.length > 0 || unlinkedExports.length > 0) {
      let summaryMsg = `Bulk Creation Complete:\n\n`;
      summaryMsg += `✓ Successfully created: ${createdOrders.length} DOs\n`;
      if (queuedCount > 0) {
        summaryMsg += `⏳ ${queuedCount} fuel record(s) queued behind an active journey.\n`;
      }

      if (unlinkedExports.length > 0) {
        summaryMsg += `\n⚠️ ${unlinkedExports.length} return DO(s) had no matching going journey:\n`;
        unlinkedExports.forEach(({ truck }) => { summaryMsg += `  • ${truck}\n`; });
      }

      if (failedReasons.length > 0) {
        summaryMsg += `\n✗ Failed to create ${failedReasons.length} DOs:\n`;
        failedReasons.forEach(({ truck, reason }) => {
          summaryMsg += `  • ${truck} - ${reason.substring(0, 50)}\n`;
        });
      }

      summaryMsg += `\n\nℹ️ Check the notification bell for details.`;
      toast.info(summaryMsg);
    }

    return {
      success: createdOrders.length > 0,
      createdOrders,
    };
  };

  // Helper function to calculate S/N based on month
  const calculateSerialNumber = (order: DeliveryOrder, index: number): number => {
    const orderMonth = getMonthFromDate(order.date);
    if (!orderMonth) return index + 1;
    
    // Count how many orders come before this one in the same month
    let sn = 1;
    for (let i = 0; i < index; i++) {
      const prevOrderMonth = getMonthFromDate(orders[i].date);
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
          <h1 className="text-2xl font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Delivery Orders</h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
            Manage all delivery orders and transportation records
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 sm:gap-3 overflow-visible pt-1.5 pr-1.5">
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
          <div className="relative flex border border-gray-300 dark:border-gray-600 rounded-md">
            <button
              onClick={() => setIsAmendedDOsModalOpen(true)}
              className="relative inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-l-md text-orange-700 dark:text-orange-200 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40"
              title="Download amended/cancelled DOs as PDF"
            >
              <FileEdit className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Amended/Cancelled DOs</span>
              <span className="sm:hidden">Amended</span>
              {amendedDOsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[1.125rem] h-[1.125rem] px-1 inline-flex items-center justify-center rounded-full bg-orange-600 text-white text-[10px] font-bold leading-none shadow-sm ring-2 ring-white dark:ring-gray-900">
                  {amendedDOsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowPendingDoModal(true)}
              className="relative inline-flex items-center px-3 py-1.5 text-sm font-medium border-l dark:border-gray-600 rounded-r-md text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              title="Follow up trucks with pending going/return DOs"
            >
              <Clock className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Pending DOs</span>
              <span className="sm:hidden">Pending</span>
              {pendingDoStats.total > 0 && (
                <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[1.125rem] h-[1.125rem] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none shadow-sm ring-2 ring-white dark:ring-gray-900">
                  {pendingDoStats.total > 99 ? '99+' : pendingDoStats.total}
                </span>
              )}
            </button>
          </div>
          <button 
            onClick={() => setIsBulkFormOpen(true)}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white"
            style={{ background: '#16A34A' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#15803D')}
            onMouseLeave={e => (e.currentTarget.style.background = '#16A34A')}
          >
            <Plus className="w-4 h-4 mr-2" />
            Bulk Create
          </button>
          <button 
            onClick={handleNewDO}
            className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white"
            style={{ background: '#2563EB' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1D4ED8')}
            onMouseLeave={e => (e.currentTarget.style.background = '#2563EB')}
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
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <List className="w-4 h-4 mr-2" />
            All Orders
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`${
              activeTab === 'summary'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Monthly Summary
          </button>
          <button
            onClick={() => setActiveTab('workbook')}
            className={`${
              activeTab === 'workbook'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
                  <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ background: isDark ? 'rgba(8,145,178,0.2)' : '#E0F2FE', color: isDark ? '#67E8F9' : '#0891B2' }}>
                    Special Delivery Orders
                  </span>
                )}
                {filterDoType === 'DO' && (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }}>
                    Delivery Orders
                  </span>
                )}
                {filterDoType === 'ALL' && (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }}>
                      DO
                    </span>
                    <span style={{ color: '#94A3B8' }}>+</span>
                    <span className="px-3 py-1 text-xs font-semibold rounded-full" style={{ background: isDark ? 'rgba(8,145,178,0.2)' : '#E0F2FE', color: isDark ? '#67E8F9' : '#0891B2' }}>
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
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2 min-w-[200px]"
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
                            {selectedYear === year && <Check className="w-4 h-4 text-blue-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleExportWorkbook(selectedYear)}
                    disabled={exportingYear !== null}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: '#16A34A' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#15803D')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#16A34A')}
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
                    <h3 className="text-md font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Delivery Order Workbooks</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded" style={{ background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }}>
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
                    <h3 className="text-md font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Special Delivery Order Workbooks</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded" style={{ background: isDark ? 'rgba(8,145,178,0.2)' : '#E0F2FE', color: isDark ? '#67E8F9' : '#0891B2' }}>
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
                                <FileSpreadsheet className="w-5 h-5 mr-1" style={{ color: '#0891B2' }} />
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
                    <div className="text-center py-6 rounded-lg border-2 border-dashed" style={{ background: isDark ? 'rgba(8,145,178,0.08)' : '#F0F9FF', borderColor: isDark ? 'rgba(8,145,178,0.3)' : '#BAE6FD' }}>
                      <FileSpreadsheet className="w-8 h-8 mx-auto mb-2" style={{ color: '#7DD3FC' }} />
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
                          <FileSpreadsheet className="w-5 h-5 mr-1" style={{ color: workbook.type === 'SDO' ? '#0891B2' : '#2563EB' }} />
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
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by DO#, Truck, Client..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 dashboard-search-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
              
              {/* Month Multi-Select Dropdown */}
              <div className="relative" ref={monthDropdownRef}>
                <button
                  onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                  className="w-full flex items-center justify-between px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600"
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
                          className="w-full text-left px-2 py-1 text-sm rounded hover:bg-blue-50"
                          style={{ color: '#2563EB' }}
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
                        className="w-full text-left px-2 py-1 text-sm rounded hover:bg-blue-50"
                        style={{ color: '#2563EB' }}
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
                                    className="w-4 h-4 border-gray-300 rounded" style={{ accentColor: '#2563EB' }}
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
                  className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
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
                        {filterDoType === option.value && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" ref={filterTypeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowFilterTypeDropdown(!showFilterTypeDropdown)}
                  className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
                >
                  <span className="truncate min-w-0">
                    {filterType === 'ALL' ? 'All Types' :
                     filterType === 'IMPORT' ? 'Import' :
                     filterType === 'EXPORT' ? 'Export' :
                     filterType === 'PENDING_GOING' ? 'Pending Going' :
                     filterType === 'PENDING_RETURN' ? 'Pending Return' :
                     filterType === 'PENDING' ? 'All Pending' :
                     filterType}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showFilterTypeDropdown && (
                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg">
                    {[
                      { value: 'ALL', label: 'All Types' },
                      { value: 'IMPORT', label: 'Import' },
                      { value: 'EXPORT', label: 'Export' },
                      { value: 'PENDING_GOING', label: 'Pending Going' },
                      { value: 'PENDING_RETURN', label: 'Pending Return' },
                      { value: 'PENDING', label: 'All Pending' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setFilterType(option.value);
                          setCurrentPage(1);
                          setShowFilterTypeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                      >
                        <span>{option.label}</span>
                        {filterType === option.value && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative" ref={filterStatusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowFilterStatusDropdown(!showFilterStatusDropdown)}
                  className="w-full px-3 h-[34px] text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between gap-2"
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
                        {filterStatus === option.value && <Check className="w-4 h-4 text-blue-600" />}
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
                  const now = new Date();
                  const currentPeriod = { year: now.getFullYear(), month: now.getMonth() + 1 };
                  const hasCurrentMonth = availablePeriods.some(p => p.year === currentPeriod.year && p.month === currentPeriod.month);
                  const mostRecentPeriod = availablePeriods.length > 0
                    ? availablePeriods.reduce((best, p) =>
                        p.year > best.year || (p.year === best.year && p.month > best.month) ? p : best
                      )
                    : currentPeriod;
                  setSelectedPeriods(hasCurrentMonth || availablePeriods.length === 0 ? [currentPeriod] : [mostRecentPeriod]);
                  setCurrentPage(1);
                }}
                className="col-span-2 md:col-span-1 w-full inline-flex items-center justify-center px-3 h-[34px] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* New-records affordance — only when created DOs relevant to the
              current view are available, so the table isn't refreshed under the user. */}
          {pendingNewDOs > 0 && (
            <div className="flex justify-center mb-2">
              <NewRecordsPill count={pendingNewDOs} onLoad={loadNewDOs} label="order" />
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg overflow-hidden transition-colors">
            {/* Thin progress bar shown during background refetch so the table stays visible */}
            {isFetching && !loading && (
              <div className="h-0.5 w-full bg-blue-500/60 dark:bg-blue-400/60 animate-pulse" />
            )}
            {loading ? (
              <UnifiedTabLoader label="Loading delivery orders..." />
            ) : isError && orders.length === 0 ? (
              <QueryErrorState
                title="Unable to load delivery orders"
                onRetry={() => { void refetchOrders(); }}
                isRetrying={isFetching}
              />
            ) : orders.length === 0 ? (
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
                      className={`border rounded-xl p-4 transition-all ${
                        order.isPendingDo
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/15 cursor-default'
                          : order.isCancelled
                            ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 cursor-pointer'
                            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      {/* Header with S/N and DO number */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold" style={{ background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }}>
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
                                ? 'bg-gray-100 text-gray-500'
                                : order.isPendingDo
                                  ? ''
                                  : order.importOrExport === 'IMPORT'
                                    ? ''
                                    : ''
                            }`}
                            style={!order.isCancelled ? (
                              order.isPendingDo
                                ? { background: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7', color: isDark ? '#FCD34D' : '#B45309' }
                                : order.importOrExport === 'IMPORT'
                                  ? { background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }
                                  : { background: isDark ? 'rgba(22,163,74,0.2)' : '#DCFCE7', color: isDark ? '#86EFAC' : '#15803D' }
                            ) : {}}>
                            {order.isPendingDo
                              ? (order.pendingKind === 'return' ? 'PENDING RETURN' : 'PENDING GOING')
                              : order.importOrExport}
                          </span>
                          {order.isCancelled ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 inline-flex items-center justify-center">
                              <Ban className="w-3 h-3 mr-1" />
                              Cancelled
                            </span>
                          ) : order.isPendingDo ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full text-center" style={{ background: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7', color: isDark ? '#FCD34D' : '#B45309' }}>
                              DO pending
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full text-center" style={{ background: isDark ? 'rgba(22,163,74,0.2)' : '#DCFCE7', color: isDark ? '#86EFAC' : '#15803D' }}>
                              Active
                            </span>
                          )}
                          {!order.isCancelled && (order.editHistory?.length ?? 0) > 0 && (
                            <span
                              className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full text-center"
                              title={`Amended ${order.editHistory!.length} time(s)${order.lastEditedAt ? ` — last on ${order.lastEditedAt}` : ''}${order.lastEditedBy ? ` by ${order.lastEditedBy}` : ''}`}
                            >
                              AMENDED
                            </span>
                          )}
                          <EditLockBadge editLock={(order as any).editLock} />
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
                          <span className="text-xs text-gray-500 dark:text-gray-400">Loading Point:</span>
                          <p className={`font-medium ${order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                            {order.loadingPoint}
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
                        {order.isPendingDo ? (
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
                            <div className="flex-[1.5] text-[10px] text-amber-700 dark:text-amber-300 italic leading-tight">
                              Pending {order.pendingKind === 'return' ? 'return' : 'going'} — edits sync to fuel record
                            </div>
                          </>
                        ) : !order.isCancelled && (
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
                            {canLinkExportDO &&
                              order.importOrExport === 'EXPORT' &&
                              order.doType === 'DO' &&
                              !order.isLinkedToFuelRecord && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLinkingExportOrder(order);
                                  }}
                                  className="flex-1 px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 inline-flex items-center justify-center"
                                >
                                  <Link2 className="w-4 h-4 mr-1" />
                                  Link
                                </button>
                              )}
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
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Loading Point</th>
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
                          onClick={() => !order.isPendingDo && handleViewOrder(order)}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                            order.isPendingDo ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'cursor-pointer'
                          } ${
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
                                ? 'bg-gray-100 text-gray-500'
                                : ''
                            }`}
                            style={!order.isCancelled ? (
                              order.isPendingDo
                                ? { background: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7', color: isDark ? '#FCD34D' : '#B45309' }
                                : order.importOrExport === 'IMPORT'
                                  ? { background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }
                                  : { background: isDark ? 'rgba(22,163,74,0.2)' : '#DCFCE7', color: isDark ? '#86EFAC' : '#15803D' }
                            ) : {}}>
                              {order.isPendingDo
                                ? (order.pendingKind === 'return' ? 'PENDING RETURN' : 'PENDING GOING')
                                : order.importOrExport}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-1">
                              {order.isCancelled ? (
                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                                  <Ban className="w-3 h-3 mr-1" />
                                  Cancelled
                                </span>
                              ) : order.isPendingDo ? (
                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full" style={{ background: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7', color: isDark ? '#FCD34D' : '#B45309' }}>
                                  DO pending
                                </span>
                              ) : (
                                <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full" style={{ background: isDark ? 'rgba(22,163,74,0.2)' : '#DCFCE7', color: isDark ? '#86EFAC' : '#15803D' }}>
                                  Active
                                </span>
                              )}
                              {!order.isCancelled && !order.isPendingDo && (order.editHistory?.length ?? 0) > 0 && (
                                <span
                                  className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded"
                                  title={`Amended ${order.editHistory!.length} time(s)${order.lastEditedAt ? ` — last on ${order.lastEditedAt}` : ''}${order.lastEditedBy ? ` by ${order.lastEditedBy}` : ''}`}
                                >
                                  AMENDED
                                </span>
                              )}
                            </div>
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
                          <td className={`px-3 py-2 text-xs text-center ${
                            order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {order.loadingPoint}
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
                            {order.isPendingDo ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditOrder(order);
                                }}
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300"
                                title="Edit pending DO (syncs fuel record)"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            ) : !order.isCancelled && (
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
                                {canLinkExportDO &&
                                  order.importOrExport === 'EXPORT' &&
                                  order.doType === 'DO' &&
                                  !order.isLinkedToFuelRecord && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLinkingExportOrder(order);
                                      }}
                                      className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 ml-3"
                                      title="Link to fuel record"
                                    >
                                      <Link2 className="w-4 h-4" />
                                    </button>
                                  )}
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
          {!loading && totalItems > 0 && (
            <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg transition-colors mt-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </div>
          )}
        </>
      ) : activeTab === 'summary' ? (
        <MonthlySummary importOrExport={filterType} doType={filterDoType} />
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
        onClose={handleCloseForm}
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

      <PendingDoFollowUpModal
        isOpen={showPendingDoModal}
        onClose={() => setShowPendingDoModal(false)}
      />

      {/* Manual EXPORT DO → fuel record linking */}
      <ExportLinkModal
        isOpen={!!linkingExportOrder}
        order={linkingExportOrder}
        onClose={() => setLinkingExportOrder(null)}
        onLinked={() => {
          refetchOrders();
          queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
          queryClient.invalidateQueries({ queryKey: fuelRecordKeys.all });
        }}
      />

      <ConflictModal
        isOpen={!!conflictData}
        onClose={() => setConflictData(null)}
        onUseLatest={() => {
          setConflictData(null);
          handleCloseForm();
          queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
        }}
        onRetry={async () => {
          if (conflictData) {
            const payload = {
              ...conflictData.pendingData,
              clientUpdatedAt: conflictData.currentRecord?.updatedAt,
            };
            const orderId = editingOrder?.id || (editingOrder as any)?._id;
            try {
              await deliveryOrdersAPI.update(orderId!, payload);
              queryClient.invalidateQueries({ queryKey: deliveryOrderKeys.lists() });
              queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
              handleCloseForm();
            } catch (err: any) {
              toast.error(err.response?.data?.message || 'Retry failed');
            }
          }
          setConflictData(null);
        }}
        currentRecord={conflictData?.currentRecord}
        modifiedBy={conflictData?.currentRecord?.lastEditedBy?.name}
        modifiedAt={conflictData?.currentRecord?.updatedAt}
      />
    </div>
  );
};

export default DeliveryOrders;
