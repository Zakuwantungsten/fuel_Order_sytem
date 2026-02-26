import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { yardFuelService } from '../services/yardFuelService';
import { useRealtimeSync } from '../hooks/useRealtimeSync';

interface PendingYardFuelAlert {
  truckNo: string;
  yard: string;
  liters: number;
  date: string;
  timestamp: string;
  enteredBy: string;
  hoursPending: number;
}

interface YardFuelAlertWidgetProps {
  onViewDetails?: () => void;
}

export default function YardFuelAlertWidget({ onViewDetails }: YardFuelAlertWidgetProps) {
  const [, setPendingEntries] = useState<PendingYardFuelAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    over24Hours: 0,
    over48Hours: 0,
    totalLiters: 0,
  });

  useEffect(() => {
    loadPendingEntries();
    // Refresh every 5 minutes
    const interval = setInterval(loadPendingEntries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadPendingEntries = async () => {
    try {
      setLoading(true);
      const response = await yardFuelService.getAll({ status: 'pending', page: 1, limit: 100 });
      const entries = response.items || [];

      // Calculate hours pending for each entry
      const now = new Date();
      const entriesWithHours = entries.map((entry: any) => ({
        ...entry,
        hoursPending: Math.floor((now.getTime() - new Date(entry.timestamp).getTime()) / (1000 * 60 * 60)),
      }));

      setPendingEntries(entriesWithHours);

      // Calculate statistics
      const totalLiters = entries.reduce((sum: number, e: any) => sum + (e.liters || 0), 0);
      const over24 = entriesWithHours.filter((e) => e.hoursPending >= 24).length;
      const over48 = entriesWithHours.filter((e) => e.hoursPending >= 48).length;

      setStats({
        total: entries.length,
        over24Hours: over24,
        over48Hours: over48,
        totalLiters: totalLiters,
      });
    } catch (error) {
      console.error('Failed to load pending yard fuel entries:', error);
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync('yard_fuel', loadPendingEntries);

  // Don't show widget if no pending entries
  if (!loading && stats.total === 0) {
    return null;
  }

  const getSeverityColor = () => {
    if (stats.over48Hours > 0) return 'red';
    if (stats.over24Hours > 0) return 'orange';
    return 'yellow';
  };

  const severityColors = {
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      icon: 'text-red-600 dark:text-red-400',
      text: 'text-red-900 dark:text-red-100',
      badge: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200',
    },
    orange: {
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800',
      icon: 'text-orange-600 dark:text-orange-400',
      text: 'text-orange-900 dark:text-orange-100',
      badge: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200',
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      icon: 'text-yellow-600 dark:text-yellow-400',
      text: 'text-yellow-900 dark:text-yellow-100',
      badge: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200',
    },
  };

  const colors = severityColors[getSeverityColor()];

  return (
    <div className={`border-2 rounded-lg p-4 ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${colors.icon}`} />
          <h3 className={`font-bold text-lg ${colors.text}`}>
            Pending Yard Fuel Entries
          </h3>
        </div>
        {stats.over48Hours > 0 && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${colors.badge}`}>
            URGENT
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`p-3 bg-white dark:bg-gray-800 rounded-lg border ${colors.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Total Pending</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
            </div>

            <div className={`p-3 bg-white dark:bg-gray-800 rounded-lg border ${colors.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-gray-500" />
                <span className="text-xs text-gray-600 dark:text-gray-400">Total Liters</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {stats.totalLiters.toLocaleString()}L
              </p>
            </div>
          </div>

          {stats.over24Hours > 0 && (
            <div className={`p-3 rounded-lg mb-3 ${colors.badge}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-semibold">
                  {stats.over48Hours > 0
                    ? `${stats.over48Hours} entries pending for 48+ hours`
                    : `${stats.over24Hours} entries pending for 24+ hours`}
                </span>
              </div>
              <p className="text-xs mt-1 ml-6">
                These entries may require manual review or DO creation
              </p>
            </div>
          )}

          <button
            onClick={onViewDetails}
            className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${
              stats.over48Hours > 0
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : stats.over24Hours > 0
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            }`}
          >
            Review {stats.total} Pending {stats.total === 1 ? 'Entry' : 'Entries'}
          </button>

          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Auto-linking now excludes cancelled DOs for accurate matching
            </p>
          </div>
        </>
      )}
    </div>
  );
}
