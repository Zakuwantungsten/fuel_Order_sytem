import { useEffect, useState } from 'react';
import { X, RefreshCw, Fuel } from 'lucide-react';
import { fuelRecordsAPI } from '../services/api';
import { pendingDoStatusLabel } from '../utils/pendingDo';
import { toast } from 'react-toastify';

interface PendingDoFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord?: (fuelRecordId: string) => void;
}

export default function PendingDoFollowUpModal({
  isOpen,
  onClose,
  onSelectRecord,
}: PendingDoFollowUpModalProps) {
  const [stats, setStats] = useState({ total: 0, goingPending: 0, returnPending: 0 });
  const [kind, setKind] = useState<'all' | 'going' | 'return'>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (nextKind: 'all' | 'going' | 'return' = kind) => {
    setLoading(true);
    try {
      const [s, list] = await Promise.all([
        fuelRecordsAPI.getPendingDoStats(),
        fuelRecordsAPI.getPendingDoList({ kind: nextKind, limit: 200 }),
      ]);
      setStats(s);
      setRows(list);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load pending DOs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pending DOs</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {stats.total} truck(s) · Going {stats.goingPending} · Return {stats.returnPending}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => load(kind)}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-2 flex gap-2 border-b border-gray-200 dark:border-gray-700">
          {([
            ['all', 'All'],
            ['going', 'Going pending'],
            ['return', 'Return pending'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                load(k);
              }}
              className={`px-2.5 py-1 rounded text-xs font-medium ${
                kind === k
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-auto flex-1 p-2">
          {loading && rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No pending DOs</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-2 py-2">Truck</th>
                  <th className="px-2 py-2">Going DO</th>
                  <th className="px-2 py-2">Return DO</th>
                  <th className="px-2 py-2">Route</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = String(r.id || r._id);
                  const label = pendingDoStatusLabel(r)
                    || (r.displayStatus ? String(r.displayStatus).replace(/_/g, ' ') : null)
                    || r.journeyStatus;
                  return (
                    <tr
                      key={id}
                      className="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                      onClick={() => onSelectRecord?.(id)}
                    >
                      <td className="px-2 py-2 font-medium text-gray-900 dark:text-gray-100">{r.truckNo}</td>
                      <td className="px-2 py-2 font-mono text-xs">{r.goingDo || '—'}</td>
                      <td className="px-2 py-2 font-mono text-xs">{r.returnDo || '—'}</td>
                      <td className="px-2 py-2 text-xs text-gray-600 dark:text-gray-300">
                        {r.from || 'TBA'} → {r.to || 'TBA'}
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                          <Fuel className="w-3 h-3" />
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
