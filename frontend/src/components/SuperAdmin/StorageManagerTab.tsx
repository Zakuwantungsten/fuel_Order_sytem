import React, { useState, useEffect } from 'react';
import { HardDrive, RefreshCw, Trash2, AlertTriangle, Loader2, X, CheckCircle, FolderOpen } from 'lucide-react';
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
  const [success, setSuccess] = useState<string | null>(null);
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
      setSuccess(`${result.deleted} temp file(s) purged${result.failed ? `, ${result.failed} failed` : ''}`);
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
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading && !info ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
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

      {/* Confirm purge modal */}
      {confirmPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Purge Temp Files</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              All files under the <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">temp/</span> prefix will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmPurge(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                {purging && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete Temp Files
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorageManagerTab;
