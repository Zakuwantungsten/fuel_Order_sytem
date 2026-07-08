import { useCallback, useEffect, useState } from 'react';
import { X, Link2, Loader2, ArrowRight, Eye, AlertCircle, CheckCircle2, Truck, Calendar, Fuel } from 'lucide-react';
import { toast } from 'react-toastify';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI, ExportLinkCandidate } from '../services/api';
import FuelRecordInspectModal from './FuelRecordInspectModal';

interface ExportLinkModalProps {
  isOpen: boolean;
  order: DeliveryOrder | null;
  onClose: () => void;
  onLinked: () => void;
}

const doId = (o: DeliveryOrder): string => String(o.id ?? (o as any)._id ?? '');

export default function ExportLinkModal({ isOpen, order, onClose, onLinked }: ExportLinkModalProps) {
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [candidates, setCandidates] = useState<ExportLinkCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  const [exportRouteLiters, setExportRouteLiters] = useState(0);
  const [routeMatched, setRouteMatched] = useState(true);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    if (!order) return;
    setLoading(true);
    setCandidates([]);
    setSelectedId(null);
    setAlreadyLinked(false);
    try {
      const res = await deliveryOrdersAPI.previewExportLink(doId(order));
      setAlreadyLinked(res.data.alreadyLinked);
      setCandidates(res.data.candidates || []);
      setExportRouteLiters(res.data.exportRouteLiters || 0);
      setRouteMatched(res.data.routeMatched);
      // Default to the most recent candidate.
      if (res.data.candidates?.length) {
        setSelectedId(res.data.candidates[0].fuelRecordId);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load fuel record candidates');
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    if (isOpen && order) {
      loadCandidates();
    }
  }, [isOpen, order, loadCandidates]);

  const handleConfirm = async () => {
    if (!order || !selectedId) return;
    setLinking(true);
    try {
      const res = await deliveryOrdersAPI.confirmExportLink(doId(order), selectedId);
      toast.success(res.message || 'EXPORT DO linked to fuel record');
      onLinked();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to link EXPORT DO');
    } finally {
      setLinking(false);
    }
  };

  if (!isOpen || !order) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
                <Link2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Link EXPORT DO to Fuel Record</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  DO-{order.doNumber} · Truck {order.truckNo}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Return-leg summary */}
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium text-gray-500 dark:text-gray-400">Return leg:</span>
              <span className="inline-flex items-center gap-1">
                <span className="font-semibold text-gray-900 dark:text-white">{order.loadingPoint || '—'}</span>
                <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-semibold text-gray-900 dark:text-white">{order.destination || '—'}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Fuel className="h-3.5 w-3.5 text-gray-400" />
                {routeMatched ? (
                  <span className="text-green-600 dark:text-green-400 font-medium">+{exportRouteLiters}L export route</span>
                ) : (
                  <span className="text-orange-500 dark:text-orange-400 font-medium">No export route matched — liters unchanged</span>
                )}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <p className="text-sm">Searching for the truck's going fuel record…</p>
              </div>
            ) : alreadyLinked ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">This DO is already linked to a fuel record.</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No further action is needed.</p>
              </div>
            ) : candidates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="h-8 w-8 text-orange-500 mb-2" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  No matching going fuel record found for truck {order.truckNo}.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                  There may be no going (IMPORT) journey recorded for this truck yet, or the existing record is cancelled or
                  already has a return DO.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {candidates.length} going record{candidates.length > 1 ? 's' : ''} found — choose which to link:
                </p>
                {candidates.map((c) => {
                  const isSelected = selectedId === c.fuelRecordId;
                  return (
                    <label
                      key={c.fuelRecordId}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500'
                          : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="export-link-candidate"
                        checked={isSelected}
                        onChange={() => setSelectedId(c.fuelRecordId)}
                        className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="inline-flex items-center gap-1 font-medium text-gray-900 dark:text-white">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            {c.date}
                          </span>
                          <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                            <Truck className="h-3.5 w-3.5 text-gray-400" />
                            Going DO: <span className="font-semibold">{c.goingDo}</span>
                          </span>
                          {c.journeyStatus && (
                            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              {c.journeyStatus}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                          <span className="inline-flex items-center gap-1">
                            <span className="font-medium">{c.goingFrom || '—'}</span>
                            <ArrowRight className="h-3 w-3 text-gray-400" />
                            <span className="font-medium">{c.goingTo || '—'}</span>
                          </span>
                          <span className="text-gray-500 dark:text-gray-400">Total: {c.totalLts}L</span>
                          <span className="text-gray-500 dark:text-gray-400">Bal: {c.balance}L</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setInspectId(c.fuelRecordId);
                        }}
                        className="mt-0.5 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400"
                        title="Inspect fuel record"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Close
            </button>
            {!alreadyLinked && candidates.length > 0 && (
              <button
                onClick={handleConfirm}
                disabled={!selectedId || linking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Link to fuel record
              </button>
            )}
          </div>
        </div>
      </div>

      {inspectId && (
        <FuelRecordInspectModal
          isOpen={!!inspectId}
          onClose={() => setInspectId(null)}
          fuelRecordId={inspectId}
          truckNumber={order.truckNo}
        />
      )}
    </>
  );
}
