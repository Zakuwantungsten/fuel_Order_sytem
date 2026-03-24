import { useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { formatDate as formatSystemDate } from '../../utils/timezone';
import { 
  Archive, 
  Database, 
  RefreshCw, 
  Settings, 
  Play, 
  Search,
  Download,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Loader,
  History
} from 'lucide-react';
import { archivalAPI } from '../../services/api';

interface ArchivalManagementTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}

const COLLECTION_OPTIONS = [
  { name: 'FuelRecord', label: 'Fuel Records', defaultMonths: 6 },
  { name: 'LPOEntry', label: 'LPO Entries', defaultMonths: 6 },
  { name: 'LPOSummary', label: 'LPO Documents', defaultMonths: 6 },
  { name: 'YardFuelDispense', label: 'Yard Fuel Dispenses', defaultMonths: 6 },
  { name: 'DeliveryOrder', label: 'Delivery Orders', defaultMonths: 12 },
  { name: 'AuditLog', label: 'Audit Logs', defaultMonths: 12 },
];

export default function ArchivalManagementTab({ onMessage, onNavigate }: ArchivalManagementTabProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'browser' | 'history'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [archiveQuery, setArchiveQuery] = useState({
    collection: 'FuelRecord',
    searchTerm: '',
    dateFrom: '',
    dateTo: '',
    limit: 50,
  });
  const [archiveResults, setArchiveResults] = useState<any[]>([]);
  const [archiveResultsLoading, setArchiveResultsLoading] = useState(false);

  // Manual archival options
  const [manualOptions, setManualOptions] = useState({
    dryRun: true,
    monthsToKeep: 6,
    auditLogMonthsToKeep: 12,
    selectedCollections: [] as string[],
  });
  const [archivalRunning, setArchivalRunning] = useState(false);
  const [showArchivalConfirm, setShowArchivalConfirm] = useState(false);

  useEffect(() => {
    loadStats();
    loadHistory();
  }, []);

  const loadStats = async () => {
    try {
      const data = await archivalAPI.getStats();
      setStats(data);
    } catch (error: any) {
      console.error('Failed to load archival stats:', error);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await archivalAPI.getHistory({ limit: 20 });
      setHistory(data || []);
    } catch (error: any) {
      console.error('Failed to load archival history:', error);
    }
  };

  const handleRunArchival = () => {
    setShowArchivalConfirm(true);
  };

  const doRunArchival = async () => {
    const { dryRun, monthsToKeep, auditLogMonthsToKeep, selectedCollections } = manualOptions;
    setShowArchivalConfirm(false);
    setArchivalRunning(true);
    try {
      const result = await archivalAPI.runArchival({
        monthsToKeep,
        auditLogMonthsToKeep,
        dryRun,
        collections: selectedCollections.length > 0 ? selectedCollections : undefined,
      });

      if (result.success) {
        onMessage('success', dryRun 
          ? `Dry run completed. Would archive ${result.data.totalRecordsArchived} records.`
          : `Archival completed successfully. Archived ${result.data.totalRecordsArchived} records.`
        );
        loadStats();
        loadHistory();
      } else {
        onMessage('error', 'Archival failed: ' + (result.data?.errors?.join(', ') || 'Unknown error'));
      }
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to run archival');
    } finally {
      setArchivalRunning(false);
    }
  };

  const handleSearchArchive = async () => {
    setArchiveResultsLoading(true);
    try {
      const query: any = {};
      
      if (archiveQuery.searchTerm) {
        // Simple text search - can be enhanced based on collection type
        query.$or = [
          { truckNo: { $regex: archiveQuery.searchTerm, $options: 'i' } },
          { lpoNo: { $regex: archiveQuery.searchTerm, $options: 'i' } },
          { doNumber: { $regex: archiveQuery.searchTerm, $options: 'i' } },
        ];
      }

      if (archiveQuery.dateFrom || archiveQuery.dateTo) {
        query.archivedAt = {};
        if (archiveQuery.dateFrom) query.archivedAt.$gte = new Date(archiveQuery.dateFrom);
        if (archiveQuery.dateTo) query.archivedAt.$lte = new Date(archiveQuery.dateTo);
      }

      const result = await archivalAPI.queryArchived({
        collectionName: archiveQuery.collection,
        query,
        limit: archiveQuery.limit,
        sort: { archivedAt: -1 },
      });

      setArchiveResults(result.records || []);
      onMessage('success', `Found ${result.count} archived records`);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to search archive');
      setArchiveResults([]);
    } finally {
      setArchiveResultsLoading(false);
    }
  };

  const handleExportUnified = async () => {
    try {
      await archivalAPI.exportUnified({
        collectionName: archiveQuery.collection,
        startDate: archiveQuery.dateFrom,
        endDate: archiveQuery.dateTo,
        format: 'excel',
      });
      onMessage('success', 'Export started. File will download shortly.');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to export data');
    }
  };

  const openDataLifecyclePolicyEditor = () => {
    sessionStorage.setItem('sa_system_preferred_tab', 'config');
    sessionStorage.setItem('sa_system_config_focus_section', 'data');
    onNavigate?.('sa_system');
  };

  const formatDate = (dateString: string) => formatSystemDate(dateString);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Data Archival Management
          </h2>
        </div>
        <button
          onClick={loadStats}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-4">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'config', label: 'Configuration', icon: Settings },
            { id: 'browser', label: 'Archive Browser', icon: Search },
            { id: 'history', label: 'History', icon: History },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Statistics Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-900 dark:text-blue-200">Total Active Records</span>
                    <Database className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                    {(Object.values(stats.activeRecords || {}) as number[]).reduce((a, b) => a + b, 0).toLocaleString()}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 p-4 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-200">Total Archived Records</span>
                    <Archive className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {(Object.values(stats.archivedRecords || {}) as number[]).reduce((a, b) => a + b, 0).toLocaleString()}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-900 dark:text-green-200">Space Saved</span>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {stats.totalSpaceSaved || 'N/A'}
                  </div>
                </div>
              </div>
            )}

            {/* Collection Details */}
            {stats && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Records by Collection
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Collection</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Active</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Archived</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Total</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">% Archived</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(stats.activeRecords || {}).map(collection => {
                        const active = stats.activeRecords[collection] || 0;
                        const archived = stats.archivedRecords[collection] || 0;
                        const total = active + archived;
                        const percentage = total > 0 ? ((archived / total) * 100).toFixed(1) : '0';
                        
                        return (
                          <tr key={collection} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{collection}</td>
                            <td className="py-3 px-4 text-sm text-right text-gray-700 dark:text-gray-300">{active.toLocaleString()}</td>
                            <td className="py-3 px-4 text-sm text-right text-purple-600 dark:text-purple-400">{archived.toLocaleString()}</td>
                            <td className="py-3 px-4 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{total.toLocaleString()}</td>
                            <td className="py-3 px-4 text-sm text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                  <div 
                                    className="bg-purple-600 h-2 rounded-full transition-all" 
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                                <span className="text-gray-700 dark:text-gray-300 w-12">{percentage}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Last Archival Info */}
            {stats?.lastArchivalDate && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">Last Archival:</span>
                  <span>{formatDate(stats.lastArchivalDate)}</span>
                </div>
              </div>
            )}

            {/* Manual Archival Section */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Play className="w-5 h-5 text-blue-600" />
                Manual Archival
              </h3>
              
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div className="text-sm text-orange-900 dark:text-orange-200">
                    <strong>Warning:</strong> Archival moves data to separate collections. Always test with DRY RUN first.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data Retention (months)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={manualOptions.monthsToKeep}
                    onChange={(e) => setManualOptions({ ...manualOptions, monthsToKeep: parseInt(e.target.value) || 6 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Archive data older than this period
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Audit Log Retention (months)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={manualOptions.auditLogMonthsToKeep}
                    onChange={(e) => setManualOptions({ ...manualOptions, auditLogMonthsToKeep: parseInt(e.target.value) || 12 })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Separate retention for audit logs
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <label className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={manualOptions.dryRun}
                    onChange={(e) => setManualOptions({ ...manualOptions, dryRun: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Dry Run (test mode - no data will be moved)
                  </span>
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRunArchival}
                  disabled={archivalRunning}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    manualOptions.dryRun
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-orange-600 hover:bg-orange-700 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {archivalRunning ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {archivalRunning ? 'Running...' : manualOptions.dryRun ? 'Run Dry Run' : 'Run Archival'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIGURATION TAB */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Archival Policy Summary
              </h3>
              <button
                onClick={openDataLifecyclePolicyEditor}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                <Settings className="w-4 h-4" />
                Manage in Data Lifecycle Policy
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-blue-900 dark:text-blue-200">Archival &amp; Retention Policy</p>
                  <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                    Enable archival, set global retention periods, and configure per-collection overrides in <strong>System &rarr; Configuration &rarr; Data Lifecycle Policy</strong>.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('sa_system_config_focus_section', 'data');
                  onNavigate?.('sa_system');
                }}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
              >
                Configure Policy
              </button>
            </div>
          </div>
        )}

        {/* ARCHIVE BROWSER TAB */}
        {activeTab === 'browser' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Browse Archived Data
            </h3>

            {/* Search Form */}
            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Collection
                  </label>
                  <select
                    value={archiveQuery.collection}
                    onChange={(e) => setArchiveQuery({ ...archiveQuery, collection: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >Select
                    {COLLECTION_OPTIONS.map(opt => (
                      <option key={opt.name} value={opt.name}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Search Term
                  </label>
                  <input
                    type="text"
                    value={archiveQuery.searchTerm}
                    onChange={(e) => setArchiveQuery({ ...archiveQuery, searchTerm: e.target.value })}
                    placeholder="Truck No, LPO No, DO Number..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Archived From
                  </label>
                  <input
                    type="date"
                    value={archiveQuery.dateFrom}
                    onChange={(e) => setArchiveQuery({ ...archiveQuery, dateFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Archived To
                  </label>
                  <input
                    type="date"
                    value={archiveQuery.dateTo}
                    onChange={(e) => setArchiveQuery({ ...archiveQuery, dateTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSearchArchive}
                  disabled={archiveResultsLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                >
                  {archiveResultsLoading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Search Archive
                </button>

                <button
                  onClick={handleExportUnified}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                >
                  <Download className="w-4 h-4" />
                  Export to Excel
                </button>
              </div>
            </div>

            {/* Results */}
            {archiveResults.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Search Results ({archiveResults.length})
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">Original ID</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">Data</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">Archived At</th>
                        <th className="text-left py-2 px-3 text-sm font-medium text-gray-700 dark:text-gray-300">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archiveResults.map((record, idx) => (
                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="py-2 px-3 text-sm text-gray-900 dark:text-gray-100 font-mono">
                            {record.originalId?.slice(-8) || 'N/A'}
                          </td>
                          <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">
                            <div className="max-w-md truncate">
                              {JSON.stringify(record).substring(0, 100)}...
                            </div>
                          </td>
                          <td className="py-2 px-3 text-sm text-gray-700 dark:text-gray-300">
                            {record.archivedAt ? formatDate(record.archivedAt) : 'N/A'}
                          </td>
                          <td className="py-2 px-3 text-sm text-gray-600 dark:text-gray-400">
                            {record.archivedReason || 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {archiveResults.length === 0 && !archiveResultsLoading && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No archived records found. Try adjusting your search criteria.</p>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Archival Execution History
            </h3>

            {history.length > 0 ? (
              <div className="space-y-3">
                {history.map((execution: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {execution.status === 'completed' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : execution.status === 'failed' ? (
                          <AlertTriangle className="w-5 h-5 text-red-600" />
                        ) : (
                          <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {execution.collectionName}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {execution.completedAt ? formatDate(execution.completedAt) : 'In progress'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Records Archived:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {execution.recordsArchived?.toLocaleString() || 0}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Duration:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {execution.duration ? `${(execution.duration / 1000).toFixed(2)}s` : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Initiated By:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {execution.initiatedBy || 'system'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Cutoff Date:</span>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {execution.cutoffDate ? new Date(execution.cutoffDate).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No archival history available yet.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={showArchivalConfirm}
        title={manualOptions.dryRun ? 'Run Dry Run Archival' : 'Run Actual Archival'}
        message={manualOptions.dryRun
          ? 'Run archival in DRY RUN mode? No data will be moved or deleted — this is a safe preview.'
          : `This will move data older than ${manualOptions.monthsToKeep} months to archive collections. This action cannot be undone.`
        }
        variant={manualOptions.dryRun ? 'info' : 'danger'}
        confirmLabel={manualOptions.dryRun ? 'Run Dry Run' : 'Run Archival'}
        loading={archivalRunning}
        onConfirm={doRunArchival}
        onCancel={() => setShowArchivalConfirm(false)}
      />
    </div>
  );
}
