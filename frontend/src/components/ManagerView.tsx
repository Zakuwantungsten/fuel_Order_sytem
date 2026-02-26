import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Search, 
  Filter, 
  Calendar, 
  Fuel, 
  FileText, 
  Truck,
  MapPin,
  DollarSign,
  RefreshCw,
  Download,
  Eye,
  Building2,
  TrendingUp,
  AlertCircle,
  X,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  LogOut,
  Wifi,
  WifiOff,
  Check,
  Key,
  User
} from 'lucide-react';
import { lposAPI } from '../services/api';
import { LPOEntry } from '../types';
import { useAuth } from '../contexts/AuthContext';
import Pagination from './Pagination';
import ChangePasswordModal from './ChangePasswordModal';
import NotificationBell from './NotificationBell';
import { subscribeToNotifications, unsubscribeFromNotifications } from '../services/websocket';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

import XLSX from 'xlsx-js-style';

// All valid fuel stations (excluding CASH)
const ALL_STATIONS = [
  'INFINITY',
  'LAKE CHILABOMBWE',
  'LAKE NDOLA',
  'LAKE KAPIRI',
  'LAKE KITWE',
  'LAKE KABANGWA',
  'LAKE CHINGOLA',
  'LAKE TUNDUMA',
  'GBP MOROGORO',
  'GBP KANGE',
  'GPB KANGE',
];

// Stations excluded for super manager (Tanzania, GBP stations, and Infinity)
const EXCLUDED_STATIONS_SUPER = [
  'LAKE TUNDUMA',
  'GBP MOROGORO',
  'GBP KANGE',
  'GPB KANGE',
  'INFINITY'
];

// Station manager to station mapping
const STATION_MAPPING: Record<string, string> = {
  'infinity': 'INFINITY',
  'chilabombwe': 'LAKE CHILABOMBWE', 
  'ndola': 'LAKE NDOLA',
  'kapiri': 'LAKE KAPIRI',
  'kitwe': 'LAKE KITWE',
  'kabangwa': 'LAKE KABANGWA',
  'chingola': 'LAKE CHINGOLA',
  'tunduma': 'LAKE TUNDUMA',
  'morogoro': 'GBP MOROGORO',
  'kange': 'GBP KANGE',
};

interface ManagerViewProps {
  user: {
    id: string;
    username: string;
    role: string;
    station?: string;
    firstName?: string;
    lastName?: string;
  };
}

interface LPODisplayEntry extends LPOEntry {
  formattedDate: string;
  totalAmount: number;
}

