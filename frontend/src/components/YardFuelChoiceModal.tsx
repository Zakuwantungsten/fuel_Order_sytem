import { AlertTriangle, X } from 'lucide-react';
import type { FuelRecord } from '../types';
import type { YardKey } from '../services/yardLpoFetchService';
import { fuelRecordIdOf, recordDoDest, yardAlreadyDispensed } from '../services/yardLpoFetchService';

interface Props {
  truckNo: string;
  yard: YardKey;
  candidates: FuelRecord[];
  onPick: (record: FuelRecord) => void;
  onClose: () => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

const yardLabel = (yard: YardKey) => (yard === 'darYard' ? 'Dar' : 'Tanga');

/**
 * Ambiguity picker for yard LPO form fetch — same idea as LPODetailForm's
 * ambiguous-DO modal: nothing is filled until the user picks a record.
 */
export default function YardFuelChoiceModal({
  truckNo, yard, candidates, onPick, onClose,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white dark:bg-gray-800 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-4 border-b border-gray-100 dark:border-gray-700">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {candidates.length} fuel records for {truckNo || 'truck'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Pick which journey to use — DO and destination fill only after you choose.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-3 max-h-[55vh] overflow-y-auto space-y-2">
          {candidates.map((fr, i) => {
            const { doNo, dest } = recordDoDest(fr);
            const yardL = yardAlreadyDispensed(fr, yard);
            return (
              <button
                key={fuelRecordIdOf(fr) || i}
                type="button"
                onClick={() => onPick(fr)}
                className="w-full text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50/60 dark:hover:bg-green-900/20 transition-colors p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {fr.date || '—'}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    #{i + 1}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>DO: <span className="font-mono text-gray-700 dark:text-gray-300">{doNo || '—'}</span></span>
                  <span>Dest: <span className="text-gray-700 dark:text-gray-300">{dest || '—'}</span></span>
                  <span>
                    {yardLabel(yard)}:{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{fmt(yardL)}L</span>
                  </span>
                  {fr.balance != null && (
                    <span>Bal: <span className="text-gray-700 dark:text-gray-300">{fmt(fr.balance)}L</span></span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
          >
            Cancel — choose later
          </button>
        </div>
      </div>
    </div>
  );
}
