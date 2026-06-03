import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  CheckCircle,
  XCircle,
  TrendingUp,
  Search,
  Loader,
  X,
  ArrowRight,
  Calendar,
  ChevronUp,
  ChevronDown,
  BarChart3,
  MapPin,
  Plus,
  RefreshCw,
  Truck,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LabelList,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { dashboardAPI, deliveryOrdersAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { readOfficerConfig } from '../hooks/useOfficerConfig';
import UnifiedTabLoader from './SuperAdmin/common/UnifiedTabLoader';

interface OfficerOverviewProps {
  user: any;
  onNavigateToDO: (params?: string) => void;
}

interface DOResult {
  id: string;
  doNumber: string;
  truckNo: string;
  date: string;
  destination: string;
  loadingPoint: string;
  tonnages: string | number;
  doType: string;
  haulier: string;
  isCancelled: boolean;
  metadata: any;
}

interface StatCard {
  name: string;
  value: string;
  sub: string;
  trend: number | null | undefined;
  color: string;
  sparkKey: string;
  sparkData: any[];
  Icon: React.ElementType;
}

// ─── Trend badge — green up / red down ───────────────────────────────────────
const TrendBadge = ({ pct }: { pct: number | null | undefined }) => {
  if (pct === null || pct === undefined) return null;
  const isUp = pct >= 0;
  const Icon = isUp ? ChevronUp : ChevronDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        isUp
          ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
          : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
      }`}
    >
      <Icon className="w-3 h-3" />
      {isUp ? '+' : ''}
      {pct}%
    </span>
  );
};

// ─── Mini sparkline (no axes, no grid, no dots) ───────────────────────────────
const Sparkline = ({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) => {
  const gradId = `sg-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ─── Location row colours ─────────────────────────────────────────────────────
const LOC_COLORS = ['#2563EB', '#16A34A', '#EA580C', '#8B5CF6', '#0891B2'];

const OfficerOverview = ({ user, onNavigateToDO }: OfficerOverviewProps) => {
  const { isDark } = useAuth();
  const isExport = user.role === 'export_officer';
  const ioType = isExport ? 'EXPORT' : 'IMPORT';
  const accentColor = isExport ? '#EA580C' : '#2563EB';

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-read config each render so changes in Config tab are immediately reflected
  const config = readOfficerConfig(user.role);

  // Truck search
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DOResult[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getOfficerStats();
      setStats(data);
      setError(null);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ─── Truck search ────────────────────────────────────────────────────────────
  const searchTrucks = useCallback(
    async (query: string) => {
      if (!query.trim()) { setSearchResults([]); return; }
      setSearching(true);
      try {
        const from = new Date();
        from.setMonth(from.getMonth() - config.searchMonths);
        const today = new Date();
        const limit = config.maxResults === 0 ? 500 : config.maxResults;

        const resp = await deliveryOrdersAPI.getAll({
          search: query,
          importOrExport: ioType,
          dateFrom: from.toISOString().split('T')[0],
          dateTo: today.toISOString().split('T')[0],
          limit,
          sortBy: 'date',
          sortOrder: 'desc',
        });

        const rows: DOResult[] = (resp.data || []).map((d: any) => ({
          id: d._id || d.id,
          doNumber: d.doNumber,
          truckNo: d.truckNo,
          date: d.date,
          destination: d.destination || d.to || '',
          loadingPoint: d.loadingPoint || d.from || '',
          tonnages: d.tonnages,
          doType: d.doType,
          haulier: d.haulier || '',
          isCancelled: !!d.isCancelled,
          metadata: d,
        }));
        setSearchResults(rows);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [ioType, config.searchMonths, config.maxResults],
  );

  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(() => searchTrucks(value), 300);
  };

  const handleResultClick = (result: DOResult) => {
    const d = new Date(result.date);
    onNavigateToDO(`highlight=${result.doNumber}&year=${d.getFullYear()}&month=${d.getMonth() + 1}&truck=${result.truckNo}`);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  if (loading) return <UnifiedTabLoader label="Loading overview..." />;
  if (error || !stats) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-300">{error || 'No data available'}</p>
      </div>
    );
  }

  const { monthStats, monthlyTrend, topLocations, recentDOs } = stats;
  const hasSearchResults = searchResults.length > 0;

  // ─── Stat cards ───────────────────────────────────────────────────────────────
  const statCards: StatCard[] = [
    {
      name: 'Total Delivery Orders',
      value: monthStats.totalDOs.toLocaleString(),
      sub: `Active trips: ${monthStats.activeDOs}`,
      trend: monthStats.trends?.totalDOs,
      color: '#2563EB',
      sparkKey: 'count',
      sparkData: monthlyTrend,
      Icon: FileText,
    },
    {
      name: 'Active DOs',
      value: monthStats.activeDOs.toLocaleString(),
      sub: `DO: ${monthStats.doCount}  ·  SDO: ${monthStats.sdoCount}`,
      trend: null,
      color: '#16A34A',
      sparkKey: 'active',
      sparkData: monthlyTrend,
      Icon: CheckCircle,
    },
    {
      name: 'Cancelled DOs',
      value: monthStats.cancelledDOs.toLocaleString(),
      sub: 'This month',
      trend: null,
      color: '#0891B2',
      sparkKey: 'cancelled',
      sparkData: monthlyTrend,
      Icon: XCircle,
    },
    {
      name: 'Tonnage (Month)',
      value: monthStats.totalTonnage.toLocaleString(),
      sub: `DO vs SDO: ${monthStats.doCount} / ${monthStats.sdoCount}`,
      trend: monthStats.trends?.tonnage,
      color: '#EA580C',
      sparkKey: 'tonnage',
      sparkData: monthlyTrend,
      Icon: TrendingUp,
    },
  ];

  const locationLabel = isExport ? 'Top Destinations' : 'Top Loading Points';

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
            {isExport ? 'Export' : 'Import'} Officer Overview
          </h1>
          <p className="mt-0.5 text-sm" style={{ color: '#64748B' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigateToDO('action=create-do')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white"
            style={{ background: accentColor }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Plus className="w-3.5 h-3.5" />
            New {ioType === 'EXPORT' ? 'Export' : 'Import'} DO
          </button>
          <button
            onClick={fetchStats}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border"
            style={{
              color: isDark ? '#94A3B8' : '#475569',
              background: isDark ? '#1E293B' : '#F8FAFC',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Truck search ── */}
      <div>
        <div className="flex items-center gap-2 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={`Search by truck number (last ${config.searchMonths} months)…`}
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchTrucks(searchQuery)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
              style={{
                background: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#D1D5DB',
                color: isDark ? '#F1F5F9' : '#111827',
                ['--tw-ring-color' as any]: accentColor,
                height: '36px',
              }}
            />
            {searching && (
              <Loader
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin"
                style={{ color: accentColor }}
              />
            )}
          </div>
          {hasSearchResults ? (
            <button
              onClick={clearSearch}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg"
              style={{
                background: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
                color: '#DC2626',
                border: '1px solid #FCA5A5',
                height: '36px',
              }}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          ) : (
            <button
              onClick={() => searchTrucks(searchQuery)}
              disabled={!searchQuery.trim() || searching}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                color: isDark ? '#94A3B8' : '#475569',
                background: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#D1D5DB',
                height: '36px',
              }}
            >
              <Search className="w-3 h-3" /> Search
            </button>
          )}
        </div>

        {/* ── Search Results — Dashboard card-grid style ── */}
        {hasSearchResults && (
          <div
            className="mt-3 rounded-xl border p-4"
            style={{
              background: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4" style={{ color: accentColor }} />
              <h3 className="text-sm font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                Delivery Orders
                <span className="ml-2 text-xs font-normal" style={{ color: '#64748B' }}>
                  ({searchResults.length} found — last {config.searchMonths} month{config.searchMonths !== 1 ? 's' : ''})
                </span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {searchResults.map(result => (
                <div
                  key={result.id}
                  onClick={() => handleResultClick(result)}
                  className="p-2 rounded-md cursor-pointer transition-all hover:shadow-sm"
                  style={{
                    background: isDark ? `${accentColor}18` : `${accentColor}0D`,
                    border: `1px solid ${isDark ? `${accentColor}35` : `${accentColor}28`}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? `${accentColor}28` : `${accentColor}1A`)}
                  onMouseLeave={e => (e.currentTarget.style.background = isDark ? `${accentColor}18` : `${accentColor}0D`)}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5">
                        <Calendar className="w-2.5 h-2.5 flex-shrink-0" style={{ color: accentColor }} />
                        <p className="text-[10px] font-semibold truncate" style={{ color: accentColor }}>
                          {new Date(result.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <p className="text-xs font-medium truncate" style={{ color: isDark ? '#E2E8F0' : '#0F172A' }}>
                        {result.doNumber} — {result.truckNo}
                      </p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: '#64748B' }}>
                        {isExport ? result.destination : result.loadingPoint} · {result.tonnages}t · {result.doType}
                      </p>
                      {result.haulier && (
                        <p className="text-[10px] truncate" style={{ color: '#94A3B8' }}>{result.haulier}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-1">
                      <ArrowRight className="w-3 h-3" style={{ color: accentColor }} />
                      <span
                        className="text-[9px] px-1 py-0.5 rounded font-medium whitespace-nowrap"
                        style={{
                          background: result.isCancelled
                            ? isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'
                            : isDark ? 'rgba(22,163,74,0.15)' : '#DCFCE7',
                          color: result.isCancelled ? '#DC2626' : '#16A34A',
                        }}
                      >
                        {result.isCancelled ? 'Cancelled' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No results */}
        {searchQuery && !searching && searchResults.length === 0 && (
          <div
            className="mt-3 rounded-xl border p-5 text-center"
            style={{
              background: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
            }}
          >
            <Search className="w-10 h-10 mx-auto mb-2" style={{ color: isDark ? '#334155' : '#CBD5E1' }} />
            <p className="text-sm font-medium" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
              No results for "{searchQuery}"
            </p>
            <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
              Try a different truck number, or increase the Search Range in Config
            </p>
          </div>
        )}
      </div>

      {/* ── Stat cards — white background + sparkline ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div
            key={card.name}
            className="rounded-xl border transition-all"
            style={{
              background: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
          >
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                {/* Left: text */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wide truncate"
                    style={{ color: isDark ? '#64748B' : '#94A3B8', letterSpacing: '0.06em' }}
                  >
                    {card.name}
                  </p>
                  <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
                    <p className="text-2xl font-bold leading-none" style={{ color: card.color }}>
                      {card.value}
                    </p>
                    <TrendBadge pct={card.trend} />
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: isDark ? '#64748B' : '#94A3B8' }}>
                    {card.sub}
                  </p>
                </div>

                {/* Right: sparkline */}
                <div className="w-20 h-12 flex-shrink-0">
                  {card.sparkData.length > 1 ? (
                    <Sparkline data={card.sparkData} dataKey={card.sparkKey} color={card.color} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <card.Icon className="w-6 h-6" style={{ color: `${card.color}50` }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Monthly DO Volume (full height bar chart) */}
        <div
          className="rounded-xl border p-4"
          style={{
            background: isDark ? '#1E293B' : '#FFFFFF',
            borderColor: isDark ? '#334155' : '#E2E8F0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <h3 className="text-base font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
              Monthly DO Volume
            </h3>
          </div>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend} margin={{ top: 18, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#F1F5F9'} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                    borderRadius: '8px',
                    color: isDark ? '#F1F5F9' : '#0F172A',
                  }}
                  formatter={(v: any) => [v, 'DOs']}
                />
                <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{ fontSize: 10, fill: isDark ? '#64748B' : '#94A3B8' }}
                    formatter={(v: any) => (v > 0 ? v : '')}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-sm" style={{ color: '#94A3B8' }}>
              No data available
            </div>
          )}
        </div>

        {/* Right column: line chart + location table stacked (matches screenshot) */}
        <div className="flex flex-col gap-4">
          {/* DO Creation Trends */}
          <div
            className="rounded-xl border p-4"
            style={{
              background: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <h3 className="text-base font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                DO Creation Trends
              </h3>
            </div>
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <LineChart data={monthlyTrend} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#F1F5F9'} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#6b7280" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#6b7280" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                      border: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`,
                      borderRadius: '8px',
                      color: isDark ? '#F1F5F9' : '#0F172A',
                    }}
                    formatter={(v: any) => [v, 'DOs']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#16A34A"
                    strokeWidth={3}
                    dot={{ fill: '#16A34A', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-32 flex items-center justify-center text-sm" style={{ color: '#94A3B8' }}>
                No data available
              </div>
            )}
          </div>

          {/* Top Destinations / Loading Points table — mirrors "Station LPO Distribution" slot */}
          <div
            className="rounded-xl border p-4 flex-1"
            style={{
              background: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4" style={{ color: accentColor }} />
              <h3 className="text-base font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
                {locationLabel}
              </h3>
            </div>

            {topLocations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${isDark ? '#334155' : '#F1F5F9'}` }}>
                      {[isExport ? 'Destination' : 'Loading Point', 'Total DOs', 'Status', 'Tonnage'].map(h => (
                        <th
                          key={h}
                          className="text-left pb-2 pr-2 font-semibold uppercase tracking-wide"
                          style={{ color: '#94A3B8', fontSize: '10px' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topLocations.map((loc: any, i: number) => (
                      <tr
                        key={loc.name}
                        style={{ borderBottom: `1px solid ${isDark ? '#1E3A4A20' : '#F8FAFC'}` }}
                      >
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: LOC_COLORS[i % LOC_COLORS.length] }}
                            />
                            <span
                              className="font-medium truncate max-w-[90px]"
                              style={{ color: isDark ? '#CBD5E1' : '#374151' }}
                            >
                              {loc.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 font-semibold" style={{ color: isDark ? '#E2E8F0' : '#0F172A' }}>
                          {loc.count}
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{
                              background:
                                loc.cancelled === 0
                                  ? isDark ? 'rgba(22,163,74,0.15)' : '#DCFCE7'
                                  : loc.cancelled === loc.count
                                  ? isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'
                                  : isDark ? 'rgba(234,88,12,0.15)' : '#FEF3C7',
                              color:
                                loc.cancelled === 0 ? '#16A34A' : loc.cancelled === loc.count ? '#DC2626' : '#D97706',
                            }}
                          >
                            {loc.cancelled === 0
                              ? 'Completed'
                              : loc.cancelled === loc.count
                              ? 'Rejected'
                              : 'Pending'}
                          </span>
                        </td>
                        <td className="py-2 text-xs" style={{ color: '#64748B' }}>
                          {loc.tonnage != null ? `${loc.tonnage.toLocaleString()}t` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-sm" style={{ color: '#94A3B8' }}>
                No data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Recent DOs ── */}
      <div
        className="rounded-xl border p-4"
        style={{
          background: isDark ? '#1E293B' : '#FFFFFF',
          borderColor: isDark ? '#334155' : '#E2E8F0',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" style={{ color: accentColor }} />
            <h3 className="text-sm font-semibold" style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}>
              Recent DOs
            </h3>
          </div>
          <button
            onClick={() => onNavigateToDO()}
            className="text-xs"
            style={{ color: accentColor }}
          >
            View all →
          </button>
        </div>
        <div className="divide-y" style={{ borderColor: isDark ? '#334155' : '#F1F5F9' }}>
          {recentDOs && recentDOs.length > 0 ? (
            recentDOs.slice(0, 7).map((DO: any) => {
              const doDate = DO.date ? new Date(DO.date) : null;
              return (
                <div
                  key={DO._id || DO.id}
                  className="py-2 px-1 -mx-1 rounded cursor-pointer transition-colors"
                  onMouseEnter={e => (e.currentTarget.style.background = isDark ? '#263347' : '#F8FAFF')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  onClick={() => {
                    if (!doDate) return;
                    onNavigateToDO(
                      `highlight=${DO.doNumber}&year=${doDate.getFullYear()}&month=${doDate.getMonth() + 1}`,
                    );
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold truncate" style={{ color: accentColor }}>
                      {DO.doNumber}
                    </span>
                    {doDate && (
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#94A3B8' }}>
                        {doDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px]" style={{ color: '#64748B' }}>
                    <Truck className="w-3 h-3 flex-shrink-0" />
                    <span className="font-medium truncate">{DO.truckNo}</span>
                    <span style={{ color: isDark ? '#334155' : '#E2E8F0' }}>•</span>
                    <span className="truncate">
                      {DO.loadingPoint || DO.from} → {DO.destination || DO.to}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {DO.tonnages && (
                      <span className="text-[10px]" style={{ color: '#94A3B8' }}>{DO.tonnages}t</span>
                    )}
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        background: DO.isCancelled
                          ? isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'
                          : isDark ? 'rgba(22,163,74,0.15)' : '#DCFCE7',
                        color: DO.isCancelled ? '#DC2626' : '#16A34A',
                      }}
                    >
                      {DO.isCancelled ? 'Cancelled' : 'Active'}
                    </span>
                    {DO.doType && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{
                          background: isDark ? 'rgba(37,99,235,0.15)' : '#EFF6FF',
                          color: '#2563EB',
                        }}
                      >
                        {DO.doType}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-center py-6 text-sm" style={{ color: '#94A3B8' }}>No recent DOs</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfficerOverview;
