import { useState, useEffect } from 'react';
import { Truck, Trash2, Plus, X, Fuel } from 'lucide-react';
import FuelConfigService from '../services/fuelConfigService';

interface TruckBatchManagementProps {
  onClose?: () => void;
}

export function TruckBatchManagement({ onClose }: TruckBatchManagementProps) {
  const [batches, setBatches] = useState<{
    batch_100: string[];
    batch_80: string[];
    batch_60: string[];
  }>({
    batch_100: [],
    batch_80: [],
    batch_60: [],
  });
  const [newTruck, setNewTruck] = useState({ suffix: '', batch: 60 as 100 | 80 | 60 });
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    // Sync from backend first
    await FuelConfigService.syncTruckBatchesFromBackend();
    // Then load from localStorage
    const allBatches = FuelConfigService.getAllTruckBatches();
    setBatches(allBatches);
  };

  const handleAddTruck = () => {
    const suffix = newTruck.suffix.trim().toLowerCase();
    
    if (!suffix) {
      alert('Please enter a truck suffix (e.g., DNH, EAG)');
      return;
    }

    // Check if already exists
    const allTrucks = [...batches.batch_100, ...batches.batch_80, ...batches.batch_60];
    if (allTrucks.includes(suffix)) {
      alert(`Truck suffix "${suffix.toUpperCase()}" is already configured. Use the move option to change its batch.`);
      return;
    }

    FuelConfigService.updateTruckBatch(suffix, newTruck.batch);
    setNewTruck({ suffix: '', batch: 60 });
    loadBatches();
  };

  const handleMoveTruck = async (suffix: string, newBatch: 100 | 80 | 60) => {
    if (confirm(`Move "${suffix.toUpperCase()}" to ${newBatch}L batch?`)) {
      await FuelConfigService.updateTruckBatch(suffix, newBatch);
      loadBatches();
    }
  };

  const handleDeleteTruck = async (suffix: string) => {
    if (confirm(`Remove "${suffix.toUpperCase()}" from batch configuration?\nIt will revert to default 60L extra fuel.`)) {
      await FuelConfigService.removeTruckFromBatches(suffix);
      loadBatches();
    }
  };

  const filterTrucks = (trucks: string[]) => {
    if (!searchQuery) return trucks;
    return trucks.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
  };

  const totalTrucks = batches.batch_100.length + batches.batch_80.length + batches.batch_60.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Truck Batch Configuration</h2>
              <p className="text-sm text-gray-500">Manage extra fuel allocations by truck suffix</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Add New Truck */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add Truck to Batch
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Truck suffix (e.g., DNH, EAG)"
                  value={newTruck.suffix}
                  onChange={(e) => setNewTruck({ ...newTruck, suffix: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                  maxLength={3}
                />
              </div>
              <div className="w-40">
                <select
                  value={newTruck.batch}
                  onChange={(e) => setNewTruck({ ...newTruck, batch: parseInt(e.target.value) as 100 | 80 | 60 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="100">100L Extra</option>
                  <option value="80">80L Extra</option>
                  <option value="60">60L Extra</option>
                </select>
              </div>
              <button
                onClick={handleAddTruck}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search truck suffixes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Batches Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 100L Batch */}
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-green-900">100L Extra</h3>
                </div>
                <span className="px-2 py-1 bg-green-200 text-green-800 text-xs font-bold rounded">
                  {filterTrucks(batches.batch_100).length}
                </span>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filterTrucks(batches.batch_100).length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No trucks in this batch</p>
                ) : (
                  filterTrucks(batches.batch_100).map((suffix) => (
                    <div
                      key={suffix}
                      className="bg-white border border-green-300 rounded p-3 flex items-center justify-between hover:shadow-sm transition-shadow"
                    >
                      <span className="font-medium text-gray-900 uppercase">{suffix}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleMoveTruck(suffix, 80)}
                          className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                          title="Move to 80L batch"
                        >
                          → 80L
                        </button>
                        <button
                          onClick={() => handleMoveTruck(suffix, 60)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          title="Move to 60L batch"
                        >
                          → 60L
                        </button>
                        <button
                          onClick={() => handleDeleteTruck(suffix)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Remove from batches"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 80L Batch */}
            <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-orange-600" />
                  <h3 className="font-semibold text-orange-900">80L Extra</h3>
                </div>
                <span className="px-2 py-1 bg-orange-200 text-orange-800 text-xs font-bold rounded">
                  {filterTrucks(batches.batch_80).length}
                </span>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filterTrucks(batches.batch_80).length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No trucks in this batch</p>
                ) : (
                  filterTrucks(batches.batch_80).map((suffix) => (
                    <div
                      key={suffix}
                      className="bg-white border border-orange-300 rounded p-3 flex items-center justify-between hover:shadow-sm transition-shadow"
                    >
                      <span className="font-medium text-gray-900 uppercase">{suffix}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleMoveTruck(suffix, 100)}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                          title="Move to 100L batch"
                        >
                          → 100L
                        </button>
                        <button
                          onClick={() => handleMoveTruck(suffix, 60)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                          title="Move to 60L batch"
                        >
                          → 60L
                        </button>
                        <button
                          onClick={() => handleDeleteTruck(suffix)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Remove from batches"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 60L Batch */}
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-blue-900">60L Extra</h3>
                </div>
                <span className="px-2 py-1 bg-blue-200 text-blue-800 text-xs font-bold rounded">
                  {filterTrucks(batches.batch_60).length}
                </span>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filterTrucks(batches.batch_60).length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No trucks in this batch</p>
                ) : (
                  filterTrucks(batches.batch_60).map((suffix) => (
                    <div
                      key={suffix}
                      className="bg-white border border-blue-300 rounded p-3 flex items-center justify-between hover:shadow-sm transition-shadow"
                    >
                      <span className="font-medium text-gray-900 uppercase">{suffix}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleMoveTruck(suffix, 100)}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                          title="Move to 100L batch"
                        >
                          → 100L
                        </button>
                        <button
                          onClick={() => handleMoveTruck(suffix, 80)}
                          className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                          title="Move to 80L batch"
                        >
                          → 80L
                        </button>
                        <button
                          onClick={() => handleDeleteTruck(suffix)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Remove from batches"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              <strong>{totalTrucks}</strong> truck suffixes configured
              {searchQuery && (
                <span> • Showing <strong>{filterTrucks(batches.batch_100).length + filterTrucks(batches.batch_80).length + filterTrucks(batches.batch_60).length}</strong> matching</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              💡 <strong>Tip:</strong> Truck suffix is the letters after the space (e.g., "DNH" from "T887 DNH")
            </p>
            <p>
              ⚠️ <strong>Note:</strong> Trucks not in any batch will use default 60L extra fuel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
