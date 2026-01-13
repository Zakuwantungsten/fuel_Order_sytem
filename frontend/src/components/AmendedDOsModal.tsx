import { useState } from 'react';
import { useAmendedDOs } from '../contexts/AmendedDOsContext';
import { amendedDOsAPI } from '../services/api';
import { X, Trash2, Download, FileText } from 'lucide-react';

interface AmendedDOsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AmendedDOsModal = ({ isOpen, onClose }: AmendedDOsModalProps) => {
  const { amendedDOs, removeAmendedDO, clearAmendedDOs, count } = useAmendedDOs();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDOs, setSelectedDOs] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedDOs(new Set());
    } else {
      setSelectedDOs(new Set(amendedDOs.map(d => d.id)));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectDO = (id: string) => {
    const newSelected = new Set(selectedDOs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedDOs(newSelected);
    setSelectAll(newSelected.size === amendedDOs.length);
  };

  const handleRemoveDO = (id: string) => {
    removeAmendedDO(id);
    selectedDOs.delete(id);
    setSelectedDOs(new Set(selectedDOs));
  };

  const handleDownloadPDF = async () => {
    const doIdsToDownload = selectedDOs.size > 0 
      ? Array.from(selectedDOs) 
      : amendedDOs.map(d => d.id);

    if (doIdsToDownload.length === 0) {
      setError('No amended/cancelled DOs to download');
      return;
    }

    setDownloading(true);
    setError(null);
    try {
      await amendedDOsAPI.downloadPDF(doIdsToDownload);
      
      // Clear the downloaded DOs from the session list
      if (selectedDOs.size > 0) {
        // Only clear selected ones
        selectedDOs.forEach(id => removeAmendedDO(id));
        setSelectedDOs(new Set());
      } else {
        // Clear all
        clearAmendedDOs();
      }
      
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all amended/cancelled DOs from this session? This action cannot be undone.')) {
      clearAmendedDOs();
      setSelectedDOs(new Set());
    }
  };

  const formatDateTime = (date: Date) => {
    return new Date(date).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
                <FileText className="w-5 h-5 mr-2 text-orange-500" />
                Amended & Cancelled Delivery Orders
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {count > 0 
                  ? `You have ${count} amended/cancelled DO(s) in this session ready to download`
                  : 'Edit or cancel DOs to add them to this list for batch PDF download'
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {amendedDOs.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-16 w-16 text-gray-300 dark:text-gray-600" />
              <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
                No Amended or Cancelled DOs Yet
              </h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                When you edit or cancel a Delivery Order, it will appear here. You can then download all 
                amended/cancelled DOs as a single PDF document.
              </p>
              <div className="mt-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg max-w-md mx-auto">
                <h4 className="text-sm font-medium text-orange-800 dark:text-orange-300">How it works:</h4>
                <ol className="mt-2 text-sm text-orange-700 dark:text-orange-400 text-left list-decimal list-inside space-y-1">
                  <li>Go to the DO list and click "Edit" or "Cancel" on any DO</li>
                  <li>Make your changes/cancellation and save</li>
                  <li>The edited/cancelled DO will be added to this list</li>
                  <li>When done, come back here to download all as PDF</li>
                </ol>
              </div>
            </div>
          ) : (
            <>
              {/* Actions Bar */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Select All ({amendedDOs.length})
                  </span>
                </div>
                <button
                  onClick={handleClearAll}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear All
                </button>
              </div>

              {/* DO List */}
              <div className="space-y-3">
                {amendedDOs.map((amendedDO) => (
                  <div
                    key={amendedDO.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      selectedDOs.has(amendedDO.id)
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedDOs.has(amendedDO.id)}
                          onChange={() => handleSelectDO(amendedDO.id)}
                          className="mt-1 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {amendedDO.doNumber}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                              amendedDO.importOrExport === 'IMPORT'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {amendedDO.importOrExport}
                            </span>
                            {/* Show CANCELLED or AMENDED badge */}
                            {amendedDO.order.isCancelled ? (
                              <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                                CANCELLED
                              </span>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                                AMENDED
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Truck: {amendedDO.truckNo} | Date: {amendedDO.date}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {amendedDO.fieldsChanged.map((field, idx) => (
                              <span
                                key={idx}
                                className="inline-flex px-2 py-0.5 text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded"
                              >
                                {field}
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            Edited: {formatDateTime(amendedDO.amendedAt)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveDO(amendedDO.id)}
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1"
                        title="Remove from list"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {selectedDOs.size > 0 ? (
              <span>{selectedDOs.size} of {amendedDOs.length} selected</span>
            ) : amendedDOs.length > 0 ? (
              <span>All {amendedDOs.length} will be downloaded</span>
            ) : null}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={amendedDOs.length === 0 || downloading}
              className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-colors flex items-center ${
                amendedDOs.length === 0 || downloading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {downloading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating PDF...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Download PDF {amendedDOs.length > 0 && `(${selectedDOs.size > 0 ? selectedDOs.size : amendedDOs.length})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AmendedDOsModal;
