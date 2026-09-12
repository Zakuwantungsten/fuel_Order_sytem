import { useEffect, useRef } from 'react';
import { AlertTriangle, Fuel, X } from 'lucide-react';

export type CheckpointDecisionChoice = 'maintain' | 'reset';

export interface CheckpointDecisionPreview {
  fuelRecordId: string;
  oldTruckNo: string;
  newTruckNo: string;
  doNumber: string;
  totalAllocated: number;
  checkpoints: Record<string, number>;
  balance: number;
  totalLts: number | null;
  extra: number | null;
}

interface TruckChangeCheckpointModalProps {
  open: boolean;
  preview: CheckpointDecisionPreview | null;
  loading?: boolean;
  onDecision: (decision: CheckpointDecisionChoice) => void;
  onCancel: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  mmsaYard: 'MMSA Yard',
  tangaYard: 'Tanga Yard',
  darYard: 'Dar Yard',
  tangaGoing: 'Tanga Going',
  darGoing: 'Dar Going',
  moroGoing: 'Morogoro Going',
  mbeyaGoing: 'Mbeya Going',
  tdmGoing: 'Tunduma Going',
  zambiaGoing: 'Zambia Going',
  congoFuel: 'Congo',
  zambiaReturn: 'Zambia Return',
  tundumaReturn: 'Tunduma Return',
  mbeyaReturn: 'Mbeya Return',
  moroReturn: 'Morogoro Return',
  darReturn: 'Dar Return',
  tangaReturn: 'Tanga Return',
};

export default function TruckChangeCheckpointModal({
  open,
  preview,
  loading = false,
  onDecision,
  onCancel,
}: TruckChangeCheckpointModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open || !preview) return null;

  const rows = Object.entries(preview.checkpoints || {}).filter(([, v]) => Number(v) !== 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />

      <div
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="truck-change-checkpoint-title"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2
                id="truck-change-checkpoint-title"
                className="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                Fuel already allocated on this journey
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Truck change for DO {preview.doNumber}
              </p>
            </div>
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Moving from <span className="font-semibold">{preview.oldTruckNo}</span> to{' '}
            <span className="font-semibold">{preview.newTruckNo}</span>. This fuel record already
            has <span className="font-semibold">{preview.totalAllocated}L</span> allocated at
            checkpoints for the former truck.
          </p>

          {rows.length > 0 && (
            <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40 text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5" />
                Current checkpoint allocation
              </div>
              <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/80">
                {rows.map(([field, liters]) => (
                  <li
                    key={field}
                    className="flex items-center justify-between px-3 py-1.5 text-sm text-gray-800 dark:text-gray-200"
                  >
                    <span>{FIELD_LABELS[field] || field}</span>
                    <span className="font-medium tabular-nums">{liters}L</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
            Keep allocations if the liters should stay on this journey under the new truck. Reset
            clears checkpoint liters (including yard) so the new truck starts clean — a snapshot is
            always saved for audit and undo.
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel amend
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => onDecision('maintain')}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              Keep allocations
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => onDecision('reset')}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              Reset for new truck
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
