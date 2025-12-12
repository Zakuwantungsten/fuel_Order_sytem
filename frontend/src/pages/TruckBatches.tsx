import { useState, useEffect } from 'react';
import { Truck, Trash2, Plus, Fuel, Search } from 'lucide-react';
import FuelConfigService from '../services/fuelConfigService';
import { useAuth } from '../contexts/AuthContext';

export default function TruckBatches() {
  const { user } = useAuth();
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setLoading(true);
    try {
      // Sync from backend first
      await FuelConfigService.syncTruckBatchesFromBackend();
      // Then load from localStorage
      const allBatches = FuelConfigService.getAllTruckBatches();
      setBatches(allBatches);
    } catch (error) {
      console.error('Error loading truck batches:', error);
    } finally {
      setLoading(false);
    }
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

  const renderBatchCard = (batchSize: 100 | 80 | 60, trucks: string[], color: string) => {
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
                {filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''}
                {searchQuery && trucks.length !== filteredTrucks.length && ` (${trucks.length} total)`}
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
            filteredTrucks.map((suffix) => (
              <div
                key={suffix}
                className="bg-white rounded-lg p-3 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-gray-500" />
                  <span className="font-medium text-gray-900 uppercase">
                    {suffix}
                  </span>
                </div>
                <div className="flex gap-2">
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
            ))
          )}
        </div>
      </div>
    );
  };

  if (loading) {
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
              Manage extra fuel allocations by truck suffix
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
          <li>• 100L batch: Premium trucks with highest extra fuel allocation</li>
          <li>• 80L batch: Standard trucks with medium extra fuel allocation</li>
          <li>• 60L batch: Basic trucks with standard extra fuel allocation (default)</li>
          <li>• Trucks not in any batch default to 60L extra fuel</li>
          <li>• You can move trucks between batches or remove them entirely</li>
        </ul>
      </div>
    </div>
  );
}
