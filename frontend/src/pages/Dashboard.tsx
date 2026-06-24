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
  RefreshCw,
  MapPin,
  Route,
  Weight,
  BellRing,
  DollarSign,
} from 'lucide-react';
import { BarChart, Bar, LabelList, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  isCancelled: boolean;
  metadata: any;
}

interface DashboardProps {
  onNavigate?: (tab: string, highlight?: string) => void;
}

const DEFAULT_CHART_DATA = { monthlyFuel: [], doTrends: [], lpoTrends: [], tonnageTrends: [], stationDistribution: [], journeyStatus: [], stationPrices: [], fuelPriceTrend: [] };

// ── Design tokens (matched to Fuel Dashboard design) ──────────────────────
const CARD =
  'bg-white dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/60 rounded-2xl ' +
  'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_10px_26px_-16px_rgba(15,23,42,0.18)]';

type Tone = 'blue' | 'green' | 'cyan' | 'orange' | 'indigo';

const TONE_CHIP: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  green: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
  cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
  indigo: 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300',
};

const TONE_STROKE: Record<Tone, string> = {
  blue: '#2563eb', green: '#16a34a', cyan: '#0891b2', orange: '#ea580c', indigo: '#0284c7',
};

// Fuel-cost card: format a price-per-litre for display by currency.
const fmtNum = (v: number, currency: string) =>
  currency === 'USD' ? `$${v.toFixed(2)}` : Math.round(v).toLocaleString();

