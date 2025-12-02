import React, { useState, useEffect } from 'react';
import { 
  Plus, X, FileSpreadsheet, Trash2, 
  Copy, User, AlertTriangle, FileDown, Search,
  Calendar, Fuel, DollarSign, ChevronDown
} from 'lucide-react';
import type { DriverAccountEntry, DriverAccountWorkbook } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { driverAccountAPI } from '../services/api';
import * as XLSX from 'xlsx';

interface DriverAccountWorkbookProps {
  year?: number;
  onClose?: () => void;
}

const DriverAccountWorkbookComponent: React.FC<DriverAccountWorkbookProps> = ({ 
  year = new Date().getFullYear(),
  onClose 
}) => {
  const { user } = useAuth();
  const [workbook, setWorkbook] = useState<DriverAccountWorkbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<Set<string | number>>(new Set());
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const [dateFilter, setDateFilter] = useState({ from: '', to: '' });

  // Load workbook from API
  useEffect(() => {
    loadWorkbook();
  }, [year]);

  const loadWorkbook = async () => {
    setLoading(true);
    try {
      const data = await driverAccountAPI.getByYear(year);
      
      if (data) {
        setWorkbook(data);
      } else {
        // Create empty workbook for display
        const newWorkbook: DriverAccountWorkbook = {
          id: `da-${year}`,
          year,
          name: `DRIVER ACCOUNTS ${year}`,
          entries: [],
          totalLiters: 0,
          totalAmount: 0,
          createdAt: new Date().toISOString()
        };
        setWorkbook(newWorkbook);
      }
    } catch (error) {
      console.error('Error loading driver account workbook:', error);
      // Set empty workbook on error
      setWorkbook({
        id: `da-${year}`,
        year,
        name: `DRIVER ACCOUNTS ${year}`,
        entries: [],
        totalLiters: 0,
        totalAmount: 0,
        createdAt: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  const addEntry = async (entry: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!workbook) return;

    try {
      await driverAccountAPI.create({
        ...entry,
        createdBy: user?.username || 'Unknown'
      } as any);
      
      // Reload workbook to get updated data
      await loadWorkbook();
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding entry:', error);
      alert('Failed to add entry. Please try again.');
    }
  };

  const deleteEntry = async (entryId: string | number) => {
    if (!workbook || !window.confirm('Are you sure you want to delete this entry?')) return;

    try {
      await driverAccountAPI.delete(String(entryId));
      await loadWorkbook();
      setSelectedEntries(prev => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const deleteSelectedEntries = async () => {
    if (!workbook || selectedEntries.size === 0) return;
    if (!window.confirm(`Delete ${selectedEntries.size} selected entries?`)) return;

    try {
      for (const entryId of selectedEntries) {
        await driverAccountAPI.delete(String(entryId));
      }
      await loadWorkbook();
      setSelectedEntries(new Set());
    } catch (error) {
      console.error('Error deleting entries:', error);
      alert('Failed to delete some entries. Please try again.');
    }
  };

  // Filter entries
  const filteredEntries = workbook?.entries.filter(entry => {
    const matchesSearch = !searchTerm || 
      entry.truckNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.driverName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.lpoNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.notes?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDateFrom = !dateFilter.from || entry.date >= dateFilter.from;
    const matchesDateTo = !dateFilter.to || entry.date <= dateFilter.to;

    return matchesSearch && matchesDateFrom && matchesDateTo;
  }) || [];

  // Export functions
  const exportToExcel = () => {
    if (!workbook || filteredEntries.length === 0) return;

    const data = filteredEntries.map((entry, index) => ({
      'S/N': index + 1,
      'Date': entry.date,
      'Truck No': entry.truckNo,
      'Driver Name': entry.driverName || 'N/A',
      'Original DO': entry.originalDoNo || entry.doNo || 'N/A',
      'Liters': entry.liters,
      'Rate': entry.rate,
      'Amount': entry.amount,
      'Station': entry.station,
      'Status': entry.status || 'pending',
      'LPO No': entry.lpoNo,
      'Created By': entry.createdBy || 'N/A',
      'Notes': entry.notes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Driver Accounts ${year}`);
    XLSX.writeFile(wb, `DRIVER_ACCOUNTS_${year}.xlsx`);
  };

  const copyToClipboard = async (format: 'text' | 'whatsapp') => {
    if (!workbook || filteredEntries.length === 0) return;

    let text = '';
    
    if (format === 'whatsapp') {
      text = `*DRIVER ACCOUNTS ${year}*\n\n`;
      filteredEntries.forEach((entry, index) => {
        text += `${index + 1}. *${entry.truckNo}*\n`;
        text += `   📅 ${entry.date}\n`;
        text += `   ⛽ ${entry.liters}L @ ${entry.rate}\n`;
        text += `   💰 Amount: ${entry.amount.toLocaleString()}\n`;
        text += `   📍 ${entry.station}\n`;
        text += `   ⚠️ ${entry.notes || 'Driver Account'}\n\n`;
      });
      text += `*TOTAL: ${workbook.totalLiters}L - ${workbook.totalAmount.toLocaleString()}*`;
    } else {
      text = `DRIVER ACCOUNTS ${year}\n`;
      text += `${'='.repeat(50)}\n\n`;
      filteredEntries.forEach((entry, index) => {
        text += `${index + 1}. ${entry.truckNo} - ${entry.date}\n`;
        text += `   ${entry.liters}L @ ${entry.rate} = ${entry.amount}\n`;
        text += `   Station: ${entry.station} | Status: ${entry.status || 'pending'}\n\n`;
      });
      text += `\nTOTAL: ${workbook.totalLiters}L - ${workbook.totalAmount.toLocaleString()}`;
    }

    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
    setShowCopyDropdown(false);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="border-b dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <User className="w-6 h-6 text-red-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Driver Accounts {year}
            </h1>
            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-full">
              {workbook?.entries.length || 0} entries
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Copy/Download Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCopyDropdown(!showCopyDropdown)}
                className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Copy className="w-4 h-4 mr-2" />
                Export
                <ChevronDown className="w-4 h-4 ml-1" />
              </button>
              
              {showCopyDropdown && (
                <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10">
                  <button
                    onClick={() => copyToClipboard('text')}
                    className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy as Text
                  </button>
                  <button
                    onClick={() => copyToClipboard('whatsapp')}
                    className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Copy for WhatsApp
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-600"></div>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                  >
                    <FileDown className="w-4 h-4 mr-2 text-green-600" />
                    Export to Excel
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </button>

            {selectedEntries.size > 0 && (
              <button
                onClick={deleteSelectedEntries}
                className="flex items-center px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedEntries.size})
              </button>
            )}

            {onClose && (
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by truck, driver, LPO, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={dateFilter.from}
              onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateFilter.to}
              onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Entries</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {filteredEntries.length}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Fuel className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Liters</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(filteredEntries.reduce((sum, e) => sum + e.liters, 0))}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Amount</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(filteredEntries.reduce((sum, e) => sum + e.amount, 0))}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg per Entry</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {filteredEntries.length > 0 
                    ? formatCurrency(filteredEntries.reduce((sum, e) => sum + e.liters, 0) / filteredEntries.length)
                    : 0}L
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          {/* Table Header */}
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-gray-300 dark:border-gray-600">
            <div className="grid grid-cols-12 gap-0">
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">
                <input
                  type="checkbox"
                  checked={selectedEntries.size === filteredEntries.length && filteredEntries.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedEntries(new Set(filteredEntries.map(e => e.id!)));
                    } else {
                      setSelectedEntries(new Set());
                    }
                  }}
                  className="w-4 h-4"
                />
              </div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">Date</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 col-span-2">Truck No</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">DO (Ref)</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 text-right">Liters</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 text-right">Rate</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 text-right">Amount</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600">Station</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 border-r border-gray-300 dark:border-gray-600 col-span-2">Reason</div>
              <div className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100 text-center">Actions</div>
            </div>
          </div>

          {/* Table Body */}
          {filteredEntries.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
              <User className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-medium">No driver account entries</p>
              <p className="text-sm mt-1">Add entries for fuel given due to misuse or theft</p>
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <div 
                key={entry.id} 
                className={`border-b border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  selectedEntries.has(entry.id!) ? 'bg-red-50 dark:bg-red-900/10' : ''
                }`}
              >
                <div className="grid grid-cols-12 gap-0">
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedEntries.has(entry.id!)}
                      onChange={(e) => {
                        setSelectedEntries(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) {
                            next.add(entry.id!);
                          } else {
                            next.delete(entry.id!);
                          }
                          return next;
                        });
                      }}
                      className="w-4 h-4"
                    />
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                    {entry.date}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 col-span-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {entry.truckNo}
                    {entry.driverName && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">{entry.driverName}</span>
                    )}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-orange-600 dark:text-orange-400">
                    NIL
                    <span className="text-xs text-gray-400 dark:text-gray-500 block">({entry.originalDoNo || entry.doNo || 'N/A'})</span>
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-right text-gray-900 dark:text-gray-100">
                    {entry.liters}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-right text-gray-700 dark:text-gray-300">
                    {entry.rate}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(entry.amount)}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
                    {entry.station}
                  </div>
                  <div className="px-3 py-2 border-r border-gray-300 dark:border-gray-600 col-span-2 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      entry.status === 'settled' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                      entry.status === 'disputed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>
                      {entry.status?.toUpperCase() || 'PENDING'}
                    </span>
                    {entry.notes && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 block mt-1">{entry.notes}</span>
                    )}
                  </div>
                  <div className="px-3 py-2 text-center">
                    <button
                      onClick={() => deleteEntry(entry.id!)}
                      className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Entry Modal */}
      {showAddForm && (
        <AddDriverAccountEntryModal
          onClose={() => setShowAddForm(false)}
          onSubmit={addEntry}
        />
      )}
    </div>
  );
};

// Add Entry Modal Component
interface AddDriverAccountEntryModalProps {
  onClose: () => void;
  onSubmit: (entry: Omit<DriverAccountEntry, 'id' | 'createdAt' | 'createdBy'>) => void;
}

const AddDriverAccountEntryModal: React.FC<AddDriverAccountEntryModalProps> = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    truckNo: '',
    driverName: '',
    originalDoNo: '',
    liters: 0,
    rate: 1.2,
    station: '',
    lpoNo: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      amount: formData.liters * formData.rate
    });
  };

  const stations = [
    'LAKE CHILABOMBWE',
    'LAKE NDOLA',
    'LAKE KAPIRI',
    'CASH',
    'TCC',
    'ZHANFEI',
    'KAMOA',
    'COMIKA',
    'DAR YARD',
    'TANGA YARD',
    'MMSA YARD'
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Add Driver Account Entry
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Warning Banner */}
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800 dark:text-red-300">Driver's Account Entry</h4>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                This entry will NOT update fuel records. DO and destination will show as NIL in LPO exports.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Truck No *</label>
              <input
                type="text"
                value={formData.truckNo}
                onChange={(e) => setFormData(prev => ({ ...prev, truckNo: e.target.value.toUpperCase() }))}
                required
                placeholder="e.g., T530 DRF"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Driver Name</label>
              <input
                type="text"
                value={formData.driverName}
                onChange={(e) => setFormData(prev => ({ ...prev, driverName: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Original DO Reference</label>
              <input
                type="text"
                value={formData.originalDoNo}
                onChange={(e) => setFormData(prev => ({ ...prev, originalDoNo: e.target.value }))}
                placeholder="e.g., 6376 (optional internal reference)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">LPO No *</label>
              <input
                type="text"
                value={formData.lpoNo}
                onChange={(e) => setFormData(prev => ({ ...prev, lpoNo: e.target.value }))}
                required
                placeholder="e.g., 2150"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Station *</label>
              <select
                value={formData.station}
                onChange={(e) => setFormData(prev => ({ ...prev, station: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">Select Station</option>
                {stations.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Liters *</label>
              <input
                type="number"
                value={formData.liters}
                onChange={(e) => setFormData(prev => ({ ...prev, liters: parseFloat(e.target.value) || 0 }))}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rate per Liter *</label>
              <input
                type="number"
                value={formData.rate}
                onChange={(e) => setFormData(prev => ({ ...prev, rate: parseFloat(e.target.value) || 0 }))}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-600 rounded-md text-lg font-semibold text-gray-900 dark:text-gray-100">
                {(formData.liters * formData.rate).toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              placeholder="Additional notes (optional)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Add to Driver's Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DriverAccountWorkbookComponent;
