import { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
import { formatDate as formatSystemDate } from '../../utils/timezone';
import {
  Database, Download, Upload, Calendar, RefreshCw, Trash2, AlertCircle,
  CheckCircle, Clock, HardDrive, Package, Lock, ChevronDown, ChevronRight,
  Plus, Pencil, X, Settings, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import { backupAPI } from '../../services/api';
import { systemConfigAPI } from '../../services/systemConfigService';
import { Backup, BackupSchedule, BackupStats } from '../../types';

interface BackupRecoveryTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}

interface ScheduleFormState {
  name: string;
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
  time: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  retentionDays: number;
}

const EMPTY_FORM: ScheduleFormState = {
  name: '',
  frequency: 'daily',
  time: '02:00',
  retentionDays: 30,
};

// Inline toggle component
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`inline-block w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
      }`} />
    </button>
  );
}

export default function BackupRecoveryTab({ onMessage }: BackupRecoveryTabProps) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expandedBackupId, setExpandedBackupId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const restorePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Backup settings (from system config)
  const [backupFrequency, setBackupFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [backupRetention, setBackupRetention] = useState<number>(30);
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Schedule CRUD
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(EMPTY_FORM);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [togglingScheduleId, setTogglingScheduleId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Confirm modal
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning';
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadData();
    loadBackupSettings();
    return () => {
      if (restorePollRef.current) clearInterval(restorePollRef.current);
    };
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────

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

  const loadBackupSettings = async () => {
    try {
      const settings = await systemConfigAPI.getSystemSettings();
      setBackupFrequency(settings.data.backupFrequency ?? 'daily');
      setBackupRetention(settings.data.backupRetention ?? 30);
    } catch {
      // non-blocking — settings default values remain
    }
  };

  // ── Backup settings save ──────────────────────────────────────────────────

  const saveBackupSettings = async () => {
    try {
      setSettingsSaving(true);
      const result = await systemConfigAPI.updateDataRetentionSettings({ backupFrequency, backupRetention });
      const pruneStarted = result?.data?.pruneStarted ?? result?.pruneStarted ?? false;
      onMessage(
        'success',
        pruneStarted
          ? 'Backup settings saved — excess copies are pruning in the background (R2 + B2)'
          : 'Backup settings saved'
      );
      // Refresh list shortly after; full prune may still be running
      if (pruneStarted) setTimeout(() => loadData(), 5000);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to save backup settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // ── Backup actions ────────────────────────────────────────────────────────

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      await backupAPI.createBackup();
      onMessage('success', 'Backup queued — it will run in the background');
      setTimeout(() => loadData(), 3000);
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

  const startRestorePolling = (id: string) => {
    setRestoringId(id);
    if (restorePollRef.current) clearInterval(restorePollRef.current);
    restorePollRef.current = setInterval(async () => {
      try {
        const updated = await backupAPI.getBackupById(id);
        // 'restoring' means the backend is still working — keep polling.
        // Any other status (completed, failed, etc.) means it's done.
        if (updated?.status !== 'restoring') {
          clearInterval(restorePollRef.current!);
          restorePollRef.current = null;
          setRestoringId(null);
          if (updated?.status === 'completed' && !updated?.error) {
            onMessage('success', 'Restore completed successfully');
          } else {
            onMessage('error', updated?.error || 'Restore failed');
          }
          loadData();
        }
      } catch {
        clearInterval(restorePollRef.current!);
        restorePollRef.current = null;
        setRestoringId(null);
      }
    }, 3000);
  };

  const handleRestore = (backup: Backup) => {
    const total = backup.metadata?.totalDocuments;
    const business = backup.metadata?.businessDocuments;
    const noBusinessData = business === 0;

    const countLine = total !== undefined
      ? `\n\nThis backup contains ${total.toLocaleString()} document(s)` +
        (business !== undefined ? ` (${business.toLocaleString()} business record(s))` : '') +
        `, taken ${formatDate(backup.createdAt)}.`
      : '';

    const emptyWarning = noBusinessData
      ? `\n\n⚠ WARNING: this backup has NO business data — restoring it will leave your delivery orders, fuel records and LPOs EMPTY. This is almost certainly a snapshot of an empty database. Are you sure?`
      : '';

    setConfirmState({
      title: 'Restore Backup',
      message: `Restore from "${backup.fileName}"?${countLine}${emptyWarning}\n\nThis will overwrite all current data and cannot be undone.`,
      variant: noBusinessData ? 'danger' : 'warning',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await backupAPI.restoreBackup(backup.id);
          setConfirmState(null);
          startRestorePolling(backup.id);
        } catch (error: any) {
          onMessage('error', error.response?.data?.message || 'Failed to restore backup');
        } finally {
          setConfirming(false);
          setConfirmState(null);
        }
      },
    });
  };

  const handleDelete = (backup: Backup) => {
    setConfirmState({
      title: 'Move to Trash',
      message: `Move "${backup.fileName}" to trash? It will be permanently deleted after 7 days, or you can restore it before then.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await backupAPI.deleteBackup(backup.id);
          onMessage('success', 'Backup moved to trash');
          loadData();
        } catch (error: any) {
          onMessage('error', error.response?.data?.message || 'Failed to delete backup');
        } finally {
          setConfirming(false);
          setConfirmState(null);
        }
      },
    });
  };

  const handleVerify = async (backup: Backup) => {
    setVerifyingId(backup.id);
    try {
      const result = await backupAPI.verifyBackup(backup.id);
      onMessage(
        result.passed ? 'success' : 'error',
        result.passed ? `Integrity verified ✓` : `Verification failed: ${result.details}`,
      );
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSyncFromR2 = async () => {
    setSyncing(true);
    try {
      const result = await backupAPI.syncFromR2();
      onMessage('success', `Synced ${result.restored} backup record(s) from R2 into local database`);
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to sync from R2');
    } finally {
      setSyncing(false);
    }
  };

  // ── Schedule CRUD ─────────────────────────────────────────────────────────

  const openCreateSchedule = () => {
    setEditingScheduleId(null);
    setScheduleForm(EMPTY_FORM);
    setShowScheduleForm(true);
  };

  const openEditSchedule = (schedule: BackupSchedule) => {
    setEditingScheduleId(schedule.id);
    setScheduleForm({
      name: schedule.name,
      frequency: schedule.frequency,
      time: schedule.time,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      retentionDays: schedule.retentionDays,
    });
    setShowScheduleForm(true);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.name.trim()) {
      onMessage('error', 'Schedule name is required');
      return;
    }
    try {
      setSavingSchedule(true);
      if (editingScheduleId) {
        await backupAPI.updateSchedule(editingScheduleId, scheduleForm);
        onMessage('success', 'Schedule updated');
      } else {
        await backupAPI.createSchedule(scheduleForm);
        onMessage('success', 'Schedule created');
      }
      setShowScheduleForm(false);
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to save schedule');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleSchedule = async (schedule: BackupSchedule) => {
    try {
      setTogglingScheduleId(schedule.id);
      await backupAPI.updateSchedule(schedule.id, { enabled: !schedule.enabled });
      setSchedules(prev =>
        prev.map(s => s.id === schedule.id ? { ...s, enabled: !s.enabled } : s)
      );
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update schedule');
    } finally {
      setTogglingScheduleId(null);
    }
  };

  const handleDeleteSchedule = (schedule: BackupSchedule) => {
    setConfirmState({
      title: 'Delete Schedule',
      message: `Delete schedule "${schedule.name}"? This cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await backupAPI.deleteSchedule(schedule.id);
          onMessage('success', 'Schedule deleted');
          loadData();
        } catch (error: any) {
          onMessage('error', error.response?.data?.message || 'Failed to delete schedule');
        } finally {
          setConfirming(false);
          setConfirmState(null);
        }
      },
    });
  };

  // ── Utility ───────────────────────────────────────────────────────────────

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => formatSystemDate(dateString);

  const timeUntil = (dateString: string): string => {
    const diff = new Date(dateString).getTime() - Date.now();
    if (diff <= 0) return 'Due now';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) { const d = Math.floor(h / 24); return `in ${d}d ${h % 24}h`; }
    return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
  };

  const getCompressionRatio = (backup: Backup): string | null => {
    if (!backup.metadata?.databaseSize || !backup.fileSize || backup.metadata.databaseSize <= 0) return null;
    const pct = Math.round((1 - backup.fileSize / backup.metadata.databaseSize) * 100);
    return pct > 0 ? `${pct}% compressed` : null;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_progress': return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'restoring': return <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
  const quotaPct = stats ? Math.min(100, (stats.totalSize / QUOTA_BYTES) * 100) : 0;
  const quotaBarColor =
    quotaPct >= 90 ? 'bg-red-500' : quotaPct >= 70 ? 'bg-amber-500' : 'bg-green-500';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Backup & Recovery</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncFromR2}
            disabled={syncing}
            title="Pull backup records from R2 into local database (use when local DB is missing entries that exist in R2)"
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {syncing ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Syncing…</>
            ) : (
              <><RefreshCw className="w-4 h-4" />Sync from R2</>
            )}
          </button>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? (
              <><RefreshCw className="w-4 h-4 animate-spin" />Creating...</>
            ) : (
              <><Download className="w-4 h-4" />Create Backup Now</>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

          {/* Storage quota gauge */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-gray-400" />
                R2 Storage Used
              </span>
              <span className={`text-xs font-semibold ${
                quotaPct >= 90 ? 'text-red-600 dark:text-red-400' :
                quotaPct >= 70 ? 'text-amber-600 dark:text-amber-400' :
                'text-gray-500 dark:text-gray-400'
              }`}>
                {formatBytes(stats.totalSize)} / 5 GB ({quotaPct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${quotaBarColor}`}
                style={{ width: `${quotaPct}%` }}
              />
            </div>
            {quotaPct >= 70 && (
              <p className={`mt-1.5 text-xs ${quotaPct >= 90 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {quotaPct >= 90 ? 'Critical: storage almost full — delete old backups or increase quota.' : 'Warning: storage above 70% — consider cleaning up old backups.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Backup health banner */}
      {stats && (() => {
        const newest = stats.newestBackup ? new Date(stats.newestBackup) : null;
        const hoursOld = newest ? (Date.now() - newest.getTime()) / 3_600_000 : Infinity;
        const hasEnabledSchedule = schedules.some(s => s.enabled);
        if (stats.completedBackups === 0) {
          return (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>No completed backups.</strong> Create a backup now to protect your data against data loss.
              </p>
            </div>
          );
        }
        if (hoursOld > 48 && hasEnabledSchedule) {
          return (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Backup health warning:</strong> Last successful backup was {Math.floor(hoursOld)}h ago.
                Check that your scheduled backups are running correctly.
              </p>
            </div>
          );
        }
        return null;
      })()}

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
          <UnifiedTabLoader label="Loading backups..." heightClassName="py-16" />
        ) : backups.length === 0 ? (
          <div className="p-8 text-center">
            <Database className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-gray-500 dark:text-gray-400">No backups found</p>
            <button onClick={handleCreateBackup} className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
              Create your first backup
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {backups.map((backup) => {
              const isExpanded = expandedBackupId === backup.id;
              const isRestoring = restoringId === backup.id;
              const compressionRatio = getCompressionRatio(backup);

              return (
                <div key={backup.id}>
                  <div className="p-4 flex items-start justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Status icon */}
                      <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        {isRestoring ? <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" /> : getStatusIcon(backup.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Row 1: filename + badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs">
                            {backup.fileName}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                            backup.type === 'manual'
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}>
                            {backup.type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                            backup.status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : backup.status === 'failed'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : backup.status === 'restoring'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                              : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          }`}>
                            {isRestoring || backup.status === 'restoring' ? 'restoring…' : backup.status}
                          </span>

                          {/* Encryption badge */}
                          {backup.metadata?.encrypted && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 flex-shrink-0">
                              <Lock className="w-3 h-3" />
                              {backup.metadata.encryptionAlgorithm ?? 'Encrypted'}
                            </span>
                          )}

                          {/* Empty-data warning badge */}
                          {backup.metadata?.businessDocuments === 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 flex-shrink-0">
                              <AlertCircle className="w-3 h-3" />
                              No business data
                            </span>
                          )}

                          {/* Verification badge */}
                          {backup.metadata?.verifiedAt && (
                            backup.metadata.verificationPassed
                              ? <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex-shrink-0">
                                  <ShieldCheck className="w-3 h-3" />Verified
                                </span>
                              : <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 flex-shrink-0">
                                  <ShieldAlert className="w-3 h-3" />Unverified
                                </span>
                          )}
                        </div>

                        {/* Row 2: metadata line */}
                        <div className="flex flex-wrap items-center gap-3 mt-1.5">
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(backup.fileSize)}</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(backup.createdAt)}</span>
                          {backup.metadata && (
                            <>
                              <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {backup.metadata.totalDocuments.toLocaleString()} docs
                              </span>
                            </>
                          )}
                          {backup.metadata?.compression && (
                            <>
                              <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {backup.metadata.compression}
                                {compressionRatio && ` (${compressionRatio})`}
                              </span>
                            </>
                          )}
                          <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">by {backup.createdBy}</span>
                        </div>

                        {/* Collections expand toggle */}
                        {backup.collections && backup.collections.length > 0 && (
                          <button
                            onClick={() => setExpandedBackupId(isExpanded ? null : backup.id)}
                            className="flex items-center gap-1 mt-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                            {backup.collections.length} collection{backup.collections.length !== 1 ? 's' : ''}
                          </button>
                        )}

                        {/* Restore in-progress status */}
                        {isRestoring && (
                          <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Restore in progress — polling for completion…
                          </p>
                        )}

                        {backup.error && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Error: {backup.error}</p>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {backup.status === 'completed' && !isRestoring && (
                      <div className="flex gap-2 flex-shrink-0 ml-4">
                        <button
                          onClick={() => handleRestore(backup)}
                          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                          title="Restore from this backup"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Restore
                        </button>
                        <button
                          onClick={() => handleVerify(backup)}
                          disabled={verifyingId === backup.id}
                          className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors flex items-center gap-1 disabled:opacity-60"
                          title="Verify backup integrity"
                        >
                          {verifyingId === backup.id
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : <ShieldCheck className="w-3.5 h-3.5" />}
                          Verify
                        </button>
                        <button
                          onClick={() => handleDownload(backup)}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                          title="Download backup file"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        <button
                          onClick={() => handleDelete(backup)}
                          className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                          title="Move to trash"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded collections */}
                  {isExpanded && backup.collections.length > 0 && (
                    <div className="px-4 pb-3 pt-0 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-100 dark:border-gray-700/50">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                        Collections backed up
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {backup.collections.map(col => (
                          <span
                            key={col}
                            className="px-2 py-0.5 text-xs rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Backup Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-5">
          <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          Backup Settings
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Backup Frequency
            </label>
            <select
              value={backupFrequency}
              onChange={e => setBackupFrequency(e.target.value as 'hourly' | 'daily' | 'weekly' | 'monthly')}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Backup Retention (copies to keep)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={backupRetention}
              onChange={e => setBackupRetention(Math.max(1, Number(e.target.value)))}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Keeps the newest N completed backups. Saving starts a background prune on Cloudflare R2 and Backblaze B2 (does not block the save).
            </p>
          </div>
        </div>
        <div className="flex justify-end mt-5">
          <button
            onClick={saveBackupSettings}
            disabled={settingsSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {settingsSaving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving…</> : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Backup Schedules */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            Backup Schedules
          </h3>
          <button
            onClick={openCreateSchedule}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Schedule
          </button>
        </div>

        {/* Inline create/edit form */}
        {showScheduleForm && (
          <div className="mb-5 p-4 border border-blue-200 dark:border-blue-800 rounded-xl bg-blue-50 dark:bg-blue-900/20 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                {editingScheduleId ? 'Edit Schedule' : 'Create Schedule'}
              </p>
              <button
                onClick={() => setShowScheduleForm(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Name</label>
                <input
                  type="text"
                  value={scheduleForm.name}
                  onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Nightly backup"
                  className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Frequency</label>
                <select
                  value={scheduleForm.frequency}
                  onChange={e => setScheduleForm(f => ({ ...f, frequency: e.target.value as 'hourly' | 'daily' | 'weekly' | 'monthly' }))}
                  className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="hourly">Hourly (~1h RPO)</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Time (HH:MM)</label>
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={e => setScheduleForm(f => ({ ...f, time: e.target.value }))}
                  className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {scheduleForm.frequency === 'weekly' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Day of Week</label>
                  <select
                    value={scheduleForm.dayOfWeek ?? 0}
                    onChange={e => setScheduleForm(f => ({ ...f, dayOfWeek: Number(e.target.value) }))}
                    className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              {scheduleForm.frequency === 'monthly' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Day of Month</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={scheduleForm.dayOfMonth ?? 1}
                    onChange={e => setScheduleForm(f => ({ ...f, dayOfMonth: Number(e.target.value) }))}
                    className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Retention (days)</label>
                <input
                  type="number"
                  min={1}
                  value={scheduleForm.retentionDays}
                  onChange={e => setScheduleForm(f => ({ ...f, retentionDays: Math.max(1, Number(e.target.value)) }))}
                  className="px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowScheduleForm(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {savingSchedule ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving…</> : (editingScheduleId ? 'Update Schedule' : 'Create Schedule')}
              </button>
            </div>
          </div>
        )}

        {/* Schedule list */}
        {schedules.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-6">
            No backup schedules configured.{' '}
            <button onClick={openCreateSchedule} className="text-blue-600 dark:text-blue-400 hover:underline">
              Create one now
            </button>
          </p>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between p-3 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Toggle
                    checked={schedule.enabled}
                    onChange={() => handleToggleSchedule(schedule)}
                    disabled={togglingScheduleId === schedule.id}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{schedule.name}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {schedule.frequency} at {schedule.time}
                        {schedule.frequency === 'weekly' && schedule.dayOfWeek !== undefined &&
                          ` · ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][schedule.dayOfWeek]}`}
                        {schedule.frequency === 'monthly' && schedule.dayOfMonth !== undefined &&
                          ` · day ${schedule.dayOfMonth}`}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Retention: {schedule.retentionDays}d
                      </span>
                      {schedule.lastRun && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Last: {formatDate(schedule.lastRun)}
                        </span>
                      )}
                      {schedule.nextRun && (
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Next: {timeUntil(schedule.nextRun)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                  <button
                    onClick={() => openEditSchedule(schedule)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                    title="Edit schedule"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteSchedule(schedule)}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Delete schedule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-blue-900 dark:text-blue-300">
            <strong>Cloudflare R2 + Backblaze B2:</strong> Backups are stored in R2 (primary) and mirrored to B2 (secondary). Retention deletes excess copies from both destinations.
          </p>
        </div>
      </div>

      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        variant={confirmState?.variant}
        loading={confirming}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => !confirming && setConfirmState(null)}
      />
    </div>
  );
}
