import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import usePersistedState from '../hooks/usePersistedState';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Download, Edit, XCircle, RotateCcw, BarChart3, List, ChevronLeft, ChevronRight, ChevronDown, Check, Clock } from 'lucide-react';
import { toast } from 'react-toastify';
import { FuelRecord } from '../types';
import { fuelRecordsAPI, configAPI, StandardAllocations } from '../services/api';
import FuelRecordForm from '../components/FuelRecordForm';
import FuelAnalytics from '../components/FuelAnalytics';
import FuelRecordDetailsModal from '../components/FuelRecordDetailsModal';
import JourneyStatusBadge from '../components/JourneyStatusBadge';
import Pagination from '../components/Pagination';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';
import QueryErrorState from '../components/QueryErrorState';
import { exportToXLSXMultiSheet } from '../utils/csvParser';
import { subscribeToNotifications, unsubscribeFromNotifications } from '../services/websocket';
import { useRealtimeSync, isOwnDataChange } from '../hooks/useRealtimeSync';
import { useEditLockSync } from '../hooks/useEditLockSync';
import { useNewRecordsPill } from '../hooks/useNewRecordsPill';
import { NewRecordsPill } from '../components/NewRecordsPill';
import { countRelevantNewRecords } from '../utils/realtimeRelevance';
import ConflictModal from '../components/ConflictModal';
import EditLockBadge from '../components/EditLockBadge';
import ConfirmModal from '../components/SuperAdmin/ConfirmModal';
import PendingDoFollowUpModal from '../components/PendingDoFollowUpModal';
import { useAuth } from '../contexts/AuthContext';
import { useFuelRecordsList, useFuelRecordRoutes, useFuelRecordPeriods, useLPODropdown, fuelRecordKeys } from '../hooks/useFuelRecords';
import { replaceUrlPreservingState } from '../utils/historyState';
import { pendingDoStatusLabel } from '../utils/pendingDo';
import { formatTruckNumber } from '../utils/dataCleanup';

// Map fuel record field names to their primary standard allocation key
const ALLOCATION_FIELD_MAP: Record<string, keyof StandardAllocations> = {
  mmsaYard: 'mmsaYard',
  tangaYard: 'tangaYardToDar',
  darYard: 'darYardStandard',
  darGoing: 'darGoing',
  moroGoing: 'moroGoing',
  mbeyaGoing: 'mbeyaGoing',
  tdmGoing: 'tdmGoing',
  zambiaGoing: 'zambiaGoing',
  congoFuel: 'congoFuel',
  zambiaReturn: 'zambiaReturn',
  tundumaReturn: 'tundumaReturn',
  mbeyaReturn: 'mbeyaReturn',
  moroReturn: 'moroReturnToMombasa',
  darReturn: 'darReturn',
  tangaReturn: 'tangaReturnToMombasa',
};

// Fields that must be compared against two standards simultaneously (fetched from DB)
const DUAL_ALLOCATION_MAP: Partial<Record<string, {
  primaryKey: keyof StandardAllocations;
  primaryLabel: string;
  secondaryKey: keyof StandardAllocations;
  secondaryLabel: string;
}>> = {
  darYard: {
    primaryKey: 'darYardStandard',
    primaryLabel: 'Standard',
    secondaryKey: 'darYardKisarawe',
    secondaryLabel: 'Kisarawe',
  },
};

interface FuelCellInfo {
  isAbove: boolean;
  isBelow: boolean;
  tooltip: string;
}

// Returns comparison info for a fuel cell.
// Rules (all DB-driven — no hardcoded values):
//   • standard === 0 → skip entirely (no flag, no color)
//   • single standard: above = amber warning, below = blue note
//   • dual standard (darYard): compare against both, show both results in tooltip
const getFuelCellInfo = (
  field: string,
  value: number | undefined,
  allocations: StandardAllocations | null,
): FuelCellInfo => {
  if (!value || value === 0 || !allocations) return { isAbove: false, isBelow: false, tooltip: '' };

  const abs = Math.abs(value);
  const dual = DUAL_ALLOCATION_MAP[field];

  if (dual) {
    const s1 = allocations[dual.primaryKey];
    const s2 = allocations[dual.secondaryKey];
    const parts: string[] = [];
    let aboveCount = 0;
    let belowCount = 0;

    const addPart = (label: string, standard: number | undefined) => {
      if (standard === undefined || standard === 0) return; // skip zeros — not checked
      const diff = abs - standard;
      if (diff > 0) {
        parts.push(`vs ${label} (${standard}L): +${diff}L above`);
        aboveCount++;
      } else if (diff < 0) {
        parts.push(`vs ${label} (${standard}L): ${Math.abs(diff)}L below`);
        belowCount++;
      } else {
        parts.push(`vs ${label} (${standard}L): at standard`);
      }
    };

    addPart(dual.primaryLabel, s1);
    addPart(dual.secondaryLabel, s2);

    if (parts.length === 0) return { isAbove: false, isBelow: false, tooltip: '' };
    return {
      isAbove: aboveCount > 0,
      isBelow: belowCount > 0,
      tooltip: parts.join(' · '),
    };
  }

  // Single standard
  const allocKey = ALLOCATION_FIELD_MAP[field];
  if (!allocKey) return { isAbove: false, isBelow: false, tooltip: '' };

  const standard = allocations[allocKey];
  if (standard === undefined || standard === 0) return { isAbove: false, isBelow: false, tooltip: '' };

  const diff = abs - standard;
  if (diff > 0) return { isAbove: true, isBelow: false, tooltip: `+${diff}L above standard (${standard}L)` };
  if (diff < 0) return { isAbove: false, isBelow: true, tooltip: `${Math.abs(diff)}L below standard (${standard}L)` };
  return { isAbove: false, isBelow: false, tooltip: '' };
};

const MONTH_NAMES_FR = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** Convert YYYY-MM to "Month YYYY" format for API */
const toMonthApiFormat = (yyyyMm: string): string => {
  const [year, monthNum] = yyyyMm.split('-');
  return `${MONTH_NAMES_FR[parseInt(monthNum) - 1]} ${year}`;
};

