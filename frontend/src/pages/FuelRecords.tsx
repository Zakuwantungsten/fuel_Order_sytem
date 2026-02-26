import { useState, useEffect, useRef } from 'react';
import usePersistedState from '../hooks/usePersistedState';
import { useSearchParams } from 'react-router-dom';
import { Search, Plus, Download, Edit, Trash2, BarChart3, List, ChevronLeft, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { FuelRecord, LPOEntry } from '../types';
import { fuelRecordsAPI, lposAPI } from '../services/api';
import FuelRecordForm from '../components/FuelRecordForm';
import FuelAnalytics from '../components/FuelAnalytics';
import FuelRecordDetailsModal from '../components/FuelRecordDetailsModal';
import JourneyStatusBadge from '../components/JourneyStatusBadge';
import Pagination from '../components/Pagination';
import { exportToXLSXMultiSheet } from '../utils/csvParser';
import { subscribeToNotifications, unsubscribeFromNotifications } from '../services/websocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

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
  const [searchTerm, setSearchTerm] = usePersistedState('fr:searchTerm', '');
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [lpos, setLpos] = useState<LPOEntry[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FuelRecord | undefined>();
  const [routeFilter, setRouteFilter] = usePersistedState('fr:routeFilter', '');
  const [routeTypeFilter, setRouteTypeFilter] = usePersistedState<'IMPORT' | 'EXPORT'>('fr:routeTypeFilter', 'IMPORT');
  const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
  const [exportYear, setExportYear] = useState<number>(() => new Date().getFullYear());
  const [viewMode, setViewMode] = usePersistedState<'records' | 'analytics'>('fr:viewMode', 'records');
  
  // Details modal state
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | number | null>(null);
  
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
  
  const [searchParams] = useSearchParams();
  
  // Pagination state (server-side)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePersistedState('fr:itemsPerPage', 10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Available months and years for filters (fetched separately)
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  
  // Dropdown states
  const [showExportYearDropdown, setShowExportYearDropdown] = useState(false);
  const [showRouteTypeDropdown, setShowRouteTypeDropdown] = useState(false);
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  
  // Dropdown refs
  const exportYearDropdownRef = useRef<HTMLDivElement>(null);
  const routeTypeDropdownRef = useRef<HTMLDivElement>(null);
  const routeDropdownRef = useRef<HTMLDivElement>(null);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  
  // Ref and state to track highlight
  const highlightProcessedRef = useRef<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const [monthInitialized, setMonthInitialized] = useState(false);

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

  useEffect(() => {
    fetchLpos();
    fetchAvailableMonthsAndYears();
    // fetchRoutes will be called when monthInitialized becomes true
  }, []);
  
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
        window.history.replaceState({}, '', url.toString());
        setMonthInitialized(true);
      } else if (highlightId && highlightId !== highlightProcessedRef.current) {
        highlightProcessedRef.current = highlightId;
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
          
          // Find the record by truck number
          const recordIndex = allMonthRecords.findIndex(r => r.truckNo === pendingHighlight);
          
          if (recordIndex >= 0) {
            // Calculate which page this record is on
            const targetPage = Math.floor(recordIndex / itemsPerPage) + 1;
            // Navigate to the correct page if needed
            if (targetPage !== currentPage) {
              setCurrentPage(targetPage);
              // Wait for page change to complete and DOM to update
              setTimeout(() => {
                scrollToAndHighlight(pendingHighlight);
              }, 1200);
            } else {
              // Already on correct page
              setTimeout(() => {
                scrollToAndHighlight(pendingHighlight);
              }, 600);
            }
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
  
  // Helper function to scroll to and highlight a record
  const scrollToAndHighlight = (truckNo: string) => {
    // Find all elements with this truck number
    const allElements = document.querySelectorAll(`[data-truck-number="${truckNo}"]`);
    // Find visible element (mobile or desktop depending on screen size)
    const visibleElements = Array.from(allElements).filter(el => {
      return (el as HTMLElement).offsetParent !== null; // offsetParent is null for hidden elements
    });
    // Prefer visible element, fall back to first element
    let element = visibleElements[0] as HTMLElement;
    if (!element && allElements.length > 0) {
      element = allElements[0] as HTMLElement;
    }
    
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
    } else {
      clearHighlight();
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
    window.history.replaceState({}, '', url.toString());
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
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch records when pagination or filters change - but only after month is initialized
  useEffect(() => {
    if (monthInitialized) {
      fetchRecords();
    }
  }, [currentPage, itemsPerPage, searchTerm, routeFilter, selectedMonth, routeTypeFilter, monthInitialized]);

  // Remove client-side filtering useEffect - filtering now happens on server
  // useEffect(() => {
  //   filterRecords();
  // }, [searchTerm, routeFilter, records, selectedMonth, routeTypeFilter]);

  // Reset route filter and fetch routes when import/export type or month changes
  useEffect(() => {
    if (monthInitialized) {
      setRouteFilter('');
      fetchRoutes();
    }
  }, [routeTypeFilter, selectedMonth, monthInitialized]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, routeFilter, selectedMonth, routeTypeFilter]);

  // Subscribe to real-time yard fuel notifications to auto-refresh the table
  const fetchRecordsRef = useRef<() => void>();
  useEffect(() => {
    fetchRecordsRef.current = fetchRecords;
  });

  useEffect(() => {
    subscribeToNotifications((notification) => {
      if (notification.type === 'yard_fuel_recorded' || notification.type === 'truck_pending_linking') {
        // Yard fuel was recorded — refresh fuel records table
        fetchRecordsRef.current?.();
      }
    }, 'fuel-records');

    return () => {
      unsubscribeFromNotifications('fuel-records');
    };
  }, []);

  // Real-time sync: refresh when any user modifies fuel records or LPO entries
  useRealtimeSync(['fuel_records', 'lpo_entries'], () => {
    fetchRecordsRef.current?.();
  });

  const fetchRecords = async () => {
    try {
      setLoading(true);
      
      // Build filters for backend
      const filters: any = {
        page: currentPage,
        limit: itemsPerPage,
        sort: 'date',
        order: 'desc'
      };
      
      // Add search filter (searches truckNo, goingDo, returnDo)
      if (searchTerm) {
        filters.search = searchTerm;
      }
      
      // Add route filter - routeFilter now contains "FROM-TO" format
      if (routeFilter) {
        const [from, to] = routeFilter.split('-');
        if (routeTypeFilter === 'IMPORT') {
          // For IMPORT, filter by the destination
          filters.to = to;
        } else {
          // For EXPORT, filter by the origin (which is 'from' in the route key)
          filters.from = from;
        }
      }
      
      // Add month filter - backend expects 'month' field which contains "Month YYYY" format
      // Convert from "YYYY-MM" to "Month YYYY"
      if (selectedMonth) {
        const [year, monthNum] = selectedMonth.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        filters.month = `${monthName} ${year}`;
      }
      
      const response = await fuelRecordsAPI.getAll(filters);
      
      // Store all records for export purposes (we still need them)
      setRecords(response.data);
      
      // For server-side pagination, filtered records are same as fetched records
      setFilteredRecords(response.data);
      
      // Update pagination metadata from server
      if (response.pagination) {
        setTotalItems(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
      } else {
        // Fallback if no pagination (all data returned)
        setTotalItems(response.data.length);
        setTotalPages(Math.ceil(response.data.length / itemsPerPage));
      }
    } catch (error) {
      console.error('Error fetching fuel records:', error);
      setRecords([]);
      setFilteredRecords([]);
      setTotalItems(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchLpos = async () => {
    try {
      const response = await lposAPI.getAll({ limit: 10000 });
      // Extract data from new API response format
      setLpos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching LPOs:', error);
      setLpos([]);
    }
  };

  const fetchRoutes = async () => {
    try {
      // Build filters to fetch records for the selected month only
      const filters: any = { limit: 10000 };
      
      // Add month filter - only fetch routes from current month
      if (selectedMonth) {
        const [year, monthNum] = selectedMonth.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        filters.month = `${monthName} ${year}`;
      }
      
      const response = await fuelRecordsAPI.getAll(filters);
      const allRecords = response.data;
      
      // Extract unique routes with both from and to fields
      const routesMap = new Map<string, { from: string; to: string }>();
      
      allRecords.forEach(record => {
        if (routeTypeFilter === 'IMPORT') {
          // IMPORT = Going routes - use originalGoingFrom/To (preserved) or fallback to from/to
          // Only include records that have a goingDo (not empty/null)
          if (record.goingDo && record.goingDo.trim() !== '') {
            const goingFrom = record.originalGoingFrom || record.from;
            const goingTo = record.originalGoingTo || record.to;
            if (goingFrom && goingTo) {
              const routeKey = `${goingFrom}-${goingTo}`;
              routesMap.set(routeKey, { from: goingFrom, to: goingTo });
            }
          }
        } else {
          // EXPORT = Return routes - use current from/to (already updated for return direction)
          // Only include records that have a returnDo (not empty/null)
          // DO NOT reverse - the from/to fields already represent the return journey direction
          if (record.returnDo && record.returnDo.trim() !== '' && record.from && record.to) {
            const routeKey = `${record.from}-${record.to}`;
            routesMap.set(routeKey, { from: record.from, to: record.to });
          }
        }
      });
      
      // Convert to array and sort by the full route string
      const routes = Array.from(routesMap.values())
        .sort((a, b) => {
          const routeA = `${a.from} - ${a.to}`;
          const routeB = `${b.from} - ${b.to}`;
          return routeA.localeCompare(routeB);
        });
      
      setAvailableRoutes(routes);
    } catch (error) {
      console.error('Error fetching routes:', error);
      setAvailableRoutes([]);
    }
  };

  // filterRecords is no longer needed - filtering happens on server
  // Keeping it here commented out for reference
  // const filterRecords = () => { ... };
  
  // Server-side pagination - no need to slice, backend already returned the right page
  const paginatedRecords = filteredRecords;
  const startIndex = (currentPage - 1) * itemsPerPage;
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // fetchRecords will be called automatically via useEffect
    // Scroll to top of table when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing items per page
    // fetchRecords will be called automatically via useEffect with new limit
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
      if (selectedRecord) {
        const recordId = selectedRecord.id || (selectedRecord as any)._id;
        if (recordId) {
          await fuelRecordsAPI.update(recordId, data);
        }
      } else {
        await fuelRecordsAPI.create(data);
      }
      fetchRecords();
    } catch (error) {
      console.error('Error saving fuel record:', error);
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
        alert(`No records found for year ${year}`);
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
      columnWidths: [8, 10, 8, 8, 6, 8, 10, 8, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 10, 8, 8, 8, 8, 8],
      strikethroughCancelledRows: true,
    });
    } catch (error) {
      console.error('Error exporting fuel records:', error);
      alert('Failed to export fuel records. Please try again.');
    }
  };

  // Fetch available months and years for filters
  const fetchAvailableMonthsAndYears = async () => {
    try {
      // Fetch all records (high limit) to get months and years
      const response = await fuelRecordsAPI.getAll({ limit: 10000 });
      const allRecords = response.data;
      
      const months = new Set<string>();
      const years = new Set<number>();
      
      allRecords.forEach(record => {
        const date = parseRecordDate(record.date as string);
        if (!date) return;
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthKey);
        years.add(date.getFullYear());
      });
      
      const sortedMonths = Array.from(months).sort();
      const sortedYears = Array.from(years).sort().reverse(); // Most recent first
      
      setAvailableMonths(sortedMonths);
      setAvailableYears(sortedYears);
    } catch (error) {
      console.error('Error fetching available months/years:', error);
    }
  };
  
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

  const goToPreviousMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      // Jump directly to the previous available month (skip empty months)
      setSelectedMonth(availableMonths[currentIndex - 1]);
    } else if (currentIndex === -1) {
      // Not in list — find nearest available month before this one
      const before = availableMonths.filter(m => m < selectedMonth);
      if (before.length > 0) setSelectedMonth(before[before.length - 1]);
    }
  };

  const goToNextMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex >= 0 && currentIndex < availableMonths.length - 1) {
      // Jump directly to the next available month (skip empty months)
      setSelectedMonth(availableMonths[currentIndex + 1]);
    } else if (currentIndex === -1) {
      // Not in list — find nearest available month after this one
      const after = availableMonths.filter(m => m > selectedMonth);
      if (after.length > 0) setSelectedMonth(after[0]);
    }
  };
  
  // Check if previous/next available month exists
  const canGoToPreviousMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return false;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) return true;
    if (currentIndex === -1) return availableMonths.some(m => m < selectedMonth);
    return false;
  };
  
  const canGoToNextMonth = () => {
    if (!selectedMonth || availableMonths.length === 0) return false;
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex >= 0 && currentIndex < availableMonths.length - 1) return true;
    if (currentIndex === -1) return availableMonths.some(m => m > selectedMonth);
    return false;
  };

  const getMonthName = (monthKey: string) => {
    return new Date(monthKey + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Get available years from state
  const getAvailableYears = (): number[] => {
    return availableYears.length > 0 ? availableYears : [new Date().getFullYear()];
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
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2 sm:gap-3">
          {/* View Toggle */}
          <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('records')}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium inline-flex items-center ${
                viewMode === 'records'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <List className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Records</span>
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium border-l dark:border-gray-600 inline-flex items-center ${
                viewMode === 'analytics'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Analytics</span>
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
                        exportYear === year ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
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
            onClick={handleCreate}
            className="inline-flex items-center px-2 sm:px-4 py-1.5 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by Truck, DO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm"
            />
          </div>
          <div className="relative" ref={routeTypeDropdownRef}>
            <button
              type="button"
              onClick={() => setShowRouteTypeDropdown(!showRouteTypeDropdown)}
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left text-sm flex items-center justify-between"
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
                    routeTypeFilter === 'IMPORT' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
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
                    routeTypeFilter === 'EXPORT' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
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
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left text-sm flex items-center justify-between"
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
                    !routeFilter ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
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
                        routeFilter === routeKey ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
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
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPreviousMonth}
              disabled={!canGoToPreviousMonth()}
              className={`p-2 rounded-md transition-colors ${
                canGoToPreviousMonth()
                  ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              title={canGoToPreviousMonth() ? "Previous Month" : "No earlier records"}
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="relative" ref={monthDropdownRef}>
              <button
                type="button"
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm flex items-center gap-2 min-w-[120px]"
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
                        selectedMonth === month ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
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
              className={`p-2 rounded-md transition-colors ${
                canGoToNextMonth()
                  ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              title={canGoToNextMonth() ? "Next Month" : "No later records"}
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
            Total Records: <span className="ml-2 font-semibold">{totalItems}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg transition-colors">
        {loading ? (
          <div className="text-center py-8 sm:py-12 text-gray-500 dark:text-gray-400">
            <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm sm:text-base">Loading fuel records...</p>
          </div>
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
                        </div>
                        <p className={`text-xs ${isCancelled ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {formatDateShort(record.date as string)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${
                          isCancelled
                            ? 'text-red-500 dark:text-red-400 line-through'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}>
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
                        <div className={`px-2 py-1 text-xs rounded ${
                          isCancelled
                            ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        }`}>
                          Dar: {record.darYard}L
                        </div>
                      )}
                      {record.tangaYard && (
                        <div className={`px-2 py-1 text-xs rounded ${
                          isCancelled
                            ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                            : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                        }`}>
                          Tanga: {record.tangaYard}L
                        </div>
                      )}
                      {record.mbeyaGoing && (
                        <div className={`px-2 py-1 text-xs rounded ${
                          isCancelled
                            ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                        }`}>
                          Mbeya: {record.mbeyaGoing}L
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isCancelled && (
                      <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <button
                          onClick={(e) => handleEdit(record, e)}
                          className="flex-1 px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 inline-flex items-center justify-center"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            const id = record.id || (record as any)._id;
                            if (id) handleDelete(id, e);
                          }}
                          className="flex-1 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
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
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-800">
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
                  <td colSpan={26} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    Loading data...
                  </td>
                </tr>
              ) : totalItems === 0 ? (
                <tr>
                  <td colSpan={26} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {selectedMonth ? `No fuel records found for ${getMonthName(selectedMonth)}` : 'No fuel records found'}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record, index) => {
                  // Check if record is cancelled
                  const isCancelled = record.isCancelled === true;
                  const actualIndex = startIndex + index; // Calculate actual index across all pages
                  
                  // Helper to render fuel cell with highlighting for extra fuel
                  const renderFuelCell = (field: string, value: number | undefined) => {
                    const hasExtraFuel = isExtraFuel(field, value);
                    const extraAmount = hasExtraFuel ? getExtraAmount(field, value) : 0;
                    
                    return (
                      <td 
                        className={`px-2 py-2 text-[10px] sm:text-xs text-center ${
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
                      data-truck-number={record.truckNo}
                      className={`cursor-pointer transition-colors ${
                        isCancelled 
                          ? 'hover:bg-red-100 dark:hover:bg-red-900/30' 
                          : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
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
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.mmsaYard || '-'}</td>
                      {renderFuelCell('tangaYard', record.tangaYard)}
                      {renderFuelCell('darYard', record.darYard)}
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.darGoing || '-'}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.moroGoing || '-'}</td>
                      {renderFuelCell('mbeyaGoing', record.mbeyaGoing)}
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.tdmGoing || '-'}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.zambiaGoing || '-'}</td>
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.congoFuel || '-'}</td>
                      {renderFuelCell('zambiaReturn', record.zambiaReturn)}
                      {renderFuelCell('tundumaReturn', record.tundumaReturn)}
                      {renderFuelCell('mbeyaReturn', record.mbeyaReturn)}
                      {renderFuelCell('moroReturn', record.moroReturn)}
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-400'}`}>{record.darReturn || '-'}</td>
                      {renderFuelCell('tangaReturn', record.tangaReturn)}
                      <td className={`px-2 py-2 text-[10px] sm:text-xs text-center font-semibold ${isCancelled ? 'text-red-500 dark:text-red-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{record.balance.toLocaleString()}</td>
                      <td className="px-2 py-2">
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
