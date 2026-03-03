import { useState, useEffect } from 'react';
import {
  TrendingUp, Activity, Users, Zap, RefreshCw, BarChart3, ArrowRight,
} from 'lucide-react';
import apiClient from '../../services/api';
import activityHeatmapService from '../../services/activityHeatmapService';
import PerformanceMetricsTab from './PerformanceMetricsTab';
import ActivityHeatmapTab from './ActivityHeatmapTab';

interface Props {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

type View = 'overview' | 'performance' | 'activity';

export default function MonitoringAnalyticsSubTab({ onMessage }: Props) {
  const [view, setView] = useState<View>('overview');
  const [stats, setStats] = useState<{ totalEvents: number; failureRate: string; activeUsers: number; peakHour: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // ActivityHeatmapTab uses reversed onMessage order
  const reversedOnMessage = (msg: string, type?: 'success' | 'error' | 'info') => {
    onMessage((type || 'error') as 'success' | 'error', msg);
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [perfRes, heatmapData] = await Promise.all([
        apiClient.get('/system-admin/performance-metrics', { params: { days: 7 } }),
        activityHeatmapService.get(7),
      ]);
      const perf = perfRes.data.data;
      const peakHour = heatmapData.hours.reduce(
        (best: { count: number; hour: number }, h: { count: number; hour: number }) => h.count > best.count ? h : best,
        heatmapData.hours[0]
      );
      setStats({
        totalEvents: perf.totalRequests,
        failureRate: perf.failureRate,
        activeUsers: heatmapData.topUsers.length,
        peakHour: peakHour.hour,
      });
    } catch {
      // Silent — individual tabs handle their own errors
    } finally {
      setLoading(false);
    }
  };

  const views: { id: View; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'performance', label: 'Performance Metrics' },
    { id: 'activity', label: 'Activity Heatmap' },
  ];

  return (
    <div className="space-y-5">
      {/* Pill navigation */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              view === v.id
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {v.label}
          </button>
        ))}
        {view === 'overview' && (
          <button
            onClick={loadOverview}
            disabled={loading}
            className="ml-auto p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Overview */}
      {view === 'overview' && (
        <div className="space-y-5">
          {/* Stats Cards */}
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
          ) : stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Activity className="w-5 h-5 text-indigo-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalEvents.toLocaleString()}</p>
                <p className="text-xs text-gray-400 mt-1">Events (7d)</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <TrendingUp className={`w-5 h-5 mx-auto mb-2 ${Number(stats.failureRate) > 5 ? 'text-red-500' : 'text-green-500'}`} />
                <p className={`text-2xl font-bold ${Number(stats.failureRate) > 5 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                  {stats.failureRate}%
                </p>
                <p className="text-xs text-gray-400 mt-1">Failure Rate</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Users className="w-5 h-5 text-blue-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.activeUsers}</p>
                <p className="text-xs text-gray-400 mt-1">Active Users</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-center">
                <Zap className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.peakHour}:00</p>
                <p className="text-xs text-gray-400 mt-1">Peak Hour</p>
              </div>
            </div>
          )}

          {/* Quick-link cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setView('performance')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
            >
              <BarChart3 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Performance Metrics</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Action counts, error rates, hourly distribution, severity breakdown, and top users
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
            <button
              onClick={() => setView('activity')}
              className="flex items-start gap-4 p-5 rounded-xl border text-left transition-all hover:shadow-md bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            >
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white">Activity Heatmap</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  User activity patterns by hour and weekday, top users, and top actions heatmap
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
            </button>
          </div>
        </div>
      )}

      {/* Detail views */}
      {view === 'performance' && <PerformanceMetricsTab />}
      {view === 'activity' && <ActivityHeatmapTab onMessage={reversedOnMessage} />}
    </div>
  );
}