// Tiny sparkline derived from a real numeric series (no fabricated data).
const Sparkline = ({ series, color }: { series: number[]; color: string }) => {
  if (!series || series.length < 2) return null;
  const w = 200, h = 30;
  const max = Math.max(...series), min = Math.min(...series);
  const span = max - min || 1;
  const pts = series.map((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - 4 - ((v - min) / span) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[30px] mt-3 block">
      <polygon points={`${pts.join(' ')} ${w},${h} 0,${h}`} fill={color} opacity={0.07} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// Journey-status tile theming, matched by status name.
const JOURNEY_CAT = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n.includes('active')) return { tile: 'bg-blue-50/70 dark:bg-blue-900/15 border-blue-100 dark:border-blue-800/50', dot: 'bg-blue-500 shadow-[0_0_0_4px_rgba(37,99,235,0.14)]' };
  if (n.includes('complet')) return { tile: 'bg-emerald-50/70 dark:bg-emerald-900/15 border-emerald-100 dark:border-emerald-800/50', dot: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(22,163,74,0.14)]' };
  if (n.includes('pend')) return { tile: 'bg-amber-50/70 dark:bg-amber-900/15 border-amber-100 dark:border-amber-800/50', dot: 'bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.16)]' };
  if (n.includes('cancel')) return { tile: 'bg-red-50/70 dark:bg-red-900/15 border-red-100 dark:border-red-800/50', dot: 'bg-red-500 shadow-[0_0_0_4px_rgba(220,38,38,0.14)]' };
  return { tile: 'bg-primary-50/70 dark:bg-primary-900/15 border-primary-100 dark:border-primary-800/50', dot: 'bg-primary-500 shadow-[0_0_0_4px_rgba(2,132,199,0.14)]' };
};

// Quick-action pill used in the dashboard toolbar.
const QuickPill = ({ onClick, icon: Icon, label, tone }: { onClick: () => void; icon: any; label: string; tone: 'indigo' | 'cyan' | 'green' }) => {
  const tones = {
    indigo: 'bg-primary-50 text-primary-700 border-primary-100 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-800/50',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800/50',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50',
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border text-[12.5px] font-bold transition hover:shadow-sm ${tones[tone]}`}>
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  );
};

const Dashboard = ({ onNavigate }: DashboardProps = {}) => {
  const navigate = useNavigate();
  const { isDark } = useAuth();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-chart-data'] });
  };

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
  useRealtimeSync(['fuel_records', 'delivery_orders', 'lpo_summaries', 'yard_fuel', 'fuel_stations'], () => {
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
      // Format a Date as a local "YYYY-MM-DD" string. Using toISOString() here
      // would convert to UTC and, for timezones ahead of UTC (e.g. EAT/UTC+3),
      // shift the day backward in the early hours — dropping today's records
      // from the date-windowed search even though they exist.
      const toLocalDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
          dateFrom: toLocalDateStr(doFromDate),
          dateTo: toLocalDateStr(today),
          limit: searchConfig.doMaxResults,
          sortBy: 'date',
          sortOrder: 'desc'
        }).catch((err) => {
          console.error('DO search error:', err);
          return { data: [] };
        }),

        lposAPI.getAll({
          search: query,
          dateFrom: toLocalDateStr(lpoFromDate),
          dateTo: toLocalDateStr(today),
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
            isCancelled: DO.isCancelled === true,
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
            isCancelled: lpo.isCancelled === true,
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
          isCancelled: (fuel as any).isCancelled === true,
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
        // For fuel records, highlight by the unique record id — a truck can have
        // many fuel records (different DOs) in a month, so highlighting by truckNo
        // would land on the wrong row (e.g. an active DO instead of the searched one).
        const fuelDate = new Date(result.metadata.date);
        const year = fuelDate.getFullYear();
        const month = fuelDate.getMonth() + 1; // 1-indexed
        const recordId = result.metadata._id || result.metadata.id;
        onNavigate('fuel_records', `highlight=${recordId}&year=${year}&month=${month}`);
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
        const recordId = result.metadata._id || result.metadata.id;
        navigate(`/fuel-records?highlight=${recordId}&year=${year}&month=${month}`);
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

  const TrendBadge = ({ pct }: { pct?: number | null }) => {
    if (pct === null || pct === undefined) {
      return (
        <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full text-gray-400 bg-gray-100 dark:text-gray-500 dark:bg-gray-700/50">
          —
        </span>
      );
    }
    const isUp = pct >= 0;
    const Icon = isUp ? ChevronUp : ChevronDown;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
        isUp
          ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20'
          : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
      }`}>
        <Icon className="w-3 h-3" />
        {isUp ? '+' : ''}{pct}%
      </span>
    );
  };

  const sparkDO = (chartData.doTrends || []).map((d: any) => Number(d.count) || 0);
  const sparkFuel = (chartData.monthlyFuel || []).map((d: any) => Number(d.value) || 0);
  const sparkLPO = (chartData.lpoTrends || []).map((d: any) => Number(d.count) || 0);
  const sparkTonnage = (chartData.tonnageTrends || []).map((d: any) => Number(d.tonnage) || 0);

  const statsCards = [
    {
      name: 'Delivery Orders',
      value: stats.totalDOs.toLocaleString(),
      sub: `${stats.activeTrips} active trip${stats.activeTrips !== 1 ? 's' : ''}`,
      trend: stats.trends?.dos,
      icon: FileText,
      tone: 'blue' as Tone,
      series: sparkDO,
    },
    {
      name: 'Fuel Dispensed',
      value: (stats.totalLiters || 0).toLocaleString(),
      unit: 'L',
      sub: `${stats.totalFuelRecords.toLocaleString()} records this month`,
      trend: stats.trends?.fuelRecords,
      icon: Fuel,
      tone: 'green' as Tone,
      series: sparkFuel,
    },
    {
      name: 'LPO Entries',
      value: stats.totalLPOs.toLocaleString(),
      sub: stats.pendingYardFuel ? `${stats.pendingYardFuel} yard fuel pending` : 'none pending',
      subClass: stats.pendingYardFuel ? 'text-amber-600 dark:text-amber-400' : undefined,
      trend: stats.trends?.lpos,
      icon: ClipboardList,
      tone: 'cyan' as Tone,
      series: sparkLPO,
    },
    {
      name: 'Tonnage (Month)',
      value: stats.totalTonnage.toLocaleString(),
      unit: 't',
      sub: `Ksh ${stats.totalRevenue.toLocaleString()} revenue`,
      trend: stats.trends?.tonnage,
      icon: Weight,
      tone: 'orange' as Tone,
      series: sparkTonnage,
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── TOP BAR ── */}
      <div className={`${CARD} px-4 py-3 flex items-center gap-4 flex-wrap`}>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 flex items-center justify-center text-white shadow-[0_6px_14px_-5px_rgba(2,132,199,0.55)]">
            <Fuel className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-[17px] font-extrabold tracking-tight text-gray-900 dark:text-gray-50">Fuel Order Dashboard</h1>
            <div className="flex items-center gap-2 mt-0.5 text-xs font-medium text-gray-400 dark:text-gray-500">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
              <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(34,197,94,0.18)]" />Live
              </span>
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-w-[180px] max-w-md mx-auto">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search DO, LPO, or truck number…"
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performUnifiedSearch(searchQuery)}
            className="w-full h-[42px] pl-10 pr-10 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition"
          />
          {searching ? (
            <Loader className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary-500" />
          ) : hasResults ? (
            <button onClick={handleClearSearch} title="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-[13px] font-bold transition shadow-[0_6px_14px_-6px_rgba(2,132,199,0.6)]"
          >
            <RefreshCw className="w-4 h-4" />Refresh
          </button>
        </div>
      </div>

      {/* Search Results */}
      {(searchResults.dos.length > 0 || searchResults.lpos.length > 0 || searchResults.fuels.length > 0) && (
        <div className={`${CARD} p-4 space-y-3`}>
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
                    className={`p-2 border rounded-md cursor-pointer transition-all hover:shadow-sm ${
                      result.isCancelled
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className={`w-2.5 h-2.5 flex-shrink-0 ${result.isCancelled ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`} />
                          <p className={`text-[10px] font-semibold truncate ${result.isCancelled ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{result.month}</p>
                          {result.isCancelled && (
                            <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-red-600 text-white flex-shrink-0">Cancelled</span>
                          )}
                        </div>
                        <p className={`text-xs font-medium truncate ${result.isCancelled ? 'text-red-700 dark:text-red-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{result.primaryText}</p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className={`w-3 h-3 flex-shrink-0 mt-0.5 ${result.isCancelled ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`} />
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
                {searchResults.lpos.map((result) => {
                  const baseBg = isDark ? 'rgba(8,145,178,0.15)' : '#E0F2FE';
                  const hoverBg = isDark ? 'rgba(8,145,178,0.25)' : '#BAE6FD';
                  const cancelBg = isDark ? 'rgba(220,38,38,0.18)' : '#FEE2E2';
                  const cancelHoverBg = isDark ? 'rgba(220,38,38,0.28)' : '#FECACA';
                  const accent = result.isCancelled ? '#DC2626' : '#0891B2';
                  return (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-2 rounded-md cursor-pointer transition-all hover:shadow-sm"
                    style={{ background: result.isCancelled ? cancelBg : baseBg, border: `1px solid ${result.isCancelled ? (isDark ? 'rgba(220,38,38,0.4)' : '#FCA5A5') : (isDark ? 'rgba(8,145,178,0.3)' : '#BAE6FD')}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = result.isCancelled ? cancelHoverBg : hoverBg)}
                    onMouseLeave={e => (e.currentTarget.style.background = result.isCancelled ? cancelBg : baseBg)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className="w-2.5 h-2.5 flex-shrink-0" style={{ color: accent }} />
                          <p className="text-[10px] font-semibold truncate" style={{ color: accent }}>{result.month}</p>
                          {result.isCancelled && (
                            <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-red-600 text-white flex-shrink-0">Cancelled</span>
                          )}
                        </div>
                        <p className="text-xs font-medium truncate" style={{ color: result.isCancelled ? '#B91C1C' : (isDark ? '#E2E8F0' : '#0F172A'), textDecoration: result.isCancelled ? 'line-through' : 'none' }}>{result.primaryText}</p>
                        <p className="text-[10px] mt-0.5 truncate" style={{ color: '#64748B' }}>{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: accent }} />
                    </div>
                  </div>
                  );
                })}
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
                    className={`p-2 border rounded-md cursor-pointer transition-all hover:shadow-sm ${
                      result.isCancelled
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Calendar className={`w-2.5 h-2.5 flex-shrink-0 ${result.isCancelled ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                          <p className={`text-[10px] font-semibold truncate ${result.isCancelled ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{result.month}</p>
                          {result.isCancelled && (
                            <span className="text-[8px] font-bold uppercase px-1 py-px rounded bg-red-600 text-white flex-shrink-0">Cancelled</span>
                          )}
                        </div>
                        <p className={`text-xs font-medium truncate ${result.isCancelled ? 'text-red-700 dark:text-red-300 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{result.primaryText}</p>
                        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className={`w-3 h-3 flex-shrink-0 mt-0.5 ${result.isCancelled ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
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
        <div className={`${CARD} p-5 text-center`}>
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No results found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Try searching with DO number, LPO number, or Truck number
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap px-0.5">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500 mr-1">Quick</span>
        <QuickPill onClick={() => handleQuickAction('create-do')} icon={Plus} label="New DO" tone="indigo" />
        <QuickPill onClick={() => handleQuickAction('bulk-create')} icon={Package} label="Bulk DO" tone="indigo" />
        <QuickPill onClick={() => handleQuickAction('create-lpo')} icon={ClipboardList} label="New LPO" tone="cyan" />
        <QuickPill onClick={() => handleQuickAction('create-fuel')} icon={Fuel} label="Fuel Record" tone="green" />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {statsCards.map((stat) => (
          <div key={stat.name} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${TONE_CHIP[stat.tone]}`}>
                <stat.icon className="w-[18px] h-[18px]" />
              </span>
              <TrendBadge pct={stat.trend} />
            </div>
            <div className="mt-3.5 flex items-baseline gap-1">
              <span className="text-[28px] leading-none font-extrabold font-mono tracking-tight text-gray-900 dark:text-gray-50">{stat.value}</span>
              {('unit' in stat && stat.unit) ? <span className="text-sm font-bold text-gray-400">{stat.unit}</span> : null}
            </div>
            <div className="mt-2 text-[13.5px] font-bold text-gray-900 dark:text-gray-100">{stat.name}</div>
            <div className={`mt-0.5 text-xs font-medium ${('subClass' in stat && stat.subClass) ? stat.subClass : 'text-gray-400 dark:text-gray-500'}`}>{stat.sub}</div>
            <Sparkline series={stat.series} color={TONE_STROKE[stat.tone]} />
          </div>
        ))}
      </div>

      {/* Charts & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Fuel Consumption */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-7 h-7 rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300 flex items-center justify-center"><BarChart3 className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Monthly Fuel Consumption</h3>
            <span className="ml-auto text-[11.5px] font-semibold text-gray-400">litres · last 6 mo</span>
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
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#eef1f6'} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={isDark ? '#9ca3af' : '#94a3b8'} />
                <YAxis tick={{ fontSize: 11 }} stroke={isDark ? '#9ca3af' : '#94a3b8'} />
                <Tooltip
                  cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(79,70,229,0.06)' }}
                  contentStyle={{ backgroundColor: isDark ? '#1f2937' : '#0f1729', border: 'none', borderRadius: '10px', color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={(v: any) => [`${Number(v).toLocaleString()} L`, 'Fuel']}
                />
                <Bar dataKey="value" fill="#0284c7" radius={[6, 6, 2, 2]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: isDark ? '#9ca3af' : '#94a3b8' }} formatter={(v: any) => v > 0 ? Number(v).toLocaleString() : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* DO Creation Trends */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center justify-center"><TrendingUp className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">DO Creation Trends</h3>
            <span className="ml-auto text-[11.5px] font-semibold text-gray-400">orders / month</span>
          </div>
          {chartData.doTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData.doTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#eef1f6'} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke={isDark ? '#9ca3af' : '#94a3b8'} />
                <YAxis tick={{ fontSize: 12 }} stroke={isDark ? '#9ca3af' : '#94a3b8'} />
                <Tooltip
                  contentStyle={{ backgroundColor: isDark ? '#1f2937' : '#0f1729', border: 'none', borderRadius: '10px', color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Line type="monotone" dataKey="count" stroke="#16A34A" strokeWidth={3} dot={{ fill: '#16A34A', r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* Station-wise LPO Distribution */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300 flex items-center justify-center"><MapPin className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Station LPO Distribution</h3>
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
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300 flex items-center justify-center"><Route className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Journey Status</h3>
          </div>
          {chartData.journeyStatus.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5">
              {chartData.journeyStatus.map((status: any) => {
                const c = JOURNEY_CAT(status.name);
                return (
                  <div key={status.name} className={`flex items-center gap-3 p-3.5 rounded-xl border ${c.tile}`}>
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">{status.name}</div>
                      <div className="text-[22px] font-extrabold font-mono text-gray-900 dark:text-gray-100 leading-tight">{status.value}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data available</div>
          )}
        </div>
      </div>

      {/* Fuel Cost per Litre — 6-month price trend, one card per currency */}
      {chartData.fuelPriceTrend && chartData.fuelPriceTrend.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(chartData.fuelPriceTrend as any[]).map((t) => {
            const down = (t.trendPct ?? 0) <= 0;
            return (
              <div key={t.currency} className={`${CARD} p-5`}>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300 flex items-center justify-center"><DollarSign className="w-4 h-4" /></span>
                  <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Fuel Cost per Litre</h3>
                  <span className="ml-auto text-[11.5px] font-semibold text-gray-400">{t.currency} · last 6 mo</span>
                </div>
                <div className="flex items-end gap-2.5 mb-1 flex-wrap">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[28px] leading-none font-extrabold font-mono tracking-tight text-gray-900 dark:text-gray-50">{fmtNum(t.current, t.currency)}</span>
                    <span className="text-sm font-bold text-gray-400">/L</span>
                  </div>
                  {t.trendPct !== null && (
                    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full mb-0.5 ${down ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20'}`}>
                      {down ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}{t.trendPct > 0 ? '+' : ''}{t.trendPct}%
                    </span>
                  )}
                  {t.previous > 0 && (
                    <span className="text-[11.5px] font-medium text-gray-400 mb-0.5">vs {fmtNum(t.previous, t.currency)} in {t.prevLabel}</span>
                  )}
                </div>
                {t.series && t.series.length > 1 ? (
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={t.series} margin={{ top: 10, right: 10, bottom: 0, left: -34 }}>
                      <defs>
                        <linearGradient id={`fp-${t.currency}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ea580c" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke={isDark ? '#374151' : '#eef1f6'} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={isDark ? '#9ca3af' : '#94a3b8'} tickLine={false} axisLine={false} />
                      <YAxis hide domain={[(min: number) => min * 0.98, (max: number) => max * 1.02]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: isDark ? '#1f2937' : '#0f1729', border: 'none', borderRadius: '10px', color: '#fff' }}
                        labelStyle={{ color: '#9ca3af' }}
                        formatter={(v: any) => [fmtNum(Number(v), t.currency), 'Price/L']}
                      />
                      <Area type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={2.5} fill={`url(#fp-${t.currency})`} dot={{ fill: '#fff', stroke: '#ea580c', strokeWidth: 2, r: 3.5 }} activeDot={{ r: 5, fill: '#ea580c' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[150px] flex items-center justify-center text-gray-400 text-sm">Not enough price history</div>
                )}
                <div className="flex gap-2 mt-2 pt-3 border-t border-gray-100 dark:border-gray-700/60">
                  <div className="flex-1 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Lowest</div>
                    <div className="text-[14px] font-extrabold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">{fmtNum(t.lowest, t.currency)}</div>
                  </div>
                  <div className="w-px bg-gray-100 dark:bg-gray-700/60" />
                  <div className="flex-1 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Average</div>
                    <div className="text-[14px] font-extrabold font-mono text-gray-700 dark:text-gray-200 mt-0.5">{fmtNum(t.average, t.currency)}</div>
                  </div>
                  <div className="w-px bg-gray-100 dark:bg-gray-700/60" />
                  <div className="flex-1 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Highest</div>
                    <div className="text-[14px] font-extrabold font-mono text-red-600 dark:text-red-400 mt-0.5">{fmtNum(t.highest, t.currency)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300 flex items-center justify-center"><DollarSign className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Fuel Cost per Litre</h3>
          </div>
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">No station prices configured</div>
        </div>
      )}

      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Attention / Status */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300 flex items-center justify-center"><BellRing className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Needs Attention</h3>
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
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 flex items-center justify-center"><FileText className="w-4 h-4" /></span>
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Recent DOs</h3>
            </div>
            <button onClick={() => onNavigate?.('do')} className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">View all →</button>
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
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300 flex items-center justify-center"><ClipboardList className="w-4 h-4" /></span>
              <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100">Recent LPOs</h3>
            </div>
            <button onClick={() => onNavigate?.('lpo')} className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">View all →</button>
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
