import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X, MapPin, Fuel } from 'lucide-react';
import FuelConfigService from '../services/fuelConfigService';

interface RouteManagementProps {
  onClose?: () => void;
}

export function RouteManagement({ onClose }: RouteManagementProps) {
  const [routes, setRoutes] = useState<Array<{ destination: string; liters: number }>>([]);
  const [newRoute, setNewRoute] = useState({ destination: '', liters: 2200 });
  const [editingRoute, setEditingRoute] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRoutes();
  }, []);

  const loadRoutes = () => {
    const allRoutes = FuelConfigService.getAllRoutes();
    setRoutes(allRoutes);
  };

  const handleAddRoute = () => {
    if (!newRoute.destination.trim()) {
      alert('Please enter a destination');
      return;
    }

    if (newRoute.liters <= 0 || newRoute.liters > 5000) {
      alert('Please enter valid liters (1-5000)');
      return;
    }

    FuelConfigService.addOrUpdateRoute(newRoute.destination, newRoute.liters);
    setNewRoute({ destination: '', liters: 2200 });
    loadRoutes();
  };

  const handleUpdateRoute = (destination: string, liters: number) => {
    FuelConfigService.addOrUpdateRoute(destination, liters);
    setEditingRoute(null);
    loadRoutes();
  };

  const handleDeleteRoute = (destination: string) => {
    if (confirm(`Delete route "${destination}"?`)) {
      FuelConfigService.removeRoute(destination);
      loadRoutes();
    }
  };

  const filteredRoutes = routes.filter(r => 
    r.destination.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <MapPin className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Route Configuration</h2>
              <p className="text-sm text-gray-500">Manage destination fuel allocations</p>
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
          {/* Add New Route */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add New Route
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Destination (e.g., KOLWEZI)"
                  value={newRoute.destination}
                  onChange={(e) => setNewRoute({ ...newRoute, destination: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="w-32">
                <input
                  type="number"
                  placeholder="Liters"
                  value={newRoute.liters}
                  onChange={(e) => setNewRoute({ ...newRoute, liters: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  min="0"
                  max="5000"
                />
              </div>
              <button
                onClick={handleAddRoute}
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
              placeholder="Search routes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Routes List */}
          <div className="space-y-2">
            {filteredRoutes.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No routes found</p>
              </div>
            ) : (
              filteredRoutes.map((route) => (
                <div
                  key={route.destination}
                  className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {editingRoute === route.destination ? (
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={route.destination}
                          disabled
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                        />
                      </div>
                      <div className="w-32">
                        <input
                          type="number"
                          defaultValue={route.liters}
                          id={`edit-${route.destination}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          min="0"
                          max="5000"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const input = document.getElementById(`edit-${route.destination}`) as HTMLInputElement;
                          const newLiters = parseInt(input.value);
                          if (newLiters > 0 && newLiters <= 5000) {
                            handleUpdateRoute(route.destination, newLiters);
                          }
                        }}
                        className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingRoute(null)}
                        className="p-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <MapPin className="w-5 h-5 text-gray-400" />
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{route.destination}</h4>
                        </div>
                        <div className="flex items-center gap-2 text-blue-600 font-semibold">
                          <Fuel className="w-4 h-4" />
                          {route.liters.toLocaleString()} L
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => setEditingRoute(route.destination)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRoute(route.destination)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Stats */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              <strong>{routes.length}</strong> routes configured
              {searchQuery && (
                <span> • Showing <strong>{filteredRoutes.length}</strong> matching routes</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600">
            💡 <strong>Tip:</strong> Routes not listed here will use the default 2200L allocation and prompt for manual entry
          </p>
        </div>
      </div>
    </div>
  );
}