const FuelRecords = () => {
  const queryClient = useQueryClient();
  const { isDark, user } = useAuth();
  const canUncancel = user?.role === 'super_admin' || user?.role === 'admin';
  const [searchTerm, setSearchTerm] = usePersistedState('fr:searchTerm', '');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FuelRecord | undefined>();
  const [routeFilter, setRouteFilter] = usePersistedState('fr:routeFilter', '');
  const [routeTypeFilter, setRouteTypeFilter] = usePersistedState<'IMPORT' | 'EXPORT'>('fr:routeTypeFilter', 'IMPORT');
  const [statusFilter, setStatusFilter] = usePersistedState<'all' | 'active' | 'cancelled'>('fr:statusFilter', 'all');
  const [exportYear, setExportYear] = useState<number>(() => new Date().getFullYear());
  const [viewMode, setViewMode] = usePersistedState<'records' | 'analytics'>('fr:viewMode', 'records');
  
  // Conflict modal state
  const [conflictData, setConflictData] = useState<{ currentRecord: any; pendingData: Partial<FuelRecord> } | null>(null);

  // Details modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | number | null>(null);
  const [showPendingDoModal, setShowPendingDoModal] = useState(false);
  const [pendingDoStats, setPendingDoStats] = useState({ total: 0, goingPending: 0, returnPending: 0 });
  const [showCreatePending, setShowCreatePending] = useState(false);
  const [pendingCreateKind, setPendingCreateKind] = useState<'going' | 'return'>('going');
  const [pendingCreateTruck, setPendingCreateTruck] = useState('');
  const [pendingCreateBusy, setPendingCreateBusy] = useState(false);
  const [cancelPending, setCancelPending] = useState<string | number | null>(null);
  const [uncancelPending, setUncancelPending] = useState<string | number | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  // Standard allocations (fetched from backend)
  const [standardAllocations, setStandardAllocations] = useState<StandardAllocations | null>(null);
  
  // Month navigation state — priority: URL params (deep-links) > localStorage > current month
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // URL params take highest priority (for deep links from notifications)
    const url = new URL(window.location.href);
    const yearParam = url.searchParams.get('year');
    const monthParam = url.searchParams.get('month');

    if (yearParam && monthParam) {
      const targetMonth = `${yearParam}-${String(monthParam).padStart(2, '0')}`;
      return targetMonth;
    }

    // Fall back to persisted value
    try {
      const stored = localStorage.getItem('fuel-order:fr:selectedMonth');
      if (stored) return JSON.parse(stored) as string;
    } catch { /* ignore */ }

    // Default to current month
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Keep selectedMonth persisted whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('fuel-order:fr:selectedMonth', JSON.stringify(selectedMonth));
    } catch { /* ignore */ }
  }, [selectedMonth]);
  
  const [_searchParams] = useSearchParams();
  
  // Pagination state (server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistedState('fr:itemsPerPage', 10);

  // Month initialization flag (must be declared before React Query hooks that depend on it)
  const [monthInitialized, setMonthInitialized] = useState(false);

  // --- React Query hooks (replace manual fetch + state) ---
  // Build the month filter for the API
  const monthApiFilter = selectedMonth ? toMonthApiFormat(selectedMonth) : undefined;

  // Route filter → from/to params
  const routeFrom = routeFilter ? (routeTypeFilter === 'EXPORT' ? routeFilter.split('-')[0] : undefined) : undefined;
  const routeTo = routeFilter ? (routeTypeFilter === 'IMPORT' ? routeFilter.split('-')[1] : undefined) : undefined;

  const { data: recordsData, isLoading: loading, isFetching, isError, refetch: refetchRecords } = useFuelRecordsList({
    page: currentPage,
    limit: itemsPerPage,
    search: searchTerm || undefined,
    month: monthApiFilter,
    routeFrom,
    routeTo,
    sort: 'date',
    order: 'desc',
    status: statusFilter,
  }, monthInitialized);

  const records = recordsData?.records ?? [];
  const filteredRecords = records;
  const totalItems = recordsData?.pagination?.total ?? 0;
  const totalPages = recordsData?.pagination?.totalPages ?? 0;

  // LPO dropdown (for linking fuel records → LPOs)
  const { data: lpos = [] } = useLPODropdown();

  // Available routes for filter dropdown
  const { data: availableRoutes = [] } = useFuelRecordRoutes(
    monthApiFilter || '',
    routeTypeFilter,
    monthInitialized && !!monthApiFilter,
  );

  // Available months & years for month picker
  const { data: periodsData } = useFuelRecordPeriods();
  const availableMonths = periodsData?.months ?? [];
  const availableYears = periodsData?.years ?? [];
  
  // Dropdown states
  const [showExportYearDropdown, setShowExportYearDropdown] = useState(false);
  const [showRouteTypeDropdown, setShowRouteTypeDropdown] = useState(false);
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  
  // Dropdown refs
  const exportYearDropdownRef = useRef<HTMLDivElement>(null);
  const routeTypeDropdownRef = useRef<HTMLDivElement>(null);
  const routeDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  
  // Ref and state to track highlight
  const highlightProcessedRef = useRef<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);

  // Robust date parser that handles both YYYY-MM-DD (UI records) and D-Mon-YYYY (imported records)
  const parseRecordDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    // ISO format: "2026-02-15"
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const d = new Date(dateStr + 'T12:00:00Z');
      return isNaN(d.getTime()) ? null : d;
    }
    // "D-Mon-YYYY" format: "7-Jan-2025"
    const abbrvMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (abbrvMatch) {
      const monthMap: Record<string, number> = {
        jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
      };
      const idx = monthMap[abbrvMatch[2].toLowerCase()];
      if (idx !== undefined) {
        return new Date(parseInt(abbrvMatch[3]), idx, parseInt(abbrvMatch[1]));
      }
    }
    // Fallback
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // Handle highlight from URL parameter
  useEffect(() => {
    const handleUrlChange = () => {
      const url = new URL(window.location.href);
      const actionParam = url.searchParams.get('action');
      const highlightId = url.searchParams.get('highlight');
      const yearParam = url.searchParams.get('year');
      const monthParam = url.searchParams.get('month');
      
      if (actionParam === 'create-fuel') {
        setSelectedRecord(undefined);
        setIsFormOpen(true);
        // Clear the action param
        url.searchParams.delete('action');
        replaceUrlPreservingState(url.toString());
        setMonthInitialized(true);
      } else if (highlightId && highlightId !== highlightProcessedRef.current) {
        highlightProcessedRef.current = highlightId;

        // Clear stale search/route filters so the incoming record isn't blocked
        setSearchTerm('');
        setRouteFilter('');

        // Reset to records view so the highlighted record is visible
        setViewMode('records');

        // If year and month are provided, construct the YYYY-MM format
        if (yearParam && monthParam) {
          const targetMonth = `${yearParam}-${String(monthParam).padStart(2, '0')}`;
          setSelectedMonth(targetMonth);
          // Set flag to allow data fetching with the correct month
          setMonthInitialized(true);
        } else {
          setMonthInitialized(true);
        }
        
        // Trigger the highlight process after a brief delay to let filters apply
        setTimeout(() => setPendingHighlight(highlightId), 200);
      } else {
        // No highlight, just initialize
        setMonthInitialized(true);
      }
    };
    
    window.addEventListener('urlchange', handleUrlChange);
    handleUrlChange(); // Check on mount
    
    return () => window.removeEventListener('urlchange', handleUrlChange);
  }, []); // Remove selectedMonth dependency to avoid re-triggering

  // Separate effect to handle highlight - fetch ALL records to find position
  useEffect(() => {
    if (pendingHighlight && selectedMonth) {
      // Fetch ALL records for the selected month to find the record's position
      const findRecordPosition = async () => {
        try {
          const [year, monthNum] = selectedMonth.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                             'July', 'August', 'September', 'October', 'November', 'December'];
          const monthName = monthNames[parseInt(monthNum) - 1];
          
          // Fetch ALL records for this month
          const response = await fuelRecordsAPI.getAll({
            limit: 10000, // High limit to get all records
            sort: 'date',
            order: 'desc',
            month: `${monthName} ${year}`
          });
          
          const allMonthRecords = response.data;

          // Find the record by its unique id (a truck can have many records in a
          // month; matching by truckNo would land on the wrong DO's row).
          const recordIndex = allMonthRecords.findIndex(
            r => ((r as any)._id || (r as any).id) === pendingHighlight
          );
          
          if (recordIndex >= 0) {
            // Calculate which page this record is on
            const targetPage = Math.floor(recordIndex / itemsPerPage) + 1;
            // Navigate to the correct page if needed
            if (targetPage !== currentPage) {
              setCurrentPage(targetPage);
            }
            // scrollToAndHighlight polls for the row, so it tolerates the
            // page-change refetch finishing whenever it does — no fixed guess needed.
            scrollToAndHighlight(pendingHighlight);
          } else {
            clearHighlight();
          }
        } catch (error) {
          console.error('❌ Error finding record position:', error);
          clearHighlight();
        }
      };
      
      findRecordPosition();
    }
  }, [pendingHighlight, selectedMonth, itemsPerPage, currentPage]);
  
  // Helper function to scroll to and highlight a record.
  // The target row may not be in the DOM yet when a page/month change triggers
  // a fresh server fetch (common for older records that need an extra refetch).
  // Instead of guessing a single delay, poll for the element to appear and only
  // give up after a max number of attempts.
  const scrollToAndHighlight = (recordId: string, attempt = 0) => {
    const MAX_ATTEMPTS = 20; // ~3s total at 150ms intervals
    const RETRY_DELAY = 150;

    // Find all elements for this specific record id
    const allElements = document.querySelectorAll(`[data-record-id="${recordId}"]`);
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
        setTimeout(() => scrollToAndHighlight(recordId, attempt + 1), RETRY_DELAY);
        return;
      }
      clearHighlight();
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
      
      // Apply subtle highlight with faint green
      element.style.setProperty('transition', 'all 0.3s ease-in-out', 'important');
      element.style.setProperty('box-shadow', '0 0 0 3px rgba(34, 197, 94, 0.3), 0 0 15px rgba(34, 197, 94, 0.2)', 'important');
      element.style.setProperty('border', '2px solid rgba(34, 197, 94, 0.4)', 'important');
      element.style.setProperty('background-color', 'rgba(34, 197, 94, 0.08)', 'important');
      element.style.setProperty('transform', 'scale(1.01)', 'important');
      element.style.setProperty('z-index', '9999', 'important');
      element.style.setProperty('position', 'relative', 'important');
      

      
      setTimeout(() => {
        element.style.boxShadow = originalStyles.boxShadow;
        element.style.border = originalStyles.border;
        element.style.backgroundColor = originalStyles.backgroundColor;
        element.style.transform = originalStyles.transform;
        element.style.transition = originalStyles.transition;
        element.style.position = '';
        element.style.zIndex = '';
        clearHighlight();
      }, 3000);
    }
  };
  
  // Helper function to clear highlight
  const clearHighlight = () => {
    highlightProcessedRef.current = null;
    setPendingHighlight(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('highlight');
    url.searchParams.delete('month');
    url.searchParams.delete('year');
    replaceUrlPreservingState(url.toString());
  };
  
  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportYearDropdownRef.current && !exportYearDropdownRef.current.contains(event.target as Node)) {
        setShowExportYearDropdown(false);
      }
      if (routeTypeDropdownRef.current && !routeTypeDropdownRef.current.contains(event.target as Node)) {
        setShowRouteTypeDropdown(false);
      }
      if (routeDropdownRef.current && !routeDropdownRef.current.contains(event.target as Node)) {
        setShowRouteDropdown(false);
      }
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        exportYearDropdownRef.current?.contains(target) ||
        routeTypeDropdownRef.current?.contains(target) ||
        routeDropdownRef.current?.contains(target) ||
        monthDropdownRef.current?.contains(target) ||
        statusDropdownRef.current?.contains(target)
      ) return;
      setShowExportYearDropdown(false);
      setShowRouteTypeDropdown(false);
      setShowRouteDropdown(false);
      setShowMonthDropdown(false);
      setShowStatusDropdown(false);
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

  // Fetch records when pagination or filters change — React Query handles this
  // automatically via the useFuelRecordsList hook above. No useEffect needed.

  // Auto-fallback: if the current month has no data, switch to the most recent month that does
  useEffect(() => {
    if (!monthInitialized || loading || availableMonths.length === 0) return;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    // Only auto-fallback when still on the initial default (current month)
    if (selectedMonth !== currentMonth) return;
    if (!availableMonths.includes(currentMonth)) {
      setSelectedMonth(availableMonths[0]); // Most recent month with data
    }
  }, [availableMonths, loading, monthInitialized]);

  // Reset route filter when import/export type or month changes
  useEffect(() => {
    if (monthInitialized) {
      setRouteFilter('');
    }
  }, [routeTypeFilter, selectedMonth, monthInitialized]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, routeFilter, selectedMonth, routeTypeFilter, statusFilter]);

  // Subscribe to real-time yard fuel notifications to auto-refresh the table
  useEffect(() => {
    subscribeToNotifications((notification) => {
      if (notification.type === 'yard_fuel_recorded' || notification.type === 'truck_pending_linking') {
        queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
      }
    }, 'fuel-records');

    return () => {
      unsubscribeFromNotifications('fuel-records');
    };
  }, []);

  // New-records pill: created fuel records relevant to the current view are
  // surfaced as a click-to-load affordance instead of refreshing the table.
  const pillResetKey = `${searchTerm}|${routeFilter}|${selectedMonth}|${routeTypeFilter}|${statusFilter}|${currentPage}|${itemsPerPage}`;
  const { pendingCount, addPending, clearPending } = useNewRecordsPill(pillResetKey);

  const loadNewRecords = () => {
    clearPending();
    refetchRecords();
  };

  // Real-time sync for fuel records. Updates are patched in place by the hook.
  // Creates are deferred (no auto-refetch); if a new record would land in the
  // current filtered + paginated view, we bump the pill instead.
  useRealtimeSync('fuel_records', (event) => {
    queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lpoDropdown() });
    if (event?.action === 'create') {
      // Creator already refreshed on mutation success — don't offer "click to load".
      if (isOwnDataChange(event, user?.id)) return;
      const relevant = countRelevantNewRecords(
        event,
        { visibleRows: records, sortField: 'date', sortOrder: 'desc', page: currentPage, totalPages },
        {
          dateField: 'date',
          matchesFilters: (rec) => {
            if (statusFilter === 'cancelled') return false; // new records are active
            if (selectedMonth) return String(rec?.date ?? '').slice(0, 7) === selectedMonth;
            return true;
          },
          matchesBulk: (meta) => {
            if (statusFilter === 'cancelled') return false;
            if (selectedMonth) {
              const lo = meta.dateMin?.slice(0, 7);
              const hi = meta.dateMax?.slice(0, 7);
              if (lo && hi) return selectedMonth >= lo && selectedMonth <= hi;
            }
            return true;
          },
        },
      );
      addPending(relevant);
    }
  }, { id: 'rt-fuel-records', deferCreates: true });

  // Live-update the "Editing: …" badge without refetching the list.
  useEditLockSync('fuel_records');

  // Real-time sync for LPO changes. Any fuel record whose linkage actually
  // changed is emitted separately as a `fuel_records` update carrying its full
  // payload (see lpoSummaryController), and patched into the list in place by
  // the hook above. So we no longer force a full fuel-records refetch here —
  // that only distracted other users — and just refresh the light LPO dropdown.
  useRealtimeSync('lpo_summaries', () => {
    queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lpoDropdown() });
  }, 'rt-lpo-summaries');

  // Fetch standard allocations from backend
  useEffect(() => {
    configAPI.getStandardAllocations().then(setStandardAllocations).catch(() => {});
  }, []);

  // Real-time sync: refresh allocations when admin changes them
  useRealtimeSync('standard_allocations', () => {
    configAPI.getStandardAllocations().then(setStandardAllocations).catch(() => {});
  });

  // Server-side pagination - no need to slice, backend already returned the right page
  const paginatedRecords = filteredRecords;
  const startIndex = (currentPage - 1) * itemsPerPage;
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // React Query will auto-fetch with new page via query key change
    // Scroll to top of table when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
    // React Query will auto-fetch with new limit via query key change
  };

  const handleCreate = () => {
    setSelectedRecord(undefined);
    setIsFormOpen(true);
  };

  const getCurrentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  useEffect(() => {
    let cancelled = false;
    fuelRecordsAPI.getPendingDoStats()
      .then((s) => { if (!cancelled) setPendingDoStats(s); })
      .catch(() => { /* non-blocking */ });
    return () => { cancelled = true; };
  }, [recordsData]);

  // If month filter leaves current month while creating "going", force return-only mode
  useEffect(() => {
    if (selectedMonth !== getCurrentMonthKey() && pendingCreateKind === 'going') {
      setPendingCreateKind('return');
    }
  }, [selectedMonth, pendingCreateKind]);

  const handleSubmitPendingCreate = async () => {
    const isCurrentMonth = selectedMonth === getCurrentMonthKey();
    if (pendingCreateKind === 'going' && !isCurrentMonth) {
      toast.error('Pending going DOs can only be created for the current month');
      setPendingCreateKind('return');
      return;
    }
    const truckNo = formatTruckNumber(pendingCreateTruck.trim());
    if (!truckNo || truckNo.length < 3) {
      toast.error('Enter a valid truck number');
      return;
    }
    setPendingCreateBusy(true);
    try {
      if (pendingCreateKind === 'going') {
        const res = await fuelRecordsAPI.createPendingGoingDo({ truckNo });
        toast.success(res?.message || 'Pending going DO created');
      } else {
        const res = await fuelRecordsAPI.createPendingReturnDo({
          truckNo,
          month: selectedMonth || undefined,
        });
        toast.success(res?.message || 'Pending return DO created');
      }
      setShowCreatePending(false);
      setPendingCreateTruck('');
      const s = await fuelRecordsAPI.getPendingDoStats();
      setPendingDoStats(s);
      refetchRecords();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to create pending DO');
    } finally {
      setPendingCreateBusy(false);
    }
  };

  const handleEdit = async (record: FuelRecord, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    const recordId = record.id || (record as any)._id;
    if (recordId) {
      try {
        await fuelRecordsAPI.acquireLock(recordId);
      } catch (err: any) {
        if (err.response?.status === 423) {
          const lockHolder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
          toast.error(`This record is being edited by ${lockHolder}.`);
        } else {
          toast.error('Could not acquire edit lock. Please try again.');
        }
        return;
      }
    }
    setSelectedRecord(record);
    setIsFormOpen(true);
  };

  const handleCloseForm = async () => {
    if (selectedRecord) {
      const recordId = selectedRecord.id || (selectedRecord as any)._id;
      if (recordId) {
        try { await fuelRecordsAPI.releaseLock(recordId); } catch { /* ignore */ }
      }
    }
    setIsFormOpen(false);
    setSelectedRecord(undefined);
  };

  // Renew the edit lock every 3 minutes while the form is open so it doesn't
  // expire mid-edit (lock TTL is 5 minutes; 3-minute renewal keeps it alive).
  useEffect(() => {
    if (!isFormOpen || !selectedRecord) return;
    const recordId = selectedRecord.id || (selectedRecord as any)._id;
    if (!recordId) return;
    const interval = setInterval(async () => {
      try { await fuelRecordsAPI.acquireLock(recordId); } catch { /* silent — user will be informed on save */ }
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isFormOpen, selectedRecord]);

  const handleRowClick = (record: FuelRecord) => {
    const recordId = record.id || (record as any)._id;
    if (recordId) {
      setSelectedRecordId(recordId);
      setIsDetailsModalOpen(true);
    }
  };

  const handleCancel = (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelPending(id);
  };

  const executeCancel = async () => {
    if (!cancelPending) return;
    setIsActionLoading(true);
    try {
      await fuelRecordsAPI.cancel(cancelPending);
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
      toast.success('Fuel record cancelled successfully');
    } catch (error) {
      console.error('Error cancelling fuel record:', error);
      toast.error('Failed to cancel fuel record');
    } finally {
      setIsActionLoading(false);
      setCancelPending(null);
    }
  };

  const handleUncancel = (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setUncancelPending(id);
  };

  const executeUncancel = async () => {
    if (!uncancelPending) return;
    setIsActionLoading(true);
    try {
      await fuelRecordsAPI.uncancel(uncancelPending);
      queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
      toast.success('Fuel record uncancelled successfully');
    } catch (error) {
      console.error('Error uncancelling fuel record:', error);
      toast.error('Failed to uncancel fuel record');
    } finally {
      setIsActionLoading(false);
      setUncancelPending(null);
    }
  };

  const handleSubmit = async (data: Partial<FuelRecord>) => {
    try {
      if (selectedRecord) {
        const recordId = selectedRecord.id || (selectedRecord as any)._id;
        if (!recordId) {
          toast.error('Unable to update fuel record (missing record id)');
          return;
        }
        const updated = await fuelRecordsAPI.update(recordId, { ...data });
        // Patch the updated row in-place across all cached list pages — no full refetch.
        // The WebSocket event will propagate the same patch to all other connected clients.
        const updatedId = String(updated.id || (updated as any)._id || recordId);
        queryClient.setQueriesData(
          { queryKey: fuelRecordKeys.lists() },
          (old: any) => {
            if (!old?.records) return old;
            const idx = old.records.findIndex((r: any) =>
              String(r._id || r.id) === updatedId
            );
            if (idx === -1) return old;
            const newRecords = [...old.records];
            newRecords[idx] = { ...newRecords[idx], ...updated };
            return { ...old, records: newRecords };
          }
        );
        queryClient.setQueryData(fuelRecordKeys.detail(updatedId), updated);
        toast.success('Fuel record updated successfully');
        // Close form AFTER save succeeds so the lock release (inside handleCloseForm)
        // always happens after the PUT — not racing against it.
        handleCloseForm();
      } else {
        await fuelRecordsAPI.create(data);
        queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
        clearPending(); // don't nag the creator with a pill for their own record
        toast.success('Fuel record created successfully');
        setIsFormOpen(false);
        setSelectedRecord(undefined);
      }
    } catch (error: any) {
      console.error('Error saving fuel record:', error);
      if (error.response?.status === 409) {
        const currentRecord = error.response?.data?.data?.current;
        if (currentRecord) {
          // Genuine version conflict — offer to keep or discard changes
          setConflictData({ currentRecord, pendingData: data });
          queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
        } else {
          // Lock-related 409: expired lock or lock not acquired
          toast.error(error.response?.data?.message || 'Your edit lock has expired. Close and re-open the form to continue.');
        }
      } else if (error.response?.status === 423) {
        const lockHolder = error.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`This record is being edited by ${lockHolder}. Please try again later.`);
      } else {
        toast.error(error.response?.data?.message || 'Failed to save fuel record');
      }
    }
  };

  const handleExport = async () => {
    // Use the selected export year
    const year = exportYear;
    
    // Fetch ALL records for the selected year (no pagination for export)
    try {
      const response = await fuelRecordsAPI.getAll({
        limit: 5000,
        sort: 'date',
        order: 'desc',
        year: year,
      });
      
      const allRecords = response.data;
      
      // Filter all records for the selected year (yearly export)
      // Use parseRecordDate to handle both YYYY-MM-DD and D-Mon-YYYY formats
      const yearlyRecords = allRecords.filter(record => {
        const recordDate = parseRecordDate(record.date as string);
        return recordDate !== null && recordDate.getFullYear() === year;
      });
    
      if (yearlyRecords.length === 0) {
        toast.warn(`No records found for year ${year}`);
        return;
      }
    
    // Group records by month
    const recordsByMonth: { [key: string]: typeof yearlyRecords } = {};
    const monthOrder: string[] = []; // To maintain order
    
    yearlyRecords.forEach(record => {
      const recordDate = parseRecordDate(record.date as string) || new Date(record.date);
      const monthName = recordDate.toLocaleDateString('en-US', { month: 'long' }); // e.g., "January", "February"
      
      if (!recordsByMonth[monthName]) {
        recordsByMonth[monthName] = [];
        monthOrder.push(monthName);
      }
      recordsByMonth[monthName].push(record);
    });
    
    // Sort months chronologically
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    monthOrder.sort((a, b) => monthNames.indexOf(a) - monthNames.indexOf(b));
    
    // Helper function to format record for export
    const formatRecordForExport = (record: FuelRecord) => {
      const isCancelled = record.isCancelled === true;
      const recordDate = parseRecordDate(record.date as string) || new Date(record.date);
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
        'Tanga\nGoing': record.tangaGoing || '',
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
        '_isCancelled': isCancelled,
      };
    };
    
    // Create sheets array - one sheet per month
    const sheets = monthOrder.map(monthName => ({
      sheetName: monthName,
      data: recordsByMonth[monthName].map(formatRecordForExport),
    }));
    
    // If no records, create an empty sheet with the current month
    if (sheets.length === 0) {
      const currentMonthName = new Date().toLocaleDateString('en-US', { month: 'long' });
      sheets.push({
        sheetName: currentMonthName,
        data: [],
      });
    }
    
    exportToXLSXMultiSheet(sheets, `FUEL RECORD ${year}.xlsx`, {
      headerColor: 'FFECD5', // Light orange/peach color for headers
      headerTextColor: '000000', // Black text
      addBorders: true,
      wrapHeader: true,
      centerAllCells: true,
      columnWidths: [8, 10, 8, 8, 6, 8, 10, 8, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 8, 8, 8, 8, 8],
      strikethroughCancelledRows: true,
    });
    } catch (error) {
      console.error('Error exporting fuel records:', error);
      toast.error('Failed to export fuel records. Please try again.');
    }
  };

  // Fetch available months and years for filters
  // Month navigation helpers
  const getAvailableMonths = () => {
    return availableMonths;
  };

  // Format a date string (any format) as "D-Mon" e.g. "4-Jan" or "22-Feb"
  const formatDateShort = (dateStr: string): string => {
    const d = parseRecordDate(dateStr);
    if (!d) return dateStr; // fallback: show raw value
    const day = d.getDate();
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    return `${day}-${mon}`;
  };

  // NOTE: availableMonths is sorted newest-first (see useFuelRecordPeriods —
  // `.sort().reverse()`). So an *older* (previous) month is at a HIGHER index
  // and a *newer* (next) month is at a LOWER index.
  const goToPreviousMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex >= 0 && currentIndex < availableMonths.length - 1) {
      // Jump directly to the previous (older) available month (skip empty months)
      setSelectedMonth(availableMonths[currentIndex + 1]);
    } else if (currentIndex === -1) {
      // Not in list — find nearest available month before this one
      const before = availableMonths.filter(m => m < selectedMonth);
      if (before.length > 0) setSelectedMonth(before[0]);
    }
  };

  const goToNextMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      // Jump directly to the next (newer) available month (skip empty months)
      setSelectedMonth(availableMonths[currentIndex - 1]);
    } else if (currentIndex === -1) {
      // Not in list — find nearest available month after this one
      const after = availableMonths.filter(m => m > selectedMonth);
      if (after.length > 0) setSelectedMonth(after[after.length - 1]);
    }
  };

  // Check if previous (older) / next (newer) available month exists
  const canGoToPreviousMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return false;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex >= 0 && currentIndex < availableMonths.length - 1) return true;
    if (currentIndex === -1) return availableMonths.some(m => m < selectedMonth);
    return false;
  };

  const canGoToNextMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return false;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) return true;
    if (currentIndex === -1) return availableMonths.some(m => m > selectedMonth);
    return false;
  };

  const getMonthName = (monthKey: string) => {
    return new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // True when any filter differs from its default
  const isAnyFilterActive = () => {
    const currentMonth = getCurrentMonthKey();
    const defaultMonth = availableMonths.includes(currentMonth)
      ? currentMonth
      : availableMonths[0] ?? currentMonth;
    return (
      searchTerm !== '' ||
      routeFilter !== '' ||
      routeTypeFilter !== 'IMPORT' ||
      selectedMonth !== defaultMonth ||
      statusFilter !== 'all'
    );
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setRouteFilter('');
    setRouteTypeFilter('IMPORT');
    setStatusFilter('all');
    // Go to current month if it has data, otherwise most recent month with data
    const currentMonth = getCurrentMonthKey();
    if (availableMonths.includes(currentMonth)) {
      setSelectedMonth(currentMonth);
    } else if (availableMonths.length > 0) {
      setSelectedMonth(availableMonths[0]);
    } else {
      setSelectedMonth(currentMonth);
    }
  };

  // Get available years from state
  const getAvailableYears = (): number[] => {
    return availableYears.length > 0 ? availableYears : [new Date().getFullYear()];
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Fuel Records</h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
            Track fuel consumption and usage across all trips
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 sm:gap-3 overflow-visible pt-1.5 pr-1.5">
          {/* View Toggle + Pending DOs */}
          <div className="relative flex border border-gray-300 dark:border-gray-600 rounded-md">
            <button
              onClick={() => setViewMode('records')}
              style={viewMode === 'records' ? { background: '#2563EB', color: '#FFFFFF' } : {}}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium inline-flex items-center rounded-l-md ${
                viewMode === 'records'
                  ? ''
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Records</span>
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              style={viewMode === 'analytics' ? { background: '#2563EB', color: '#FFFFFF' } : {}}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium border-l dark:border-gray-600 inline-flex items-center ${
                viewMode === 'analytics'
                  ? ''
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Analytics</span>
            </button>
            <button
              onClick={() => setShowPendingDoModal(true)}
              className="relative px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium border-l dark:border-gray-600 inline-flex items-center rounded-r-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              title="Trucks with pending going (PG) or return (PR) DOs"
            >
              <Clock className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Pending DOs</span>
              {pendingDoStats.total > 0 && (
                <span className="absolute -top-1.5 -right-1.5 z-10 min-w-[1.125rem] h-[1.125rem] px-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none shadow-sm ring-2 ring-white dark:ring-gray-900">
                  {pendingDoStats.total > 99 ? '99+' : pendingDoStats.total}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <div className="relative" ref={exportYearDropdownRef}>
              <button
                type="button"
                onClick={() => setShowExportYearDropdown(!showExportYearDropdown)}
                className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs sm:text-sm flex items-center gap-2"
                title="Select year to export"
              >
                <span>{exportYear}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showExportYearDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showExportYearDropdown && (
                <div className="absolute z-50 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto min-w-[100px]">
                  {getAvailableYears().map((year) => (
                    <button
                      key={`export-year-${year}`}
                      type="button"
                      onClick={() => {
                        setExportYear(year);
                        setShowExportYearDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        exportYear === year ? 'text-blue-600 bg-blue-50' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span>{year}</span>
                      {exportYear === year && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleExport}
              className="inline-flex items-center px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              title={`Export fuel records for ${exportYear}`}
            >
              <Download className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
          <button
            onClick={() => {
              const isCurrent = selectedMonth === getCurrentMonthKey();
              setPendingCreateKind(isCurrent ? 'going' : 'return');
              setShowCreatePending(true);
            }}
            className="inline-flex items-center px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
            title={
              selectedMonth === getCurrentMonthKey()
                ? 'Create pending going (PG) or return (PR) DO'
                : 'Create pending return (PR) DO for this month'
            }
          >
            <Plus className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">
              {selectedMonth === getCurrentMonthKey() ? 'Pending DO' : 'Pending Return'}
            </span>
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-2 sm:px-4 py-1.5 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white"
            style={{ background: '#16A34A' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#15803D')}
            onMouseLeave={e => (e.currentTarget.style.background = '#16A34A')}
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">New Record</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Analytics View */}
      {viewMode === 'analytics' ? (
        <FuelAnalytics fuelRecords={records} lpoEntries={lpos} />
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-3 mb-6 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 flex-1">
          <div className="relative col-span-2 md:col-span-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by Truck, DO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm dashboard-search-input"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
          <div className="relative" ref={routeTypeDropdownRef}>
            <button
              type="button"
              onClick={() => setShowRouteTypeDropdown(!showRouteTypeDropdown)}
              className="w-full h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left text-sm flex items-center justify-between"
            >
              <span>{routeTypeFilter === 'IMPORT' ? 'Import (Going)' : 'Export (Return)'}</span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showRouteTypeDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showRouteTypeDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setRouteTypeFilter('IMPORT');
                    setRouteFilter('');
                    setShowRouteTypeDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                    routeTypeFilter === 'IMPORT' ? 'text-blue-600 bg-blue-50' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <span>Import (Going)</span>
                  {routeTypeFilter === 'IMPORT' && <Check className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRouteTypeFilter('EXPORT');
                    setRouteFilter('');
                    setShowRouteTypeDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                    routeTypeFilter === 'EXPORT' ? 'text-blue-600 bg-blue-50' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <span>Export (Return)</span>
                  {routeTypeFilter === 'EXPORT' && <Check className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          <div className="relative" ref={routeDropdownRef}>
            <button
              type="button"
              onClick={() => setShowRouteDropdown(!showRouteDropdown)}
              className="w-full h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left text-sm flex items-center justify-between"
            >
              <span className={!routeFilter ? 'text-gray-400' : ''}>
                {routeFilter ? routeFilter.replace('-', ' → ') : 'All Routes'}
              </span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showRouteDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showRouteDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setRouteFilter('');
                    setShowRouteDropdown(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                    !routeFilter ? 'text-blue-600 bg-blue-50' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <span>All Routes</span>
                  {!routeFilter && <Check className="w-4 h-4" />}
                </button>
                {availableRoutes.map((route) => {
                  const routeKey = `${route.from}-${route.to}`;
                  const routeDisplay = `${route.from} → ${route.to}`;
                  return (
                    <button
                      key={`route-${routeKey}`}
                      type="button"
                      onClick={() => {
                        setRouteFilter(routeKey);
                        setShowRouteDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        routeFilter === routeKey ? 'text-blue-600 bg-blue-50' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span>{routeDisplay}</span>
                      {routeFilter === routeKey && <Check className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={goToPreviousMonth}
              disabled={!canGoToPreviousMonth()}
              className={`hidden md:inline-flex items-center justify-center h-9 w-9 flex-shrink-0 rounded-md transition-colors ${
                canGoToPreviousMonth()
                  ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              title={canGoToPreviousMonth() ? "Previous Month" : "No earlier records"}
            >
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="relative flex-1" ref={monthDropdownRef}>
              <button
                type="button"
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                className="w-full h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm flex items-center justify-between gap-2"
              >
                <span>{getMonthName(selectedMonth)}</span>
                <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showMonthDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {getAvailableMonths().map(month => (
                    <button
                      key={month}
                      type="button"
                      onClick={() => {
                        setSelectedMonth(month);
                        setShowMonthDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        selectedMonth === month ? 'text-blue-600 bg-blue-50' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span>{getMonthName(month)}</span>
                      {selectedMonth === month && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={goToNextMonth}
              disabled={!canGoToNextMonth()}
              className={`hidden md:inline-flex items-center justify-center h-9 w-9 flex-shrink-0 rounded-md transition-colors ${
                canGoToNextMonth()
                  ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              title={canGoToNextMonth() ? "Next Month" : "No later records"}
            >
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          {/* Status Filter */}
          <div className="relative" ref={statusDropdownRef}>
            <button
              type="button"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="w-full h-9 px-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left text-sm flex items-center justify-between"
            >
              <span>{statusFilter === 'active' ? 'Active' : statusFilter === 'cancelled' ? 'Cancelled' : 'All Status'}</span>
              <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showStatusDropdown ? 'rotate-180' : ''}`} />
            </button>
            {showStatusDropdown && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                {(['all', 'active', 'cancelled'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setStatusFilter(s); setCurrentPage(1); setShowStatusDropdown(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${statusFilter === s ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : 'text-gray-900 dark:text-gray-100'}`}
                  >
                    <span>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    {statusFilter === s && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleClearFilters}
            disabled={!isAnyFilterActive()}
            className={`col-span-2 md:col-span-1 w-full h-9 inline-flex items-center justify-center px-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium transition-colors ${
              isAnyFilterActive()
                ? 'text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
                : 'text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed'
            }`}
            title={isAnyFilterActive() ? 'Reset all filters to default' : 'No active filters to clear'}
          >
            Clear Filters
          </button>
        </div>
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap lg:flex-shrink-0">
          Total Records: <span className="ml-2 font-semibold">{totalItems}</span>
        </div>
        </div>
      </div>

      {/* New-records affordance — appears only when created records relevant to
          the current view are available, so the table is never refreshed out
          from under the user. */}
      {pendingCount > 0 && (
        <div className="flex justify-center mb-2">
          <NewRecordsPill count={pendingCount} onLoad={loadNewRecords} label="record" />
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg transition-colors">
        {/* Thin progress bar shown during a background refetch so the table
            stays visible instead of being replaced by a full-screen loader. */}
        {isFetching && !loading && (
          <div className="h-0.5 w-full bg-blue-500/60 dark:bg-blue-400/60 animate-pulse" />
        )}
        {loading ? (
          <UnifiedTabLoader label="Loading fuel records..." />
        ) : isError && totalItems === 0 ? (
          <QueryErrorState
            title="Unable to load fuel records"
            onRetry={() => { void refetchRecords(); }}
            isRetrying={isFetching}
          />
        ) : totalItems === 0 ? (
          <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm sm:text-base">
              {selectedMonth ? `No fuel records found for ${getMonthName(selectedMonth)}` : 'No fuel records found'}
            </p>
          </div>
        ) : (
          <>
            {/* Card View - Mobile/Tablet (below lg) */}
            <div className="lg:hidden space-y-3 p-4">
              {paginatedRecords.map((record, index) => {
                const isCancelled = record.isCancelled === true;
                const recordId = record.id || (record as any)._id;
                const actualIndex = startIndex + index; // Calculate actual index across all pages
                
                return (
                  <div
                    key={recordId || `record-${index}`}
                    data-truck-number={record.truckNo}
                    data-record-id={recordId}
                    onClick={() => handleRowClick(record)}
                    className={`border rounded-xl p-4 transition-all cursor-pointer ${
                      isCancelled
                        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50'
                    }`}
                    title={isCancelled ? 'This fuel record has been cancelled - Click for details' : 'Tap to view full fuel breakdown'}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-gray-500 dark:text-gray-400">#{actualIndex + 1}</span>
                          <h3 className={`text-base font-bold ${
                            isCancelled
                              ? 'text-red-500 dark:text-red-400 line-through'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}>
                            {record.truckNo}
                          </h3>
                          {isCancelled && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                              Cancelled
                            </span>
                          )}
                          {!isCancelled && record.journeyStatus && (
                            <JourneyStatusBadge 
                              status={record.journeyStatus} 
                              queueOrder={record.queueOrder}
                              size="sm"
                            />
                          )}
                          {!isCancelled && pendingDoStatusLabel(record) && (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                              {pendingDoStatusLabel(record)}
                            </span>
                          )}
                          <EditLockBadge editLock={(record as any).editLock} />
                        </div>
                        <p className={`text-xs ${isCancelled ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {formatDateShort(record.date as string)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-xl font-bold ${
                            isCancelled ? 'text-red-500 dark:text-red-400 line-through' : ''
                          }`}
                          style={!isCancelled ? { color: '#2563EB' } : {}}
                        >
                          {(record.totalLts || 0).toLocaleString()}L
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                      </div>
                    </div>

                    {/* Route Info */}
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Route:</span>
                        <p className={`font-medium ${isCancelled ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {record.from} → {record.to}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Balance:</span>
                        <p className={`font-medium ${
                          isCancelled
                            ? 'text-red-500 dark:text-red-400 line-through'
                            : record.balance < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-green-600 dark:text-green-400'
                        }`}>
                          {record.balance.toLocaleString()}L
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Going DO:</span>
                        <p className={`font-medium ${isCancelled ? 'text-red-500 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {record.goingDo}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Return DO:</span>
                        <p className={`font-medium ${
                          isCancelled
                            ? 'text-red-500 dark:text-red-400'
                            : record.returnDo
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-orange-500 dark:text-orange-400'
                        }`}>
                          {record.returnDo || 'Pending'}
                        </p>
                      </div>
                    </div>

                    {/* Key Fuel Points */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {record.darYard && (
                        <div
                          className="px-2 py-1 text-xs rounded"
                          style={isCancelled
                            ? { background: isDark ? 'rgba(220,38,38,0.2)' : '#FEE2E2', color: isDark ? '#FCA5A5' : '#DC2626' }
                            : { background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF', color: isDark ? '#93C5FD' : '#2563EB' }}
                        >
                          Dar: {record.darYard}L
                        </div>
                      )}
                      {record.tangaYard && (
                        <div
                          className="px-2 py-1 text-xs rounded"
                          style={isCancelled
                            ? { background: isDark ? 'rgba(220,38,38,0.2)' : '#FEE2E2', color: isDark ? '#FCA5A5' : '#DC2626' }
                            : { background: isDark ? 'rgba(8,145,178,0.2)' : '#E0F2FE', color: isDark ? '#67E8F9' : '#0891B2' }}
                        >
                          Tanga: {record.tangaYard}L
                        </div>
                      )}
                      {record.mbeyaGoing && (
                        <div
                          className="px-2 py-1 text-xs rounded"
                          style={isCancelled
                            ? { background: isDark ? 'rgba(220,38,38,0.2)' : '#FEE2E2', color: isDark ? '#FCA5A5' : '#DC2626' }
                            : { background: isDark ? 'rgba(234,88,12,0.2)' : '#FFF7ED', color: isDark ? '#FDBA74' : '#EA580C' }}
                        >
                          Mbeya: {record.mbeyaGoing}L
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isCancelled && (
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={(e) => handleEdit(record, e)}
                          className="flex-1 px-3 py-2 text-xs font-medium rounded-lg inline-flex items-center justify-center"
                          style={{ color: isDark ? '#93C5FD' : '#2563EB', background: isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF' }}
                          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.3)' : '#DBEAFE')}
                          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.2)' : '#EFF6FF')}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            const id = record.id || (record as any)._id;
                            if (id) handleCancel(id, e);
                          }}
                          className="flex-1 px-3 py-2 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/30 inline-flex items-center justify-center"
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Cancel
                        </button>
                      </div>
                    )}
                    {isCancelled && canUncancel && (
                      <div className="flex items-center gap-2 pt-3 border-t border-red-200 dark:border-red-700">
                        <button
                          onClick={(e) => {
                            const id = record.id || (record as any)._id;
                            if (id) handleUncancel(id, e);
                          }}
                          className="flex-1 px-3 py-2 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 inline-flex items-center justify-center"
                        >
                          <RotateCcw className="w-4 h-4 mr-1" />
                          Uncancel
                        </button>
                      </div>
                    )}
                    
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2 italic">
                      Tap card to view full fuel breakdown →
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Table View - Desktop (lg and up) */}
            <div className="hidden lg:block overflow-x-auto overflow-y-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-xs divide-y divide-gray-200 dark:divide-gray-700 table-fixed overflow-visible">
            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
              <tr>
                <th className="w-8 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">SN</th>
                <th className="w-12 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">Date</th>
                <th className="w-16 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">Truck</th>
                <th className="w-16 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">Go</th>
                <th className="w-14 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">Ret</th>
                <th className="w-10 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">St</th>
                <th className="w-20 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">Fr</th>
                <th className="w-20 px-1 py-1 text-left font-medium text-gray-500 dark:text-gray-100 uppercase">To</th>
                <th className="w-10 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">Tot</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">Ex</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">MMS</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">TnY</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">DrY</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">TnG</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">DrG</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">MoG</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">MbG</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">TdG</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">ZmG</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">Cng</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">ZmR</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">TdR</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">MbR</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">MoR</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">DrR</th>
                <th className="w-9 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">TnR</th>
                <th className="w-11 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">Bal</th>
                <th className="w-10 px-1 py-1 text-center font-medium text-gray-500 dark:text-gray-100 uppercase">Act</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={27} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading data...
                  </td>
                </tr>
              ) : totalItems === 0 ? (
                <tr>
                  <td colSpan={27} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {selectedMonth ? `No fuel records found for ${getMonthName(selectedMonth)}` : 'No fuel records found'}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record, index) => {
                  // Check if record is cancelled
                  const isCancelled = record.isCancelled === true;
                  const actualIndex = startIndex + index; // Calculate actual index across all pages
                  
                  // Helper to render fuel cell with two-color highlighting:
                  // amber = above standard, blue = below standard, neutral if standard is 0
                  const renderFuelCell = (field: string, value: number | undefined) => {
                    const { isAbove, isBelow, tooltip } = getFuelCellInfo(field, value, standardAllocations);
                    const flagged = !isCancelled && (isAbove || isBelow);

                    return (
                      <td
                        className={`px-2 py-2 text-[10px] sm:text-xs text-center relative ${
                          isCancelled
                            ? 'text-red-500 dark:text-red-400 line-through'
                            : isAbove
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 font-semibold'
                              : isBelow
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 font-semibold'
                                : 'text-gray-600 dark:text-gray-400'
                        }`}
                        title={flagged ? tooltip : ''}
                      >
                        {isAbove && !isCancelled && (
                          <span className="absolute top-0 right-0 text-[8px] text-yellow-600 dark:text-yellow-400">⚠</span>
                        )}
                        {isBelow && !isCancelled && (
                          <span className="absolute top-0 right-0 text-[8px] text-blue-500 dark:text-blue-400">↓</span>
                        )}
                        {value || '-'}
                      </td>
                    );
                  };

                  const recordId = record.id || (record as any)._id;

                  return (
                    <tr
                      key={recordId || `record-${index}`}
                      data-truck-number={record.truckNo}
                      data-record-id={recordId}
                      className={`cursor-pointer transition-colors ${
                        isCancelled 
                          ? 'hover:bg-red-100 dark:hover:bg-red-900/30' 
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => handleRowClick(record)}
                      title={isCancelled ? 'This fuel record has been cancelled' : 'Click to view full details'}
                    >
                      <td className={`px-1 py-2 text-[10px] sm:text-xs ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                        {actualIndex + 1}
                      </td>
                      <td className={`px-1 py-2 text-[10px] sm:text-xs ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{formatDateShort(record.date as string)}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs font-medium ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`} title={record.truckNo}>{record.truckNo}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs truncate ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`} title={record.goingDo}>{record.goingDo}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs truncate ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`} title={record.returnDo || 'N/A'}>
                        {isCancelled ? (
                          <span>{record.returnDo || '-'}</span>
                        ) : record.returnDo ? (
                          <span className="text-green-600 dark:text-green-400">{record.returnDo}</span>
                        ) : (
                          <span className="text-orange-500 dark:text-orange-400">-</span>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.start}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs truncate ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`} title={record.from}>
                        {record.from}
                      </td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs truncate ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`} title={record.to}>
                        {record.to}
                      </td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{(record.totalLts || 0).toLocaleString()}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.extra || '-'}</td>
                      {renderFuelCell('mmsaYard', record.mmsaYard)}
                      {renderFuelCell('tangaYard', record.tangaYard)}
                      {renderFuelCell('darYard', record.darYard)}
                      {renderFuelCell('tangaGoing', record.tangaGoing)}
                      {renderFuelCell('darGoing', record.darGoing)}
                      {renderFuelCell('moroGoing', record.moroGoing)}
                      {renderFuelCell('mbeyaGoing', record.mbeyaGoing)}
                      {renderFuelCell('tdmGoing', record.tdmGoing)}
                      {renderFuelCell('zambiaGoing', record.zambiaGoing)}
                      {renderFuelCell('congoFuel', record.congoFuel)}
                      {renderFuelCell('zambiaReturn', record.zambiaReturn)}
                      {renderFuelCell('tundumaReturn', record.tundumaReturn)}
                      {renderFuelCell('mbeyaReturn', record.mbeyaReturn)}
                      {renderFuelCell('moroReturn', record.moroReturn)}
                      {renderFuelCell('darReturn', record.darReturn)}
                      {renderFuelCell('tangaReturn', record.tangaReturn)}
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center font-semibold ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{record.balance.toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <div className="flex space-x-1 justify-center">
                          {!isCancelled && (
                            <>
                              <button
                                onClick={(e) => handleEdit(record, e)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" style={{ color: '#2563EB' }}
                                title="Edit"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  const id = record.id || (record as any)._id;
                                  if (id) handleCancel(id, e);
                                }}
                                className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                title="Cancel"
                              >
                                <XCircle className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          {isCancelled && canUncancel && (
                            <button
                              onClick={(e) => {
                                const id = record.id || (record as any)._id;
                                if (id) handleUncancel(id, e);
                              }}
                              className="text-green-700 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                              title="Uncancel"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
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
          </>
        )}
        
        {/* Pagination */}
        {!loading && totalItems > 0 && (
          <div className="p-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
              showItemsPerPage={true}
            />
          </div>
        )}
      </div>
        </>
      )}

      <FuelRecordForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
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

      <PendingDoFollowUpModal
        isOpen={showPendingDoModal}
        onClose={() => setShowPendingDoModal(false)}
        onSelectRecord={(id) => {
          setShowPendingDoModal(false);
          setSelectedRecordId(id);
          setIsDetailsModalOpen(true);
        }}
      />

      {showCreatePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Create pending {pendingCreateKind === 'going' ? 'going' : 'return'} DO
            </h3>
            {selectedMonth === getCurrentMonthKey() ? (
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setPendingCreateKind('going')}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-medium ${pendingCreateKind === 'going' ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
                >
                  Going (PG####)
                </button>
                <button
                  type="button"
                  onClick={() => setPendingCreateKind('return')}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-medium ${pendingCreateKind === 'return' ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
                >
                  Return (PR####)
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-3">
                Previous months: pending return (PR####) only. Switch to the current month to create a pending going DO.
              </p>
            )}
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Truck number</label>
            <input
              value={pendingCreateTruck}
              onChange={(e) => setPendingCreateTruck(formatTruckNumber(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm mb-4"
              placeholder="e.g. T123 ABC"
              autoFocus
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">
              {pendingCreateKind === 'going'
                ? 'Creates a temporary fuel record with from/to = TBA. Replaced when the real IMPORT DO is created.'
                : 'Attaches a temporary return DO to the truck’s going journey in this month. Replaced when the real EXPORT DO is linked.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePending(false)}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600"
                disabled={pendingCreateBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitPendingCreate}
                disabled={pendingCreateBusy}
                className="px-3 py-1.5 text-sm rounded bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
              >
                {pendingCreateBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConflictModal
        isOpen={!!conflictData}
        onClose={() => setConflictData(null)}
        onUseLatest={() => {
          setConflictData(null);
          handleCloseForm();
          queryClient.invalidateQueries({ queryKey: fuelRecordKeys.lists() });
        }}
        onRetry={async () => {
          if (conflictData) {
            const payload = {
              ...conflictData.pendingData,
            };
            const recordId =
              conflictData.currentRecord?.id ||
              (conflictData.currentRecord as any)?._id ||
              selectedRecord?.id ||
              (selectedRecord as any)?._id;
            try {
              if (!recordId) {
                toast.error('Unable to update fuel record (missing record id)');
                setConflictData(null);
                return;
              }
              await fuelRecordsAPI.update(recordId, payload);
              toast.success('Fuel record updated successfully');
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
      <ConfirmModal
        open={cancelPending !== null}
        title="Cancel Fuel Record"
        message="Are you sure you want to cancel this fuel record? This will mark it as cancelled."
        confirmLabel="Cancel Record"
        cancelLabel="Keep"
        variant="danger"
        loading={isActionLoading}
        onConfirm={executeCancel}
        onCancel={() => setCancelPending(null)}
      />
      <ConfirmModal
        open={uncancelPending !== null}
        title="Uncancel Fuel Record"
        message="Are you sure you want to uncancel this fuel record? This will restore it to active status."
        confirmLabel="Uncancel"
        cancelLabel="Dismiss"
        variant="warning"
        loading={isActionLoading}
        onConfirm={executeUncancel}
        onCancel={() => setUncancelPending(null)}
      />
    </div>
  );
};

export default FuelRecords;
