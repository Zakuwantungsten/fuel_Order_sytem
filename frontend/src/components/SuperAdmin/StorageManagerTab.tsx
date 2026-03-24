import React, { useState, useEffect } from 'react';
import { HardDrive, RefreshCw, Trash2, AlertTriangle, X, FolderOpen } from 'lucide-react';
import { toast } from 'react-toastify';
import ConfirmModal from './ConfirmModal';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import * as storageService from '../../services/storageService';
import type { StorageInfo } from '../../services/storageService';

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export const StorageManagerTab: React.FC = () => {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);

  const fetchInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await storageService.getStorageInfo();
      setInfo(data);
    } catch {
      setError('Failed to load storage info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInfo(); }, []);

  const handlePurge = async () => {
    setPurging(true);
    setConfirmPurge(false);
    try {
      const result = await storageService.purgeTempFiles();
      toast.success(`${result.deleted} temp file(s) purged${result.failed ? `, ${result.failed} failed` : ''}`);
      await fetchInfo();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Purge failed';
      setError(msg);
    } finally {
      setPurging(false);
    }
  };

  const categories = info?.categories ? Object.entries(info.categories) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/30">
            <HardDrive className="h-6 w-6 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Storage Manager</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Cloudflare R2 bucket overview</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchInfo}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {info?.enabled && (
            <button
              onClick={() => setConfirmPurge(true)}
              disabled={purging}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Purge Temp Files
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading && !info ? (
        <UnifiedTabLoader label="Loading storage overview..." heightClassName="py-20" />
      ) : !info?.enabled ? (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-xl p-8 text-center">
          <HardDrive className="h-12 w-12 mx-auto mb-3 text-yellow-500 opacity-60" />
          <p className="font-semibold text-yellow-700 dark:text-yellow-300">Storage Not Configured</p>
          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
            Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your .env file to enable cloud storage.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Files</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{info!.totalFiles.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Total Size</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{fmtBytes(info!.totalBytes)}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Folders</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{categories.length}</p>
            </div>
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-gray-500" />
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">Folders</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-750">
                    <th className="px-5 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Folder</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Files</th>
                    <th className="px-5 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {categories.map(([prefix, cat]) => (
                    <tr key={prefix}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{prefix}/</td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{cat.count}</td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{fmtBytes(cat.bytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Files */}
          {info!.recentFiles && info!.recentFiles.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-900 dark:text-white text-sm">Recent Files (latest 20)</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
                {info!.recentFiles.map((f) => (
                  <div key={f.key} className="px-5 py-3 flex items-center justify-between gap-4">
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate">{f.key}</span>
                    <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      <span>{fmtBytes(f.size)}</span>
                      <span>{new Date(f.lastModified).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmPurge}
        title="Purge Temp Files"
        message="All files under the temp/ prefix will be permanently deleted. This cannot be undone."
        confirmLabel={purging ? 'Purging…' : 'Delete Temp Files'}
        variant="danger"
        loading={purging}
        onConfirm={handlePurge}
        onCancel={() => setConfirmPurge(false)}
      />
    </div>
  );
};

export default StorageManagerTab;
