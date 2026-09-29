import { useCallback, useEffect, useState } from 'react';
import { X, Link2, Loader2, ArrowRight, AlertCircle, CheckCircle2, Calendar, Fuel, Eye } from 'lucide-react';
import { toast } from 'react-toastify';
import { deliveryOrdersAPI } from '../services/api';
import FuelRecordInspectModal from './FuelRecordInspectModal';

export interface UnlinkedExportCandidate {
  id: string;
  doNumber: string;
  date: string;
  truckNo: string;
  loadingPoint: string;
  destination: string;
  clientName: string;
  exportRouteLiters: number;
  routeMatched: boolean;
}

interface FuelRecordExportLinkModalProps {
  isOpen: boolean;
  fuelRecordId: string;
  truckNo: string;
  onClose: () => void;
  onLinked: () => void;
}

/**
 * Pick an unlinked EXPORT DO and attach it as the return DO of a fuel record
 * the LPO row already has. Confirms through the same link used in DO Management.
 */
export default function FuelRecordExportLinkModal({
  isOpen,
  fuelRecordId,
  truckNo,
  onClose,
  onLinked,
}: FuelRecordExportLinkModalProps) {
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [candidates, setCandidates] = useState<UnlinkedExportCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alreadyHasReturnDo, setAlreadyHasReturnDo] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);

  const loadCandidates = useCallback(async () => {
    if (!fuelRecordId) return;
    setLoading(true);
    setCandidates([]);
    setSelectedId(null);
    setAlreadyHasReturnDo(false);
    try {
      const res = await deliveryOrdersAPI.listUnlinkedExportsForFuelRecord(fuelRecordId);
      setAlreadyHasReturnDo(res.data.alreadyHasReturnDo);
      const next = res.data.candidates || [];
      setCandidates(next);
      if (next.length) setSelectedId(next[0].id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to load export DOs');
    } finally {
      setLoading(false);
    }
  }, [fuelRecordId]);

  useEffect(() => {
    if (isOpen && fuelRecordId) loadCandidates();
  }, [isOpen, fuelRecordId, loadCandidates]);

  const handleConfirm = async () => {
    if (!selectedId || !fuelRecordId) return;
    setLinking(true);
    try {
      const res = await deliveryOrdersAPI.confirmExportLink(selectedId, fuelRecordId);
      toast.success(res.message || 'EXPORT DO linked to fuel record');
      onLinked();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to link EXPORT DO');
    } finally {
      setLinking(false);
    }
  };

  if (!isOpen || !fuelRecordId) return null;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
              <Link2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Link export DO</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Truck {truckNo} · choose the return DO
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-sm">Looking for unlinked export DOs…</p>
            </div>
          ) : alreadyHasReturnDo ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">This fuel record already has a return DO.</p>
            </div>
          ) : candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-8 w-8 text-orange-500 mb-2" />
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                No unlinked export DO for truck {truckNo}.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                Create the export DO in DO Management first, or it is already linked to another fuel record.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {candidates.length} export DO{candidates.length > 1 ? 's' : ''} — choose which to link as the return:
              </p>
              {candidates.map((candidate) => {
                const isSelected = selectedId === candidate.id;
                return (
                  <label
                    key={candidate.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500'
                        : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="return-export-link"
                      checked={isSelected}
                      onChange={() => setSelectedId(candidate.id)}
                      className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-semibold text-gray-900 dark:text-white">DO-{candidate.doNumber}</span>
                        <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          {candidate.date}
                        </span>
                        {candidate.clientName && (
                          <span className="text-gray-500 dark:text-gray-400">{candidate.clientName}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium">{candidate.loadingPoint || '—'}</span>
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <span className="font-medium">{candidate.destination || '—'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Fuel className="h-3.5 w-3.5 text-gray-400" />
                          {candidate.routeMatched ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">+{candidate.exportRouteLiters}L export route</span>
                          ) : (
                            <span className="text-orange-500 dark:text-orange-400 font-medium">No export route matched</span>
                          )}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setInspectOpen(true);
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

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
          {!alreadyHasReturnDo && candidates.length > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedId || linking}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {linking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Link return DO
            </button>
          )}
        </div>
      </div>
    </div>

    <FuelRecordInspectModal
      isOpen={inspectOpen}
      onClose={() => setInspectOpen(false)}
      fuelRecordId={fuelRecordId}
      truckNumber={truckNo}
    />
    </>
  );
}
