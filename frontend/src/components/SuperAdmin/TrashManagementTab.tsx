import { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
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
  Check,
  XCircle,
} from 'lucide-react';
import UnifiedTabLoader from './common/UnifiedTabLoader';
import { trashAPI } from '../../services/api';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface TrashManagementTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
  onNavigate?: (section: string) => void;
}

const DELETED_RESOURCE_TYPES = [
  { value: 'delivery_orders', label: 'Delivery Orders' },
  { value: 'lpo_summaries', label: 'LPO Documents' },
  { value: 'fuel_records', label: 'Fuel Records' },
  { value: 'users', label: 'Users' },
  { value: 'yard_dispenses', label: 'Yard Dispenses' },
  { value: 'driver_accounts', label: 'Driver Accounts' },
];

const CANCELLED_RESOURCE_TYPES = [
  { value: 'fuel_records', label: 'Fuel Records' },
  { value: 'delivery_orders', label: 'Delivery Orders' },
  { value: 'lpo_summaries', label: 'LPO Entries' },
];

export default function TrashManagementTab({ onMessage, onNavigate }: TrashManagementTabProps) {
  const [viewMode, setViewMode] = useState<'deleted' | 'cancelled'>('deleted');
  const [selectedType, setSelectedType] = useState('delivery_orders');
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState('30');
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning';
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [showResourceTypeDropdown, setShowResourceTypeDropdown] = useState(false);
  const [showDateFilterDropdown, setShowDateFilterDropdown] = useState(false);

  const resourceTypeDropdownRef = useRef<HTMLDivElement>(null);
  const dateFilterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resourceTypeDropdownRef.current && !resourceTypeDropdownRef.current.contains(event.target as Node)) {
        setShowResourceTypeDropdown(false);
      }
      if (dateFilterDropdownRef.current && !dateFilterDropdownRef.current.contains(event.target as Node)) {
        setShowDateFilterDropdown(false);
      }
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (resourceTypeDropdownRef.current?.contains(target) || dateFilterDropdownRef.current?.contains(target)) return;
      setShowResourceTypeDropdown(false);
      setShowDateFilterDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  useEffect(() => {
    loadTrashStats();
  }, []);

  // When switching view modes reset type to a valid option for that mode
  useEffect(() => {
    const validTypes = viewMode === 'deleted' ? DELETED_RESOURCE_TYPES : CANCELLED_RESOURCE_TYPES;
    if (!validTypes.find(t => t.value === selectedType)) {
      setSelectedType(validTypes[0].value);
    }
  }, [viewMode]);

  useEffect(() => {
    loadItems();
  }, [selectedType, dateFilter, viewMode]);

  const loadTrashStats = async () => {
    try {
      const data = await trashAPI.getStats();
      setStats(data);
    } catch {
      onMessage('error', 'Failed to load trash statistics');
    }
  };

  const loadItems = async () => {
    setLoading(true);
    setSelectedItems(new Set());
    try {
      const dateTo = new Date().toISOString();
      const dateFrom = new Date(Date.now() - parseInt(dateFilter) * 24 * 60 * 60 * 1000).toISOString();

      let response;
      if (viewMode === 'deleted') {
        response = await trashAPI.getDeletedItems(selectedType, { dateFrom, dateTo, page: 1, limit: 100 });
      } else {
        response = await trashAPI.getCancelledItems(selectedType, { dateFrom, dateTo, page: 1, limit: 100 });
      }
      setItems(response.data || []);
    } catch {
      onMessage('error', `Failed to load ${viewMode} items`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useRealtimeSync(
    ['fuel_records', 'delivery_orders', 'lpo_summaries', 'users', 'yard_fuel'],
    () => { loadTrashStats(); loadItems(); }
  );

  // ── Deleted-mode handlers ─────────────────────────────────────────────────

  const handleRestore = async (id: string) => {
    try {
      await trashAPI.restoreItem(selectedType, id);
      onMessage('success', 'Item restored successfully');
      loadItems();
      loadTrashStats();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to restore item');
    }
  };

  const handleBulkRestore = () => {
    if (selectedItems.size === 0) { onMessage('error', 'No items selected'); return; }
    setConfirmState({
      title: 'Restore Items',
      message: `Restore ${selectedItems.size} item(s) from trash?`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await trashAPI.bulkRestore(selectedType, Array.from(selectedItems));
          onMessage('success', `${selectedItems.size} item(s) restored`);
          setSelectedItems(new Set());
          setConfirmState(null);
          loadItems();
          loadTrashStats();
        } catch { onMessage('error', 'Failed to restore items'); }
        finally { setConfirming(false); }
      },
    });
  };

  const handlePermanentDelete = (id: string) => {
    setConfirmState({
      title: 'Permanently Delete Item',
      message: 'This will permanently delete this item. This action cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await trashAPI.permanentDelete(selectedType, id);
          onMessage('success', 'Item permanently deleted');
          setConfirmState(null);
          loadItems();
          loadTrashStats();
        } catch { onMessage('error', 'Failed to delete item permanently'); }
        finally { setConfirming(false); }
      },
    });
  };

  const handleBulkPermanentDelete = () => {
    if (selectedItems.size === 0) { onMessage('error', 'No items selected'); return; }
    setConfirmState({
      title: 'Permanently Delete Items',
      message: `Permanently delete ${selectedItems.size} item(s)? This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await trashAPI.bulkPermanentDelete(selectedType, Array.from(selectedItems));
          onMessage('success', `${selectedItems.size} item(s) permanently deleted`);
          setSelectedItems(new Set());
          setConfirmState(null);
          loadItems();
          loadTrashStats();
        } catch { onMessage('error', 'Failed to delete items permanently'); }
        finally { setConfirming(false); }
      },
    });
  };

  const handleEmptyTrash = () => {
    setConfirmState({
      title: 'Empty Trash',
      message: `Permanently delete all ${items.length} items in ${selectedType}? This action cannot be undone.`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await trashAPI.emptyTrash(selectedType);
          onMessage('success', 'Trash emptied successfully');
          setConfirmState(null);
          loadItems();
          loadTrashStats();
        } catch { onMessage('error', 'Failed to empty trash'); }
        finally { setConfirming(false); }
      },
    });
  };

  // ── Cancelled-mode handler ────────────────────────────────────────────────

  const handleUncancel = async (item: any) => {
    const id = item._id || item.id;
    const truckNo = selectedType === 'lpo_summaries' ? item.truckNo : undefined;
    const label = selectedType === 'lpo_summaries'
      ? `${item.lpoNo} / ${item.truckNo}`
      : item.doNumber || item.truckNo || id;

    setConfirmState({
      title: 'Uncancel Item',
      message: `Restore "${label}" to active status?`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirming(true);
        try {
          await trashAPI.uncancelItem(selectedType, id, truckNo);
          onMessage('success', 'Item uncancelled successfully');
          setConfirmState(null);
          loadItems();
        } catch (error: any) {
          onMessage('error', error.response?.data?.message || 'Failed to uncancel item');
        } finally {
          setConfirming(false);
        }
      },
    });
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openDataLifecyclePolicyEditor = () => {
    sessionStorage.setItem('sa_system_preferred_tab', 'config');
    sessionStorage.setItem('sa_system_config_focus_section', 'data');
    onNavigate?.('sa_system');
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item._id || item.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    const next = new Set(selectedItems);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedItems(next);
  };

  const formatDate = (date: string) => formatSystemDate(date);

  const activeTypes = viewMode === 'deleted' ? DELETED_RESOURCE_TYPES : CANCELLED_RESOURCE_TYPES;
  const selectedTypeLabel = activeTypes.find(t => t.value === selectedType)?.label ?? selectedType;

  // Row identity: for LPO cancelled entries use lpoId+truckNo composite to avoid collisions
  const rowKey = (item: any) =>
    selectedType === 'lpo_summaries' && viewMode === 'cancelled'
      ? `${item._id}_${item.truckNo}`
      : (item._id || item.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Trash2 className="w-6 h-6 text-orange-600 dark:text-orange-400" />
          {viewMode === 'deleted' ? '🗑️ Deleted Items (Recycle Bin)' : '🚫 Cancelled Items'}
        </h2>
        <button
          onClick={loadItems}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* View Mode Toggle */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('deleted')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'deleted'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Trash className="w-4 h-4" />
          Deleted
        </button>
        <button
          onClick={() => setViewMode('cancelled')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            viewMode === 'cancelled'
              ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <XCircle className="w-4 h-4" />
          Cancelled
        </button>
      </div>

      {/* Stats Cards — only shown for deleted mode */}
      {viewMode === 'deleted' && (
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
      )}

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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
              >
                <span>{selectedTypeLabel}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>
              {showResourceTypeDropdown && (
                <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {activeTypes.map(type => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => { setSelectedType(type.value); setShowResourceTypeDropdown(false); }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>{type.label}</span>
                      {selectedType === type.value && <Check className="w-4 h-4 text-blue-600" />}
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
                className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 flex items-center justify-between"
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
                      onClick={() => { setDateFilter(option.value); setShowDateFilterDropdown(false); }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 flex items-center justify-between"
                    >
                      <span>{option.label}</span>
                      {dateFilter === option.value && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk actions bar — deleted mode only */}
      {viewMode === 'deleted' && selectedItems.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
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
                {/* Checkbox only in deleted mode */}
                {viewMode === 'deleted' && (
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === items.length && items.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Item
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  {viewMode === 'deleted' ? 'Deleted By' : 'Cancelled By'}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  {viewMode === 'deleted' ? 'Deleted At' : 'Cancelled At'}
                </th>
                {viewMode === 'cancelled' && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                    Reason
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={viewMode === 'deleted' ? 5 : 5} className="px-4 py-8 text-center">
                    <UnifiedTabLoader label={`Loading ${viewMode} items...`} heightClassName="py-4" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'deleted' ? 5 : 5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No {viewMode} items found
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const key = rowKey(item);
                  const itemId = item._id || item.id;

                  // Display name
                  const isLpoCancelled = selectedType === 'lpo_summaries' && viewMode === 'cancelled';
                  const itemName = isLpoCancelled
                    ? item.lpoNo || itemId
                    : (item.doNumber || item.lpoNo || item.truckNo || item.username || itemId || 'Unknown');

                  return (
                    <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      {/* Checkbox — deleted mode only */}
                      {viewMode === 'deleted' && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.has(itemId)}
                            onChange={() => toggleSelectItem(itemId)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}

                      {/* Item name */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {itemName}
                        </p>
                        {/* Sub-line: truck number for LPO cancelled entries */}
                        {isLpoCancelled && item.truckNo && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Truck: {item.truckNo}
                          </p>
                        )}
                        {/* Sub-line: truck for non-LPO deleted items */}
                        {!isLpoCancelled && item.truckNo && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Truck: {item.truckNo}
                          </p>
                        )}
                      </td>

                      {/* Deleted/Cancelled By */}
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {viewMode === 'deleted'
                          ? (item.deletedBy || 'Unknown')
                          : (isLpoCancelled
                              ? (item.cancellationPoint || '—')
                              : (item.cancelledBy || '—'))
                        }
                      </td>

                      {/* Deleted/Cancelled At */}
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {viewMode === 'deleted'
                          ? (item.deletedAt ? formatDate(item.deletedAt) : 'Unknown')
                          : (item.cancelledAt ? formatDate(item.cancelledAt) : '—')
                        }
                      </td>

                      {/* Reason column — cancelled mode only */}
                      {viewMode === 'cancelled' && (
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate" title={item.cancellationReason || ''}>
                          {item.cancellationReason || '—'}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {viewMode === 'deleted' ? (
                            <>
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
                            </>
                          ) : (
                            <button
                              onClick={() => handleUncancel(item)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                              title="Uncancel"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Uncancel
                            </button>
                          )}
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
              {/* Empty Trash only in deleted mode */}
              {viewMode === 'deleted' && (
                <button
                  onClick={handleEmptyTrash}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  <Trash className="w-4 h-4" />
                  Empty Trash
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Retention Policy — deleted mode only */}
      {viewMode === 'deleted' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100">Trash Retention Policy</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Auto-delete threshold and automatic cleanup toggle — configured in <strong>System &rarr; Data Lifecycle Policy</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openDataLifecyclePolicyEditor}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Configure Policy
            </button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        variant={confirmState?.variant}
        loading={confirming}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => !confirming && setConfirmState(null)}
      />
    </div>
  );
}
