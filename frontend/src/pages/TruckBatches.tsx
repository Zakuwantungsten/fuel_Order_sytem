import { useState, useCallback, useEffect } from 'react';
import { Truck, Trash2, Plus, Fuel, Search, MapPin, X, Edit2 } from 'lucide-react';
import { toast } from 'react-toastify';
import ConfirmModal from '../components/SuperAdmin/ConfirmModal';
import {
  useTruckBatches,
  useAddTruckBatch,
  useRemoveTruckBatch,
  useAddDestinationRule,
  useDeleteDestinationRule,
  useCreateBatch,
  useUpdateBatch,
  useDeleteBatch,
  useAddBatchDestinationRule,
  useDeleteBatchDestinationRule,
  truckBatchKeys,
} from '../hooks/useTruckBatches';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';

interface DestinationRule {
  destination: string;
  extraLiters: number;
}

interface TruckBatchesProps {
  initialSuffix?: string;
  onSuffixConsumed?: () => void;
}

export default function TruckBatches({ initialSuffix, onSuffixConsumed }: TruckBatchesProps) {
  // Use React Query hooks
  const { data: batchConfig, isLoading: loading } = useTruckBatches();
  const batches = batchConfig?.truckBatches;
  const batchDestinationRules = batchConfig?.batchDestinationRules ?? {};
  const queryClient = useQueryClient();
  const addTruckMutation = useAddTruckBatch();
  const removeTruckMutation = useRemoveTruckBatch();
  const addRuleMutation = useAddDestinationRule();
  const deleteRuleMutation = useDeleteDestinationRule();
  const createBatchMutation = useCreateBatch();
  const updateBatchMutation = useUpdateBatch();
  const deleteBatchMutation = useDeleteBatch();
  const addBatchRuleMutation = useAddBatchDestinationRule();
  const deleteBatchRuleMutation = useDeleteBatchDestinationRule();

  // Real-time sync: refresh when other users modify truck batches
  const invalidateBatches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: truckBatchKeys.all });
  }, [queryClient]);
  useRealtimeSync('truck_batches', invalidateBatches);

  const [newTruck, setNewTruck] = useState({ suffix: '', batch: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Batch management modal state
  const [showAddTruckModal, setShowAddTruckModal] = useState(false);
  const [showCreateBatchModal, setShowCreateBatchModal] = useState(false);
  const [newBatchLiters, setNewBatchLiters] = useState<number>(0);
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<{ extraLiters: number; trucks: any[] } | null>(null);
  
  // Open Add Truck modal with pre-filled suffix when navigated from a notification
  useEffect(() => {
    if (!initialSuffix) return;
    setNewTruck({ suffix: initialSuffix.toLowerCase(), batch: 0 });
    setShowAddTruckModal(true);
    onSuffixConsumed?.();
  }, [initialSuffix]);

  // Truck-level destination rules modal state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<{ suffix: string; batch: number; rules: DestinationRule[] } | null>(null);
  const [newRule, setNewRule] = useState({ destination: '', extraLiters: 0 });

  // Batch-level destination rules modal state
  const [showBatchRulesModal, setShowBatchRulesModal] = useState(false);
  const [selectedBatchForRules, setSelectedBatchForRules] = useState<{ extraLiters: number; rules: DestinationRule[] } | null>(null);
  const [newBatchRule, setNewBatchRule] = useState({ destination: '', extraLiters: 0 });
  const [deleteBatchRuleTarget, setDeleteBatchRuleTarget] = useState<string | null>(null);

  // Confirmation modal state
  const [moveTarget, setMoveTarget] = useState<{ suffix: string; newBatch: number } | null>(null);
  const [deleteTruckTarget, setDeleteTruckTarget] = useState<string | null>(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<number | null>(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<string | null>(null);
  const [confirmUpdateBatch, setConfirmUpdateBatch] = useState(false);

  const handleAddTruck = async () => {
    const suffix = newTruck.suffix.trim().toLowerCase();

    if (!suffix) {
      toast.error('Please enter a truck suffix (e.g., DNH, EAG)');
      return;
    }

    if (!/^[a-z0-9]+$/i.test(suffix)) {
      toast.error('Suffix must contain only letters and numbers (e.g., DNH, EAG, ABC123)');
      return;
    }

    if (newTruck.batch <= 0) {
      toast.error('Please select a valid batch');
      return;
    }

    if (!batches) return;

    // Check if already exists in any batch
    const allTrucks: string[] = [];
    Object.values(batches).forEach(trucks => {
      if (Array.isArray(trucks)) {
        allTrucks.push(...trucks.map(t => t.truckSuffix));
      }
    });

    if (allTrucks.includes(suffix)) {
      toast.error(`Truck suffix "${suffix.toUpperCase()}" is already configured. Use the move option to change its batch.`);
      return;
    }

    try {
      await addTruckMutation.mutateAsync({
        truckSuffix: suffix,
        extraLiters: newTruck.batch,
      });
      const batch = newTruck.batch;
      setNewTruck({ suffix: '', batch: 0 });
      setShowAddTruckModal(false);
      toast.success(`Truck ${suffix.toUpperCase()} added to ${batch}L batch`);
    } catch (error: any) {
      toast.error(`Failed to add truck: ${error.message}`);
    }
  };

  const confirmMoveTruck = async () => {
    if (!moveTarget) return;
    const { suffix, newBatch } = moveTarget;
    try {
      await addTruckMutation.mutateAsync({
        truckSuffix: suffix,
        extraLiters: newBatch,
      });
      toast.success(`Truck ${suffix.toUpperCase()} moved to ${newBatch}L batch`);
    } catch (error: any) {
      toast.error(`Failed to move truck: ${error.message}`);
    } finally {
      setMoveTarget(null);
    }
  };

  const confirmDeleteTruck = async () => {
    if (!deleteTruckTarget) return;
    const suffix = deleteTruckTarget;
    try {
      await removeTruckMutation.mutateAsync(suffix);
      toast.success(`Truck ${suffix.toUpperCase()} removed from batches`);
    } catch (error: any) {
      toast.error(`Failed to remove truck: ${error.message}`);
    } finally {
      setDeleteTruckTarget(null);
    }
  };

  const handleManageRules = (truck: any, batch: number) => {
    const suffix = typeof truck === 'string' ? truck : truck.truckSuffix;
    const rules = typeof truck === 'string' ? [] : (truck.destinationRules || []);
    setSelectedTruck({ suffix, batch, rules });
    setShowRulesModal(true);
    setNewRule({ destination: '', extraLiters: batch });
  };

  const handleManageBatchRules = (batchSize: number) => {
    const rules = (batchDestinationRules[batchSize.toString()] ?? []) as DestinationRule[];
    setSelectedBatchForRules({ extraLiters: batchSize, rules: [...rules] });
    setShowBatchRulesModal(true);
    setNewBatchRule({ destination: '', extraLiters: batchSize });
  };

  const handleAddBatchRule = async () => {
    if (!selectedBatchForRules || !newBatchRule.destination.trim()) {
      toast.error('Please enter a destination');
      return;
    }
    try {
      await addBatchRuleMutation.mutateAsync({
        extraLiters: selectedBatchForRules.extraLiters,
        destination: newBatchRule.destination.trim(),
        extraLitersOverride: newBatchRule.extraLiters,
      });
      setSelectedBatchForRules({
        ...selectedBatchForRules,
        rules: [...selectedBatchForRules.rules, { destination: newBatchRule.destination.trim(), extraLiters: newBatchRule.extraLiters }],
      });
      setNewBatchRule({ destination: '', extraLiters: selectedBatchForRules.extraLiters });
    } catch (error: any) {
      toast.error(`Failed to add rule: ${error.response?.data?.error || error.message}`);
    }
  };

  const confirmDeleteBatchRule = async () => {
    if (!selectedBatchForRules || !deleteBatchRuleTarget) return;
    const destination = deleteBatchRuleTarget;
    try {
      await deleteBatchRuleMutation.mutateAsync({
        extraLiters: selectedBatchForRules.extraLiters,
        destination,
      });
      setSelectedBatchForRules({
        ...selectedBatchForRules,
        rules: selectedBatchForRules.rules.filter(r => r.destination !== destination),
      });
    } catch (error: any) {
      toast.error(`Failed to delete rule: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeleteBatchRuleTarget(null);
    }
  };

  const handleCreateBatch = async () => {
    if (newBatchLiters <= 0) {
      toast.error('Please enter a valid liter amount greater than 0');
      return;
    }

    try {
      await createBatchMutation.mutateAsync({ extraLiters: newBatchLiters });
      const created = newBatchLiters;
      setNewBatchLiters(0);
      setShowCreateBatchModal(false);
      toast.success(`New batch ${created}L created successfully`);
    } catch (error: any) {
      toast.error(`Failed to create batch: ${error.response?.data?.error || error.message}`);
    }
  };

  const requestUpdateBatch = () => {
    if (!editingBatch || newBatchLiters <= 0) {
      toast.error('Please enter a valid liter amount greater than 0');
      return;
    }
    setConfirmUpdateBatch(true);
  };

  const confirmUpdateBatchAction = async () => {
    if (!editingBatch || newBatchLiters <= 0) return;
    const from = editingBatch.extraLiters;
    const to = newBatchLiters;
    try {
      await updateBatchMutation.mutateAsync({
        oldExtraLiters: from,
        newExtraLiters: to,
      });
      setEditingBatch(null);
      setNewBatchLiters(0);
      setShowEditBatchModal(false);
      setConfirmUpdateBatch(false);
      toast.success(`Batch updated: ${from}L → ${to}L`);
    } catch (error: any) {
      toast.error(`Failed to update batch: ${error.response?.data?.error || error.message}`);
      setConfirmUpdateBatch(false);
    }
  };

  const requestDeleteBatch = (extraLiters: number) => {
    const batchKey = extraLiters.toString();
    const batch = batches?.[batchKey];

    if (batch && batch.length > 0) {
      toast.error(`Cannot delete batch ${extraLiters}L with ${batch.length} trucks assigned. Move trucks first.`);
      return;
    }

    setDeleteBatchTarget(extraLiters);
  };

  const confirmDeleteBatch = async () => {
    if (deleteBatchTarget === null) return;
    const extraLiters = deleteBatchTarget;
    try {
      await deleteBatchMutation.mutateAsync(extraLiters);
      toast.success(`Batch ${extraLiters}L deleted successfully`);
    } catch (error: any) {
      toast.error(`Failed to delete batch: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeleteBatchTarget(null);
    }
  };

  const handleAddRule = async () => {
    if (!selectedTruck || !newRule.destination.trim()) {
      toast.error('Please enter a destination');
      return;
    }

    if (!batches) return;

    try {
      await addRuleMutation.mutateAsync({
        truckSuffix: selectedTruck.suffix,
        destination: newRule.destination.trim(),
        extraLiters: newRule.extraLiters
      });

      // Immediately update local modal state — don't wait for stale batches refetch
      setSelectedTruck({
        ...selectedTruck,
        rules: [...selectedTruck.rules, { destination: newRule.destination.trim(), extraLiters: newRule.extraLiters }],
      });
      setNewRule({ destination: '', extraLiters: selectedTruck.batch });
    } catch (error: any) {
      toast.error(`Failed to add rule: ${error.response?.data?.error || error.message}`);
    }
  };

  const confirmDeleteRule = async () => {
    if (!selectedTruck || !deleteRuleTarget) return;
    const destination = deleteRuleTarget;

    try {
      await deleteRuleMutation.mutateAsync({
        truckSuffix: selectedTruck.suffix,
        destination
      });

      // Immediately update local modal state — don't wait for stale batches refetch
      setSelectedTruck({
        ...selectedTruck,
        rules: selectedTruck.rules.filter((r) => r.destination !== destination),
      });
    } catch (error: any) {
      toast.error(`Failed to delete rule: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeleteRuleTarget(null);
    }
  };

  const filterTrucks = (trucks: any[]) => {
    if (!searchQuery) return trucks;
    return trucks.filter(t => {
      const suffix = typeof t === 'string' ? t : t.truckSuffix;
      return suffix.toLowerCase().includes(searchQuery.toLowerCase());
    });
  };

  const getTruckSuffix = (truck: any): string => {
    return typeof truck === 'string' ? truck : truck.truckSuffix;
  };

  // Generate dynamic batch list
  const batchList = batches
    ? Object.entries(batches).map(([extraLitersStr, trucks]) => ({
        extraLiters: parseInt(extraLitersStr),
        trucks: Array.isArray(trucks) ? trucks : [],
        count: Array.isArray(trucks) ? trucks.length : 0,
      }))
    : [];

  // Sort by extraLiters descending
  batchList.sort((a, b) => b.extraLiters - a.extraLiters);

  const totalTrucks = batchList.reduce((sum, batch) => sum + batch.count, 0);

  // Shared icon-button styling so edit/delete actions look consistent across the tab.
  const iconButtonBase =
    'inline-flex items-center justify-center h-8 w-8 rounded-lg transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'dark:focus-visible:ring-offset-gray-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const deleteButtonClass =
    `${iconButtonBase} text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 ` +
    'hover:bg-red-50 dark:hover:bg-red-900/30 focus-visible:ring-red-500';

  // Labeled outline buttons (icon + text) for the batch-level Modify / Delete actions.
  const labelButtonBase =
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border bg-white dark:bg-gray-800 ' +
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'dark:focus-visible:ring-offset-gray-800 disabled:opacity-40 disabled:cursor-not-allowed';
  const modifyButtonClass =
    `${labelButtonBase} border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 ` +
    'hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-700 focus-visible:ring-blue-500';
  const deleteLabelButtonClass =
    `${labelButtonBase} border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 ` +
    'hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 focus-visible:ring-red-500';

  const renderBatchCard = (batchSize: number, trucks: any[]) => {
    const filteredTrucks = filterTrucks(trucks);

    return (
      <div
        key={batchSize}
        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-4"
      >
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {batchSize}L Extra Fuel
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''} (going + returning)
                {searchQuery && trucks.length !== filteredTrucks.length && ` · ${trucks.length} total`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleManageBatchRules(batchSize)}
              className={`${labelButtonBase} border-gray-300 dark:border-gray-600 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-700 focus-visible:ring-purple-500`}
              aria-label={`Manage batch rules for ${batchSize}L`}
              title="Manage batch destination rules"
            >
              <MapPin className="w-4 h-4" />
              Batch Rules
              {(batchDestinationRules[batchSize.toString()] ?? []).length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 text-xs font-bold bg-purple-600 text-white rounded-full">
                  {(batchDestinationRules[batchSize.toString()] ?? []).length}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setEditingBatch({ extraLiters: batchSize, trucks });
                setNewBatchLiters(batchSize);
                setShowEditBatchModal(true);
              }}
              className={modifyButtonClass}
              aria-label={`Modify ${batchSize}L batch`}
              title="Modify batch"
            >
              <Edit2 className="w-4 h-4" />
              Modify
            </button>
            <button
              onClick={() => requestDeleteBatch(batchSize)}
              className={deleteLabelButtonClass}
              aria-label={`Delete ${batchSize}L batch`}
              title="Delete batch"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {filteredTrucks.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-3">
              {searchQuery ? 'No matching trucks' : 'No trucks in this batch'}
            </p>
          ) : (
            filteredTrucks.map((truck) => {
              const suffix = getTruckSuffix(truck);
              const hasRules = typeof truck !== 'string' && truck.destinationRules && truck.destinationRules.length > 0;
              
              return (
                <div
                  key={suffix}
                  className="bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-lg p-2 hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Truck className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                          {suffix}
                        </span>
                        {hasRules && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <MapPin className="w-2.5 h-2.5" />
                            <span>{truck.destinationRules.length} rule{truck.destinationRules.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleManageRules(truck, batchSize)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        title="Manage destination rules"
                      >
                        <MapPin className="w-3 h-3" />
                        Rules
                      </button>
                      {batchList.filter(b => b.extraLiters !== batchSize).length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setMoveTarget({ suffix, newBatch: parseInt(e.target.value) });
                              e.target.value = '';
                            }
                          }}
                          className="px-1.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-600/60 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
                          title="Move to batch"
                          aria-label={`Move truck ${suffix.toUpperCase()} to another batch`}
                        >
                          <option value="" disabled>→ Move</option>
                          {batchList.filter(b => b.extraLiters !== batchSize).map(b => (
                            <option key={b.extraLiters} value={b.extraLiters}>{b.extraLiters}L</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => setDeleteTruckTarget(suffix)}
                        className={deleteButtonClass}
                        aria-label={`Remove truck ${suffix.toUpperCase()} from batches`}
                        title="Remove from batches"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  if (loading || !batchConfig) {
    return (
      <UnifiedTabLoader label="Loading truck batches..." heightClassName="h-96" />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Truck Batch Configuration
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create and manage custom fuel allocation batches
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddTruckModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Truck
            </button>
            <button
              onClick={() => setShowCreateBatchModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Batch
            </button>
          </div>
        </div>

        {/* Dynamic Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">Total Batches</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{batchList.length}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">Total Trucks</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalTrucks}</p>
          </div>
          {batchList.slice(0, 2).map((batch) => (
            <div
              key={batch.extraLiters}
              className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 rounded-lg p-3"
            >
              <p className="text-xs text-blue-700 dark:text-blue-300">{batch.extraLiters}L Batch</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{batch.count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search truck suffixes..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Dynamic Batches Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {batchList.map((batch) => renderBatchCard(batch.extraLiters, batch.trucks))}
      </div>

      {batchList.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm p-8 text-center">
          <div className="inline-flex p-3 bg-blue-50 dark:bg-blue-900/30 rounded-full mb-3">
            <Fuel className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">No batches configured yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Create a batch to start assigning trucks to fuel allocations.</p>
          <button
            onClick={() => setShowCreateBatchModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
          >
            <Plus className="w-4 h-4" />
            Create Your First Batch
          </button>
        </div>
      )}

      {/* Destination Rules Modal */}
      {showRulesModal && selectedTruck && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Destination Rules for {selectedTruck.suffix.toUpperCase()}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Default: {selectedTruck.batch}L · Override for specific destinations
                  </p>
                </div>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Add New Rule */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Add Destination Rule
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Destination
                    </label>
                    <input
                      type="text"
                      value={newRule.destination}
                      onChange={(e) => setNewRule({ ...newRule, destination: e.target.value })}
                      placeholder="e.g., LUBUMBASHI"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Extra Liters
                    </label>
                    <input
                      type="number"
                      value={newRule.extraLiters}
                      onChange={(e) => setNewRule({ ...newRule, extraLiters: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddRule}
                  disabled={addRuleMutation.isPending}
                  className="mt-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {addRuleMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {addRuleMutation.isPending ? 'Adding...' : 'Add Rule'}
                </button>
              </div>

              {/* Existing Rules */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Current Rules ({selectedTruck.rules.length})
                </h3>
                
                {selectedTruck.rules.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No destination rules configured</p>
                    <p className="text-sm mt-1">All destinations will use the default {selectedTruck.batch}L</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedTruck.rules.map((rule, index) => (
                      <div
                        key={index}
                        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {rule.destination}
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              {rule.extraLiters}L extra fuel
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setDeleteRuleTarget(rule.destination)}
                          disabled={deleteRuleMutation.isPending}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 rounded-lg transition-colors"
                          title="Delete rule"
                        >
                          {deleteRuleMutation.isPending ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 <strong>Tip:</strong> Destination matching is case-insensitive and uses partial matching.
                For example, a rule for "LUBUMBASHI" will match "lubumbashi", "LUBUMBASHI YARD", etc.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Batch-Level Destination Rules Modal */}
      {showBatchRulesModal && selectedBatchForRules && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Batch Rules — {selectedBatchForRules.extraLiters}L
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Applies to all trucks in this batch unless a truck has its own rule
                  </p>
                </div>
                <button
                  onClick={() => setShowBatchRulesModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Add Destination Rule</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination</label>
                    <input
                      type="text"
                      value={newBatchRule.destination}
                      onChange={(e) => setNewBatchRule({ ...newBatchRule, destination: e.target.value })}
                      placeholder="e.g., LUBUMBASHI"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Extra Liters</label>
                    <input
                      type="number"
                      value={newBatchRule.extraLiters}
                      onChange={(e) => setNewBatchRule({ ...newBatchRule, extraLiters: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddBatchRule}
                  disabled={addBatchRuleMutation.isPending}
                  className="mt-3 w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {addBatchRuleMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {addBatchRuleMutation.isPending ? 'Adding...' : 'Add Rule'}
                </button>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Current Rules ({selectedBatchForRules.rules.length})
                </h3>
                {selectedBatchForRules.rules.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No batch destination rules configured</p>
                    <p className="text-sm mt-1">All trucks default to {selectedBatchForRules.extraLiters}L unless they have their own rule</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedBatchForRules.rules.map((rule, index) => (
                      <div
                        key={index}
                        className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{rule.destination}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{rule.extraLiters}L extra fuel</div>
                          </div>
                        </div>
                        <button
                          onClick={() => setDeleteBatchRuleTarget(rule.destination)}
                          disabled={deleteBatchRuleMutation.isPending}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 rounded-lg transition-colors"
                          title="Delete rule"
                        >
                          {deleteBatchRuleMutation.isPending ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 <strong>Priority:</strong> Truck-level rules override batch rules. Batch rules override the default {selectedBatchForRules.extraLiters}L.
                Matching is case-insensitive and partial (e.g. "LUBUMBASHI" matches "lubumbashi yard").
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Truck Modal */}
      {showAddTruckModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  Add Truck to Batch
                </h2>
                <button
                  onClick={() => { setShowAddTruckModal(false); setNewTruck({ suffix: '', batch: 0 }); }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Truck Suffix
                </label>
                <input
                  type="text"
                  value={newTruck.suffix}
                  onChange={(e) => setNewTruck({ ...newTruck, suffix: e.target.value })}
                  placeholder="e.g., DNH, EAG, BAB"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100 uppercase"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddTruck();
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Batch
                </label>
                <select
                  value={newTruck.batch}
                  onChange={(e) => setNewTruck({ ...newTruck, batch: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value={0}>-- Select Batch --</option>
                  {batchList.map((batch) => (
                    <option key={batch.extraLiters} value={batch.extraLiters}>
                      {batch.extraLiters} Liters ({batch.count} trucks)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => { setShowAddTruckModal(false); setNewTruck({ suffix: '', batch: 0 }); }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleAddTruck();
                }}
                disabled={!newTruck.suffix.trim() || newTruck.batch <= 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Truck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Batch Modal */}
      {showCreateBatchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Create New Batch
                </h2>
                <button
                  onClick={() => setShowCreateBatchModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Extra Fuel Allocation (Liters)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={newBatchLiters === 0 ? '' : newBatchLiters}
                  onChange={(e) => setNewBatchLiters(Number(e.target.value))}
                  placeholder="Enter liter amount (e.g., 120, 150, 200)"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Must be between 0 and 10,000 liters
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateBatchModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={newBatchLiters <= 0 || newBatchLiters > 10000}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Batch Modal */}
      {showEditBatchModal && editingBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Edit Batch
                </h2>
                <button
                  onClick={() => {
                    setShowEditBatchModal(false);
                    setEditingBatch(null);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Current Extra Fuel Allocation
                </label>
                <input
                  type="text"
                  value={`${editingBatch.extraLiters}L`}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  New Extra Fuel Allocation (Liters)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={newBatchLiters === 0 ? '' : newBatchLiters}
                  onChange={(e) => setNewBatchLiters(Number(e.target.value))}
                  placeholder="Enter new liter amount"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Must be between 0 and 10,000 liters
                </p>
              </div>

              {editingBatch.trucks.length > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 dark:text-yellow-300">
                    ⚠️ This batch contains {editingBatch.trucks.length} truck(s). Their extra fuel allocation will be updated to the new value.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowEditBatchModal(false);
                  setEditingBatch(null);
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={requestUpdateBatch}
                disabled={newBatchLiters <= 0 || newBatchLiters > 10000 || newBatchLiters === editingBatch.extraLiters}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Update Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        open={moveTarget !== null}
        title="Move Truck"
        message={moveTarget ? `Move "${moveTarget.suffix.toUpperCase()}" to the ${moveTarget.newBatch}L batch?` : ''}
        confirmLabel="Move"
        variant="warning"
        loading={addTruckMutation.isPending}
        onConfirm={confirmMoveTruck}
        onCancel={() => setMoveTarget(null)}
      />
      <ConfirmModal
        open={deleteTruckTarget !== null}
        title="Remove Truck"
        message={deleteTruckTarget ? `Remove "${deleteTruckTarget.toUpperCase()}" from batch configuration? It will revert to the default 60L extra fuel.` : ''}
        confirmLabel="Remove"
        variant="danger"
        loading={removeTruckMutation.isPending}
        onConfirm={confirmDeleteTruck}
        onCancel={() => setDeleteTruckTarget(null)}
      />
      <ConfirmModal
        open={deleteBatchTarget !== null}
        title="Delete Batch"
        message={deleteBatchTarget !== null ? `Delete batch ${deleteBatchTarget}L? This cannot be undone.` : ''}
        confirmLabel="Delete"
        variant="danger"
        loading={deleteBatchMutation.isPending}
        onConfirm={confirmDeleteBatch}
        onCancel={() => setDeleteBatchTarget(null)}
      />
      <ConfirmModal
        open={deleteRuleTarget !== null}
        title="Remove Destination Rule"
        message={deleteRuleTarget ? `Remove the destination rule for "${deleteRuleTarget}"?` : ''}
        confirmLabel="Remove"
        variant="danger"
        loading={deleteRuleMutation.isPending}
        onConfirm={confirmDeleteRule}
        onCancel={() => setDeleteRuleTarget(null)}
      />
      <ConfirmModal
        open={confirmUpdateBatch}
        title="Update Batch"
        message={
          editingBatch
            ? `Update batch from ${editingBatch.extraLiters}L to ${newBatchLiters}L?${
                editingBatch.trucks.length > 0
                  ? ` This will update ${editingBatch.trucks.length} truck(s).`
                  : ''
              }`
            : ''
        }
        confirmLabel="Update"
        variant="warning"
        loading={updateBatchMutation.isPending}
        onConfirm={confirmUpdateBatchAction}
        onCancel={() => setConfirmUpdateBatch(false)}
      />
      <ConfirmModal
        open={deleteBatchRuleTarget !== null}
        title="Remove Batch Rule"
        message={deleteBatchRuleTarget ? `Remove the batch-level rule for "${deleteBatchRuleTarget}"?` : ''}
        confirmLabel="Remove"
        variant="danger"
        loading={deleteBatchRuleMutation.isPending}
        onConfirm={confirmDeleteBatchRule}
        onCancel={() => setDeleteBatchRuleTarget(null)}
      />
    </div>
  );
}
