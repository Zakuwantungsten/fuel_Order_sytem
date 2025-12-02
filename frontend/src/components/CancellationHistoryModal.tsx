import React, { useState, useEffect } from 'react';
import { X, Clock, Copy, Trash2, AlertTriangle, Search, Calendar } from 'lucide-react';
import { CancellationReport } from '../types';
import { getCancellationHistory, clearCancellationHistory } from '../services/cancellationService';

interface CancellationHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CancellationHistoryModal: React.FC<CancellationHistoryModalProps> = ({ isOpen, onClose }) => {
  const [history, setHistory] = useState<(CancellationReport & { savedAt: string })[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = () => {
    const data = getCancellationHistory();
    setHistory(data);
  };

  const handleClearHistory = () => {
    if (window.confirm('Are you sure you want to clear all cancellation history? This cannot be undone.')) {
      clearCancellationHistory();
      setHistory([]);
    }
  };

  const handleCopyReport = async (report: CancellationReport) => {
    try {
      await navigator.clipboard.writeText(report.reportText);
      alert('Report copied to clipboard!');
    } catch (error) {
      console.error('Error copying report:', error);
      alert('Failed to copy report');
    }
  };

  const filteredHistory = history.filter(item => {
    const matchesSearch = !searchTerm || 
      item.lpoNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.station.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.cancelledTrucks.some(t => 
        t.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.doNo.toLowerCase().includes(searchTerm.toLowerCase())
      );
    
    const matchesDate = !dateFilter || item.date.includes(dateFilter);
    
    return matchesSearch && matchesDate;
  });

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Cancellation History
            </h2>
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm rounded-full">
              {history.length} records
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {history.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="flex items-center px-3 py-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Clear All
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by LPO, station, truck..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredHistory.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                No Cancellation History
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Cancellation reports will appear here when trucks are cancelled from LPOs.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredHistory.map((item, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-4 ${
                    item.isFullyCancelled 
                      ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20' 
                      : 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <AlertTriangle className={`w-5 h-5 ${
                        item.isFullyCancelled ? 'text-red-600' : 'text-orange-600'
                      }`} />
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-gray-100">
                          LPO {item.lpoNo} 
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                            item.isFullyCancelled 
                              ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' 
                              : 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200'
                          }`}>
                            {item.isFullyCancelled ? 'Fully Cancelled' : 'Partial'}
                          </span>
                        </h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {item.station} • {item.date}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-400">
                        {formatDate(item.savedAt)}
                      </span>
                      <button
                        onClick={() => handleCopyReport(item)}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="Copy Report"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Cancelled Trucks */}
                  <div className="mt-3">
                    <h5 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                      Cancelled Trucks ({item.cancelledTrucks.length})
                    </h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {item.cancelledTrucks.map((truck, tIdx) => (
                        <div key={tIdx} className="text-sm bg-white dark:bg-gray-700 rounded px-2 py-1 border border-red-200 dark:border-red-800">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{truck.truckNo}</span>
                          <span className="text-gray-500 dark:text-gray-400"> • DO: {truck.doNo}</span>
                          <span className="text-red-600 dark:text-red-400"> • {truck.liters}L</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Trucks (if any) */}
                  {item.activeTrucks.length > 0 && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
                        Active Trucks ({item.activeTrucks.length})
                      </h5>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {item.activeTrucks.map((truck, tIdx) => (
                          <div key={tIdx} className="text-sm bg-white dark:bg-gray-700 rounded px-2 py-1 border border-green-200 dark:border-green-800">
                            <span className="font-medium text-gray-900 dark:text-gray-100">{truck.truckNo}</span>
                            <span className="text-gray-500 dark:text-gray-400"> • DO: {truck.doNo}</span>
                            <span className="text-green-600 dark:text-green-400"> • {truck.liters}L</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Report Text */}
                  <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-600 rounded text-sm text-gray-700 dark:text-gray-300">
                    {item.reportText}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CancellationHistoryModal;
