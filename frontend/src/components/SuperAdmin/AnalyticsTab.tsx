import { useState, useEffect } from 'react';
import { TrendingUp, BarChart, Download, TrendingDown, DollarSign, Fuel, Truck, Activity, RefreshCw } from 'lucide-react';
import { analyticsAPI } from '../../services/api';
import { DashboardAnalytics } from '../../types';

interface AnalyticsTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function AnalyticsTab({ onMessage }: AnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('30');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [period]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await analyticsAPI.getDashboard({ period: parseInt(period) });
      setAnalytics(data);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (reportType: 'revenue' | 'fuel' | 'user-activity' | 'comprehensive') => {
    try {
      setExporting(true);
      const blob = await analyticsAPI.exportReport({
        reportType,
        startDate: analytics?.period.start,
        endDate: analytics?.period.end,
      });
      
      // Create download for Excel file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportType}_report_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      onMessage('success', 'Excel report downloaded successfully');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return `TSh ${(amount / 1000000).toFixed(1)}M`;
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatTrend = (value: number): string => {
    return value > 0 ? `+${value.toFixed(1)}%` : `${value.toFixed(1)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-pink-600 dark:text-pink-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Analytics & Reports
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          
          <button
            onClick={loadAnalytics}
            disabled={loading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={() => handleExport('comprehensive')}
            disabled={exporting || !analytics}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {loading && !analytics ? (
        <div className="p-8 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">Loading analytics...</p>
        </div>
      ) : analytics ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Revenue</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {formatCurrency(analytics.summary.totalRevenue)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1">
                {analytics.summary.revenueTrend >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                <p className={`text-sm ${
                  analytics.summary.revenueTrend >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatTrend(analytics.summary.revenueTrend)}
                </p>
                <span className="text-sm text-gray-500 dark:text-gray-400">vs previous period</span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                    <Fuel className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Fuel Dispensed</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {formatNumber(Math.round(analytics.summary.fuelDispensed))} L
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1">
                {analytics.summary.fuelTrend >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                <p className={`text-sm ${
                  analytics.summary.fuelTrend >= 0 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatTrend(analytics.summary.fuelTrend)}
                </p>
                <span className="text-sm text-gray-500 dark:text-gray-400">vs previous period</span>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                    <Truck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Active Trucks</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                      {analytics.summary.activeTrucks}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1">
                {analytics.summary.truckTrend >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                )}
                <p className={`text-sm ${
                  analytics.summary.truckTrend >= 0 
                    ? 'text-purple-600 dark:text-purple-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {analytics.summary.truckTrend >= 0 ? '+' : ''}{analytics.summary.truckTrend}
                </p>
                <span className="text-sm text-gray-500 dark:text-gray-400">vs previous period</span>
              </div>
            </div>
          </div>

          {/* Top Trucks */}
          {analytics.charts.topTrucks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Truck className="w-5 h-5" />
                Top Performing Trucks
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="text-left py-2 text-sm font-medium text-gray-500 dark:text-gray-400">Truck No</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-500 dark:text-gray-400">Trips</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-500 dark:text-gray-400">Tonnage</th>
                      <th className="text-right py-2 text-sm font-medium text-gray-500 dark:text-gray-400">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.charts.topTrucks.slice(0, 5).map((truck) => (
                      <tr key={truck._id} className="border-b dark:border-gray-700 last:border-0">
                        <td className="py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{truck._id}</td>
                        <td className="py-3 text-sm text-right text-gray-600 dark:text-gray-400">{truck.trips}</td>
                        <td className="py-3 text-sm text-right text-gray-600 dark:text-gray-400">{truck.totalTonnage.toFixed(1)}</td>
                        <td className="py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(truck.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fuel by Station */}
          {analytics.charts.fuelByStation.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Fuel className="w-5 h-5" />
                Fuel Consumption by Station
              </h3>
              <div className="space-y-3">
                {analytics.charts.fuelByStation.map((station) => (
                  <div key={station._id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{station._id}</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formatNumber(Math.round(station.totalLiters))} L
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${(station.totalLiters / analytics.charts.fuelByStation[0].totalLiters) * 100}%`
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Reports */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <BarChart className="w-5 h-5" />
              Quick Reports
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button
                onClick={() => handleExport('revenue')}
                disabled={exporting}
                className="px-4 py-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Revenue Report
              </button>
              <button
                onClick={() => handleExport('fuel')}
                disabled={exporting}
                className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Fuel Report
              </button>
              <button
                onClick={() => handleExport('user-activity')}
                disabled={exporting}
                className="px-4 py-3 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                User Activity
              </button>
              <button
                onClick={() => handleExport('comprehensive')}
                disabled={exporting}
                className="px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Full Report
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          {analytics.recentActivity.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Recent Activity
              </h3>
              <div className="space-y-3">
                {analytics.recentActivity.slice(0, 10).map((activity, index) => (
                  <div key={index} className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{activity.user}</span>
                    <span className="text-gray-600 dark:text-gray-400">{activity.action}</span>
                    <span className="text-gray-500 dark:text-gray-500">{activity.resource}</span>
                    <span className="ml-auto text-xs text-gray-400">
                      {new Date(activity.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="p-8 text-center">
          <BarChart className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">No analytics data available</p>
        </div>
      )}
    </div>
  );
}
