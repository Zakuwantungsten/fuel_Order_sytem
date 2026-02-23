import { useState, useEffect } from 'react';
import { 
  Database, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw,
  HardDrive,
  Zap
} from 'lucide-react';
import { systemAdminAPI } from '../../services/api';

interface DatabaseMonitorTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function DatabaseMonitorTab({ onMessage }: DatabaseMonitorTabProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    loadMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(loadMetrics, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const loadMetrics = async () => {
    try {
      const data = await systemAdminAPI.getDatabaseMetrics();
      setMetrics(data);
      setLoading(false);
    } catch (error: any) {
      onMessage('error', 'Failed to load database metrics');
      setLoading(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header with Auto-refresh Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          🔴 Real-Time Database Monitor
        </h2>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={loadMetrics}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Now
          </button>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Connection Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-xs font-medium text-green-600 dark:text-green-400">LIVE</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Connection Status</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            ✅ Connected
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Pool: {metrics?.connections?.current || 0}/{metrics?.connections?.available || 0}
          </p>
        </div>

        {/* Queries Per Second */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Queries/Second</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {metrics?.performance?.queriesPerSecond || 0} q/s
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            🟢 Normal
          </p>
        </div>

        {/* Response Time */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Avg Response Time</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {metrics?.performance?.averageResponseTime || 0}ms
          </p>
          <p className="text-xs text-green-600 dark:text-green-400 mt-2">
            🟢 Good
          </p>
        </div>

        {/* Database Size */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <HardDrive className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Database Size</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {formatBytes(metrics?.storage?.totalSize || 0)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Data: {formatBytes(metrics?.storage?.dataSize || 0)}
          </p>
        </div>
      </div>

      {/* Active Connections */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Active Connections
        </h3>
        <div className="space-y-2">
          {metrics?.activeConnections?.length > 0 ? (
            metrics.activeConnections.map((conn: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {conn.user}
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">@ {conn.ip}</span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Active {conn.durationSeconds < 60
                        ? `${conn.durationSeconds}s`
                        : `${Math.floor(conn.durationSeconds / 60)}min`} — {conn.requestCount} {conn.requestCount === 1 ? 'request' : 'requests'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 capitalize">
                  {conn.role?.replace(/_/g, ' ')}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-gray-500 dark:text-gray-400">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No active connections detected</p>
            </div>
          )}
        </div>
      </div>

      {/* Slow Queries */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          Slow Queries ({">"} 500ms)
        </h3>
        {metrics?.performance?.slowQueries?.length > 0 ? (
          <div className="space-y-2">
            {metrics.performance.slowQueries.map((query: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {query.query || 'Query details'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Collection: {query.collection || 'Unknown'} • {query.executionTime || 0}ms
                  </p>
                </div>
                <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  ⚠️ Slow
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-sm">No slow queries detected</p>
          </div>
        )}
      </div>

      {/* Collection Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          Collection Statistics
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Collection</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Documents</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Indexes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {metrics?.collections?.map((collection: any, index: number) => (
                <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {collection.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {collection.documentCount?.toLocaleString() || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {formatBytes(collection.size || 0)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                    {collection.indexes || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
