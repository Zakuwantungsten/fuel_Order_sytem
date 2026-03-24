import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  FileText, 
  Fuel, 
  ClipboardList, 
  TrendingUp,
  ChevronUp,
  ChevronDown,
  Activity,
  Calendar,
  Package,
  Plus,
  BarChart3,
  AlertCircle,
  ArrowRight,
  Loader,
  X,
  Truck,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { BarChart, Bar, LabelList, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardAPI, deliveryOrdersAPI, lposAPI, fuelRecordsAPI } from '../services/api';
import { DashboardStats, FuelRecord } from '../types';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';

// Colors for charts
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface SearchResult {
  id: string;
  type: 'do' | 'lpo' | 'fuel';
  month: string;
  primaryText: string;
  secondaryText: string;
  metadata: any;
}

interface DashboardProps {
  onNavigate?: (tab: string, highlight?: string) => void;
}

const Dashboard = ({ onNavigate }: DashboardProps = {}) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Unified search states — persisted in sessionStorage so results survive tab navigation
  const [searchQuery, setSearchQuery] = useState<string>(() => {
    try { return sessionStorage.getItem('dashboard_search_query') || ''; } catch { return ''; }
  });
  const [searchResults, setSearchResults] = useState<{
    dos: SearchResult[];
    lpos: SearchResult[];
    fuels: SearchResult[];
  }>(() => {
    try {
      const saved = sessionStorage.getItem('dashboard_search_results');
      return saved ? JSON.parse(saved) : { dos: [], lpos: [], fuels: [] };
    } catch { return { dos: [], lpos: [], fuels: [] }; }
  });
  const [searching, setSearching] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Persist search state to sessionStorage whenever it changes
  useEffect(() => {
    try { sessionStorage.setItem('dashboard_search_query', searchQuery); } catch {}
  }, [searchQuery]);

  useEffect(() => {
    try { sessionStorage.setItem('dashboard_search_results', JSON.stringify(searchResults)); } catch {}
  }, [searchResults]);

  // Chart data
  const [chartData, setChartData] = useState<any>({
    monthlyFuel: [],
    doTrends: [],
    stationDistribution: [],
    journeyStatus: []
  });

  useEffect(() => {
    fetchStats();
    fetchChartData();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getStats();
      setStats(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch dashboard stats:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      // Fetch chart data from backend with proper date filtering
      const data = await dashboardAPI.getChartData();
      console.log('Chart data received:', data);
      if (data) {
        setChartData({
          monthlyFuel: data.monthlyFuel || [],
          doTrends: data.doTrends || [],
          stationDistribution: data.stationDistribution || [],
          journeyStatus: data.journeyStatus || []
        });
      }
    } catch (err) {
      console.error('Failed to fetch chart data:', err);
      // Set empty arrays to avoid undefined errors
      setChartData({
        monthlyFuel: [],
        doTrends: [],
        stationDistribution: [],
        journeyStatus: []
      });
    }
  };

  useRealtimeSync(['fuel_records', 'delivery_orders', 'lpo_entries', 'yard_fuel'], () => {
    fetchStats();
    fetchChartData();
  });

  // Unified search functionality
  const performUnifiedSearch = async (queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) {
      setSearchResults({ dos: [], lpos: [], fuels: [] });
      return;
    }
    
    setSearching(true);
    
    try {
      // Calculate date restrictions
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      
      const today = new Date();

      console.log('Search params:', {
        query,
        today: today.toISOString().split('T')[0],
        oneMonthAgo: oneMonthAgo.toISOString().split('T')[0],
        fourMonthsAgo: fourMonthsAgo.toISOString().split('T')[0]
      });

      // Search all three types in parallel
      // DOs: Last 4 months, get 6 most recent | LPOs: Last 30 days, get up to 50 | Fuel Records: No date limit, get 3 most recent
      const [dosResponse, lposResponse, fuelsResponse] = await Promise.all([
        deliveryOrdersAPI.getAll({ 
          search: query,
          dateFrom: fourMonthsAgo.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
          limit: 6,
          sortBy: 'date',
          sortOrder: 'desc'
        }).catch((err) => {
          console.error('DO search error:', err);
          return { data: [] };
        }),
        
        lposAPI.getAll({ 
          search: query,
          dateFrom: oneMonthAgo.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
          limit: 50
        }).catch((err) => {
          console.error('LPO search error:', err);
          return { data: [] };
        }),
        
        fuelRecordsAPI.getAll({ 
          search: query,
          limit: 3,
          sortBy: 'date',
          sortOrder: 'desc'
        }).catch((err) => {
          console.error('Fuel search error:', err);
          return { data: [] };
        })
      ]);

      console.log('Raw API responses:', {
        dosResponse,
        lposResponse,
        fuelsResponse
      });

      // Log detailed LPO response structure
      console.log('LPO Response Details:', {
        fullResponse: lposResponse,
        dataField: lposResponse.data,
        dataType: typeof lposResponse.data,
        isArray: Array.isArray(lposResponse.data),
        pagination: (lposResponse as any).pagination
      });

      // API functions return { data: Array, pagination?: ... } structure directly
      const dosData = dosResponse.data || [];
      const lposData = lposResponse.data || [];
      const fuelsData = fuelsResponse.data || [];

      console.log('Extracted data arrays:', {
        dos: dosData.length,
        lpos: lposData.length,
        fuels: fuelsData.length
      });

      console.log('Sample data:', { lpo: lposData[0], do: dosData[0], fuel: fuelsData[0] });

      // Process DO results - backend already filtered, no client-side filtering needed
      const dosResults: SearchResult[] = dosData
        .map((DO: any, index: number) => {
          const importExportLabel = DO.importOrExport === 'IMPORT' ? '📥 Import' : '📤 Export';
          return {
            id: `do-${DO._id || DO.id || index}`,
            type: 'do' as const,
            month: new Date(DO.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            primaryText: `${DO.doNumber} - ${DO.to || DO.destination || 'N/A'}`,
            secondaryText: `${importExportLabel} | ${DO.truckNo} | ${DO.tonnages} tons | ${DO.haulier}`,
            metadata: DO
          };
        });

      // Process LPO results - Backend filtered by actualDate (actual LPO date)
      // Display the actualDate if available, otherwise parse date field + createdAt year
      const lposResults: SearchResult[] = lposData
        .map((lpo: any, index: number) => {
          let displayDate = 'Unknown Date';
          
          // Prefer actualDate if available
          if (lpo.actualDate) {
            const lpoDate = new Date(lpo.actualDate);
            displayDate = lpoDate.toLocaleDateString('en-US', { 
              day: 'numeric',
              month: 'long', 
              year: 'numeric' 
            });
          } else if (lpo.date && lpo.createdAt) {
            // Fallback: Parse the 'date' field (e.g., "14-Dec") and combine with year from createdAt
            try {
              const createdYear = new Date(lpo.createdAt).getFullYear();
              const dateParts = lpo.date.split('-');
              if (dateParts.length >= 2) {
                const day = dateParts[0];
                let monthName = dateParts[1];
                
                // If month is a number, convert to name
                if (!isNaN(parseInt(monthName))) {
                  const monthNum = parseInt(monthName, 10);
                  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                    'July', 'August', 'September', 'October', 'November', 'December'];
                  monthName = monthNames[monthNum - 1] || monthName;
                }
                
                displayDate = `${day} ${monthName} ${createdYear}`;
              }
            } catch (e) {
              // Fallback to createdAt if parsing fails
              const lpoDate = new Date(lpo.createdAt);
              displayDate = lpoDate.toLocaleDateString('en-US', { 
                day: 'numeric',
                month: 'long', 
                year: 'numeric' 
              });
            }
          } else if (lpo.createdAt) {
            // Final fallback to createdAt
            const lpoDate = new Date(lpo.createdAt);
            displayDate = lpoDate.toLocaleDateString('en-US', { 
              day: 'numeric',
              month: 'long', 
              year: 'numeric' 
            });
          }
          
          return {
            id: `lpo-${lpo._id || lpo.id || index}`,
            type: 'lpo' as const,
            month: displayDate,
            primaryText: `${lpo.lpoNo} - ${lpo.dieselAt}`,
            secondaryText: `${lpo.truckNo} | ${lpo.ltrs}L | ${lpo.doSdo}`,
            metadata: lpo
          };
        });

      // Process Fuel Records results
      const fuelsResults: SearchResult[] = fuelsData
        .map((fuel: FuelRecord, index: number) => ({
          id: `fuel-${fuel._id || fuel.id || index}`,
          type: 'fuel' as const,
          month: new Date(fuel.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          primaryText: `${fuel.truckNo} | ${fuel.goingDo} → ${fuel.to || 'N/A'}`,
          secondaryText: `${fuel.totalLts}L | Status: ${fuel.journeyStatus}`,
          metadata: fuel
        }));

      console.log('Processed results:', {
        dos: dosResults.length,
        lpos: lposResults.length,
        fuels: fuelsResults.length
      });

      setSearchResults({ 
        dos: dosResults, 
        lpos: lposResults, 
        fuels: fuelsResults 
      });
    } catch (err) {
      console.error('Failed to perform unified search:', err);
      setSearchResults({ dos: [], lpos: [], fuels: [] });
    } finally {
      setSearching(false);
    }
  };

  // Clear search query and results, also wipes sessionStorage
  const handleClearSearch = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setSearchQuery('');
    setSearchResults({ dos: [], lpos: [], fuels: [] });
    try {
      sessionStorage.removeItem('dashboard_search_query');
      sessionStorage.removeItem('dashboard_search_results');
    } catch {}
  };

  // Handle search input — debounce auto-search as the user types
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    if (!value.trim()) {
      setSearchResults({ dos: [], lpos: [], fuels: [] });
      return;
    }
    
    debounceTimerRef.current = setTimeout(() => {
      performUnifiedSearch(value);
    }, 300);
  };

  const hasResults = searchResults.dos.length > 0 || searchResults.lpos.length > 0 || searchResults.fuels.length > 0;

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle search result click
  const handleResultClick = (result: SearchResult) => {
    if (onNavigate) {
      // Use tab-based navigation for EnhancedDashboard
      if (result.type === 'do') {
        // For DOs, pass DO number, year, and month
        const doDate = new Date(result.metadata.date);
        const year = doDate.getFullYear();
        const month = doDate.getMonth() + 1; // 1-indexed
        onNavigate('do', `highlight=${result.metadata.doNumber}&year=${year}&month=${month}`);
      } else if (result.type === 'lpo') {
        // For LPOs, use the parsed timestamp from metadata
        const lpoDate = result.metadata._parsedDate;
        if (lpoDate) {
          const year = lpoDate.getFullYear();
          const month = lpoDate.getMonth() + 1; // 1-indexed
          onNavigate('lpo', `highlight=${result.metadata.lpoNo}&year=${year}&month=${month}`);
        } else {
          onNavigate('lpo', `highlight=${result.metadata.lpoNo}`);
        }
      } else if (result.type === 'fuel') {
        // For fuel records, pass truck number, year, and month
        const fuelDate = new Date(result.metadata.date);
        const year = fuelDate.getFullYear();
        const month = fuelDate.getMonth() + 1; // 1-indexed
        onNavigate('fuel_records', `highlight=${result.metadata.truckNo}&year=${year}&month=${month}`);
      }
    } else {
      // Fallback to route-based navigation
      if (result.type === 'do') {
        const doDate = new Date(result.metadata.date);
        const year = doDate.getFullYear();
        const month = doDate.getMonth() + 1;
        navigate(`/do?highlight=${result.metadata.doNumber}&year=${year}&month=${month}`);
      } else if (result.type === 'lpo') {
        // Use the parsed timestamp from metadata
        const lpoDate = result.metadata._parsedDate;
        if (lpoDate) {
          const year = lpoDate.getFullYear();
          const month = lpoDate.getMonth() + 1;
          navigate(`/lpo?highlight=${result.metadata.lpoNo}&year=${year}&month=${month}`);
        } else {
          navigate(`/lpo?highlight=${result.metadata.lpoNo}`);
        }
      } else if (result.type === 'fuel') {
        const fuelDate = new Date(result.metadata.date);
        const year = fuelDate.getFullYear();
        const month = fuelDate.getMonth() + 1;
        navigate(`/fuel-records?highlight=${result.metadata.truckNo}&year=${year}&month=${month}`);
      }
    }
  };

  // Quick actions
  const handleQuickAction = (action: string) => {
    if (onNavigate) {
      // Use tab-based navigation with action parameter
      switch (action) {
        case 'create-do':
          onNavigate('do', 'action=create-do');
          break;
        case 'bulk-create':
          onNavigate('do', 'action=bulk-create');
          break;
        case 'create-lpo':
          onNavigate('lpo', 'action=create-lpo');
          break;
        case 'create-fuel':
          onNavigate('fuel_records', 'action=create-fuel');
          break;
      }
    } else {
      // Fallback to route-based navigation
      switch (action) {
        case 'create-do':
          navigate('/do?action=create');
          break;
        case 'bulk-create':
          navigate('/do?action=bulk');
          break;
        case 'create-lpo':
          navigate('/lpo?action=create');
          break;
        case 'create-fuel':
          navigate('/fuel-records?action=create');
          break;
      }
    }
  };

  if (loading) {
    return <UnifiedTabLoader label="Loading dashboard..." />;
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-300">{error || 'No data available'}</p>
      </div>
    );
  }

  const TrendBadge = ({ pct }: { pct: number | null | undefined }) => {
    if (pct === null || pct === undefined) {
      return (
        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700/50">
          —
        </span>
      );
    }
    const isUp = pct >= 0;
    const Icon = isUp ? ChevronUp : ChevronDown;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        isUp
          ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
          : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
      }`}>
        <Icon className="w-3 h-3" />
        {isUp ? '+' : ''}{pct}%
      </span>
    );
  };

  const statsCards = [
    {
      name: 'Delivery Orders',
      value: stats.totalDOs.toLocaleString(),
      sub: `${stats.activeTrips} active trip${stats.activeTrips !== 1 ? 's' : ''}`,
      trend: stats.trends?.dos,
      icon: FileText,
      borderColor: 'border-l-blue-500',
      iconBg: 'bg-blue-50 dark:bg-blue-900/20',
      iconColor: '#3b82f6',
    },
    {
      name: 'Fuel Records',
      value: stats.totalFuelRecords.toLocaleString(),
      sub: `${stats.totalLiters.toLocaleString()} L dispensed`,
      trend: stats.trends?.fuelRecords,
      icon: Fuel,
      borderColor: 'border-l-green-500',
      iconBg: 'bg-green-50 dark:bg-green-900/20',
      iconColor: '#10b981',
    },
    {
      name: 'LPO Entries',
      value: stats.totalLPOs.toLocaleString(),
      sub: stats.pendingYardFuel ? `${stats.pendingYardFuel} yard pending` : 'none pending',
      trend: stats.trends?.lpos,
      icon: ClipboardList,
      borderColor: 'border-l-purple-500',
      iconBg: 'bg-purple-50 dark:bg-purple-900/20',
      iconColor: '#8b5cf6',
    },
    {
      name: 'Tonnage (Month)',
      value: stats.totalTonnage.toLocaleString(),
      sub: `Ksh ${stats.totalRevenue.toLocaleString()} revenue`,
      trend: stats.trends?.tonnage,
      icon: TrendingUp,
      borderColor: 'border-l-orange-500',
      iconBg: 'bg-orange-50 dark:bg-orange-900/20',
      iconColor: '#f59e0b',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Fuel Order Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Activity className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search DO, LPO, or Truck..."
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performUnifiedSearch(searchQuery)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Loader className="w-4 h-4 animate-spin text-indigo-600" />
            </div>
          )}
        </div>
        {hasResults ? (
          <button
            onClick={handleClearSearch}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        ) : (
          <button
            onClick={performUnifiedSearch}
            disabled={!searchQuery.trim() || searching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <Search className="w-3.5 h-3.5" />
            Search
          </button>
        )}
      </div>

      {/* Search Results */}
      {(searchResults.dos.length > 0 || searchResults.lpos.length > 0 || searchResults.fuels.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          {/* Delivery Orders Results */}
          {searchResults.dos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Delivery Orders
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({searchResults.dos.length} found)
                  </span>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {searchResults.dos.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                          <p className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 truncate">{result.month}</p>
                        </div>
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{result.primaryText}</p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LPO Results */}
          {searchResults.lpos.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  LPOs
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({searchResults.lpos.length} found)
                  </span>
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto">
                {searchResults.lpos.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className="w-2.5 h-2.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                          <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 truncate">{result.month}</p>
                        </div>
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{result.primaryText}</p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fuel Records Results */}
          {searchResults.fuels.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Fuel className="w-4 h-4 text-green-600 dark:text-green-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Fuel Records
                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                    ({searchResults.fuels.length} found)
                  </span>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                {searchResults.fuels.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-all hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className="w-2.5 h-2.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                          <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 truncate">{result.month}</p>
                        </div>
                        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{result.primaryText}</p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Results Message */}
      {searchQuery && !searching && 
       searchResults.dos.length === 0 && 
       searchResults.lpos.length === 0 && 
       searchResults.fuels.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-5 text-center">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No results found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Try searching with DO number, LPO number, or Truck number
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statsCards.map((stat) => (
          <div
            key={stat.name}
            className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${stat.borderColor} hover:shadow-md transition-shadow`}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
                    {stat.name}
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 leading-none">
                      {stat.value}
                    </p>
                    <TrendBadge pct={stat.trend} />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{stat.sub}</p>
                </div>
                <div className={`${stat.iconBg} p-2 rounded-lg flex-shrink-0`}>
                  <stat.icon className="w-4 h-4" style={{ color: stat.iconColor }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mr-1">Quick:</span>
        <button
          onClick={() => handleQuickAction('create-do')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <Plus className="w-3 h-3" /> New DO
        </button>
        <button
          onClick={() => handleQuickAction('bulk-create')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
        >
          <Package className="w-3 h-3" /> Bulk DO
        </button>
        <button
          onClick={() => handleQuickAction('create-lpo')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
        >
          <Plus className="w-3 h-3" /> New LPO
        </button>
        <button
          onClick={() => handleQuickAction('create-fuel')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-full hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
        >
          <Plus className="w-3 h-3" /> Fuel Record
        </button>
      </div>

      {/* Charts & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Fuel Consumption */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Monthly Fuel Consumption</h3>
          </div>
          {chartData.monthlyFuel.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={[...chartData.monthlyFuel].sort((a: any, b: any) => {
                  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                  return months.indexOf(a.month) - months.indexOf(b.month);
                })}
                margin={{ top: 18, right: 8, bottom: 0, left: -16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(v: any) => [`${Number(v).toLocaleString()} L`, 'Fuel']}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#6b7280' }} formatter={(v: any) => v > 0 ? Number(v).toLocaleString() : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* DO Creation Trends */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">DO Creation Trends</h3>
          </div>
          {chartData.doTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData.doTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* Station-wise LPO Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Station LPO Distribution</h3>
          </div>
          {chartData.stationDistribution.length > 0 ? (() => {
            const total = chartData.stationDistribution.reduce((s: number, d: any) => s + d.value, 0);
            return (
              <div className="space-y-3">
                {[...chartData.stationDistribution]
                  .sort((a: any, b: any) => b.value - a.value)
                  .map((station: any, i: number) => {
                    const pct = total > 0 ? Math.round((station.value / total) * 100) : 0;
                    return (
                      <div key={station.name}>
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 font-medium">
                            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            {station.name}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">
                            {station.value.toLocaleString()} L
                            <span className="text-gray-400 dark:text-gray-500 ml-1">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right pt-1">Total: {total.toLocaleString()} L</p>
              </div>
            );
          })() : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data available</div>
          )}
        </div>

        {/* Journey Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Journey Status</h3>
          </div>
          {chartData.journeyStatus.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {chartData.journeyStatus.map((status: any, i: number) => (
                <div key={status.name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">{status.name}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{status.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data available</div>
          )}
        </div>
      </div>

      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attention / Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Attention</h3>
          </div>
          <div className="space-y-2">
            <div className={`flex items-center justify-between p-2.5 rounded-lg ${
              stats.activeTrips > 0
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800'
                : 'bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700'
            }`}>
              <div className="flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Active Trips</span>
              </div>
              <span className={`text-sm font-bold ${
                stats.activeTrips > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'
              }`}>{stats.activeTrips}</span>
            </div>
            <div className={`flex items-center justify-between p-2.5 rounded-lg ${
              stats.pendingYardFuel && stats.pendingYardFuel > 0
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800'
                : 'bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-700'
            }`}>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Pending Yard Fuel</span>
              </div>
              <span className={`text-sm font-bold ${
                stats.pendingYardFuel && stats.pendingYardFuel > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
              }`}>{stats.pendingYardFuel || 0}</span>
            </div>
            {stats.yardFuelSummary && (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 px-1 pt-1">Yard Dispensed</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'MMSA', value: stats.yardFuelSummary.mmsa },
                    { label: 'Tanga', value: stats.yardFuelSummary.tanga },
                    { label: 'DAR', value: stats.yardFuelSummary.dar },
                  ].map(y => (
                    <div key={y.label} className="p-2 bg-gray-50 dark:bg-gray-900/30 rounded-lg text-center border border-gray-100 dark:border-gray-700">
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{y.label}</p>
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{y.value.toLocaleString()}L</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {stats.activeTrips === 0 && (!stats.pendingYardFuel || stats.pendingYardFuel === 0) && (
              <div className="flex items-center gap-2 p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                <span className="text-xs font-medium text-green-700 dark:text-green-300">All systems clear</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Delivery Orders */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent DOs</h3>
            </div>
            <button onClick={() => onNavigate?.('do')} className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">View all →</button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {stats.recentActivities?.deliveryOrders && stats.recentActivities.deliveryOrders.length > 0 ? (
              stats.recentActivities.deliveryOrders.slice(0, 5).map((DO: any) => (
                <div
                  key={DO._id || DO.id}
                  className="py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded px-1 -mx-1 transition-colors"
                  onClick={() => onNavigate ? onNavigate('do', `highlight=${DO.doNumber}`) : navigate(`/do?highlight=${DO.doNumber}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 truncate">{DO.doNumber}</span>
                    {DO.date && <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{new Date(DO.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                    <Truck className="w-3 h-3 flex-shrink-0" />
                    <span className="font-medium truncate">{DO.truckNo}</span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="truncate">{DO.from} → {DO.to}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {DO.tonnages && <span className="text-[10px] text-gray-500 dark:text-gray-400">{DO.tonnages}t</span>}
                    {DO.haulier && <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{DO.haulier}</span>}
                    {DO.importOrExport && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        DO.importOrExport === 'IMPORT'
                          ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                      }`}>{DO.importOrExport}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-400 text-xs py-6">No recent DOs</p>
            )}
          </div>
        </div>

        {/* Recent LPOs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent LPOs</h3>
            </div>
            <button onClick={() => onNavigate?.('lpo')} className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">View all →</button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {stats.recentActivities?.lpoEntries && stats.recentActivities.lpoEntries.length > 0 ? (
              stats.recentActivities.lpoEntries.slice(0, 5).map((lpo: any) => (
                <div
                  key={lpo._id || lpo.id}
                  className="py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded px-1 -mx-1 transition-colors"
                  onClick={() => onNavigate ? onNavigate('lpo', `highlight=${lpo.lpoNo}`) : navigate(`/lpo?highlight=${lpo.lpoNo}`)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 truncate">{lpo.lpoNo}</span>
                    {lpo.ltrs != null && <span className="text-[10px] font-bold text-green-600 dark:text-green-400 flex-shrink-0">{Number(lpo.ltrs).toLocaleString()} L</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-600 dark:text-gray-400">
                    <Truck className="w-3 h-3 flex-shrink-0" />
                    <span className="font-medium truncate">{lpo.truckNo}</span>
                    <span className="text-gray-300 dark:text-gray-600">•</span>
                    <span className="truncate">{lpo.dieselAt}</span>
                  </div>
                  {lpo.doSdo && <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400 truncate">DO: {lpo.doSdo}</p>}
                </div>
              ))
            ) : (
              <p className="text-center text-gray-400 text-xs py-6">No recent LPOs</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
