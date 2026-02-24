import React, { useEffect, useState } from 'react';
import { X, Fuel, AlertCircle, Loader2, TruckIcon, Calendar } from 'lucide-react';
import { FuelRecord } from '../types';
import api from '../services/api';

// All checkpoint columns with their abbreviations and field names
const CHECKPOINT_COLUMNS = [
  { abbr: 'MMS', field: 'mmsaYard', label: 'MMSA Yard' },
  { abbr: 'TnY', field: 'tangaYard', label: 'Tanga Yard' },
  { abbr: 'DrY', field: 'darYard', label: 'DAR Yard' },
  { abbr: 'DrG', field: 'darGoing', label: 'DAR Going' },
  { abbr: 'MoG', field: 'moroGoing', label: 'Moro Going' },
  { abbr: 'MbG', field: 'mbeyaGoing', label: 'Mbeya Going' },
  { abbr: 'TdG', field: 'tdmGoing', label: 'Tunduma Going' },
  { abbr: 'ZmG', field: 'zambiaGoing', label: 'Zambia Going' },
  { abbr: 'Cng', field: 'congoFuel', label: 'Congo Fuel' },
  { abbr: 'ZmR', field: 'zambiaReturn', label: 'Zambia Return' },
  { abbr: 'TdR', field: 'tundumaReturn', label: 'Tunduma Return' },
  { abbr: 'MbR', field: 'mbeyaReturn', label: 'Mbeya Return' },
  { abbr: 'MoR', field: 'moroReturn', label: 'Moro Return' },
  { abbr: 'DrR', field: 'darReturn', label: 'DAR Return' },
  { abbr: 'TnR', field: 'tangaReturn', label: 'Tanga Return' },
  { abbr: 'Bal', field: 'balance', label: 'Balance' },
] as const;

interface FuelRecordInspectModalProps {
  isOpen: boolean;
  onClose: () => void;
  fuelRecordId: string | number;
  truckNumber?: string;
}

/**
 * Calculate remaining balance for Mbeya return checkpoint
 */
export function calculateMbeyaReturnBalance(fuelRecord: FuelRecord): {
  standardAllocation: number;
  tundumaFuel: number;
  availableBalance: number;
  hasReceivedTundumaFuel: boolean;
  suggestedLiters: number;
  reason: string;
} {
  const standardAllocation = 400;
  const tundumaFuel = fuelRecord.tundumaReturn || 0;
  const availableBalance = Math.max(0, standardAllocation - tundumaFuel);
  const suggestedLiters = availableBalance;
  const reason = tundumaFuel > 0 
    ? `Standard ${standardAllocation}L - ${tundumaFuel}L (Tunduma) = ${availableBalance}L available`
    : `Standard allocation: ${standardAllocation}L`;
  
  return {
    standardAllocation,
    tundumaFuel,
    availableBalance,
    hasReceivedTundumaFuel: tundumaFuel > 0,
    suggestedLiters,
    reason,
  };
}

/**
 * Calculate total fuel consumed by a truck
 */
function calculateTotalFuel(record: FuelRecord): number {
  return (
    (record.mmsaYard || 0) +
    (record.tangaYard || 0) +
    (record.darYard || 0) +
    (record.darGoing || 0) +
    (record.moroGoing || 0) +
    (record.mbeyaGoing || 0) +
    (record.tdmGoing || 0) +
    (record.zambiaGoing || 0) +
    (record.congoFuel || 0) +
    (record.zambiaReturn || 0) +
    (record.tundumaReturn || 0) +
    (record.mbeyaReturn || 0) +
    (record.moroReturn || 0) +
    (record.darReturn || 0) +
    (record.tangaReturn || 0)
  );
}

