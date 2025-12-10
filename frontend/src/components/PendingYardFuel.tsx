import React, { useState, useEffect } from 'react';
import { Truck, AlertTriangle, X, CheckCircle } from 'lucide-react';
import { yardFuelService } from '../services/yardFuelService';
import { toast } from 'react-toastify';

interface PendingYardFuelProps {
  onClose: () => void;
}

export default function PendingYardFuel({ onClose }: PendingYardFuelProps) {
  const [pendingEntries, setPendingEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null);

  useEffect(() => {
    loadPendingEntries();
  }, []);

  const loadPendingEntries = async () => {
    try {
      setLoading(true);
      const response = await yardFuelService.getAll({ status: 'pending', page: 1, limit: 50 });
      setPendingEntries(response.items || []);
    } catch (error: any) {
      console.error('Failed to load pending entries:', error);
      toast.error('Failed to load pending entries');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedEntry || !rejectReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      setRejecting(selectedEntry._id);
      await yardFuelService.rejectYardFuelEntry(selectedEntry._id, rejectReason);
      toast.success(`Entry rejected. Yard personnel will be notified.`);
      setSelectedEntry(null);
      setRejectReason('');
      loadPendingEntries();
    } catch (error: any) {
      console.error('Failed to reject entry:', error);
      toast.error('Failed to reject entry');
    } finally {
      setRejecting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Truck className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Pending Yard Fuel Entries
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {pendingEntries.length} entries awaiting DO linkage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Loading...</p>
            </div>
          ) : pendingEntries.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                All Clear!
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                No pending yard fuel entries at this time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingEntries.map((entry) => (
                <div
                  key={entry._id}
                  className="border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-4 bg-yellow-50 dark:bg-yellow-900/10"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                          {entry.truckNo}
                        </h3>
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 font-medium">
                          PENDING
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.yard} • {new Date(entry.date).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Entered by: {entry.enteredBy}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                        {entry.liters}L
                      </p>
                    </div>
                  </div>

                  {entry.notes && (
                    <div className="mb-3 p-2 bg-white dark:bg-gray-800 rounded">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Notes:
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">{entry.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-yellow-200 dark:border-yellow-800">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <p className="text-xs text-gray-700 dark:text-gray-300 flex-1">
                      No active DO found for this truck. Create DO to link, or reject if incorrect.
                    </p>
                    <button
                      onClick={() => {
                        setSelectedEntry(entry);
                        setRejectReason('');
                      }}
                      disabled={rejecting === entry._id}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:bg-gray-400"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rejection Modal */}
        {selectedEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                Reject Entry: {selectedEntry.truckNo}
              </h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Rejection Reason *
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="E.g., Incorrect truck number, duplicate entry..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setSelectedEntry(null);
                    setRejectReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting !== null || !rejectReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
