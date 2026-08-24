import { useCallback, useEffect, useState } from 'react';
import { X, GitMerge, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI } from '../services/api';

interface MergeToPendingDoModalProps {
  isOpen: boolean;
  order: DeliveryOrder | null;
  onClose: () => void;
  onMerged: () => void;
}

const doId = (o: DeliveryOrder): string => String(o.id ?? (o as any)._id ?? '');

export default function MergeToPendingDoModal({
  isOpen,
  order,
  onClose,
  onMerged,
}: MergeToPendingDoModalProps) {
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [pendingDo, setPendingDo] = useState<string | null>(null);
  const [kind, setKind] = useState<'going' | 'return'>('going');
  const [truckNo, setTruckNo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    setError(null);
    setHasPending(false);
    setPendingDo(null);
    try {
      const res = await deliveryOrdersAPI.previewMergeToPending(doId(order));
      setHasPending(!!res.data.hasPending);
      setPendingDo(res.data.pendingDo);
      setKind(res.data.kind || (order.importOrExport === 'EXPORT' ? 'return' : 'going'));
      setTruckNo(res.data.truckNo || order.truckNo);
      if (!res.data.hasPending) {
        setError(`No pending ${res.data.kind === 'return' ? 'return' : 'going'} DO found for truck ${res.data.truckNo || order.truckNo}.`);
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Failed to look up pending DO for this truck';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (isOpen && order) {
      loadPreview();
    }
  }, [isOpen, order, loadPreview]);

  const handleConfirm = async () => {
    if (!order || !hasPending) return;
    setMerging(true);
    try {
      const res = await deliveryOrdersAPI.mergeToPending(doId(order));
      toast.success(res.message || `Merged with pending ${pendingDo}`);
      onMerged();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to merge with pending DO');
    } finally {
      setMerging(false);
    }
  };

  if (!isOpen || !order) return null;

  const kindLabel = kind === 'return' ? 'pending return' : 'pending going';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
              <GitMerge className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Merge to pending DO
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {order.doType}-{order.doNumber} · Truck {order.truckNo}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-sm">Looking up pending DO for this truck…</p>
            </div>
          ) : error || !hasPending ? (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {error || `No ${kindLabel} DO found for truck ${truckNo || order.truckNo}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-4">
                <AlertTriangle className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
                <p className="text-sm text-violet-900 dark:text-violet-100">
                  Truck <span className="font-semibold">{truckNo}</span> has {kindLabel}{' '}
                  <span className="font-mono font-semibold">{pendingDo}</span>. Merge{' '}
                  {order.doType}-{order.doNumber} into that pending journey?
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pending liters, yard, and LPO amounts stay on the pending row. PG/PR references are
                rewritten to this DO.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
          {hasPending && !loading && (
            <button
              onClick={handleConfirm}
              disabled={merging}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {merging ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
              Yes, merge
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