const FuelRecordInspectModal: React.FC<FuelRecordInspectModalProps> = ({
  isOpen,
  onClose,
  fuelRecordId,
  truckNumber,
}) => {
  const [fuelRecord, setFuelRecord] = useState<FuelRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal closes or fuelRecordId changes
  useEffect(() => {
    if (!isOpen) {
      // Clear state when modal closes to prevent showing stale data on next open
      setFuelRecord(null);
      setLoading(true);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && fuelRecordId) {
      // Clear previous data before fetching new record
      setFuelRecord(null);
      setLoading(true);
      setError(null);
      fetchFuelRecord();
    }
  }, [isOpen, fuelRecordId]);

  // Handle Escape key with propagation prevention
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isOpen, onClose]);

  const fetchFuelRecord = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/fuel-records/${fuelRecordId}`);
      // API returns { success, message, data: fuelRecord }
      const fuelRecordData = response.data?.data || response.data;
      setFuelRecord(fuelRecordData);
    } catch (err: any) {
      console.error('Error fetching fuel record:', err);
      setError(err.response?.data?.message || 'Failed to fetch fuel record');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalFuel = fuelRecord ? calculateTotalFuel(fuelRecord) : 0;
  const mbeyaBalance = fuelRecord ? calculateMbeyaReturnBalance(fuelRecord) : null;

  // Handle close with event propagation prevention
  const handleClose = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div 
        className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-600">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Fuel className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Fuel Record Inspection
              </h2>
              {truckNumber && (
                <p className="text-sm text-white/80 flex items-center gap-1">
                  <TruckIcon className="h-3 w-3" />
                  {truckNumber}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <span className="ml-3 text-gray-600 dark:text-gray-400">Loading fuel record...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="text-red-600 dark:text-red-400 text-center">{error}</p>
              <button
                onClick={fetchFuelRecord}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Retry
              </button>
            </div>
          ) : fuelRecord ? (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Truck</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {fuelRecord.truckNo || truckNumber || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Month</p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {fuelRecord.month || 'N/A'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Date</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {fuelRecord.date ? new Date(fuelRecord.date).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      (fuelRecord as any).isLocked
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                        : fuelRecord.balance === 0 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                          : fuelRecord.balance > 0 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {(fuelRecord as any).isLocked 
                        ? '🔒 Locked (Pending Config)' 
                        : fuelRecord.balance === 0 
                          ? 'Completed' 
                          : fuelRecord.balance > 0 
                            ? 'Active' 
                            : 'Overspent'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Route Info - Going Journey */}
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2">
                  🚛 Going Journey (IMPORT)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400">DO Number</p>
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      {fuelRecord.goingDo || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400">From</p>
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      {(fuelRecord as any).originalGoingFrom || fuelRecord.from || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400">To</p>
                    <p className="font-semibold text-blue-900 dark:text-blue-100">
                      {(fuelRecord as any).originalGoingTo || fuelRecord.to || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Route Info - Return Journey (only if exists) */}
              {fuelRecord.returnDo && (
                <div className="bg-green-50 dark:bg-green-900/30 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                    🔄 Return Journey (EXPORT)
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-green-600 dark:text-green-400">DO Number</p>
                      <p className="font-semibold text-green-900 dark:text-green-100">
                        {fuelRecord.returnDo}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600 dark:text-green-400">From</p>
                      <p className="font-semibold text-green-900 dark:text-green-100">
                        {fuelRecord.from || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-600 dark:text-green-400">To</p>
                      <p className="font-semibold text-green-900 dark:text-green-100">
                        {fuelRecord.to || 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Locked Record Warning - Show configuration missing */}
              {(fuelRecord as any).isLocked && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-4 rounded-lg">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mr-3 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                        🔒 Record Locked - Missing Configuration
                      </h4>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {(fuelRecord as any).pendingConfigReason === 'both' 
                          ? 'Missing: Route total liters AND truck batch assignment'
                          : (fuelRecord as any).pendingConfigReason === 'missing_total_liters'
                          ? 'Missing: Route total liters configuration'
                          : 'Missing: Truck batch assignment'}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                        ℹ️ Contact admin to configure missing settings. Manual LPO entry is still allowed.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Checkpoint Table — desktop only */}
              <div className="hidden md:block">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Fuel className="h-5 w-5" />
                  Fuel at Each Checkpoint
                </h3>
                
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-100 dark:bg-gray-700">
                      <tr>
                        {CHECKPOINT_COLUMNS.map((col) => (
                          <th
                            key={col.abbr}
                            className="px-2 py-2 text-center text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider whitespace-nowrap"
                            title={col.label}
                          >
                            {col.abbr}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      <tr>
                        {CHECKPOINT_COLUMNS.map((col) => {
                          const value = (fuelRecord as any)[col.field] || 0;
                          const isBalance = col.field === 'balance';
                          const hasValue = value > 0;
                          
                          return (
                            <td
                              key={col.abbr}
                              className={`px-2 py-3 text-center text-sm font-medium whitespace-nowrap ${
                                isBalance
                                  ? value > 0
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                    : value < 0
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                      : 'text-gray-500 dark:text-gray-400'
                                  : hasValue
                                    ? 'text-gray-900 dark:text-white bg-yellow-50 dark:bg-yellow-900/20'
                                    : 'text-gray-400 dark:text-gray-500'
                              }`}
                              title={col.label}
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                {/* Legend */}
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 rounded"></span>
                    Has fuel
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-100 dark:bg-green-900/30 border border-green-300 rounded"></span>
                    Positive balance
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-100 dark:bg-red-900/30 border border-red-300 rounded"></span>
                    Negative balance
                  </span>
                </div>
              </div>

              {/* Checkpoint Details Cards — mobile: always visible, desktop: always visible too */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Checkpoint Details
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {CHECKPOINT_COLUMNS.map((col) => {
                    const value = (fuelRecord as any)[col.field] || 0;
                    const isBalance = col.field === 'balance';
                    const hasValue = value !== 0;
                    
                    return (
                      <div
                        key={col.abbr}
                        className={`p-2 rounded-lg border ${
                          isBalance
                            ? value > 0
                              ? 'border-green-300 bg-green-50 dark:bg-green-900/30 dark:border-green-700'
                              : value < 0
                                ? 'border-red-300 bg-red-50 dark:bg-red-900/30 dark:border-red-700'
                                : 'border-gray-200 bg-gray-50 dark:bg-gray-700/50 dark:border-gray-600'
                            : hasValue
                              ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 dark:border-yellow-700'
                              : 'border-gray-200 bg-gray-50 dark:bg-gray-700/50 dark:border-gray-600'
                        }`}
                      >
                        <p className="text-xs text-gray-500 dark:text-gray-400">{col.label}</p>
                        <p className={`text-lg font-bold ${
                          isBalance
                            ? value > 0
                              ? 'text-green-700 dark:text-green-300'
                              : value < 0
                                ? 'text-red-700 dark:text-red-300'
                                : 'text-gray-500 dark:text-gray-400'
                            : hasValue
                              ? 'text-gray-900 dark:text-white'
                              : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {value}L
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Totals Summary */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Fuel Used</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {totalFuel}L
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total Litres (Allocated)</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {fuelRecord.totalLts || 0}L
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Balance</p>
                    <p className={`text-2xl font-bold ${
                      (fuelRecord.balance || 0) > 0
                        ? 'text-green-600 dark:text-green-400'
                        : (fuelRecord.balance || 0) < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-600 dark:text-gray-400'
                    }`}>
                      {fuelRecord.balance || 0}L
                    </p>
                  </div>
                </div>
              </div>

              {/* Mbeya Return Balance Info */}
              {mbeyaBalance && mbeyaBalance.hasReceivedTundumaFuel && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
                  <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Mbeya Return Balance Note
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Standard Mbeya Return: <strong>400L</strong> - Tunduma Return fuel (<strong>{mbeyaBalance.tundumaFuel}L</strong>) 
                    = Available: <strong className="text-green-700 dark:text-green-300">{mbeyaBalance.availableBalance}L</strong>
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end items-center">
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FuelRecordInspectModal;
