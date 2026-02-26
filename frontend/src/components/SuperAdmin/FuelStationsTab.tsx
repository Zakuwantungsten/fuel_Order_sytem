import { useState, useEffect, useRef } from 'react';
import { Fuel, Plus, Edit2, Trash2, Save, X, ChevronDown, Check } from 'lucide-react';
import { configAPI } from '../../services/api';
import { FuelStationConfig, FuelRecordFieldOption } from '../../types';

interface FuelStationsTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function FuelStationsTab({ onMessage }: FuelStationsTabProps) {
  const [stations, setStations] = useState<FuelStationConfig[]>([]);
  const [fuelRecordFieldsGoing, setFuelRecordFieldsGoing] = useState<FuelRecordFieldOption[]>([]);
  const [fuelRecordFieldsReturning, setFuelRecordFieldsReturning] = useState<FuelRecordFieldOption[]>([]);
  const [showStationModal, setShowStationModal] = useState(false);
  const [editingStation, setEditingStation] = useState<FuelStationConfig | null>(null);

  const [stationForm, setStationForm] = useState({
    stationName: '',
    defaultRate: '',
    defaultLitersGoing: '',
    defaultLitersReturning: '',
    fuelRecordFieldGoing: '',
    fuelRecordFieldReturning: '',
    formulaGoing: '',
    formulaReturning: '',
    currency: 'TZS' as 'USD' | 'TZS',
  });
  
  // Dropdown states
  const [showGoingFieldDropdown, setShowGoingFieldDropdown] = useState(false);
  const [showReturningFieldDropdown, setShowReturningFieldDropdown] = useState(false);
  
