import { useState } from 'react';
import { Truck, Trash2, Plus, Fuel, Search, MapPin, X } from 'lucide-react';
import {
  useTruckBatches,
  useAddTruckBatch,
  useRemoveTruckBatch,
  useAddDestinationRule,
  useDeleteDestinationRule,
} from '../hooks/useTruckBatches';

interface DestinationRule {
  destination: string;
  extraLiters: number;
}

export default function TruckBatches() {
  // Use React Query hooks instead of manual state/API calls
  const { data: batches, isLoading: loading } = useTruckBatches();
  const addTruckMutation = useAddTruckBatch();
  const removeTruckMutation = useRemoveTruckBatch();
  const addRuleMutation = useAddDestinationRule();
  const deleteRuleMutation = useDeleteDestinationRule();

  const [newTruck, setNewTruck] = useState({ suffix: '', batch: 60 as 100 | 80 | 60 });
  const [searchQuery, setSearchQuery] = useState('');
  
  // Destination rules modal state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<{ suffix: string; batch: 100 | 80 | 60; rules: DestinationRule[] } | null>(null);
  const [newRule, setNewRule] = useState({ destination: '', extraLiters: 0 });

  const handleAddTruck = async () => {
    const suffix = newTruck.suffix.trim().toLowerCase();
    
    if (!suffix) {
      alert('Please enter a truck suffix (e.g., DNH, EAG)');
      return;
    }

    if (!batches) return;

    // Check if already exists
    const allTrucks = [
      ...batches.batch_100.map(t => typeof t === 'string' ? t : t.truckSuffix),
      ...batches.batch_80.map(t => typeof t === 'string' ? t : t.truckSuffix),
      ...batches.batch_60.map(t => typeof t === 'string' ? t : t.truckSuffix)
    ];
    if (allTrucks.includes(suffix)) {
      alert(`Truck suffix "${suffix.toUpperCase()}" is already configured. Use the move option to change its batch.`);
      return;
    }

    try {
      await addTruckMutation.mutateAsync({
        truckSuffix: suffix,
        extraLiters: newTruck.batch,
      });
      setNewTruck({ suffix: '', batch: 60 });
      alert(`✓ Truck ${suffix.toUpperCase()} added to ${newTruck.batch}L batch`);
    } catch (error: any) {
      alert(`Failed to add truck: ${error.message}`);
    }
  };

  const handleMoveTruck = async (suffix: string, newBatch: 100 | 80 | 60) => {
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

  const handleManageRules = (truck: any, batch: 100 | 80 | 60) => {
    const suffix = typeof truck === 'string' ? truck : truck.truckSuffix;
    const rules = typeof truck === 'string' ? [] : (truck.destinationRules || []);
    setSelectedTruck({ suffix, batch, rules });
    setShowRulesModal(true);
    setNewRule({ destination: '', extraLiters: batch }); // Default to batch size
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
      const batchKey = `batch_${selectedTruck.batch}` as keyof typeof batches;
      const batch = batches[batchKey];
      const truck = batch.find((t: any) => (typeof t === 'string' ? t : t.truckSuffix) === selectedTruck.suffix);
      if (truck && typeof truck !== 'string') {
        setSelectedTruck({ ...selectedTruck, rules: truck.destinationRules || [] });
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
      const batchKey = `batch_${selectedTruck.batch}` as keyof typeof batches;
      const batch = batches[batchKey];
      const truck = batch.find((t: any) => (typeof t === 'string' ? t : t.truckSuffix) === selectedTruck.suffix);
      if (truck && typeof truck !== 'string') {
        setSelectedTruck({ ...selectedTruck, rules: truck.destinationRules || [] });
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

  const totalTrucks = batches 
    ? batches.batch_100.length + batches.batch_80.length + batches.batch_60.length 
    : 0;

  const renderBatchCard = (batchSize: 100 | 80 | 60, trucks: any[], color: string) => {
    const filteredTrucks = filterTrucks(trucks);
    const bgColor = color === 'green' ? 'bg-green-50' : color === 'yellow' ? 'bg-yellow-50' : 'bg-blue-50';
    const borderColor = color === 'green' ? 'border-green-200' : color === 'yellow' ? 'border-yellow-200' : 'border-blue-200';
    const textColor = color === 'green' ? 'text-green-900' : color === 'yellow' ? 'text-yellow-900' : 'text-blue-900';
    const badgeColor = color === 'green' ? 'bg-green-600' : color === 'yellow' ? 'bg-yellow-600' : 'bg-blue-600';

    return (
      <div className={`${bgColor} ${borderColor} border-2 rounded-lg p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 ${badgeColor} rounded-lg`}>
              <Fuel className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${textColor}`}>
                {batchSize}L Extra Fuel
              </h3>
              <p className="text-sm text-gray-600">
                {filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''} (going + returning)
                {searchQuery && trucks.length !== filteredTrucks.length && ` · ${trucks.length} total`}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredTrucks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              {searchQuery ? 'No matching trucks' : 'No trucks in this batch'}
            </p>
          ) : (
            filteredTrucks.map((truck) => {
              const suffix = getTruckSuffix(truck);
              const hasRules = typeof truck !== 'string' && truck.destinationRules && truck.destinationRules.length > 0;
              
              return (
                <div
                  key={suffix}
                  className="bg-white rounded-lg p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-gray-500" />
                      <div>
                        <span className="font-medium text-gray-900 uppercase">
                          {suffix}
                        </span>
                        {hasRules && (
                          <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                            <MapPin className="w-3 h-3" />
                            <span>{truck.destinationRules.length} destination rule{truck.destinationRules.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleManageRules(truck, batchSize)}
                        className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors flex items-center gap-1"
                        title="Manage destination rules"
                      >
                        <MapPin className="w-3 h-3" />
                        Rules
                      </button>
                      {[100, 80, 60].map((size) => {
                        if (size === batchSize) return null;
                        return (
                          <button
                            key={size}
                            onClick={() => handleMoveTruck(suffix, size as 100 | 80 | 60)}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                            title={`Move to ${size}L batch`}
                          >
                            → {size}L
                          </button>
                        );
                      })}
                      <button
                        onClick={() => handleDeleteTruck(suffix)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
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
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center gap-3 mb-4">
          <Truck className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Truck Batch Configuration
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage extra fuel allocations by truck suffix (API-based, no localStorage!)
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Trucks</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalTrucks}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
            <p className="text-sm text-green-700 dark:text-green-400">100L Batch</p>
            <p className="text-2xl font-bold text-green-900 dark:text-green-100">{batches.batch_100.length}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">80L Batch</p>
            <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{batches.batch_80.length}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
            <p className="text-sm text-blue-700 dark:text-blue-400">60L Batch</p>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{batches.batch_60.length}</p>
          </div>
        </div>
      </div>

      {/* Add New Truck */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
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
              Batch (Extra Fuel)
            </label>
            <select
              value={newTruck.batch}
              onChange={(e) => setNewTruck({ ...newTruck, batch: parseInt(e.target.value) as 100 | 80 | 60 })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value={100}>100 Liters</option>
              <option value={80}>80 Liters</option>
              <option value={60}>60 Liters</option>
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search truck suffixes..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      {/* Batches Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {renderBatchCard(100, batches.batch_100, 'green')}
        {renderBatchCard(80, batches.batch_80, 'yellow')}
        {renderBatchCard(60, batches.batch_60, 'blue')}
      </div>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          How Truck Batches Work
        </h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Truck suffixes determine extra fuel allocation (e.g., T 123 <strong>DNH</strong>)</li>
          <li>• Each truck gets <strong>ONE fixed allocation</strong> for both going AND returning</li>
          <li>• 100L batch: Premium trucks (100L extra fuel for entire journey)</li>
          <li>• 80L batch: Standard trucks (80L extra fuel for entire journey)</li>
          <li>• 60L batch: Basic trucks (60L extra fuel for entire journey)</li>
          <li>• ⚠️ Trucks NOT in any batch will require <strong>manual extra fuel input</strong></li>
          <li>• 🎯 <strong>Destination Rules:</strong> Override batch defaults for specific destinations</li>
          <li>• Admin will be notified when unconfigured trucks are used</li>
          <li>• You can move trucks between batches or remove them entirely</li>
        </ul>
      </div>

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
    </div>
  );
}
