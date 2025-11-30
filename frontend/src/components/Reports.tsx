import { useState, useEffect } from 'react';
import { TrendingUp, Download, Fuel, DollarSign, Truck, FileText } from 'lucide-react';
import { dashboardAPI } from '../services/api';
import { ReportStats } from '../types';

interface ReportsProps {
  user: any;
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error || 'No data available'}</p>
      </div>
    );
  }

  const renderOverviewReport = () => (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Fuel Consumed</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.fuelConsumption.total.toLocaleString()}L</div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Fuel className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Revenue</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(reportData.financials.totalRevenue)}</div>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Trips</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.operations.totalTrips}</div>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Truck className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Profit Margin</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.financials.profitMargin}%</div>
            </div>
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fuel by Yard */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Fuel Consumption by Yard</h3>
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
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Fuel Consumption by Station</h3>
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
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Monthly Trends</h3>
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Revenue</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(reportData.financials.totalRevenue)}</div>
          <div className="text-sm text-green-600 dark:text-green-400 mt-1">From operations</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Cost</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(reportData.financials.totalCost)}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Fuel: {formatCurrency(reportData.financials.totalFuelCost)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Net Profit</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(reportData.financials.profit)}</div>
          <div className={`text-sm mt-1 ${
            reportData.financials.profit > 0 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-red-600 dark:text-red-400'
          }`}>
            Margin: {reportData.financials.profitMargin}%
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Revenue Breakdown</h3>
        <p className="text-gray-600 dark:text-gray-400">Revenue generated from {reportData.operations.totalTrips} trips with total fuel cost of {formatCurrency(reportData.financials.totalFuelCost)}.</p>
      </div>
    </div>
  );

  const renderOperationalReport = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Trips</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.operations.totalTrips}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Active Trucks</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.operations.totalTrucks}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">Avg Fuel/Trip</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.operations.averageFuelPerTrip.toFixed(0)}L</div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <div className="text-sm text-gray-600 dark:text-gray-400">On-Time Delivery</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{reportData.operations.onTimeDelivery}%</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Operational Efficiency</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Fleet efficiency metrics: {reportData.operations.totalTrips} trips completed using {reportData.operations.totalTrucks} trucks 
          with an average fuel consumption of {reportData.operations.averageFuelPerTrip.toFixed(0)} liters per trip.
        </p>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Reports & Analytics</h1>
        <p className="text-gray-600 dark:text-gray-400">Comprehensive business intelligence and reporting</p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow dark:shadow-gray-700/30 p-6 mb-6 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex space-x-4">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="overview">Overview Report</option>
              <option value="financial">Financial Report</option>
              <option value="operational">Operational Report</option>
              <option value="fuel">Fuel Analysis</option>
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          <div className="flex space-x-2">
            <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center">
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </button>
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center">
              <FileText className="w-4 h-4 mr-2" />
              Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      {reportType === 'overview' && renderOverviewReport()}
      {reportType === 'financial' && renderFinancialReport()}
      {reportType === 'operational' && renderOperationalReport()}
      {reportType === 'fuel' && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow transition-colors">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Fuel Analysis Report</h3>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Total fuel consumption: <span className="font-semibold text-gray-900 dark:text-gray-100">{reportData.fuelConsumption.total.toLocaleString()}L</span>
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              Average fuel per trip: <span className="font-semibold text-gray-900 dark:text-gray-100">{reportData.operations.averageFuelPerTrip.toFixed(0)}L</span>
            </p>
            <p className="text-gray-600 dark:text-gray-400">
              Total fuel cost: <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(reportData.financials.totalFuelCost)}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;