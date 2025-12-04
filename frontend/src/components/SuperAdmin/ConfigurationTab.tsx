import { useState, useEffect } from 'react';
import { Settings, Plus, Edit2, Trash2, Save, X, Fuel, Route, Calculator, Info } from 'lucide-react';
import { configAPI } from '../../services/api';
import { FuelStationConfig, RouteConfig, FormulaVariable, FormulaExample, FuelRecordFieldOption } from '../../types';

interface ConfigurationTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function ConfigurationTab({ onMessage }: ConfigurationTabProps) {
  const [activeTab, setActiveTab] = useState<'stations' | 'routes'>('stations');
  const [stations, setStations] = useState<FuelStationConfig[]>([]);
  const [routes, setRoutes] = useState<RouteConfig[]>([]);
  const [variables, setVariables] = useState<FormulaVariable[]>([]);
  const [examples, setExamples] = useState<FormulaExample[]>([]);
  const [fuelRecordFieldsGoing, setFuelRecordFieldsGoing] = useState<FuelRecordFieldOption[]>([]);
  const [fuelRecordFieldsReturning, setFuelRecordFieldsReturning] = useState<FuelRecordFieldOption[]>([]);
  const [showStationModal, setShowStationModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  const [editingStation, setEditingStation] = useState<FuelStationConfig | null>(null);
  const [editingRoute, setEditingRoute] = useState<RouteConfig | null>(null);

  const [stationForm, setStationForm] = useState({
    stationName: '',
    defaultRate: '',
    defaultLitersGoing: '',
    defaultLitersReturning: '',
    fuelRecordFieldGoing: '',
    fuelRecordFieldReturning: '',
    formulaGoing: '',
    formulaReturning: '',
  });

  const [routeForm, setRouteForm] = useState({
    routeName: '',
    destination: '',
    defaultTotalLiters: '',
    description: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [stationsData, routesData, formulaData] = await Promise.all([
        configAPI.getStations(),
        configAPI.getRoutes(),
        configAPI.getFormulaVariables(),
      ]);
      setStations(stationsData);
      setRoutes(routesData);
      setVariables(formulaData.data);
      setExamples(formulaData.examples);
      setFuelRecordFieldsGoing(formulaData.fuelRecordFieldsGoing || []);
      setFuelRecordFieldsReturning(formulaData.fuelRecordFieldsReturning || []);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load configuration');
    }
  };

  const handleCreateStation = async () => {
    try {
      await configAPI.createStation({
        stationName: stationForm.stationName,
        defaultRate: parseFloat(stationForm.defaultRate),
        defaultLitersGoing: parseFloat(stationForm.defaultLitersGoing),
        defaultLitersReturning: parseFloat(stationForm.defaultLitersReturning),
        fuelRecordFieldGoing: stationForm.fuelRecordFieldGoing || undefined,
        fuelRecordFieldReturning: stationForm.fuelRecordFieldReturning || undefined,
        formulaGoing: stationForm.formulaGoing || undefined,
        formulaReturning: stationForm.formulaReturning || undefined,
      });
      onMessage('success', 'Fuel station created successfully');
      setShowStationModal(false);
      resetStationForm();
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to create station');
    }
  };

  const handleUpdateStation = async () => {
    if (!editingStation) return;
    try {
      await configAPI.updateStation(editingStation._id, {
        stationName: stationForm.stationName,
        defaultRate: parseFloat(stationForm.defaultRate),
        defaultLitersGoing: parseFloat(stationForm.defaultLitersGoing),
        defaultLitersReturning: parseFloat(stationForm.defaultLitersReturning),
        fuelRecordFieldGoing: stationForm.fuelRecordFieldGoing || undefined,
        fuelRecordFieldReturning: stationForm.fuelRecordFieldReturning || undefined,
        formulaGoing: stationForm.formulaGoing || undefined,
        formulaReturning: stationForm.formulaReturning || undefined,
      });
      onMessage('success', 'Fuel station updated successfully');
      setShowStationModal(false);
      setEditingStation(null);
      resetStationForm();
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to update station');
    }
  };

  const handleDeleteStation = async (id: string) => {
    if (!confirm('Are you sure you want to delete this station?')) return;
    try {
      await configAPI.deleteStation(id);
      onMessage('success', 'Station deleted successfully');
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to delete station');
    }
  };

  const handleCreateRoute = async () => {
    try {
      await configAPI.createRoute({
        routeName: routeForm.routeName,
        destination: routeForm.destination,
        defaultTotalLiters: parseFloat(routeForm.defaultTotalLiters),
        description: routeForm.description || undefined,
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
      await configAPI.updateRoute(editingRoute._id, {
        routeName: routeForm.routeName,
        destination: routeForm.destination,
        defaultTotalLiters: parseFloat(routeForm.defaultTotalLiters),
        description: routeForm.description || undefined,
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

  const openStationModal = (station?: FuelStationConfig) => {
    if (station) {
      setEditingStation(station);
      setStationForm({
        stationName: station.stationName,
        defaultRate: station.defaultRate.toString(),
        defaultLitersGoing: station.defaultLitersGoing.toString(),
        defaultLitersReturning: station.defaultLitersReturning.toString(),
        fuelRecordFieldGoing: station.fuelRecordFieldGoing || '',
        fuelRecordFieldReturning: station.fuelRecordFieldReturning || '',
        formulaGoing: station.formulaGoing || '',
        formulaReturning: station.formulaReturning || '',
      });
    }
    setShowStationModal(true);
  };

  const openRouteModal = (route?: RouteConfig) => {
    if (route) {
      setEditingRoute(route);
      setRouteForm({
        routeName: route.routeName,
        destination: route.destination,
        defaultTotalLiters: route.defaultTotalLiters.toString(),
        description: route.description || '',
      });
    }
    setShowRouteModal(true);
  };

  const resetStationForm = () => {
    setStationForm({
      stationName: '',
      defaultRate: '',
      defaultLitersGoing: '',
      defaultLitersReturning: '',
      fuelRecordFieldGoing: '',
      fuelRecordFieldReturning: '',
      formulaGoing: '',
      formulaReturning: '',
    });
  };

  const resetRouteForm = () => {
    setRouteForm({
      routeName: '',
      destination: '',
      defaultTotalLiters: '',
      description: '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            System Configuration
          </h2>
        </div>
        <button
          onClick={() => setShowFormulaHelp(!showFormulaHelp)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Calculator className="w-4 h-4" />
          Formula Help
        </button>
      </div>

      {showFormulaHelp && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">Formula Guide</h3>
            </div>
            <button onClick={() => setShowFormulaHelp(false)} className="text-blue-600 dark:text-blue-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Available Variables:</h4>
              <div className="space-y-1 text-sm">
                {variables.map((variable) => (
                  <div key={variable.name} className="flex items-center gap-2">
                    <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded text-blue-900 dark:text-blue-100">
                      {variable.name}
                    </code>
                    <span className="text-blue-700 dark:text-blue-300">{variable.description}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Example Formulas:</h4>
              <div className="space-y-2 text-sm">
                {examples.map((example, index) => (
                  <div key={index} className="bg-white dark:bg-gray-800 p-3 rounded border border-blue-200 dark:border-blue-700">
                    <code className="block text-blue-900 dark:text-blue-100 mb-1">{example.formula}</code>
                    <p className="text-blue-600 dark:text-blue-400 text-xs">{example.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b dark:border-gray-700">
        <button
          onClick={() => setActiveTab('stations')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'stations' ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600' : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center gap-2"><Fuel className="w-4 h-4" />Fuel Stations</div>
        </button>
        <button
          onClick={() => setActiveTab('routes')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'routes' ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600' : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          <div className="flex items-center gap-2"><Route className="w-4 h-4" />Routes</div>
        </button>
      </div>

      {activeTab === 'stations' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">Manage fuel stations with rates, default liters, and fuel record column mappings</p>
            <button onClick={() => openStationModal()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              <Plus className="w-4 h-4" />Add Station
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Station</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Rate</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Going (L)</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Returning (L)</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Fills Column</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {stations.map((station) => (
                  <tr key={station._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{station.stationName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">TSh {station.defaultRate}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{station.defaultLitersGoing}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{station.defaultLitersReturning}</td>
                    <td className="px-4 py-3 text-xs">
                      {station.fuelRecordFieldGoing && (
                        <div className="text-green-600 dark:text-green-400">↑ {station.fuelRecordFieldGoing}</div>
                      )}
                      {station.fuelRecordFieldReturning && (
                        <div className="text-blue-600 dark:text-blue-400">↓ {station.fuelRecordFieldReturning}</div>
                      )}
                      {!station.fuelRecordFieldGoing && !station.fuelRecordFieldReturning && (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button onClick={() => openStationModal(station)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 mr-3">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteStation(station._id)} className="text-red-600 dark:text-red-400 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {stations.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No fuel stations configured. Add existing stations like Lake Kapiri, Infinity, etc.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">Manage delivery routes and default fuel allocations</p>
            <button onClick={() => openRouteModal()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
              <Plus className="w-4 h-4" />Add Route
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Route</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Destination</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Default Liters</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-600 dark:text-gray-400">Description</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-gray-600 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {routes.map((route) => (
                  <tr key={route._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{route.routeName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{route.destination}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{route.defaultTotalLiters} L</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{route.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button onClick={() => openRouteModal(route)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 mr-3">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteRoute(route._id)} className="text-red-600 dark:text-red-400 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {routes.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No routes configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showStationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editingStation ? 'Edit Station' : 'Add New Station'}</h3>
                <button onClick={() => { setShowStationModal(false); setEditingStation(null); resetStationForm(); }} className="text-gray-500 hover:text-gray-700">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Station Name *</label>
                  <input type="text" value={stationForm.stationName} onChange={(e) => setStationForm({ ...stationForm, stationName: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., LAKE KAPIRI" />
                  <p className="mt-1 text-xs text-gray-500">Physical fuel station name (e.g., Lake Kapiri, Infinity, GBP Morogoro)</p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rate (per Liter) *</label>
                    <input type="number" value={stationForm.defaultRate} onChange={(e) => setStationForm({ ...stationForm, defaultRate: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="1.2 or 2500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Going (L) *</label>
                    <input type="number" value={stationForm.defaultLitersGoing} onChange={(e) => setStationForm({ ...stationForm, defaultLitersGoing: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="1000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Returning (L) *</label>
                    <input type="number" value={stationForm.defaultLitersReturning} onChange={(e) => setStationForm({ ...stationForm, defaultLitersReturning: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="800" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fills Going Column</label>
                    <select value={stationForm.fuelRecordFieldGoing} onChange={(e) => setStationForm({ ...stationForm, fuelRecordFieldGoing: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                      <option value="">— None —</option>
                      {fuelRecordFieldsGoing.map(field => (
                        <option key={field.value} value={field.value}>{field.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">Which fuel record column for going direction</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fills Returning Column</label>
                    <select value={stationForm.fuelRecordFieldReturning} onChange={(e) => setStationForm({ ...stationForm, fuelRecordFieldReturning: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                      <option value="">— None —</option>
                      {fuelRecordFieldsReturning.map(field => (
                        <option key={field.value} value={field.value}>{field.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">Which fuel record column for return direction</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Going Formula (Optional)</label>
                  <input type="text" value={stationForm.formulaGoing} onChange={(e) => setStationForm({ ...stationForm, formulaGoing: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm" placeholder="totalLiters + extraLiters - 900" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Custom formula for dynamic allocation (e.g., Zambia going)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Returning Formula (Optional)</label>
                  <input type="text" value={stationForm.formulaReturning} onChange={(e) => setStationForm({ ...stationForm, formulaReturning: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm" placeholder="totalLiters * 0.8" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Custom formula for return allocation</p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { setShowStationModal(false); setEditingStation(null); resetStationForm(); }}
                  className="flex-1 px-4 py-2 border dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                <button onClick={editingStation ? handleUpdateStation : handleCreateStation}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />{editingStation ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Route Name *</label>
                    <input type="text" value={routeForm.routeName} onChange={(e) => setRouteForm({ ...routeForm, routeName: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., Lusaka Express" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination *</label>
                    <input type="text" value={routeForm.destination} onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="e.g., Lusaka, Zambia" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Total Liters *</label>
                  <input type="number" value={routeForm.defaultTotalLiters} onChange={(e) => setRouteForm({ ...routeForm, defaultTotalLiters: e.target.value })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="1500" />
                  <p className="mt-1 text-xs text-gray-500">Default liters assigned when creating new fuel records for this route</p>
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