  // Dropdown refs
  const goingFieldDropdownRef = useRef<HTMLDivElement>(null);
  const returningFieldDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);
  
  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (goingFieldDropdownRef.current && !goingFieldDropdownRef.current.contains(event.target as Node)) {
        setShowGoingFieldDropdown(false);
      }
      if (returningFieldDropdownRef.current && !returningFieldDropdownRef.current.contains(event.target as Node)) {
        setShowReturningFieldDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      const [stationsData, formulaData] = await Promise.all([
        configAPI.getStations(),
        configAPI.getFormulaVariables(),
      ]);
      setStations(stationsData);
      setFuelRecordFieldsGoing(formulaData.fuelRecordFieldsGoing || []);
      setFuelRecordFieldsReturning(formulaData.fuelRecordFieldsReturning || []);
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load fuel stations');
    }
  };

  const handleCreateStation = async () => {
    try {
      // Validate required fields with specific messages
      if (!stationForm.stationName || !stationForm.stationName.trim()) {
        onMessage('error', 'Please enter a Station Name');
        return;
      }

      if (!stationForm.defaultRate || stationForm.defaultRate.trim() === '') {
        onMessage('error', 'Please enter a Default Rate');
        return;
      }

      const rateValue = parseFloat(stationForm.defaultRate);
      if (isNaN(rateValue) || rateValue <= 0) {
        onMessage('error', 'Default Rate must be a valid number greater than 0');
        return;
      }

      const going = parseFloat(stationForm.defaultLitersGoing) || 0;
      const returning = parseFloat(stationForm.defaultLitersReturning) || 0;
      
      if (going === 0 && returning === 0) {
        onMessage('error', 'Please enter at least one: Default Liters Going or Default Liters Returning (must be greater than 0)');
        return;
      }

      if (going < 0 || returning < 0) {
        onMessage('error', 'Liters values cannot be negative');
        return;
      }

      await configAPI.createStation({
        stationName: stationForm.stationName.trim(),
        defaultRate: rateValue,
        defaultLitersGoing: going,
        defaultLitersReturning: returning,
        fuelRecordFieldGoing: stationForm.fuelRecordFieldGoing || undefined,
        fuelRecordFieldReturning: stationForm.fuelRecordFieldReturning || undefined,
        formulaGoing: stationForm.formulaGoing?.trim() || undefined,
        formulaReturning: stationForm.formulaReturning?.trim() || undefined,
        currency: stationForm.currency,
      });
      onMessage('success', 'Fuel station created successfully');
      setShowStationModal(false);
      resetStationForm();
      loadData();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to create station';
      onMessage('error', errorMessage);
    }
  };

  const handleUpdateStation = async () => {
    if (!editingStation) return;
    try {
      // Validate required fields with specific messages
      if (!stationForm.stationName || !stationForm.stationName.trim()) {
        onMessage('error', 'Please enter a Station Name');
        return;
      }

      if (!stationForm.defaultRate || stationForm.defaultRate.trim() === '') {
        onMessage('error', 'Please enter a Default Rate');
        return;
      }

      const rateValue = parseFloat(stationForm.defaultRate);
      if (isNaN(rateValue) || rateValue <= 0) {
        onMessage('error', 'Default Rate must be a valid number greater than 0');
        return;
      }

      const going = parseFloat(stationForm.defaultLitersGoing) || 0;
      const returning = parseFloat(stationForm.defaultLitersReturning) || 0;
      
      if (going === 0 && returning === 0) {
        onMessage('error', 'Please enter at least one: Default Liters Going or Default Liters Returning (must be greater than 0)');
        return;
      }

      if (going < 0 || returning < 0) {
        onMessage('error', 'Liters values cannot be negative');
        return;
      }

      await configAPI.updateStation(editingStation._id, {
        stationName: stationForm.stationName.trim(),
        defaultRate: rateValue,
        defaultLitersGoing: going,
        defaultLitersReturning: returning,
        fuelRecordFieldGoing: stationForm.fuelRecordFieldGoing || undefined,
        fuelRecordFieldReturning: stationForm.fuelRecordFieldReturning || undefined,
        formulaGoing: stationForm.formulaGoing?.trim() || undefined,
        formulaReturning: stationForm.formulaReturning?.trim() || undefined,
        currency: stationForm.currency,
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

  const openStationModal = (station?: FuelStationConfig) => {
    if (station) {
      setEditingStation(station);
      setStationForm({
        stationName: station.stationName || '',
        defaultRate: String(station.defaultRate ?? ''),
        defaultLitersGoing: String(station.defaultLitersGoing ?? ''),
        defaultLitersReturning: String(station.defaultLitersReturning ?? ''),
        fuelRecordFieldGoing: station.fuelRecordFieldGoing || '',
        fuelRecordFieldReturning: station.fuelRecordFieldReturning || '',
        formulaGoing: station.formulaGoing || '',
        formulaReturning: station.formulaReturning || '',
        currency: station.currency || 'TZS',
      });
    }
    setShowStationModal(true);
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
      currency: 'TZS',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Fuel className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Fuel Stations Management
          </h2>
        </div>
        <button onClick={() => openStationModal()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700">
          <Plus className="w-3.5 h-3.5" />Add Station
        </button>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {stations.map((station) => (
          <div key={String(station._id)} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{station.stationName}</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => openStationModal(station)} className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDeleteStation(station._id)} className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Rate</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mr-1 ${
                    (station.currency || 'TZS') === 'USD'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}>{station.currency || 'TZS'}</span>
                  {station.defaultRate}
                </div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Fills Column</span>
                <div className="mt-0.5 text-xs">
                  {station.fuelRecordFieldGoing && (
                    <div className="text-green-600 dark:text-green-400">↑ {station.fuelRecordFieldGoing}</div>
                  )}
                  {station.fuelRecordFieldReturning && (
                    <div className="text-blue-600 dark:text-blue-400">↓ {station.fuelRecordFieldReturning}</div>
                  )}
                  {!station.fuelRecordFieldGoing && !station.fuelRecordFieldReturning && (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Going (L)</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5 font-medium">{station.defaultLitersGoing}</div>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs">Returning (L)</span>
                <div className="text-gray-900 dark:text-gray-100 mt-0.5 font-medium">{station.defaultLitersReturning}</div>
              </div>
            </div>
          </div>
        ))}
        {stations.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            No fuel stations configured. Add existing stations like Lake Kapiri, Infinity, etc.
          </div>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Station</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Rate</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Going (L)</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Returning (L)</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Fills Column</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {stations.map((station) => (
              <tr key={String(station._id)} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{station.stationName}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium mr-0.5 ${
                    (station.currency || 'TZS') === 'USD'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}>{station.currency || 'TZS'}</span>
                  {station.defaultRate}
                </td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{station.defaultLitersGoing}</td>
                <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{station.defaultLitersReturning}</td>
                <td className="px-3 py-2.5 text-xs">
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
                <td className="px-3 py-2.5 text-sm text-right">
                  <button onClick={() => openStationModal(station)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 mr-2">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteStation(station._id)} className="text-red-600 dark:text-red-400 hover:text-red-800">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {stations.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No fuel stations configured. Add existing stations like Lake Kapiri, Infinity, etc.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rate (per Liter) *</label>
                    <input type="number" value={stationForm.defaultRate} onChange={(e) => setStationForm({ ...stationForm, defaultRate: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="1.2 or 2500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Going (L)</label>
                    <input type="number" value={stationForm.defaultLitersGoing} onChange={(e) => setStationForm({ ...stationForm, defaultLitersGoing: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="0 or 450" />
                    <p className="mt-1 text-xs text-gray-500">0 if not used</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Default Returning (L)</label>
                    <input type="number" value={stationForm.defaultLitersReturning} onChange={(e) => setStationForm({ ...stationForm, defaultLitersReturning: e.target.value })}
                      className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" placeholder="0 or 400" />
                    <p className="mt-1 text-xs text-gray-500">0 if not used</p>
                  </div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    ⚠️ At least one of Going or Returning must be greater than 0
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Currency *</label>
                  <select
                    value={stationForm.currency}
                    onChange={(e) => setStationForm({ ...stationForm, currency: e.target.value as 'USD' | 'TZS' })}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="TZS">TZS – Tanzanian Shilling</option>
                    <option value="USD">USD – US Dollar</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Select USD for Zambia (Lake) stations, TZS for Tanzania stations</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                <div className="relative" ref={goingFieldDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fills Going Column</label>
                  <button
                    type="button"
                    onClick={() => setShowGoingFieldDropdown(!showGoingFieldDropdown)}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                  >
                    <span className={!stationForm.fuelRecordFieldGoing ? 'text-gray-400' : ''}>
                      {stationForm.fuelRecordFieldGoing ? fuelRecordFieldsGoing.find(f => f.value === stationForm.fuelRecordFieldGoing)?.label : '— None —'}
                    </span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showGoingFieldDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showGoingFieldDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setStationForm({ ...stationForm, fuelRecordFieldGoing: '' });
                          setShowGoingFieldDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          !stationForm.fuelRecordFieldGoing ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>— None —</span>
                        {!stationForm.fuelRecordFieldGoing && <Check className="w-4 h-4" />}
                      </button>
                      {fuelRecordFieldsGoing.map(field => (
                        <button
                          key={field.value}
                          type="button"
                          onClick={() => {
                            setStationForm({ ...stationForm, fuelRecordFieldGoing: field.value });
                            setShowGoingFieldDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            stationForm.fuelRecordFieldGoing === field.value ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>{field.label}</span>
                          {stationForm.fuelRecordFieldGoing === field.value && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Which fuel record column for going direction</p>
                </div>
                <div className="relative" ref={returningFieldDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fills Returning Column</label>
                  <button
                    type="button"
                    onClick={() => setShowReturningFieldDropdown(!showReturningFieldDropdown)}
                    className="w-full px-3 py-2 border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                  >
                    <span className={!stationForm.fuelRecordFieldReturning ? 'text-gray-400' : ''}>
                      {stationForm.fuelRecordFieldReturning ? fuelRecordFieldsReturning.find(f => f.value === stationForm.fuelRecordFieldReturning)?.label : '— None —'}
                    </span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showReturningFieldDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showReturningFieldDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setStationForm({ ...stationForm, fuelRecordFieldReturning: '' });
                          setShowReturningFieldDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          !stationForm.fuelRecordFieldReturning ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>— None —</span>
                        {!stationForm.fuelRecordFieldReturning && <Check className="w-4 h-4" />}
                      </button>
                      {fuelRecordFieldsReturning.map(field => (
                        <button
                          key={field.value}
                          type="button"
                          onClick={() => {
                            setStationForm({ ...stationForm, fuelRecordFieldReturning: field.value });
                            setShowReturningFieldDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            stationForm.fuelRecordFieldReturning === field.value ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>{field.label}</span>
                          {stationForm.fuelRecordFieldReturning === field.value && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                    </div>
                  )}
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
    </div>
  );
}
