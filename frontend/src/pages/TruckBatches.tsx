import { useState, useCallback, useEffect } from 'react';
import { Truck, Trash2, Plus, Fuel, Search, MapPin, X, Edit2, SlidersHorizontal, ArrowRight } from 'lucide-react';
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
  useAddSpecialTruck,
  useRemoveSpecialTruck,
  useAddSpecialTruckDestinationRule,
  useDeleteSpecialTruckDestinationRule,
  truckBatchKeys,
} from '../hooks/useTruckBatches';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import UnifiedTabLoader from '../components/SuperAdmin/common/UnifiedTabLoader';
import type { SpecialTruck } from '../services/api';

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
  const addSpecialTruckMutation = useAddSpecialTruck();
  const removeSpecialTruckMutation = useRemoveSpecialTruck();
  const addSpecialRuleMutation = useAddSpecialTruckDestinationRule();
  const deleteSpecialRuleMutation = useDeleteSpecialTruckDestinationRule();

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

  // Special trucks (full-plate overrides)
  const [showAddSpecialModal, setShowAddSpecialModal] = useState(false);
  const [newSpecial, setNewSpecial] = useState({
    truckNo: '',
    extraLiters: 100,
    linkedBatchLiters: '' as string | number,
    notes: '',
  });
  const [showSpecialRulesModal, setShowSpecialRulesModal] = useState(false);
  const [selectedSpecial, setSelectedSpecial] = useState<{
    truckNo: string;
    extraLiters: number;
    linkedBatchLiters?: number | null;
    rules: DestinationRule[];
  } | null>(null);
  const [newSpecialRule, setNewSpecialRule] = useState({ destination: '', extraLiters: 0 });
  const [deleteSpecialTarget, setDeleteSpecialTarget] = useState<string | null>(null);
  const [deleteSpecialRuleTarget, setDeleteSpecialRuleTarget] = useState<string | null>(null);
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [moveMenuKey, setMoveMenuKey] = useState<string | null>(null);
  const CARD_PREVIEW_COUNT = 3;
  
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

  const handleAddSpecialTruck = async () => {
    const truckNo = newSpecial.truckNo.trim();
    if (!truckNo) {
      toast.error('Please enter the full truck number (e.g. T103 XYZ)');
      return;
    }
    if (newSpecial.extraLiters <= 0) {
      toast.error('Extra liters must be greater than 0');
      return;
    }
    try {
      const linked =
        newSpecial.linkedBatchLiters === '' || newSpecial.linkedBatchLiters === null
          ? null
          : Number(newSpecial.linkedBatchLiters);
      await addSpecialTruckMutation.mutateAsync({
        truckNo,
        extraLiters: Number(newSpecial.extraLiters),
        linkedBatchLiters: linked,
        notes: newSpecial.notes.trim() || undefined,
      });
      setShowAddSpecialModal(false);
      setNewSpecial({ truckNo: '', extraLiters: 100, linkedBatchLiters: '', notes: '' });
      toast.success(`Special truck ${truckNo.toUpperCase()} added`);
    } catch (error: any) {
      toast.error(`Failed to add special truck: ${error.response?.data?.error || error.message}`);
    }
  };

  const confirmDeleteSpecial = async () => {
    if (!deleteSpecialTarget) return;
    try {
      await removeSpecialTruckMutation.mutateAsync(deleteSpecialTarget);
      toast.success(`Special truck ${deleteSpecialTarget} removed`);
    } catch (error: any) {
      toast.error(`Failed to remove: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeleteSpecialTarget(null);
    }
  };

  const handleManageSpecialRules = (truck: SpecialTruck) => {
    setSelectedSpecial({
      truckNo: truck.truckNo,
      extraLiters: truck.extraLiters,
      linkedBatchLiters: truck.linkedBatchLiters,
      rules: [...(truck.destinationRules || [])],
    });
    setNewSpecialRule({ destination: '', extraLiters: truck.extraLiters });
    setShowSpecialRulesModal(true);
  };

  const handleAddSpecialRule = async () => {
    if (!selectedSpecial || !newSpecialRule.destination.trim()) {
      toast.error('Please enter a destination');
      return;
    }
    try {
      await addSpecialRuleMutation.mutateAsync({
        truckNo: selectedSpecial.truckNo,
        destination: newSpecialRule.destination.trim(),
        extraLiters: newSpecialRule.extraLiters,
      });
      setSelectedSpecial({
        ...selectedSpecial,
        rules: [
          ...selectedSpecial.rules,
          { destination: newSpecialRule.destination.trim(), extraLiters: newSpecialRule.extraLiters },
        ],
      });
      setNewSpecialRule({ destination: '', extraLiters: selectedSpecial.extraLiters });
      toast.success('Destination rule added');
    } catch (error: any) {
      toast.error(`Failed to add rule: ${error.response?.data?.error || error.message}`);
    }
  };

  const confirmDeleteSpecialRule = async () => {
    if (!selectedSpecial || !deleteSpecialRuleTarget) return;
    const destination = deleteSpecialRuleTarget;
    try {
      await deleteSpecialRuleMutation.mutateAsync({
        truckNo: selectedSpecial.truckNo,
        destination,
      });
      setSelectedSpecial({
        ...selectedSpecial,
        rules: selectedSpecial.rules.filter((r) => r.destination !== destination),
      });
    } catch (error: any) {
      toast.error(`Failed to delete rule: ${error.response?.data?.error || error.message}`);
    } finally {
      setDeleteSpecialRuleTarget(null);
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

  const specialTrucks: SpecialTruck[] = batchConfig?.specialTrucks || [];
  const filteredSpecialTrucks = specialTrucks.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.truckNo.toLowerCase().includes(q) ||
      String(t.extraLiters).includes(q) ||
      (t.notes || '').toLowerCase().includes(q)
    );
  });

  const totalTrucks = batchList.reduce((sum, batch) => sum + batch.count, 0);

  // Shared icon-button styling — compact icon-only actions for card rows/headers
  const iconBtn =
    'inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'dark:focus-visible:ring-offset-gray-900 disabled:opacity-40 disabled:cursor-not-allowed';
  const iconBtnGray =
    `${iconBtn} border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 ` +
    'bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:ring-gray-400';
  const iconBtnBlue =
    `${iconBtn} border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 ` +
    'bg-blue-50/80 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 focus-visible:ring-blue-500';
  const iconBtnRed =
    `${iconBtn} border-red-300 dark:border-red-700 text-red-500 dark:text-red-400 ` +
    'bg-transparent hover:bg-red-50 dark:hover:bg-red-900/20 focus-visible:ring-red-500';
  // Keep deleteButtonClass alias for modals that still use the older style
  const deleteButtonClass = iconBtnRed;

  const toggleBatchExpanded = (key: string) => {
    setExpandedBatches((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderBatchCard = (batchSize: number, trucks: any[]) => {
    const filteredTrucks = filterTrucks(trucks);
    const cardKey = `batch-${batchSize}`;
    const isExpanded = !!expandedBatches[cardKey];
    const visibleTrucks =
      isExpanded || filteredTrucks.length <= CARD_PREVIEW_COUNT
        ? filteredTrucks
        : filteredTrucks.slice(0, CARD_PREVIEW_COUNT);
    const moreCount = filteredTrucks.length - CARD_PREVIEW_COUNT;
    const otherBatches = batchList.filter((b) => b.extraLiters !== batchSize);
    const batchRuleCount = (batchDestinationRules[batchSize.toString()] ?? []).length;

    return (
      <div
        key={batchSize}
        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col min-w-0"
      >
        {/* Header */}
        <div className="px-3.5 pt-3.5 pb-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Fuel className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                  {batchSize}L Extra Fuel
                </h3>
                <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                  {filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''} · going and returning
                  {searchQuery && trucks.length !== filteredTrucks.length ? ` · ${trucks.length} total` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => handleManageBatchRules(batchSize)}
                className={iconBtnGray}
                aria-label={`Manage batch rules for ${batchSize}L`}
                title={batchRuleCount > 0 ? `Batch rules (${batchRuleCount})` : 'Batch destination rules'}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditingBatch({ extraLiters: batchSize, trucks });
                  setNewBatchLiters(batchSize);
                  setShowEditBatchModal(true);
                }}
                className={iconBtnGray}
                aria-label={`Modify ${batchSize}L batch`}
                title="Modify batch"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => requestDeleteBatch(batchSize)}
                className={iconBtnRed}
                aria-label={`Delete ${batchSize}L batch`}
                title="Delete batch"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Truck rows */}
        <div className="flex-1">
          {filteredTrucks.length === 0 ? (
            <p className="text-[12px] text-gray-500 dark:text-gray-400 text-center py-4 px-3">
              {searchQuery ? 'No matching trucks' : 'No trucks in this batch'}
            </p>
          ) : (
            visibleTrucks.map((truck, idx) => {
              const suffix = getTruckSuffix(truck);
              const hasRules =
                typeof truck !== 'string' &&
                truck.destinationRules &&
                truck.destinationRules.length > 0;
              const moveKey = `${cardKey}:${suffix}`;
              const showMoveMenu = moveMenuKey === moveKey;

              return (
                <div
                  key={suffix}
                  className={`px-3.5 py-2 flex items-center justify-between gap-2 ${
                    idx < visibleTrucks.length - 1 || moreCount > 0
                      ? 'border-b border-gray-100 dark:border-gray-800'
                      : ''
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                      {suffix}
                    </span>
                    {hasRules && (
                      <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-tight">
                        {truck.destinationRules.length} rule
                        {truck.destinationRules.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 relative">
                    <button
                      onClick={() => handleManageRules(truck, batchSize)}
                      className={iconBtnBlue}
                      title="Manage destination rules"
                      aria-label={`Rules for ${suffix.toUpperCase()}`}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                    {otherBatches.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setMoveMenuKey(showMoveMenu ? null : moveKey)}
                          className={iconBtnGray}
                          title="Move to another batch"
                          aria-label={`Move truck ${suffix.toUpperCase()}`}
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        {showMoveMenu && (
                          <div className="absolute right-0 top-full mt-1 z-20 min-w-[7rem] py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                            {otherBatches.map((b) => (
                              <button
                                key={b.extraLiters}
                                type="button"
                                className="w-full text-left px-3 py-1.5 text-[12px] text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                                onClick={() => {
                                  setMoveTarget({ suffix, newBatch: b.extraLiters });
                                  setMoveMenuKey(null);
                                }}
                              >
                                Move to {b.extraLiters}L
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setDeleteTruckTarget(suffix)}
                      className={iconBtnRed}
                      aria-label={`Remove truck ${suffix.toUpperCase()} from batches`}
                      title="Remove from batches"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!isExpanded && moreCount > 0 && (
          <div className="px-3.5 py-2.5 flex justify-center border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => toggleBatchExpanded(cardKey)}
              className="px-3 py-1 text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              +{moreCount} more
            </button>
          </div>
        )}
        {isExpanded && filteredTrucks.length > CARD_PREVIEW_COUNT && (
          <div className="px-3.5 py-2.5 flex justify-center border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => toggleBatchExpanded(cardKey)}
              className="px-3 py-1 text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Show less
            </button>
          </div>
        )}
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
              onClick={() => setShowAddSpecialModal(true)}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Special Truck
            </button>
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">Total Batches</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{batchList.length}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">Total Trucks</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{totalTrucks}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">Special Trucks</p>
            <p className="text-xl font-bold text-amber-900 dark:text-amber-100">{specialTrucks.length}</p>
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

      {/* Dynamic Batches Grid — equal-width cards, 4 per row on large screens */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Special trucks card — same chrome as batch cards */}
        {(() => {
          const cardKey = 'special';
          const isExpanded = !!expandedBatches[cardKey];
          const visible =
            isExpanded || filteredSpecialTrucks.length <= CARD_PREVIEW_COUNT
              ? filteredSpecialTrucks
              : filteredSpecialTrucks.slice(0, CARD_PREVIEW_COUNT);
          const moreCount = filteredSpecialTrucks.length - CARD_PREVIEW_COUNT;

          return (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col min-w-0">
              <div className="px-3.5 pt-3.5 pb-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Fuel className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                        Special Trucks
                      </h3>
                      <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                        {specialTrucks.length} truck{specialTrucks.length !== 1 ? 's' : ''} · full plate overrides
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddSpecialModal(true)}
                    className={iconBtnGray}
                    title="Add special truck"
                    aria-label="Add special truck"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800" />

              <div className="flex-1">
                {filteredSpecialTrucks.length === 0 ? (
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 text-center py-4 px-3">
                    {searchQuery ? 'No matching special trucks' : 'No special trucks yet'}
                  </p>
                ) : (
                  visible.map((truck, idx) => (
                    <div
                      key={truck.truckNo}
                      className={`px-3.5 py-2 flex items-center justify-between gap-2 ${
                        idx < visible.length - 1 || moreCount > 0
                          ? 'border-b border-gray-100 dark:border-gray-800'
                          : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                          {truck.truckNo}
                        </span>
                        <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-tight truncate">
                          {truck.extraLiters}L
                          {truck.linkedBatchLiters != null ? ` · linked ${truck.linkedBatchLiters}L` : ''}
                          {(truck.destinationRules?.length || 0) > 0
                            ? ` · ${truck.destinationRules!.length} rule${truck.destinationRules!.length !== 1 ? 's' : ''}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleManageSpecialRules(truck)}
                          className={iconBtnBlue}
                          title="Manage destination rules"
                          aria-label={`Rules for ${truck.truckNo}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteSpecialTarget(truck.truckNo)}
                          className={iconBtnRed}
                          title="Remove special truck"
                          aria-label={`Remove ${truck.truckNo}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {!isExpanded && moreCount > 0 && (
                <div className="px-3.5 py-2.5 flex justify-center border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => toggleBatchExpanded(cardKey)}
                    className="px-3 py-1 text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    +{moreCount} more
                  </button>
                </div>
              )}
              {isExpanded && filteredSpecialTrucks.length > CARD_PREVIEW_COUNT && (
                <div className="px-3.5 py-2.5 flex justify-center border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => toggleBatchExpanded(cardKey)}
                    className="px-3 py-1 text-[12px] font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Show less
                  </button>
                </div>
              )}
            </div>
          );
        })()}

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
                disabled={!newTruck.suffix.trim() || newTruck.batch <= 0 || addTruckMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addTruckMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {addTruckMutation.isPending ? 'Adding…' : 'Add Truck'}
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
                disabled={newBatchLiters <= 0 || newBatchLiters > 10000 || createBatchMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {createBatchMutation.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {createBatchMutation.isPending ? 'Creating…' : 'Create Batch'}
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
      <ConfirmModal
        open={deleteSpecialTarget !== null}
        title="Remove Special Truck"
        message={
          deleteSpecialTarget
            ? `Remove special truck "${deleteSpecialTarget}"? Fuel matching will fall back to suffix batches.`
            : ''
        }
        confirmLabel="Remove"
        variant="danger"
        loading={removeSpecialTruckMutation.isPending}
        onConfirm={confirmDeleteSpecial}
        onCancel={() => setDeleteSpecialTarget(null)}
      />
      <ConfirmModal
        open={deleteSpecialRuleTarget !== null}
        title="Remove Special Rule"
        message={
          deleteSpecialRuleTarget
            ? `Remove the destination rule for "${deleteSpecialRuleTarget}" on this special truck?`
            : ''
        }
        confirmLabel="Remove"
        variant="danger"
        loading={deleteSpecialRuleMutation.isPending}
        onConfirm={confirmDeleteSpecialRule}
        onCancel={() => setDeleteSpecialRuleTarget(null)}
      />

      {/* Add Special Truck Modal */}
      {showAddSpecialModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Special Truck</h2>
              <button onClick={() => setShowAddSpecialModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full truck number
                </label>
                <input
                  type="text"
                  value={newSpecial.truckNo}
                  onChange={(e) => setNewSpecial({ ...newSpecial, truckNo: e.target.value })}
                  placeholder="e.g. T103 XYZ"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Extra liters
                </label>
                <input
                  type="number"
                  min={1}
                  value={newSpecial.extraLiters || ''}
                  onChange={(e) =>
                    setNewSpecial({ ...newSpecial, extraLiters: parseInt(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Link batch (inherit batch destination rules)
                </label>
                <select
                  value={newSpecial.linkedBatchLiters === '' ? '' : String(newSpecial.linkedBatchLiters)}
                  onChange={(e) =>
                    setNewSpecial({
                      ...newSpecial,
                      linkedBatchLiters: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                >
                  <option value="">None</option>
                  {batchList.map((b) => (
                    <option key={b.extraLiters} value={b.extraLiters}>
                      {b.extraLiters}L batch
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={newSpecial.notes}
                  onChange={(e) => setNewSpecial({ ...newSpecial, notes: e.target.value })}
                  placeholder="e.g. late plate from 100L purchase group"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowAddSpecialModal(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSpecialTruck}
                disabled={addSpecialTruckMutation.isPending}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {addSpecialTruckMutation.isPending ? 'Adding…' : 'Add Special Truck'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Special truck destination rules modal */}
      {showSpecialRulesModal && selectedSpecial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    Destination Rules for {selectedSpecial.truckNo}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Default: {selectedSpecial.extraLiters}L
                    {selectedSpecial.linkedBatchLiters != null
                      ? ` · inherits ${selectedSpecial.linkedBatchLiters}L batch rules when no own rule`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={() => setShowSpecialRulesModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSpecialRule.destination}
                  onChange={(e) =>
                    setNewSpecialRule({ ...newSpecialRule, destination: e.target.value })
                  }
                  placeholder="Destination"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                />
                <input
                  type="number"
                  min={0}
                  value={newSpecialRule.extraLiters || ''}
                  onChange={(e) =>
                    setNewSpecialRule({
                      ...newSpecialRule,
                      extraLiters: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-gray-100"
                />
                <button
                  onClick={handleAddSpecialRule}
                  disabled={addSpecialRuleMutation.isPending}
                  className="px-3 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {selectedSpecial.rules.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No own destination rules yet
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedSpecial.rules.map((rule) => (
                    <div
                      key={rule.destination}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {rule.destination} → <strong>{rule.extraLiters}L</strong>
                      </span>
                      <button
                        onClick={() => setDeleteSpecialRuleTarget(rule.destination)}
                        className={deleteButtonClass}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