export function ManagerView({ user }: ManagerViewProps) {
  const [lpoEntries, setLpoEntries] = useState<LPODisplayEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('all');
  const [sortField, setSortField] = useState<'date' | 'lpoNo' | 'ltrs' | 'station'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LPODisplayEntry | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Custom dropdown states
  const [showStationDropdown, setShowStationDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const stationDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Password change states
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  const { toggleTheme, isDark, logout } = useAuth();

  // Determine if user is super manager or station manager
  // super_manager role can see multiple stations (all Zambian LAKE stations)
  // station_manager and manager roles can only see their assigned station
  const isSuperManager = user.role === 'super_manager';
  
  // Get the station for station managers
  const userStation = useMemo(() => {
    if (isSuperManager) return null;
    if (user.station) return user.station.toUpperCase();
    const usernameKey = user.username.toLowerCase().replace('manager_', '').replace('mgr_', '');
    return STATION_MAPPING[usernameKey] || null;
  }, [user, isSuperManager]);

  // Get available stations for filtering
  const availableStations = useMemo(() => {
    if (isSuperManager) {
      return ALL_STATIONS.filter(s => !EXCLUDED_STATIONS_SUPER.includes(s));
    }
    return userStation ? [userStation] : [];
  }, [isSuperManager, userStation]);

  // Calculate date range (rolling 30 days)
  const dateRange = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return {
      from: thirtyDaysAgo,
      to: today,
      fromFormatted: thirtyDaysAgo.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      toFormatted: today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    };
  }, []);

  // Parse date string
  const parseEntryDate = useCallback((dateStr: string, year: number = new Date().getFullYear()): Date => {
    const parts = dateStr.split('-');
    if (parts.length !== 2) return new Date(0);
    
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1];
    const monthMap: Record<string, number> = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    const month = monthMap[monthStr.toLowerCase()] ?? 0;
    
    return new Date(year, month, day);
  }, []);

  // Fetch LPO entries (with optional silent refresh for real-time updates)
  const fetchLPOEntries = useCallback(async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    
    try {
      const currentYear = new Date().getFullYear();
      // Fetch all LPOs without date filters - LPO dates are in "dd-mmm" format (e.g., "13-Jan")
      // which doesn't work with backend's ISO date string comparison.
      // Frontend filtering handles date ranges properly.
      const response = await lposAPI.getAll({ limit: 10000 });
      const entries = response.data;
      
      const processedEntries: LPODisplayEntry[] = entries
        .map((entry: LPOEntry) => {
          const entryDate = parseEntryDate(entry.date, currentYear);
          return {
            ...entry,
            formattedDate: entry.date,
            totalAmount: entry.ltrs * entry.pricePerLtr,
            _parsedDate: entryDate,
          };
        })
        .filter((entry: LPODisplayEntry & { _parsedDate: Date }) => {
          const isInDateRange = entry._parsedDate >= dateRange.from && entry._parsedDate <= dateRange.to;
          const station = entry.dieselAt?.toUpperCase()?.trim();
          
          if (station === 'CASH') return false;
          if (isSuperManager && EXCLUDED_STATIONS_SUPER.includes(station)) return false;
          if (!isSuperManager && userStation && station !== userStation) return false;
          
          return isInDateRange;
        })
        .map(({ _parsedDate, ...rest }: any) => rest as LPODisplayEntry);
      
      setLpoEntries(processedEntries);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Error fetching LPO entries:', err);
      if (!silent) {
        setError(err.message || 'Failed to fetch LPO data');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  }, [dateRange, userStation, isSuperManager, parseEntryDate]);

  // Click-outside detection for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Online/Offline status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial fetch and WebSocket real-time updates
  useEffect(() => {
    // Initial data fetch
    fetchLPOEntries();
    
    // Subscribe to LPO creation notifications.
    // The WebSocket is a shared singleton already initialised by App/NotificationBell;
    // we just register our own named subscription here — do NOT call
    // initializeWebSocket() again or disconnectWebSocket() on cleanup.
    subscribeToNotifications((notification) => {
      console.log('[ManagerView] Received real-time notification:', notification);
      
      // If it's an LPO notification, refresh the list immediately
      if (notification.type === 'lpo_created') {
        console.log('[ManagerView] LPO created - refreshing data...');
        fetchLPOEntries(true); // Silent refresh
      }
    }, 'manager');
    
    return () => {
      unsubscribeFromNotifications('manager');
    };
  }, [fetchLPOEntries]);

  useRealtimeSync('lpo_entries', () => fetchLPOEntries(true));

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setShowStationDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    let filtered = lpoEntries;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.truckNo?.toLowerCase().includes(term) ||
        entry.lpoNo?.toLowerCase().includes(term) ||
        entry.doSdo?.toLowerCase().includes(term) ||
        entry.dieselAt?.toLowerCase().includes(term) ||
        entry.destinations?.toLowerCase().includes(term)
      );
    }
    
    if (isSuperManager && selectedStation !== 'all') {
      filtered = filtered.filter(entry => 
        entry.dieselAt?.toUpperCase() === selectedStation.toUpperCase()
      );
    }
    
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          const dateA = parseEntryDate(a.date);
          const dateB = parseEntryDate(b.date);
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'lpoNo':
          comparison = (a.lpoNo || '').localeCompare(b.lpoNo || '');
          break;
        case 'ltrs':
          comparison = (a.ltrs || 0) - (b.ltrs || 0);
          break;
        case 'station':
          comparison = (a.dieselAt || '').localeCompare(b.dieselAt || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [lpoEntries, searchTerm, selectedStation, sortField, sortDirection, isSuperManager]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice(
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

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedStation, sortField, sortDirection]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalLPOs = filteredEntries.length;
    const uniqueLPONos = new Set(filteredEntries.map(e => e.lpoNo)).size;
    const totalLiters = filteredEntries.reduce((sum, e) => sum + (e.ltrs || 0), 0);
    const totalAmount = filteredEntries.reduce((sum, e) => sum + e.totalAmount, 0);
    const uniqueTrucks = new Set(filteredEntries.map(e => e.truckNo)).size;
    
    const byStation: Record<string, { count: number; liters: number; amount: number }> = {};
    filteredEntries.forEach(entry => {
      const station = entry.dieselAt || 'Unknown';
      if (!byStation[station]) {
        byStation[station] = { count: 0, liters: 0, amount: 0 };
      }
      byStation[station].count++;
      byStation[station].liters += entry.ltrs || 0;
      byStation[station].amount += entry.totalAmount;
    });
    
    return { totalLPOs, uniqueLPONos, totalLiters, totalAmount, uniqueTrucks, byStation };
  }, [filteredEntries]);

  // Export to Excel
  const handleExport = () => {
    const exportData = filteredEntries.map((entry, index) => ({
      'S/No.': index + 1,
      'Date': entry.date,
      'LPO No.': entry.lpoNo,
      'Diesel @': entry.dieselAt,
      'DO/SDI': entry.doSdo,
      'Truck No.': entry.truckNo,
      'Ltrs': entry.ltrs,
      'Price per Ltr': entry.pricePerLtr,
      'Destinations': entry.destinations,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LPO Summary');
    
    const filename = isSuperManager 
      ? `LPO_Summary_All_Stations.xlsx`
      : `LPO_Summary_${userStation}.xlsx`;
    
    XLSX.writeFile(wb, filename.replace(/\s+/g, '_'));
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="w-10 h-10 animate-spin text-indigo-600 dark:text-indigo-400" />
          <p className="text-gray-600 dark:text-gray-400 text-lg">Loading LPO data...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors">
        <div className="flex flex-col items-center space-y-4 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 dark:text-red-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Error Loading Data</h2>
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => fetchLPOEntries()}
            className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors overflow-x-hidden">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-3 sm:px-4 py-3">
          <div className="flex flex-row items-center justify-between">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              {isSuperManager ? 'All Stations' : userStation || 'Station'}
            </h1>
            <div className="flex items-center gap-2">
              <NotificationBell
                onNotificationClick={(notification) => {
                  if (notification.type === 'lpo_created' && notification.metadata?.lpoNo) {
                    const lpoEntry = lpoEntries.find(e => e.lpoNo === notification.metadata?.lpoNo);
                    if (lpoEntry) {
                      setSelectedEntry(lpoEntry);
                    }
                  }
                }}
              />
              <button
                onClick={toggleTheme}
                className="p-1.5 sm:p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                {isDark ? <Sun className="w-4 h-4 sm:w-5 sm:h-5" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="p-1.5 sm:p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <User className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-[100]" onClick={() => setShowProfileMenu(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-[110]">
                      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Signed in as</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.firstName} {user.lastName}</p>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowChangePassword(true);
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Key className="w-4 h-4 mr-3" />
                        Change Password
                      </button>
                      <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          logout();
                        }}
                        className="w-full flex items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <LogOut className="w-4 h-4 mr-3" />
                        Sign Out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-20 overflow-x-hidden">
        {/* Stats Grid - Responsive grid that wraps on mobile */}
        <div className="px-3 sm:px-4 py-3 sm:py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
            {/* Total Entries */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Entries</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.totalLPOs}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            {/* Unique LPOs */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">LPOs</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.uniqueLPONos}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </div>

            {/* Total Liters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Liters</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">{stats.totalLiters.toLocaleString()}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <Fuel className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            {/* Unique Trucks */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Trucks</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">{stats.uniqueTrucks}</p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600 dark:text-yellow-400" />
                </div>
              </div>
            </div>

            {/* Total Value */}
            <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 border border-gray-100 dark:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Value</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    ${(stats.totalAmount / 1000).toFixed(1)}k
                  </p>
                </div>
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center flex-shrink-0 ml-2">
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="px-3 sm:px-6 pb-3 sm:pb-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 p-3 sm:p-4 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0 relative">
                  <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search by truck number, LPO, or DO..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-10 py-3 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {isSuperManager && (
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex-shrink-0 p-3 rounded-lg border-2 transition-all ${
                      showFilters || selectedStation !== 'all'
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-500 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                    title="Filter by station"
                  >
                    <Filter className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Station Filter Dropdown */}
              {isSuperManager && showFilters && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <label htmlFor="station-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Filter by Station</label>
                  <div className="relative" ref={stationDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowStationDropdown(!showStationDropdown)}
                      className="w-full px-4 py-3 pr-10 border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      <span className="truncate font-medium">{selectedStation === 'all' ? 'All Stations' : selectedStation}</span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showStationDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {/* Custom Dropdown Menu */}
                    {showStationDropdown && (
                      <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto left-0 right-0">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStation('all');
                            setShowStationDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            selectedStation === 'all' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>All Stations</span>
                          {selectedStation === 'all' && <Check className="w-5 h-5" />}
                        </button>
                        {availableStations.map(station => (
                          <button
                            key={station}
                            type="button"
                            onClick={() => {
                              setSelectedStation(station);
                              setShowStationDropdown(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                              selectedStation === station ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            <span>{station}</span>
                            {selectedStation === station && <Check className="w-5 h-5" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Station Breakdown (Super Manager - collapsible on mobile) */}
        {isSuperManager && Object.keys(stats.byStation).length > 0 && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden transition-colors">
              <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                  <Building2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 text-gray-400" />
                  Station Breakdown
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {Object.keys(stats.byStation).length} stations
                </span>
              </div>
              <div className="p-2 sm:p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
                {Object.entries(stats.byStation)
                  .sort((a, b) => b[1].liters - a[1].liters)
                  .map(([station, data]) => (
                    <button 
                      key={station}
                      onClick={() => setSelectedStation(selectedStation === station ? 'all' : station)}
                      className={`p-2 sm:p-3 rounded-lg text-left transition-all ${
                        selectedStation === station
                          ? 'bg-indigo-100 dark:bg-indigo-900/40 border-2 border-indigo-300 dark:border-indigo-600'
                          : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                        {station.replace('LAKE ', '')}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {data.count}
                        </span>
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          {data.liters.toLocaleString()}L
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Results Count */}
        <div className="px-3 sm:px-4 pb-2 flex items-center justify-between">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
            {selectedStation !== 'all' && (
              <button
                onClick={() => setSelectedStation('all')}
                className="ml-2 text-indigo-600 dark:text-indigo-400 hover:underline text-xs"
              >
                Clear
              </button>
            )}
          </p>
          {/* Sort options for mobile - always visible */}
          <div className="relative" ref={sortDropdownRef}>
            <button
              type="button"
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="text-xs sm:text-sm px-2 py-1 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center gap-1"
            >
              <span>
                {sortField === 'date' && sortDirection === 'desc' ? 'Newest' :
                 sortField === 'date' && sortDirection === 'asc' ? 'Oldest' :
                 sortField === 'ltrs' && sortDirection === 'desc' ? 'Most L' :
                 sortField === 'ltrs' && sortDirection === 'asc' ? 'Least L' :
                 sortField === 'lpoNo' && sortDirection === 'asc' ? 'LPO ↑' :
                 'LPO ↓'}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>
            {showSortDropdown && (
              <div className="absolute z-50 mt-1 right-0 min-w-[120px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
                {[
                  {value: 'date-desc', label: 'Newest'},
                  {value: 'date-asc', label: 'Oldest'},
                  {value: 'ltrs-desc', label: 'Most L'},
                  {value: 'ltrs-asc', label: 'Least L'},
                  {value: 'lpoNo-asc', label: 'LPO ↑'},
                  {value: 'lpoNo-desc', label: 'LPO ↓'}
                ].map((option) => {
                  const currentValue = `${sortField}-${sortDirection}`;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const [field, dir] = option.value.split('-');
                        setSortField(field as typeof sortField);
                        setSortDirection(dir as 'asc' | 'desc');
                        setShowSortDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs sm:text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-between"
                    >
                      <span>{option.label}</span>
                      {currentValue === option.value && <Check className="w-3 h-3 text-primary-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Empty State */}
        {filteredEntries.length === 0 && (
          <div className="px-3 sm:px-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 sm:p-8 text-center transition-colors">
              <FileText className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2 sm:mb-3" />
              <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">No LPO entries found</p>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-2 text-indigo-600 dark:text-indigo-400 text-xs sm:text-sm hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        )}

        {/* Card View - Mobile/Tablet (below lg) */}
        {filteredEntries.length > 0 && (
          <div className="lg:hidden px-3 sm:px-4 space-y-2 sm:space-y-3">
            {
            paginatedEntries.map((entry, index) => (
              <button
                key={entry.id || `${entry.lpoNo}-${index}`}
                onClick={() => setSelectedEntry(entry)}
                className="w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 sm:p-4 text-left transition-all hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-1 sm:gap-2">
                      <span className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {entry.lpoNo}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {entry.date}
                      </span>
                    </div>
                    <div className="flex items-center mt-1 text-xs sm:text-sm text-gray-900 dark:text-gray-100">
                      <Truck className="w-3 h-3 sm:w-4 sm:h-4 mr-1 text-gray-400 flex-shrink-0" />
                      <span className="font-medium truncate">{entry.truckNo}</span>
                    </div>
                    <div className="flex items-center mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                      <span className="truncate">{entry.dieselAt}</span>
                    </div>
                  </div>
                  <div className="text-right ml-2 sm:ml-3 flex-shrink-0">
                    <div className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">
                      {entry.ltrs}L
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      @{entry.pricePerLtr}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 mt-1 ml-auto" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Table View - Desktop/Laptop (lg and up) */}
        {filteredEntries.length > 0 && (
          <div className="hidden lg:block px-3 sm:px-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        LPO No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Truck No.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Station
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Liters
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Price/L
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Total Amount
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedEntries.map((entry, index) => (
                      <tr key={entry.id || `${entry.lpoNo}-${index}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                            {entry.lpoNo}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {entry.date}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <Truck className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {entry.truckNo}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-900 dark:text-gray-100">
                              {entry.dieselAt}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end">
                            <Fuel className="w-4 h-4 mr-1 text-green-500 dark:text-green-400" />
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {entry.ltrs}L
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {entry.pricePerLtr}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end">
                            <DollarSign className="w-4 h-4 mr-1 text-gray-400" />
                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                              {entry.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {filteredEntries.length > 0 && (
          <div className="px-3 sm:px-4 pb-24 lg:pb-28">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredEntries.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </div>
          </div>
        )}

        {/* Summary Footer - Fixed at bottom */}
        {filteredEntries.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2 sm:py-3 shadow-lg z-30">
            <div className="flex items-center justify-around text-center max-w-lg mx-auto">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Liters</p>
                <p className="text-base sm:text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  {stats.totalLiters.toLocaleString()}L
                </p>
              </div>
              <div className="h-6 sm:h-8 w-px bg-gray-200 dark:bg-gray-700" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Est. Value</p>
                <p className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">
                  ${stats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </p>
              </div>
              <div className="h-6 sm:h-8 w-px bg-gray-200 dark:bg-gray-700" />
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Entries</p>
                <p className="text-base sm:text-lg font-bold text-purple-600 dark:text-purple-400">
                  {filteredEntries.length}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Entry Detail Modal (Mobile) */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div 
            className="absolute inset-0 bg-black/50 dark:bg-black/70"
            onClick={() => setSelectedEntry(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                LPO Details
              </h3>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* LPO Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">LPO Number</p>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {selectedEntry.lpoNo}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Date</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {selectedEntry.date}
                  </p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <Truck className="w-3 h-3 mr-1" /> Truck No.
                  </p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-1">
                    {selectedEntry.truckNo}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">DO/SDI</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-1">
                    {selectedEntry.doSdo}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                    <MapPin className="w-3 h-3 mr-1" /> Station
                  </p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-1">
                    {selectedEntry.dieselAt}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Destination</p>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-1">
                    {selectedEntry.destinations}
                  </p>
                </div>
              </div>

              {/* Fuel Info */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-100 dark:border-green-800/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-green-600 dark:text-green-400">Liters</p>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                      {selectedEntry.ltrs}L
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-600 dark:text-green-400">Rate per Ltr</p>
                    <p className="text-xl font-semibold text-green-700 dark:text-green-300">
                      {selectedEntry.pricePerLtr}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 dark:text-green-400">Total Amount</span>
                    <span className="text-xl font-bold text-green-700 dark:text-green-300">
                      ${selectedEntry.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info Note */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800/50">
                <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  This is a read-only view. Contact admin for any changes.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            setSuccessMessage('Password changed successfully!');
            setTimeout(() => setSuccessMessage(''), 3000);
          }}
        />
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-3">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage('')} className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default ManagerView;
