import { useState } from 'react';
import { X, AlertTriangle, RefreshCw, ArrowRight } from 'lucide-react';

interface ConflictField {
  field: string;
  yourValue: any;
  currentValue: any;
}

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUseLatest: () => void;
  onRetry: () => void;
  currentRecord: any;
  modifiedBy?: string;
  modifiedAt?: string;
  conflictFields?: ConflictField[];
}

const ConflictModal = ({
  isOpen,
  onClose,
  onUseLatest,
  onRetry,
  currentRecord: _currentRecord,
  modifiedBy,
  modifiedAt,
  conflictFields = [],
}: ConflictModalProps) => {
  const [showDiff, setShowDiff] = useState(false);

  if (!isOpen) return null;

  const formattedTime = modifiedAt
    ? new Date(modifiedAt).toLocaleString()
    : 'Unknown time';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-lg font-semibold">Edit Conflict</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            This record was updated by{' '}
            <span className="font-semibold">{modifiedBy || 'another user'}</span>{' '}
            at <span className="font-semibold">{formattedTime}</span> while you were editing.
          </p>

          {/* Diff table */}
          {conflictFields.length > 0 && (
            <div>
              <button
                onClick={() => setShowDiff(!showDiff)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showDiff ? 'Hide changes' : 'View changes'}
              </button>

              {showDiff && (
                <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300">Field</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300">Your Value</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-300">Current Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflictFields.map((cf) => (
                        <tr key={cf.field} className="border-t border-gray-100 dark:border-gray-700">
                          <td className="px-3 py-2 font-medium text-gray-700 dark:text-gray-300">
                            {cf.field}
                          </td>
                          <td className="px-3 py-2 text-red-600 dark:text-red-400 line-through">
                            {String(cf.yourValue ?? '—')}
                          </td>
                          <td className="px-3 py-2 text-green-600 dark:text-green-400">
                            {String(cf.currentValue ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onUseLatest}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            <RefreshCw className="w-4 h-4" />
            Use latest version
          </button>
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
          >
            <ArrowRight className="w-4 h-4" />
            Keep my changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConflictModal;
