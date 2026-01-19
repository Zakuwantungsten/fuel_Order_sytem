import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  FileText, 
  Fuel, 
  ClipboardList, 
  TrendingUp, 
  Activity,
  Calendar,
  Package,
  Plus,
  BarChart3,
  PieChart,
  AlertCircle,
  ArrowRight,
  Loader,
  X
} from 'lucide-react';
import { BarChart, Bar, PieChart as RePieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardAPI, deliveryOrdersAPI, lposAPI, fuelRecordsAPI } from '../services/api';
import { DashboardStats, FuelRecord } from '../types';

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

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Unified search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    dos: SearchResult[];
    lpos: SearchResult[];
    fuels: SearchResult[];
  }>({ dos: [], lpos: [], fuels: [] });
  const [searching, setSearching] = useState(false);

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
      // Fetch chart data from backend (last 4 months)
      const data = await dashboardAPI.getChartData(4);
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

  // Unified search functionality
  const performUnifiedSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults({ dos: [], lpos: [], fuels: [] });
      return;
    }
    
    setSearching(true);
    const query = searchQuery.trim();
    
    try {
      const fourMonthsAgo = new Date();
      fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
      
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      const today = new Date();

      console.log('Search params:', {
        query,
        today: today.toISOString().split('T')[0],
        fourMonthsAgoDate: fourMonthsAgo.toISOString().split('T')[0],
        oneMonthAgoDate: oneMonthAgo.toISOString().split('T')[0]
      });

      // Search all three types in parallel
      const [dosResponse, lposResponse, fuelsResponse] = await Promise.all([
        deliveryOrdersAPI.getAll({ 
          search: query,
          dateFrom: fourMonthsAgo.toISOString().split('T')[0],
          limit: 50
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
          dateFrom: fourMonthsAgo.toISOString().split('T')[0],
          limit: 50
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
        .map((DO: any, index: number) => ({
          id: `do-${DO._id || DO.id || index}`,
          type: 'do' as const,
          month: new Date(DO.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          primaryText: `${DO.doNumber} - ${DO.to || DO.destination || 'N/A'}`,
          secondaryText: `${DO.truckNo} | ${DO.tonnages} tons | ${DO.haulier}`,
          metadata: DO
        }));

      // Process LPO results - NO FILTERING, backend already filtered
      const lposResults: SearchResult[] = lposData
        .map((lpo: any, index: number) => ({
          id: `lpo-${lpo._id || lpo.id || index}`,
          type: 'lpo' as const,
          month: new Date(lpo.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
          primaryText: `${lpo.lpoNo} - ${lpo.dieselAt}`,
          secondaryText: `${lpo.truckNo} | ${lpo.ltrs}L | ${lpo.doSdo}`,
          metadata: lpo
        }));

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

  // Handle search result click
  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'do') {
      navigate(`/do?highlight=${result.metadata.doNumber}`);
    } else if (result.type === 'lpo') {
      navigate(`/lpo?highlight=${result.metadata.lpoNo}`);
    } else if (result.type === 'fuel') {
      navigate(`/fuel-records?highlight=${result.metadata.truckNo}`);
    }
  };

  // Quick actions
  const handleQuickAction = (action: string) => {
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-300">{error || 'No data available'}</p>
      </div>
    );
  }

  const statsCards = [
    { 
      name: 'Total Delivery Orders', 
      value: stats.totalDOs.toString(),
      icon: FileText,
      color: 'bg-blue-500',
      lightColor: 'bg-blue-50 dark:bg-blue-900/20'
    },
    { 
      name: 'Active Fuel Records', 
      value: stats.totalFuelRecords.toString(),
      icon: Fuel,
      color: 'bg-green-500',
      lightColor: 'bg-green-50 dark:bg-green-900/20'
    },
    { 
      name: 'Total LPOs', 
      value: stats.totalLPOs.toString(),
      icon: ClipboardList,
      color: 'bg-purple-500',
      lightColor: 'bg-purple-50 dark:bg-purple-900/20'
    },
    { 
      name: 'This Month', 
      value: stats.totalTonnage.toLocaleString(),
      icon: TrendingUp,
      color: 'bg-orange-500',
      lightColor: 'bg-orange-50 dark:bg-orange-900/20'
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Fuel Order Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Activity className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search DO, LPO, or Truck..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && performUnifiedSearch()}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => { 
                setSearchQuery(''); 
                setSearchResults({ dos: [], lpos: [], fuels: [] }); 
              }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={performUnifiedSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition-colors whitespace-nowrap"
        >
          {searching ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Search
            </>
          )}
        </button>
      </div>

      {/* Search Results */}
      {(searchResults.dos.length > 0 || searchResults.lpos.length > 0 || searchResults.fuels.length > 0) && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                {searchResults.dos.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{result.month}</p>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{result.primaryText}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                {searchResults.lpos.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                          <p className="text-xs font-semibold text-purple-600 dark:text-purple-400">{result.month}</p>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{result.primaryText}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-1" />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                {searchResults.fuels.map((result) => (
                  <div
                    key={result.id}
                    onClick={() => handleResultClick(result)}
                    className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-all hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <p className="text-xs font-semibold text-green-600 dark:text-green-400">{result.month}</p>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{result.primaryText}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{result.secondaryText}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" />
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <Search className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No results found</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Try searching with DO number, LPO number, or Truck number
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <div
            key={stat.name}
            className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl transition-all hover:shadow-xl border border-gray-200 dark:border-gray-700"
          >
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {stat.name}
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
                    {stat.value}
                  </p>
                </div>
                <div className={`${stat.lightColor} p-3 rounded-lg`}>
                  <stat.icon className="w-6 h-6" style={{ color: stat.color.replace('bg-', '#') }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quick Actions</h2>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => handleQuickAction('create-do')}
            className="flex flex-col items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-all hover:scale-105"
          >
            <div className="p-3 bg-blue-600 rounded-full">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create DO</span>
          </button>

          <button
            onClick={() => handleQuickAction('bulk-create')}
            className="flex flex-col items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-all hover:scale-105"
          >
            <div className="p-3 bg-indigo-600 rounded-full">
              <Package className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Bulk Create</span>
          </button>

          <button
            onClick={() => handleQuickAction('create-lpo')}
            className="flex flex-col items-center gap-3 p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all hover:scale-105"
          >
            <div className="p-3 bg-purple-600 rounded-full">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create LPO</span>
          </button>

          <button
            onClick={() => handleQuickAction('create-fuel')}
            className="flex flex-col items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-all hover:scale-105"
          >
            <div className="p-3 bg-green-600 rounded-full">
              <Fuel className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fuel Record</span>
          </button>
        </div>
      </div>

      {/* Charts & Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Fuel Consumption */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Monthly Fuel Consumption</h3>
          </div>
          {chartData.monthlyFuel.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData.monthlyFuel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fontSize: 12 }} stroke="#6b7280" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* DO Creation Trends */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">DO Creation Trends</h3>
          </div>
          {chartData.doTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
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
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* Station-wise LPO Distribution */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Station-wise LPO Distribution</h3>
          </div>
          {chartData.stationDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <RePieChart>
                <Pie
                  data={chartData.stationDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value.toLocaleString()}L`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.stationDistribution.map((entry: any, index: number) => (
                    <Cell key={`station-cell-${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>

        {/* Journey Status */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Journey Status Overview</h3>
          </div>
          {chartData.journeyStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <RePieChart>
                <Pie
                  data={chartData.journeyStatus}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.journeyStatus.map((entry: any, index: number) => (
                    <Cell key={`journey-cell-${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }} />
              </RePieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
          )}
        </div>
      </div>

      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">System Status</h3>
          </div>
          <div className="space-y-3">
            {stats.activeTrips > 0 && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">{stats.activeTrips} Active Trips</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">Journeys in progress</p>
              </div>
            )}
            {stats.pendingYardFuel && stats.pendingYardFuel > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{stats.pendingYardFuel} Pending Yard Fuel</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Awaiting approval</p>
              </div>
            )}
            {stats.activeTrips === 0 && (!stats.pendingYardFuel || stats.pendingYardFuel === 0) && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">All Systems Normal</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">No alerts at this time</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Delivery Orders */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent DOs</h3>
          <div className="space-y-3">
            {stats.recentActivities?.deliveryOrders && stats.recentActivities.deliveryOrders.length > 0 ? (
              stats.recentActivities.deliveryOrders.slice(0, 5).map((DO: any) => (
                <div key={DO._id || DO.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30" onClick={() => navigate(`/do?highlight=${DO.doNumber}`)}>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{DO.doNumber}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{DO.truckNo} • {DO.from} → {DO.to}</p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-400 py-8">No recent DOs</p>
            )}
          </div>
        </div>

        {/* Recent LPOs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recent LPOs</h3>
          <div className="space-y-3">
            {stats.recentActivities?.lpoEntries && stats.recentActivities.lpoEntries.length > 0 ? (
              stats.recentActivities.lpoEntries.slice(0, 5).map((lpo: any) => (
                <div key={lpo._id || lpo.id} className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30" onClick={() => navigate(`/lpo?highlight=${lpo.lpoNo}`)}>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{lpo.lpoNo}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{lpo.truckNo} • {lpo.dieselAt} • {lpo.ltrs}L</p>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-400 py-8">No recent LPOs</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
