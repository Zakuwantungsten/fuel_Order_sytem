import React, { useState, useEffect } from 'react';
import { GitCompare, RefreshCw, AlertTriangle, Loader2, ChevronDown, ChevronRight, Camera } from 'lucide-react';
import Pagination from '../Pagination';
import apiClient from '../../services/api';

interface Snapshot {
  _id: string;
  savedBy: { username: string };
  savedAt: string;
  changeDescription: string;
  snapshot?: Record<string, unknown>;
}

export const ConfigVersionHistoryTab: React.FC = () => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<Record<string, unknown> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showTakeModal, setShowTakeModal] = useState(false);
  const [description, setDescription] = useState('');
  const [taking, setTaking] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const LIMIT = 10;

  const fetchSnapshots = async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/system-admin/config-history', { params: { page: p, limit: 10 } });
      setSnapshots(res.data.data.snapshots || []);
      setTotalPages(res.data.data.pagination?.totalPages || 1);
      setTotalItems(res.data.data.pagination?.total || 0);
    } catch {
      setError('Failed to load configuration history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSnapshots(); }, [page]);

  const handleExpand = async (snap: Snapshot) => {
    if (expanded === snap._id) { setExpanded(null); setExpandedData(null); return; }
    setExpanded(snap._id);
    setLoadingDetail(true);
    try {
      const res = await apiClient.get(`/system-admin/config-history/${snap._id}`);
      setExpandedData(res.data.data.snapshot || {});
    } catch { setExpandedData(null); }
    finally { setLoadingDetail(false); }
  };

  const handleTakeSnapshot = async () => {
    setTaking(true);
    try {
      await apiClient.post('/system-admin/config-history/snapshot', { changeDescription: description });
      setShowTakeModal(false);
      setDescription('');
      fetchSnapshots(1);
      setPage(1);
    } catch {
      setError('Failed to take snapshot');
    } finally {
      setTaking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <GitCompare className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Config Version History</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Snapshot system configuration for audit and rollback reference</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchSnapshots()} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setShowTakeModal(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium">
            <Camera className="h-4 w-4" />
            Take Snapshot
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>
      ) : (
        <>
          <div className="space-y-2">
            {snapshots.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-12 text-sm">No snapshots yet. Take your first snapshot.</p>}
            {snapshots.map((snap) => {
              const isOpen = expanded === snap._id;
              return (
                <div key={snap._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button onClick={() => handleExpand(snap)} className="w-full flex items-start justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors text-left">
                    <div className="flex items-start gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400 mt-0.5" /> : <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5" />}
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{snap.changeDescription || 'No description'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">by @{snap.savedBy?.username || 'system'} · {new Date(snap.savedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 font-mono shrink-0 ml-4">{snap._id.slice(-8)}</span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-5 py-4">
                      {loadingDetail ? (
                        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-violet-500" /></div>
                      ) : expandedData ? (
                        <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-96 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {JSON.stringify(expandedData, null, 2)}
                        </pre>
                      ) : <p className="text-sm text-gray-500">Unable to load snapshot data.</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={LIMIT}
            onPageChange={setPage}
            showItemsPerPage={false}
          />
        </>
      )}

      {showTakeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Take Configuration Snapshot</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Save the current system configuration as a versioned snapshot.</p>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description (optional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Before enabling maintenance mode"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTakeModal(false)} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-600">Cancel</button>
              <button onClick={handleTakeSnapshot} disabled={taking} className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-50">
                {taking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigVersionHistoryTab;
