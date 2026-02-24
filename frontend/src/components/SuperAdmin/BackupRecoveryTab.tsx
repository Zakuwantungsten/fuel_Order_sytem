import { useState, useEffect } from 'react';
import { formatDate as formatSystemDate } from '../../utils/timezone';
import { Database, Download, Upload, Calendar, RefreshCw, Trash2, AlertCircle, CheckCircle, Clock, HardDrive, Package } from 'lucide-react';
import { backupAPI } from '../../services/api';
import { Backup, BackupSchedule, BackupStats } from '../../types';

interface BackupRecoveryTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function BackupRecoveryTab({ onMessage }: BackupRecoveryTabProps) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [_showScheduleModal, setShowScheduleModal] = useState(false);
  // Using underscore prefix to suppress unused variable warning
  void _showScheduleModal;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [backupsData, schedulesData, statsData] = await Promise.all([
        backupAPI.getBackups({ limit: 20 }),
        backupAPI.getSchedules(),
        backupAPI.getStats(),
      ]);
      
      setBackups(backupsData.backups || []);
      setSchedules(schedulesData || []);
      setStats(statsData);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load backup data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      await backupAPI.createBackup();
      onMessage('success', 'Backup created successfully');
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (backup: Backup) => {
    try {
      const result = await backupAPI.downloadBackup(backup.id);
      window.open(result.url, '_blank');
      onMessage('success', 'Download started');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to download backup');
    }
  };

  const handleRestore = async (backup: Backup) => {
    if (!confirm(`Are you sure you want to restore from "${backup.fileName}"? This will replace all current data!`)) {
      return;
    }

    try {
      await backupAPI.restoreBackup(backup.id);
      onMessage('success', 'Backup restore started. This may take several minutes.');
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to restore backup');
    }
  };

  const handleDelete = async (backup: Backup) => {
    if (!confirm(`Delete backup "${backup.fileName}"?`)) {
      return;
    }

    try {
      await backupAPI.deleteBackup(backup.id);
      onMessage('success', 'Backup deleted successfully');
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to delete backup');
    }
  };

  const handleToggleSchedule = async (schedule: BackupSchedule) => {
    try {
      await backupAPI.updateSchedule(schedule.id, { enabled: !schedule.enabled });
      onMessage('success', `Schedule ${schedule.enabled ? 'disabled' : 'enabled'}`);
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update schedule');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => formatSystemDate(dateString);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Backup & Recovery
          </h2>
        </div>
        <button 
          onClick={handleCreateBackup}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {creating ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Create Backup Now
            </>
          )}
        </button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.totalBackups}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Backups</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.completedBackups}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.failedBackups}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Failed</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatBytes(stats.totalSize)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total Size</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backup List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm">
        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Available Backups ({backups.length})
          </h3>
          <button
            onClick={loadData}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">Loading backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-gray-500 dark:text-gray-400">No backups found</p>
            <button
              onClick={handleCreateBackup}
              className="mt-4 text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Create your first backup
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {backups.map((backup) => (
              <div key={backup.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
                    {getStatusIcon(backup.status)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{backup.fileName}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        backup.type === 'manual' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {backup.type}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        backup.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : backup.status === 'failed'
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      }`}>
                        {backup.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatBytes(backup.fileSize)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(backup.createdAt)}
                      </p>
                      {backup.metadata && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {backup.metadata.totalDocuments.toLocaleString()} documents
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        by {backup.createdBy}
                      </p>
                    </div>
                    {backup.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                        Error: {backup.error}
                      </p>
                    )}
                  </div>
                </div>
                
                {backup.status === 'completed' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(backup)}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                      title="Restore from this backup"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDownload(backup)}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center gap-1"
                      title="Download backup file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(backup)}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title="Delete backup"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheduled Backups */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Backup Schedules
          </h3>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add Schedule
          </button>
        </div>

        {schedules.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            No backup schedules configured
          </p>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between p-3 border dark:border-gray-700 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={() => handleToggleSchedule(schedule)}
                    className="rounded text-indigo-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {schedule.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {schedule.frequency} at {schedule.time} • Retention: {schedule.retentionDays} days
                    </p>
                  </div>
                </div>
                {schedule.lastRun && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last run: {formatDate(schedule.lastRun)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-300">
            <strong>Cloudflare R2 Storage:</strong> All backups are securely stored in Cloudflare R2 cloud storage with automatic retention management.
          </p>
        </div>
      </div>
    </div>
  );
}
