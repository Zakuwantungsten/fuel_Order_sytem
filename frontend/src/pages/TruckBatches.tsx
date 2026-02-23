import { useState } from 'react';
import { Truck, Trash2, Plus, Fuel, Search, MapPin, X, Edit2 } from 'lucide-react';
import {
  useTruckBatches,
  useAddTruckBatch,
  useRemoveTruckBatch,
  useAddDestinationRule,
  useDeleteDestinationRule,
  useCreateBatch,
  useUpdateBatch,
  useDeleteBatch,
} from '../hooks/useTruckBatches';

interface DestinationRule {
  destination: string;
  extraLiters: number;
}

export default function TruckBatches() {
  // Use React Query hooks
  const { data: batches, isLoading: loading } = useTruckBatches();
  const addTruckMutation = useAddTruckBatch();
  const removeTruckMutation = useRemoveTruckBatch();
  const addRuleMutation = useAddDestinationRule();
  const deleteRuleMutation = useDeleteDestinationRule();
  const createBatchMutation = useCreateBatch();
  const updateBatchMutation = useUpdateBatch();
  const deleteBatchMutation = useDeleteBatch();

  const [newTruck, setNewTruck] = useState({ suffix: '', batch: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Batch management modal state
  const [showCreateBatchModal, setShowCreateBatchModal] = useState(false);
  const [newBatchLiters, setNewBatchLiters] = useState<number>(0);
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<{ extraLiters: number; trucks: any[] } | null>(null);
  
  // Destination rules modal state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<{ suffix: string; batch: number; rules: DestinationRule[] } | null>(null);
  const [newRule, setNewRule] = useState({ destination: '', extraLiters: 0 });

  const handleAddTruck = async () => {
    const suffix = newTruck.suffix.trim().toLowerCase();
    
    if (!suffix) {
      alert('Please enter a truck suffix (e.g., DNH, EAG)');
      return;
    }

    if (newTruck.batch <= 0) {
      alert('Please select a valid batch');
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
      alert(`Truck suffix "${suffix.toUpperCase()}" is already configured. Use the move option to change its batch.`);
      return;
    }

    try {
      await addTruckMutation.mutateAsync({
        truckSuffix: suffix,
        extraLiters: newTruck.batch,
      });
      setNewTruck({ suffix: '', batch: 0 });
      alert(`✓ Truck ${suffix.toUpperCase()} added to ${newTruck.batch}L batch`);
    } catch (error: any) {
      alert(`Failed to add truck: ${error.message}`);
    }
  };

  const handleMoveTruck = async (suffix: string, newBatch: number) => {
    if (!confirm(`Move "${suffix.toUpperCase()}" to ${newBatch}L batch?`)) return;

    try {
      await addTruckMutation.mutateAsync({
        truckSuffix: suffix,
        extraLiters: newBatch,
      });
      alert(`✓ Truck ${suffix.toUpperCase()} moved to ${newBatch}L batch`);
    } catch (error: any) {
      alert(`Failed to move truck: ${error.message}`);
    }
  };

  const handleDeleteTruck = async (suffix: string) => {
    if (!confirm(`Remove "${suffix.toUpperCase()}" from batch configuration?\nIt will revert to default 60L extra fuel.`)) return;

    try {
      await removeTruckMutation.mutateAsync(suffix);
      alert(`✓ Truck ${suffix.toUpperCase()} removed from batches`);
    } catch (error: any) {
      alert(`Failed to remove truck: ${error.message}`);
    }
  };

  const handleManageRules = (truck: any, batch: number) => {
    const suffix = typeof truck === 'string' ? truck : truck.truckSuffix;
    const rules = typeof truck === 'string' ? [] : (truck.destinationRules || []);
    setSelectedTruck({ suffix, batch, rules });
    setShowRulesModal(true);
    setNewRule({ destination: '', extraLiters: batch }); // Default to batch size
  };

  const handleCreateBatch = async () => {
    if (newBatchLiters <= 0) {
      alert('Please enter a valid liter amount greater than 0');
      return;
    }

    try {
      await createBatchMutation.mutateAsync({ extraLiters: newBatchLiters });
      setNewBatchLiters(0);
      setShowCreateBatchModal(false);
      alert(`✓ New batch ${newBatchLiters}L created successfully`);
    } catch (error: any) {
      alert(`Failed to create batch: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleUpdateBatch = async () => {
    if (!editingBatch || newBatchLiters <= 0) {
      alert('Please enter a valid liter amount greater than 0');
      return;
    }

    if (!confirm(`Update batch from ${editingBatch.extraLiters}L to ${newBatchLiters}L?`)) return;

    try {
      await updateBatchMutation.mutateAsync({ 
        oldExtraLiters: editingBatch.extraLiters, 
        newExtraLiters: newBatchLiters 
      });
      setEditingBatch(null);
      setNewBatchLiters(0);
      setShowEditBatchModal(false);
      alert(`✓ Batch updated: ${editingBatch.extraLiters}L → ${newBatchLiters}L`);
    } catch (error: any) {
      alert(`Failed to update batch: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleDeleteBatch = async (extraLiters: number) => {
    const batchKey = extraLiters.toString();
    const batch = batches?.[batchKey];
    
    if (batch && batch.length > 0) {
      alert(`Cannot delete batch ${extraLiters}L with ${batch.length} trucks assigned. Move trucks first.`);
      return;
    }

    if (!confirm(`Delete batch ${extraLiters}L? This cannot be undone.`)) return;

    try {
      await deleteBatchMutation.mutateAsync(extraLiters);
      alert(`✓ Batch ${extraLiters}L deleted successfully`);
    } catch (error: any) {
      alert(`Failed to delete batch: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleAddRule = async () => {
    if (!selectedTruck || !newRule.destination.trim()) {
      alert('Please enter a destination');
      return;
    }

    if (!batches) return;

    try {
      await addRuleMutation.mutateAsync({
        truckSuffix: selectedTruck.suffix,
        destination: newRule.destination.trim(),
        extraLiters: newRule.extraLiters
      });
      
      // React Query will auto-refresh batches, update selected truck
      const batchKey = selectedTruck.batch.toString() as keyof typeof batches;
      const batch = batches[batchKey];
      if (Array.isArray(batch)) {
        const truck = batch.find((t: any) => (typeof t === 'string' ? t : t.truckSuffix) === selectedTruck.suffix);
        if (truck && typeof truck !== 'string') {
          setSelectedTruck({ ...selectedTruck, rules: truck.destinationRules || [] });
        }
      }
      
      setNewRule({ destination: '', extraLiters: selectedTruck.batch });
      alert(`✓ Destination rule added for ${selectedTruck.suffix.toUpperCase()}`);
    } catch (error: any) {
      alert(`Failed to add rule: ${error.response?.data?.error || error.message}`);
    }
  };

  const handleDeleteRule = async (destination: string) => {
    if (!selectedTruck) return;
    
    if (!confirm(`Remove destination rule for "${destination}"?`)) return;
    if (!batches) return;

    try {
      await deleteRuleMutation.mutateAsync({
        truckSuffix: selectedTruck.suffix,
        destination
      });
      
      // React Query will auto-refresh batches, update selected truck
      const batchKey = selectedTruck.batch.toString() as keyof typeof batches;
      const batch = batches[batchKey];
      if (Array.isArray(batch)) {
        const truck = batch.find((t: any) => (typeof t === 'string' ? t : t.truckSuffix) === selectedTruck.suffix);
        if (truck && typeof truck !== 'string') {
          setSelectedTruck({ ...selectedTruck, rules: truck.destinationRules || [] });
        }
      }
      
      alert(`✓ Destination rule deleted for ${selectedTruck.suffix.toUpperCase()}`);
    } catch (error: any) {
      alert(`Failed to delete rule: ${error.response?.data?.error || error.message}`);
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

  const colorConfig: Record<string, { bg: string; border: string; text: string; badge: string; subtext: string }> = {
    green:  { bg: 'bg-green-50 dark:bg-green-900/20',   border: 'border-green-200 dark:border-green-800',   text: 'text-green-900 dark:text-green-100',   badge: 'bg-green-600',   subtext: 'text-green-700 dark:text-green-300' },
    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800', text: 'text-yellow-900 dark:text-yellow-100', badge: 'bg-yellow-600', subtext: 'text-yellow-700 dark:text-yellow-300' },
    blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800',     text: 'text-blue-900 dark:text-blue-100',     badge: 'bg-blue-600',   subtext: 'text-blue-700 dark:text-blue-300' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-900 dark:text-purple-100', badge: 'bg-purple-600', subtext: 'text-purple-700 dark:text-purple-300' },
    pink:   { bg: 'bg-pink-50 dark:bg-pink-900/20',     border: 'border-pink-200 dark:border-pink-800',     text: 'text-pink-900 dark:text-pink-100',     badge: 'bg-pink-600',   subtext: 'text-pink-700 dark:text-pink-300' },
    indigo: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-900 dark:text-indigo-100', badge: 'bg-indigo-600', subtext: 'text-indigo-700 dark:text-indigo-300' },
    red:    { bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800',       text: 'text-red-900 dark:text-red-100',       badge: 'bg-red-600',    subtext: 'text-red-700 dark:text-red-300' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-900 dark:text-orange-100', badge: 'bg-orange-600', subtext: 'text-orange-700 dark:text-orange-300' },
    teal:   { bg: 'bg-teal-50 dark:bg-teal-900/20',     border: 'border-teal-200 dark:border-teal-800',     text: 'text-teal-900 dark:text-teal-100',     badge: 'bg-teal-600',   subtext: 'text-teal-700 dark:text-teal-300' },
    cyan:   { bg: 'bg-cyan-50 dark:bg-cyan-900/20',     border: 'border-cyan-200 dark:border-cyan-800',     text: 'text-cyan-900 dark:text-cyan-100',     badge: 'bg-cyan-600',   subtext: 'text-cyan-700 dark:text-cyan-300' },
  };

  const getColorForIndex = (index: number) => {
    const colors = ['green', 'yellow', 'blue', 'purple', 'pink', 'indigo', 'red', 'orange', 'teal', 'cyan'];
    return colors[index % colors.length];
  };

  const renderBatchCard = (batchSize: number, trucks: any[], colorIndex: number) => {
    const filteredTrucks = filterTrucks(trucks);
    const color = getColorForIndex(colorIndex);
    const { bg, border, text, badge, subtext } = colorConfig[color];

    return (
      <div key={batchSize} className={`${bg} ${border} border-2 rounded-lg p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 ${badge} rounded-lg`}>
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className={`text-base font-semibold ${text}`}>
                {batchSize}L Extra Fuel
              </h3>
              <p className={`text-xs ${subtext}`}>
                {filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''} (going + returning)
                {searchQuery && trucks.length !== filteredTrucks.length && ` · ${trucks.length} total`}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => {
                setEditingBatch({ extraLiters: batchSize, trucks });
                setNewBatchLiters(batchSize);
                setShowEditBatchModal(true);
              }}
              className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              title="Edit batch"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeleteBatch(batchSize)}
              className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              title="Delete batch"
            >
              <Trash2 className="w-3.5 h-3.5" />
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
                  className="bg-white dark:bg-gray-700/80 rounded-md p-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 uppercase">
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
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleManageRules(truck, batchSize)}
                        className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded transition-colors flex items-center gap-0.5"
                        title="Manage destination rules"
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        Rules
                      </button>
                      {batchList.slice(0, 3).map((batch) => {
                        if (batch.extraLiters === batchSize) return null;
                        return (
                          <button
                            key={batch.extraLiters}
                            onClick={() => handleMoveTruck(suffix, batch.extraLiters)}
                            className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded transition-colors"
                            title={`Move to ${batch.extraLiters}L batch`}
                          >
                            → {batch.extraLiters}L
                          </button>
                        );
                      })}
                      <button
                        onClick={() => handleDeleteTruck(suffix)}
                        className="p-0.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Remove from batches"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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

  if (loading || !batches) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading truck batches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Truck Batch Configuration
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create and manage custom fuel allocation batches
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateBatchModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Batch
          </button>
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
          {batchList.slice(0, 2).map((batch, idx) => {
            const color = getColorForIndex(idx);
            const { bg, text, subtext } = colorConfig[color];
            return (
              <div key={batch.extraLiters} className={`${bg} rounded-lg p-3`}>
                <p className={`text-xs ${subtext}`}>{batch.extraLiters}L Batch</p>
                <p className={`text-xl font-bold ${text}`}>{batch.count}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add New Truck */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Add New Truck Suffix
        </h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Truck Suffix
            </label>
            <input
              type="text"
              value={newTruck.suffix}
              onChange={(e) => setNewTruck({ ...newTruck, suffix: e.target.value })}
              placeholder="e.g., DNH, EAG, BAB"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100 uppercase"
              onKeyDown={(e) => e.key === 'Enter' && handleAddTruck()}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Batch
            </label>
            <select
              value={newTruck.batch}
              onChange={(e) => setNewTruck({ ...newTruck, batch: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value={0}>-- Select Batch --</option>
              {batchList.map((batch) => (
                <option key={batch.extraLiters} value={batch.extraLiters}>
                  {batch.extraLiters} Liters ({batch.count} trucks)
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddTruck}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Truck
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search truck suffixes..."
            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Dynamic Batches Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {batchList.map((batch, index) => renderBatchCard(batch.extraLiters, batch.trucks, index))}
      </div>

      {batchList.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 mb-2">No batches configured yet</p>
          <button
            onClick={() => setShowCreateBatchModal(true)}
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
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
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                </div>
                <button
                  onClick={handleAddRule}
                  className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Rule
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
                          <MapPin className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
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
                          onClick={() => handleDeleteRule(rule.destination)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
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
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
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
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
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
                onClick={handleUpdateBatch}
                disabled={newBatchLiters <= 0 || newBatchLiters > 10000 || newBatchLiters === editingBatch.extraLiters}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Update Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
