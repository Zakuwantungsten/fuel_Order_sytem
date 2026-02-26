import { useState, useEffect, useRef } from 'react';
import { formatDate as formatSystemDate } from '../../utils/timezone';
import { 
  Trash2, 
  RefreshCw, 
  RotateCcw,
  Trash,
  AlertTriangle,
  Calendar,
  Filter,
  ChevronDown,
  Check
} from 'lucide-react';
import { trashAPI } from '../../services/api';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface TrashManagementTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

const RESOURCE_TYPES = [
  { value: 'delivery_orders', label: 'Delivery Orders' },
  { value: 'lpo_entries', label: 'LPO Entries' },
  { value: 'lpo_summaries', label: 'LPO Documents' },
  { value: 'fuel_records', label: 'Fuel Records' },
  { value: 'users', label: 'Users' },
  { value: 'yard_dispenses', label: 'Yard Dispenses' },
  { value: 'driver_accounts', label: 'Driver Accounts' },
];

export default function TrashManagementTab({ onMessage }: TrashManagementTabProps) {
  const [selectedType, setSelectedType] = useState('delivery_orders');
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [retentionSettings, setRetentionSettings] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState('30'); // Last 30 days

  // Dropdown states
  const [showResourceTypeDropdown, setShowResourceTypeDropdown] = useState(false);
  const [showDateFilterDropdown, setShowDateFilterDropdown] = useState(false);

  // Refs for click-outside detection
  const resourceTypeDropdownRef = useRef<HTMLDivElement>(null);
  const dateFilterDropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resourceTypeDropdownRef.current && !resourceTypeDropdownRef.current.contains(event.target as Node)) {
        setShowResourceTypeDropdown(false);
      }
      if (dateFilterDropdownRef.current && !dateFilterDropdownRef.current.contains(event.target as Node)) {
        setShowDateFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadTrashStats();
    loadRetentionSettings();
  }, []);

  useEffect(() => {
    loadDeletedItems();
  }, [selectedType, dateFilter]);

  const loadTrashStats = async () => {
    try {
      const data = await trashAPI.getStats();
      setStats(data);
    } catch (error: any) {
      onMessage('error', 'Failed to load trash statistics');
    }
  };

  const loadDeletedItems = async () => {
    setLoading(true);
    try {
      const dateTo = new Date().toISOString();
      const dateFrom = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000).toISOString();
      
      const response = await trashAPI.getDeletedItems(selectedType, {
        dateFrom,
        dateTo,
        page: 1,
        limit: 100,
      });
      setItems(response.data || []);
    } catch (error: any) {
      onMessage('error', 'Failed to load deleted items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(
    ['fuel_records', 'delivery_orders', 'lpo_entries', 'lpo_summaries', 'users', 'yard_fuel'],
    () => { loadTrashStats(); loadDeletedItems(); }
  );

  const loadRetentionSettings = async () => {
    try {
      const settings = await trashAPI.getRetentionSettings();
      setRetentionSettings(settings);
    } catch (error) {
      // Settings might not exist yet
    }
  };

  const handleRestore = async (id: string) => {
    try {
      await trashAPI.restoreItem(selectedType, id);
      onMessage('success', 'Item restored successfully');
      loadDeletedItems();
      loadTrashStats();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to restore item');
    }
  };

  const handleBulkRestore = async () => {
    if (selectedItems.size === 0) {
      onMessage('error', 'No items selected');
      return;
    }

    if (!confirm(`Restore ${selectedItems.size} item(s)?`)) return;

    try {
      await trashAPI.bulkRestore(selectedType, Array.from(selectedItems));
      onMessage('success', `${selectedItems.size} item(s) restored`);
      setSelectedItems(new Set());
      loadDeletedItems();
      loadTrashStats();
    } catch (error: any) {
      onMessage('error', 'Failed to restore items');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!confirm('⚠️ PERMANENT DELETE - This action cannot be undone! Continue?')) return;

    try {
      await trashAPI.permanentDelete(selectedType, id);
      onMessage('success', 'Item permanently deleted');
      loadDeletedItems();
      loadTrashStats();
    } catch (error: any) {
      onMessage('error', 'Failed to delete item permanently');
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (selectedItems.size === 0) {
      onMessage('error', 'No items selected');
      return;
    }

    if (!confirm(`⚠️ PERMANENT DELETE ${selectedItems.size} ITEMS - This action cannot be undone! Continue?`)) return;

    try {
      await trashAPI.bulkPermanentDelete(selectedType, Array.from(selectedItems));
      onMessage('success', `${selectedItems.size} item(s) permanently deleted`);
      setSelectedItems(new Set());
      loadDeletedItems();
      loadTrashStats();
    } catch (error: any) {
      onMessage('error', 'Failed to delete items permanently');
    }
  };

  const handleEmptyTrash = async () => {
    if (!confirm(`⚠️ EMPTY TRASH - This will permanently delete ALL ${items.length} items in ${selectedType}! This cannot be undone!`)) return;

    try {
      await trashAPI.emptyTrash(selectedType);
      onMessage('success', 'Trash emptied successfully');
      loadDeletedItems();
      loadTrashStats();
    } catch (error: any) {
      onMessage('error', 'Failed to empty trash');
    }
  };

  const handleUpdateRetention = async () => {
    if (!retentionSettings) return;

    try {
      await trashAPI.updateRetentionSettings(retentionSettings);
      onMessage('success', 'Retention policy updated');
    } catch (error: any) {
      onMessage('error', 'Failed to update retention policy');
    }
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item._id || item.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const formatDate = (date: string) => formatSystemDate(date);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Trash2 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          🗑️ Deleted Items (Recycle Bin)
        </h2>
        <button
          onClick={loadDeletedItems}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats?.stats?.map((stat: any) => (
          <div
            key={stat.type}
            className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm"
          >
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {stat.type.replace(/_/g, ' ')}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {stat.count}
            </p>
            {stat.oldestItem && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Oldest: {new Date(stat.oldestItem.deletedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Filter className="w-4 h-4 inline mr-1" />
              Resource Type
            </label>
            <div className="relative" ref={resourceTypeDropdownRef}>
              <button
                type="button"
                onClick={() => setShowResourceTypeDropdown(!showResourceTypeDropdown)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
              >
                <span>{RESOURCE_TYPES.find(t => t.value === selectedType)?.label}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showResourceTypeDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {RESOURCE_TYPES.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => {
                        setSelectedType(type.value);
                        setShowResourceTypeDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>{type.label}</span>
                      {selectedType === type.value && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Time Period
            </label>
            <div className="relative" ref={dateFilterDropdownRef}>
              <button
                type="button"
                onClick={() => setShowDateFilterDropdown(!showDateFilterDropdown)}
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
              >
                <span>
                  {dateFilter === '7' ? 'Last 7 Days' :
                   dateFilter === '30' ? 'Last 30 Days' :
                   dateFilter === '90' ? 'Last 90 Days' :
                   'Last Year'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showDateFilterDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg">
                  {[{value: '7', label: 'Last 7 Days'}, {value: '30', label: 'Last 30 Days'}, {value: '90', label: 'Last 90 Days'}, {value: '365', label: 'Last Year'}].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setDateFilter(option.value);
                        setShowDateFilterDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>{option.label}</span>
                      {dateFilter === option.value && <Check className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      {selectedItems.size > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
              {selectedItems.size} item(s) selected
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleBulkRestore}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Restore Selected
              </button>
              <button
                onClick={handleBulkPermanentDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash className="w-4 h-4" />
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Items Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === items.length && items.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Item
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Deleted By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Deleted At
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <RefreshCw className="w-6 h-6 mx-auto text-gray-400 animate-spin" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No deleted items found
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const itemId = item._id || item.id;
                  const itemName = item.doNumber || item.lpoNo || item.truckNo || item.username || item.id || 'Unknown';
                  
                  return (
                    <tr key={itemId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(itemId)}
                          onChange={() => toggleSelectItem(itemId)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {itemName}
                        </p>
                        {item.truckNo && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Truck: {item.truckNo}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {item.deletedBy || 'Unknown'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {item.deletedAt ? formatDate(item.deletedAt) : 'Unknown'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRestore(itemId)}
                            className="p-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors"
                            title="Restore"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(itemId)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Delete Permanently"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {items.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 border-t dark:border-gray-700">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Showing {items.length} item(s)
              </p>
              <button
                onClick={handleEmptyTrash}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
              >
                <Trash className="w-4 h-4" />
                Empty Trash
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Retention Policy */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          Retention Policy
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Auto-delete items older than (days)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={retentionSettings?.retentionDays || 90}
                onChange={(e) => setRetentionSettings({ ...retentionSettings, retentionDays: parseInt(e.target.value) })}
                className="w-32 px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <span className="text-sm text-gray-600 dark:text-gray-300">days</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={retentionSettings?.autoCleanupEnabled || false}
              onChange={(e) => setRetentionSettings({ ...retentionSettings, autoCleanupEnabled: e.target.checked })}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label className="text-sm text-gray-700 dark:text-gray-300">
              Enable automatic cleanup
            </label>
          </div>
          <button
            onClick={handleUpdateRetention}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Save Settings
          </button>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            ⚠️ Items older than {retentionSettings?.retentionDays || 90} days will be permanently deleted automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
