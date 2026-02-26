import { useState, useEffect } from 'react';
import { TrendingUp, Download, Fuel, DollarSign, Truck, FileText, BarChart3 } from 'lucide-react';
import { dashboardAPI } from '../services/api';
import { ReportStats } from '../types';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface ReportsProps {
  user: any;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    green:  'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
    red:    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400',
    indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 mr-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

export function Reports({}: ReportsProps) {
  const [dateRange, setDateRange] = useState('month');
  const [reportType, setReportType] = useState('overview');
  const [reportData, setReportData] = useState<ReportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReportData();
  }, [dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.getReports(dateRange);
      setReportData(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch report data:', err);
      setError('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(['fuel_records', 'delivery_orders', 'lpo_entries'], fetchReportData);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading reports...</p>
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-400">{error || 'No data available'}</p>
      </div>
    );
  }

  const renderOverviewReport = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Fuel Consumed" value={`${reportData.fuelConsumption.total.toLocaleString()} L`} icon={Fuel} color="blue" />
        <StatCard label="Total Revenue" value={formatCurrency(reportData.financials.totalRevenue)} icon={DollarSign} color="green" />
        <StatCard label="Total Trips" value={reportData.operations.totalTrips.toString()} icon={Truck} color="purple" />
        <StatCard label="Profit Margin" value={`${reportData.financials.profitMargin}%`} icon={TrendingUp} color="yellow" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Fuel by Yard */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Fuel Consumption by Yard</h3>
          <div className="space-y-3">
            {reportData.fuelConsumption.byYard.map((yard, index) => (
              <div key={yard.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    index === 0 ? 'bg-blue-500' : index === 1 ? 'bg-green-500' : index === 2 ? 'bg-yellow-500' : 'bg-purple-500'
                  }`}></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{yard.name}</span>
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{yard.value.toLocaleString()}L</div>
              </div>
            ))}
          </div>
        </div>

        {/* Fuel by Station */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Fuel Consumption by Station</h3>
          <div className="space-y-3">
            {reportData.fuelConsumption.byStation.map((station, index) => (
              <div key={station.name} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    index === 0 ? 'bg-indigo-500' : index === 1 ? 'bg-pink-500' : index === 2 ? 'bg-orange-500' : 
                    index === 3 ? 'bg-teal-500' : 'bg-gray-500'
                  }`}></div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{station.name}</span>
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{station.value.toLocaleString()}L</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trends */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Monthly Trends</h3>
        {reportData.trends && reportData.trends.length > 0 ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${reportData.trends.length}, minmax(0, 1fr))` }}>
            {reportData.trends.map((trend) => (
              <div key={trend.month} className="text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{trend.month}</div>
                <div className="bg-gray-200 dark:bg-gray-700 rounded-lg h-20 flex flex-col justify-end p-2">
                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100">{trend.fuel.toLocaleString()}L</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300">{formatCurrency(trend.revenue)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No trend data available for the selected period</p>
        )}
      </div>
    </div>
  );

  const renderFinancialReport = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Total Revenue" value={formatCurrency(reportData.financials.totalRevenue)} sub="From operations" icon={DollarSign} color="green" />
        <StatCard label="Total Cost" value={formatCurrency(reportData.financials.totalCost)} sub={`Fuel: ${formatCurrency(reportData.financials.totalFuelCost)}`} icon={TrendingUp} color="orange" />
        <StatCard label="Net Profit" value={formatCurrency(reportData.financials.profit)} sub={`Margin: ${reportData.financials.profitMargin}%`} icon={BarChart3} color={reportData.financials.profit >= 0 ? 'green' : 'red'} />
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Revenue Breakdown</h3>
        <p className="text-gray-600 dark:text-gray-400">Revenue generated from {reportData.operations.totalTrips} trips with total fuel cost of {formatCurrency(reportData.financials.totalFuelCost)}.</p>
      </div>
    </div>
  );

  const renderOperationalReport = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Trips" value={reportData.operations.totalTrips.toString()} icon={Truck} color="purple" />
        <StatCard label="Active Trucks" value={reportData.operations.totalTrucks.toString()} icon={Truck} color="blue" />
        <StatCard label="Avg Fuel/Trip" value={`${reportData.operations.averageFuelPerTrip.toFixed(0)} L`} icon={Fuel} color="orange" />
        <StatCard label="On-Time Delivery" value={`${reportData.operations.onTimeDelivery}%`} icon={TrendingUp} color="green" />
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border dark:border-gray-700">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Operational Efficiency</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Fleet efficiency metrics: {reportData.operations.totalTrips} trips completed using {reportData.operations.totalTrucks} trucks 
          with an average fuel consumption of {reportData.operations.averageFuelPerTrip.toFixed(0)} liters per trip.
        </p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Reports & Analytics</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Comprehensive business intelligence and reporting</p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="flex-1 min-w-[130px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="overview">Overview</option>
            <option value="financial">Financial</option>
            <option value="operational">Operational</option>
            <option value="fuel">Fuel Analysis</option>
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="flex-1 min-w-[110px] px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom</option>
          </select>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Export Excel</span>
              <span className="sm:hidden">XLS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      {reportType === 'overview' && renderOverviewReport()}
      {reportType === 'financial' && renderFinancialReport()}
      {reportType === 'operational' && renderOperationalReport()}
      {reportType === 'fuel' && (
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg border dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Fuel Analysis Report</h3>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>Total fuel consumption: <span className="font-semibold text-gray-900 dark:text-gray-100">{reportData.fuelConsumption.total.toLocaleString()} L</span></p>
            <p>Average fuel per trip: <span className="font-semibold text-gray-900 dark:text-gray-100">{reportData.operations.averageFuelPerTrip.toFixed(0)} L</span></p>
            <p>Total fuel cost: <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(reportData.financials.totalFuelCost)}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;