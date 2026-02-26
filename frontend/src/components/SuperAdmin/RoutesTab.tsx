import { useState, useEffect, useRef } from 'react';
import { Route, Plus, Edit2, Trash2, Save, X, ChevronDown, Check } from 'lucide-react';
import { configAPI } from '../../services/api';
import { RouteConfig } from '../../types';

interface RoutesTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function RoutesTab({ onMessage }: RoutesTabProps) {
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteConfig | null>(null);

  const [routeForm, setRouteForm] = useState({
    routeName: '',
    origin: '',
    destination: '',
    destinationAliases: '',
    routeType: 'IMPORT' as 'IMPORT' | 'EXPORT',
    defaultTotalLiters: '',
    description: '',
  });
  
  // Dropdown state
  const [showRouteTypeDropdown, setShowRouteTypeDropdown] = useState(false);
  
  // Dropdown ref
  const routeTypeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);
  
  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (routeTypeDropdownRef.current && !routeTypeDropdownRef.current.contains(event.target as Node)) {
        setShowRouteTypeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      const routesData = await configAPI.getRoutes();
      setRoutes(routesData);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load routes');
    }
  };

  const handleCreateRoute = async () => {
    try {
      // Validate and trim required fields with specific messages
      const routeName = routeForm.routeName?.trim();
      if (!routeName) {
        onMessage('error', 'Please enter a Route Name');
        return;
      }

      const origin = routeForm.origin?.trim();
      if (!origin) {
        onMessage('error', 'Please enter a Starting Point');
        return;
      }

      const destination = routeForm.destination?.trim();
      if (!destination) {
        onMessage('error', 'Please enter a Destination');
        return;
      }

      const defaultLiters = routeForm.defaultTotalLiters?.trim();
      if (!defaultLiters) {
        onMessage('error', 'Please enter Default Liters');
        return;
      }

      const litersValue = parseFloat(defaultLiters);
      if (isNaN(litersValue) || litersValue <= 0) {
        onMessage('error', 'Default Liters must be a valid number greater than 0');
        return;
      }

      await configAPI.createRoute({
        routeName,
        origin,
        destination,
        destinationAliases: routeForm.destinationAliases
          ? routeForm.destinationAliases.split(',').map(a => a.trim()).filter(Boolean)
          : undefined,
        routeType: routeForm.routeType,
        defaultTotalLiters: litersValue,
        description: routeForm.description?.trim() || undefined,
      });
      onMessage('success', 'Route created successfully');
      setShowRouteModal(false);
      resetRouteForm();
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to create route');
    }
  };

  const handleUpdateRoute = async () => {
    if (!editingRoute) return;
    try {
      // Validate and trim required fields with specific messages
      const routeName = routeForm.routeName?.trim();
      if (!routeName) {
        onMessage('error', 'Please enter a Route Name');
        return;
      }

      const origin = routeForm.origin?.trim();
      if (!origin) {
        onMessage('error', 'Please enter a Starting Point');
        return;
      }

      const destination = routeForm.destination?.trim();
      if (!destination) {
        onMessage('error', 'Please enter a Destination');
        return;
      }

      const defaultLiters = routeForm.defaultTotalLiters?.trim();
      if (!defaultLiters) {
        onMessage('error', 'Please enter Default Liters');
        return;
      }

      const litersValue = parseFloat(defaultLiters);
      if (isNaN(litersValue) || litersValue <= 0) {
        onMessage('error', 'Default Liters must be a valid number greater than 0');
        return;
      }

      await configAPI.updateRoute(editingRoute._id, {
        routeName,
        origin,
        destination,
        destinationAliases: routeForm.destinationAliases
          ? routeForm.destinationAliases.split(',').map(a => a.trim()).filter(Boolean)
          : undefined,
        routeType: routeForm.routeType,
        defaultTotalLiters: litersValue,
        description: routeForm.description?.trim() || undefined,
      });
      onMessage('success', 'Route updated successfully');
      setShowRouteModal(false);
      setEditingRoute(null);
      resetRouteForm();
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update route');
    }
  };

  const handleDeleteRoute = async (id: string) => {
    if (!confirm('Are you sure you want to delete this route?')) return;
    try {
      await configAPI.deleteRoute(id);
      onMessage('success', 'Route deleted successfully');
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to delete route');
    }
  };

  const openRouteModal = (route?: RouteConfig) => {
    if (route) {
      setEditingRoute(route);
      setRouteForm({
        routeName: route.routeName || '',
        origin: route.origin || '',
        destination: route.destination || '',
        destinationAliases: route.destinationAliases?.join(', ') || '',
        routeType: route.routeType || 'IMPORT',
        defaultTotalLiters: String(route.defaultTotalLiters ?? ''),
        description: route.description || '',
      });
    }
    setShowRouteModal(true);
  };

  const resetRouteForm = () => {
    setRouteForm({
      routeName: '',
      origin: '',
      destination: '',
      destinationAliases: '',
      routeType: 'IMPORT',
      defaultTotalLiters: '',
      description: '',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Route className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Routes Management
          </h2>
        </div>
        <button onClick={() => openRouteModal()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700">
          <Plus className="w-3.5 h-3.5" />Add Route
        </button>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {routes.map((route) => (
          <div key={String(route._id)} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{route.routeName}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => openRouteModal(route)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteRoute(route._id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-sm">
              {route.origin ? (
                <span className="flex items-center gap-1">
                  <span className="font-medium text-green-600 dark:text-green-400">{route.origin}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
                </span>
              ) : (
                <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Type</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5 font-medium">{route.routeType || 'IMPORT'}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Default Liters</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5 font-medium">{route.defaultTotalLiters} L</div>
              </div>
            </div>
            {route.destinationAliases && route.destinationAliases.length > 0 && (
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Aliases</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {route.destinationAliases.map((alias, idx) => (
                    <span key={idx} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded text-xs">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {route.description && (
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Description</span>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{route.description}</p>
              </div>
            )}
          </div>
        ))}
        {routes.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No routes configured.
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Route</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">From → To</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Default Liters</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Aliases</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Description</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {routes.map((route) => (
              <tr key={String(route._id)} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{route.routeName}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                  {route.origin ? (
                    <span className="flex items-center gap-1">
                      <span className="font-medium text-green-600 dark:text-green-400">{route.origin}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
                    </span>
                  ) : (
                    <span className="font-medium text-blue-600 dark:text-blue-400">{route.destination}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{route.routeType || 'IMPORT'}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{route.defaultTotalLiters} L</td>
                <td className="px-3 py-2.5 text-xs">
                  {route.destinationAliases && route.destinationAliases.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {route.destinationAliases.map((alias, idx) => (
                        <span key={idx} className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded text-[11px]">
                          {alias}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">{route.description || '—'}</td>
                <td className="px-3 py-2.5 text-sm text-right">
                  <button onClick={() => openRouteModal(route)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 mr-2">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteRoute(route._id)} className="text-red-600 dark:text-red-400 hover:text-red-800">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No routes configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showRouteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editingRoute ? 'Edit Route' : 'Add New Route'}</h3>
                <button onClick={() => { setShowRouteModal(false); setEditingRoute(null); resetRouteForm(); }} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Route Name *</label>
                  <input type="text" value={routeForm.routeName} onChange={(e) => setRouteForm({ ...routeForm, routeName: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., Dar to Kolwezi Route" />
                  <p className="mt-1 text-xs text-gray-500">Descriptive name for this route</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Starting Point (Origin) *</label>
                    <input type="text" value={routeForm.origin} onChange={(e) => setRouteForm({ ...routeForm, origin: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., DAR, TANGA, DSM" required />
                    <p className="mt-1 text-xs text-gray-500">Where the journey starts (determines fuel allocation)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination *</label>
                    <input type="text" value={routeForm.destination} onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., KOLWEZI, LUSAKA" />
                    <p className="mt-1 text-xs text-gray-500">Final destination (will be auto-uppercased)</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination Aliases</label>
                  <input type="text" value={routeForm.destinationAliases} onChange={(e) => setRouteForm({ ...routeForm, destinationAliases: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., DSM, DAR (comma-separated)" />
                  <p className="mt-1 text-xs text-gray-500">Alternative names for destination (e.g., "DSM, DAR" for Dar es Salaam)</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="relative" ref={routeTypeDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Route Type *</label>
                    <button
                      type="button"
                      onClick={() => setShowRouteTypeDropdown(!showRouteTypeDropdown)}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                    >
                      <span>{routeForm.routeType === 'IMPORT' ? 'Import (Going/Outbound)' : 'Export (Return/Inbound)'}</span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showRouteTypeDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showRouteTypeDropdown && (
                      <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                        <button
                          type="button"
                          onClick={() => {
                            setRouteForm({ ...routeForm, routeType: 'IMPORT' });
                            setShowRouteTypeDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            routeForm.routeType === 'IMPORT' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>Import (Going/Outbound)</span>
                          {routeForm.routeType === 'IMPORT' && <Check className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRouteForm({ ...routeForm, routeType: 'EXPORT' });
                            setShowRouteTypeDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            routeForm.routeType === 'EXPORT' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>Export (Return/Inbound)</span>
                          {routeForm.routeType === 'EXPORT' && <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-gray-500">Import = outgoing routes, Export = return routes</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Total Liters *</label>
                    <input type="number" value={routeForm.defaultTotalLiters} onChange={(e) => setRouteForm({ ...routeForm, defaultTotalLiters: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="2400" />
                    <p className="mt-1 text-xs text-gray-500">Default liters assigned for this route</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                  <textarea value={routeForm.description} onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" rows={3} placeholder="Additional notes about this route..." />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowRouteModal(false); setEditingRoute(null); resetRouteForm(); }}
                  className="flex-1 px-4 py-2 border dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                <button onClick={editingRoute ? handleUpdateRoute : handleCreateRoute}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />{editingRoute ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
