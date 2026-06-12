import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  ArrowRight,
  Loader,
  X,
  Truck,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { BarChart, Bar, LabelList, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardAPI, deliveryOrdersAPI, lposAPI, fuelRecordsAPI } from '../services/api';
import { useJourneyConfig } from '../hooks/useJourneyConfig';
import { FuelRecord } from '../types';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useAuth } from '../contexts/AuthContext';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';

// Colors for charts — aligned with design system palette
const CHART_COLORS = ['#2563EB', '#16A34A', '#F97316', '#8B5CF6', '#0891B2', '#EC4899'];

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

const DEFAULT_CHART_DATA = { monthlyFuel: [], doTrends: [], stationDistribution: [], journeyStatus: [] };

const Dashboard = ({ onNavigate }: DashboardProps = {}) => {
  const navigate = useNavigate();
  const { isDark } = useAuth();
  const queryClient = useQueryClient();

  const { data: stats = null, isLoading: loading, error: statsError } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardAPI.getStats(),
    staleTime: 2 * 60 * 1000,
  });
  const error: string | null = statsError ? 'Failed to load dashboard data' : null;

  const { data: chartData = DEFAULT_CHART_DATA } = useQuery({
    queryKey: ['dashboard-chart-data'],
    queryFn: () => dashboardAPI.getChartData().then(d => d ?? DEFAULT_CHART_DATA),
    staleTime: 2 * 60 * 1000,
    placeholderData: DEFAULT_CHART_DATA,
  });
  
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

  const [searchConfig, setSearchConfig] = useState({
    doMonths: 4,
    doMaxResults: 6,
    lpoMonths: 1,
    lpoMaxResults: 50,
    fuelMaxResults: 3,
  });

  const { data: journeyConfig } = useJourneyConfig();
  useEffect(() => {
    if (journeyConfig?.searchConfig) setSearchConfig((prev) => ({ ...prev, ...journeyConfig.searchConfig }));
  }, [journeyConfig]);

  // Persist search state to sessionStorage whenever it changes
  useEffect(() => {
    try { sessionStorage.setItem('dashboard_search_query', searchQuery); } catch {}
  }, [searchQuery]);

  useEffect(() => {
    try { sessionStorage.setItem('dashboard_search_results', JSON.stringify(searchResults)); } catch {}
  }, [searchResults]);

  // Debounced realtime refresh — a burst of N changes (e.g. bulk DO create)
  // triggers one invalidation instead of N parallel refetches.
  const statsRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeSync(['fuel_records', 'delivery_orders', 'lpo_summaries', 'yard_fuel'], () => {
    if (statsRefreshTimer.current) clearTimeout(statsRefreshTimer.current);
    statsRefreshTimer.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-chart-data'] });
    }, 2500);
  });
  useEffect(() => () => {
    if (statsRefreshTimer.current) clearTimeout(statsRefreshTimer.current);
  }, []);

  // Unified search functionality
  const performUnifiedSearch = async (queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) {
      setSearchResults({ dos: [], lpos: [], fuels: [] });
      return;
    }
    
    setSearching(true);
    
    try {
      // Calculate date restrictions from config
      const doFromDate = new Date();
      doFromDate.setMonth(doFromDate.getMonth() - searchConfig.doMonths);

      const lpoFromDate = new Date();
      lpoFromDate.setMonth(lpoFromDate.getMonth() - searchConfig.lpoMonths);

      const today = new Date();

      // Search all three types in parallel using configurable limits
      const [dosResponse, lposResponse, fuelsResponse] = await Promise.all([
        deliveryOrdersAPI.getAll({
          search: query,
          dateFrom: doFromDate.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
          limit: searchConfig.doMaxResults,
          sortBy: 'date',
          sortOrder: 'desc'
        }).catch((err) => {
          console.error('DO search error:', err);
          return { data: [] };
        }),

        lposAPI.getAll({
          search: query,
          dateFrom: lpoFromDate.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
          limit: searchConfig.lpoMaxResults
        }).catch((err) => {
          console.error('LPO search error:', err);
          return { data: [] };
        }),

        fuelRecordsAPI.getAll({
          search: query,
          limit: searchConfig.fuelMaxResults,
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

  if (!stats) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-300">{error || 'No data available'}</p>
      </div>
    );
  }

  const TrendBadge = ({ pct, onCard }: { pct: number | null | undefined; onCard?: boolean }) => {
    if (pct === null || pct === undefined) {
      return (
        <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={onCard ? { background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.80)' } : undefined}
          {...(!onCard && { className: 'inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700/50' })}>
          —
        </span>
      );
    }
    const isUp = pct >= 0;
    const Icon = isUp ? ChevronUp : ChevronDown;
    if (onCard) {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff' }}>
          <Icon className="w-3 h-3" />
          {isUp ? '+' : ''}{pct}%
        </span>
      );
    }
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
      bg: '#2563EB',
    },
    {
      name: 'Fuel Records',
      value: stats.totalFuelRecords.toLocaleString(),
      sub: `${stats.totalLiters.toLocaleString()} L dispensed`,
      trend: stats.trends?.fuelRecords,
      icon: Fuel,
      bg: '#16A34A',
    },
    {
      name: 'LPO Entries',
      value: stats.totalLPOs.toLocaleString(),
      sub: stats.pendingYardFuel ? `${stats.pendingYardFuel} yard pending` : 'none pending',
      trend: stats.trends?.lpos,
      icon: ClipboardList,
      bg: '#0891B2',
    },
    {
      name: 'Tonnage (Month)',
      value: stats.totalTonnage.toLocaleString(),
      sub: `Ksh ${stats.totalRevenue.toLocaleString()} revenue`,
      trend: stats.trends?.tonnage,
      icon: TrendingUp,
      bg: '#EA580C',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Fuel Order Dashboard</h1>
          <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => { queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }); queryClient.invalidateQueries({ queryKey: ['dashboard-chart-data'] }); }}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-white rounded-lg transition-colors"
          style={{ background: '#2563EB', width: 'fit-content', alignSelf: 'center', flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#1D4ED8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#2563EB')}
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
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:border-transparent dashboard-search-input" style={{ '--tw-ring-color': '#2563EB', paddingLeft: '2.5rem', height: '34px' } as React.CSSProperties}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Loader className="w-4 h-4 animate-spin" style={{ color: '#2563EB' }} />
            </div>
          )}
        </div>
        {hasResults ? (
          <button
            onClick={handleClearSearch}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap dashboard-search-btn"
            style={{ height: '34px', width: 'fit-content', flexShrink: 0 }}
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        ) : (
          <button
            onClick={() => performUnifiedSearch()}
            disabled={!searchQuery.trim() || searching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap dashboard-search-btn"
            style={{ height: '34px', width: 'fit-content', flexShrink: 0 }}
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
                <ClipboardList className="w-4 h-4" style={{ color: '#0891B2' }} />
                <h3 className="text-sm font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
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
                    className="p-2 rounded-md cursor-pointer transition-all hover:shadow-sm"
                    style={{ background: isDark ? 'rgba(8,145,178,0.15)' : '#E0F2FE', border: `1px solid ${isDark ? 'rgba(8,145,178,0.3)' : '#BAE6FD'}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(8,145,178,0.25)' : '#BAE6FD')}
                    onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(8,145,178,0.15)' : '#E0F2FE')}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className="w-2.5 h-2.5 flex-shrink-0" style={{ color: '#0891B2' }} />
                          <p className="text-[10px] font-semibold truncate" style={{ color: '#0891B2' }}>{result.month}</p>
                        </div>
                        <p className="text-xs font-medium truncate" style={{ color: isDark ? '#E2E8F0' : '#0F172A' }}>{result.primaryText}</p>
                        <p className="text-[10px] mt-0.5 truncate" style={{ color: '#64748B' }}>{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#0891B2' }} />
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
            className="rounded-xl transition-all"
            style={{
              background: `linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.08) 100%), ${stat.bg}`,
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.10)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.08)')}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: 'rgba(255,255,255,0.65)', letterSpacing: '0.07em' }}>
                    {stat.name}
                  </p>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <p className="text-2xl font-bold leading-none text-white">
                      {stat.value}
                    </p>
                    <TrendBadge pct={stat.trend} onCard />
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{stat.sub}</p>
                </div>
                <div className="p-2 rounded-lg flex-shrink-0" style={{ background: 'rgba(255,255,255,0.18)' }}>
                  <stat.icon className="w-4 h-4 text-white" />
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
          style={{ color: isDark ? '#93C5FD' : '#1D4ED8', background: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF', border: `1px solid ${isDark ? 'rgba(37,99,235,0.3)' : '#BFDBFE'}` }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.25)' : '#DBEAFE')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF')}
        >
          <Plus className="w-3 h-3" /> New DO
        </button>
        <button
          onClick={() => handleQuickAction('bulk-create')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
          style={{ color: isDark ? '#93C5FD' : '#1D4ED8', background: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF', border: `1px solid ${isDark ? 'rgba(37,99,235,0.3)' : '#BFDBFE'}` }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.25)' : '#DBEAFE')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF')}
        >
          <Package className="w-3 h-3" /> Bulk DO
        </button>
        <button
          onClick={() => handleQuickAction('create-lpo')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
          style={{ color: isDark ? '#67E8F9' : '#0369A1', background: isDark ? 'rgba(8,145,178,0.15)' : '#E0F2FE', border: `1px solid ${isDark ? 'rgba(8,145,178,0.3)' : '#BAE6FD'}` }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(8,145,178,0.25)' : '#BAE6FD')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(8,145,178,0.15)' : '#E0F2FE')}
        >
          <Plus className="w-3 h-3" /> New LPO
        </button>
        <button
          onClick={() => handleQuickAction('create-fuel')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
          style={{ color: isDark ? '#86EFAC' : '#15803D', background: isDark ? 'rgba(22,163,74,0.15)' : '#DCFCE7', border: `1px solid ${isDark ? 'rgba(22,163,74,0.3)' : '#BBF7D0'}` }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(22,163,74,0.25)' : '#BBF7D0')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(22,163,74,0.15)' : '#DCFCE7')}
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
                <Bar dataKey="value" fill="#2563EB" radius={[4, 4, 0, 0]}>
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
                <Line type="monotone" dataKey="count" stroke="#16A34A" strokeWidth={3} dot={{ fill: '#16A34A', r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* Station-wise LPO Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4" style={{ color: '#0891B2' }} />
            <h3 className="text-base font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Station LPO Distribution</h3>
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
            <button onClick={() => onNavigate?.('do')} className="text-xs transition-colors" style={{ color: '#2563EB' }} onMouseEnter={e => (e.currentTarget.style.color = '#1D4ED8')} onMouseLeave={e => (e.currentTarget.style.color = '#2563EB')}>View all →</button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {stats.recentActivities?.deliveryOrders && stats.recentActivities.deliveryOrders.length > 0 ? (
              stats.recentActivities.deliveryOrders.slice(0, 5).map((DO: any, i: number) => (
                <div
                  key={DO._id || DO.id || DO.doNumber || `do-${i}`}
                  className="py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded px-1 -mx-1 transition-colors"
                  onClick={() => {
                    const rawDate = DO.createdAt || DO.date;
                    const doDate = rawDate ? new Date(rawDate) : null;
                    const year = doDate && !isNaN(doDate.getTime()) ? doDate.getFullYear() : null;
                    const month = doDate && !isNaN(doDate.getTime()) ? doDate.getMonth() + 1 : null;
                    const params = year && month ? `highlight=${DO.doNumber}&year=${year}&month=${month}` : `highlight=${DO.doNumber}`;
                    onNavigate ? onNavigate('do', params) : navigate(`/do?${params}`);
                  }}
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
              <ClipboardList className="w-4 h-4" style={{ color: '#0891B2' }} />
              <h3 className="text-sm font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>Recent LPOs</h3>
            </div>
            <button onClick={() => onNavigate?.('lpo')} className="text-xs transition-colors" style={{ color: '#2563EB' }} onMouseEnter={e => (e.currentTarget.style.color = '#1D4ED8')} onMouseLeave={e => (e.currentTarget.style.color = '#2563EB')}>View all →</button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {stats.recentActivities?.lpoEntries && stats.recentActivities.lpoEntries.length > 0 ? (
              stats.recentActivities.lpoEntries.slice(0, 5).map((lpo: any, i: number) => (
                <div
                  key={lpo._id || lpo.id || lpo.lpoNo || `lpo-${i}`}
                  className="py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded px-1 -mx-1 transition-colors"
                  onClick={() => {
                    const rawDate = lpo.actualDate || lpo.createdAt;
                    const lpoDate = rawDate ? new Date(rawDate) : null;
                    const year = lpoDate && !isNaN(lpoDate.getTime()) ? lpoDate.getFullYear() : null;
                    const month = lpoDate && !isNaN(lpoDate.getTime()) ? lpoDate.getMonth() + 1 : null;
                    const params = year && month ? `highlight=${lpo.lpoNo}&year=${year}&month=${month}` : `highlight=${lpo.lpoNo}`;
                    onNavigate ? onNavigate('lpo', params) : navigate(`/lpo?${params}`);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate" style={{ color: '#0891B2' }}>{lpo.lpoNo}</span>
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
