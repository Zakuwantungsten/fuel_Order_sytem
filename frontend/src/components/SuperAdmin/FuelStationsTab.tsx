import { useState, useEffect, useRef } from 'react';
import ConfirmModal from './ConfirmModal';
import { Fuel, Plus, Edit2, Trash2, Save, X, ChevronDown, Check, AlertTriangle, RotateCcw, Clock, ToggleLeft, ToggleRight } from 'lucide-react';
import { configAPI, StandardAllocations, YardFuelTimeLimitConfig } from '../../services/api';
import { FuelStationConfig, FuelRecordFieldOption } from '../../types';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';

interface FuelStationsTabProps {
  onMessage: (type: 'success' | 'error', message: string) => void;
}

export default function FuelStationsTab({ onMessage }: FuelStationsTabProps) {
  const [stations, setStations] = useState<FuelStationConfig[]>([]);
  const [fuelRecordFieldsGoing, setFuelRecordFieldsGoing] = useState<FuelRecordFieldOption[]>([]);
  const [fuelRecordFieldsReturning, setFuelRecordFieldsReturning] = useState<FuelRecordFieldOption[]>([]);
  const [showStationModal, setShowStationModal] = useState(false);
  const [editingStation, setEditingStation] = useState<FuelStationConfig | null>(null);
  const [deleteStationTarget, setDeleteStationTarget] = useState<string | null>(null);
  const [deletingStation, setDeletingStation] = useState(false);

  // Standard Allocations state
  const [allocations, setAllocations] = useState<StandardAllocations | null>(null);
  const [editingAllocations, setEditingAllocations] = useState<StandardAllocations | null>(null);
  const [isEditingAllocations, setIsEditingAllocations] = useState(false);
  const [savingAllocations, setSavingAllocations] = useState(false);

  // Yard Fuel Time Limit state
  const [timeLimit, setTimeLimit] = useState<YardFuelTimeLimitConfig>({
    enabled: false,
    perYard: {
      darYard: { enabled: true, timeLimitDays: 2 },
      tangaYard: { enabled: true, timeLimitDays: 2 },
      mmsaYard: { enabled: true, timeLimitDays: 2 },
    },
  });
  const [savingTimeLimit, setSavingTimeLimit] = useState(false);

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

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        goingFieldDropdownRef.current?.contains(target) ||
        returningFieldDropdownRef.current?.contains(target)
      ) return;
      setShowGoingFieldDropdown(false);
      setShowReturningFieldDropdown(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const loadData = async () => {
    try {
      const [stationsData, formulaData, allocData, timeLimitData] = await Promise.all([
        configAPI.getStations(),
        configAPI.getFormulaVariables(),
        configAPI.getStandardAllocations(),
        configAPI.getYardFuelTimeLimit(),
      ]);
      setStations(stationsData);
      setFuelRecordFieldsGoing(formulaData.fuelRecordFieldsGoing || []);
      setFuelRecordFieldsReturning(formulaData.fuelRecordFieldsReturning || []);
      setAllocations(allocData);
      if (timeLimitData) setTimeLimit(timeLimitData);
      // If currently editing, update the editing form too (real-time sync)
      if (!isEditingAllocations) {
        setEditingAllocations(allocData);
      }
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to load fuel stations');
    }
  };

  useRealtimeSync(['fuel_stations', 'standard_allocations', 'yard_fuel_time_limit'], loadData);

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

  const handleDeleteStation = (id: string) => {
    setDeleteStationTarget(id);
  };

  const confirmDeleteStation = async () => {
    if (!deleteStationTarget) return;
    setDeletingStation(true);
    try {
      await configAPI.deleteStation(deleteStationTarget);
      onMessage('success', 'Station deleted successfully');
      setDeleteStationTarget(null);
      loadData();
    } catch (error: any) {
      onMessage('error', error.response?.data?.message || 'Failed to delete station');
    } finally {
      setDeletingStation(false);
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
        <button onClick={() => openStationModal()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
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
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />{editingStation ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Yard Fuel Dispense Time Limit Settings */}
      <div className="space-y-4 mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Yard Fuel Dispense Time Limit
            </h2>
          </div>
          <button
            onClick={async () => {
              const newEnabled = !timeLimit.enabled;
              setSavingTimeLimit(true);
              try {
                const updated = await configAPI.updateYardFuelTimeLimit({ enabled: newEnabled });
                setTimeLimit(updated);
                onMessage('success', `Time limit ${newEnabled ? 'enabled' : 'disabled'} successfully`);
              } catch (error: any) {
                onMessage('error', error.response?.data?.message || 'Failed to update time limit');
              } finally {
                setSavingTimeLimit(false);
              }
            }}
            disabled={savingTimeLimit}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
              timeLimit.enabled
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
            } disabled:opacity-50`}
          >
            {timeLimit.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {timeLimit.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          When enabled, yard fuel can only be dispensed for trucks that have an active fuel record created within the specified time window. This prevents dispensing fuel to trucks with old/stale records.
        </p>

        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4 space-y-4">
          {/* Per-Yard Time Limit Settings */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Per-Yard Time Limits</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: 'darYard' as const, label: 'DAR YARD' },
                { key: 'tangaYard' as const, label: 'TANGA YARD' },
                { key: 'mmsaYard' as const, label: 'MMSA YARD' },
              ]).map(({ key, label }) => (
                <div
                  key={key}
                  className={`p-4 rounded-lg border transition-colors ${
                    timeLimit.perYard[key]?.enabled && timeLimit.enabled
                      ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
                  } ${!timeLimit.enabled ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
                    <button
                      onClick={async () => {
                        const newEnabled = !timeLimit.perYard[key]?.enabled;
                        const newPerYard = {
                          ...timeLimit.perYard,
                          [key]: { ...timeLimit.perYard[key], enabled: newEnabled },
                        };
                        setSavingTimeLimit(true);
                        try {
                          const updated = await configAPI.updateYardFuelTimeLimit({ perYard: newPerYard });
                          setTimeLimit(updated);
                          onMessage('success', `${label} time limit ${newEnabled ? 'enabled' : 'disabled'}`);
                        } catch (error: any) {
                          onMessage('error', error.response?.data?.message || 'Failed to update yard setting');
                        } finally {
                          setSavingTimeLimit(false);
                        }
                      }}
                      disabled={!timeLimit.enabled || savingTimeLimit}
                      className="disabled:cursor-not-allowed"
                    >
                      {timeLimit.perYard[key]?.enabled && timeLimit.enabled ? (
                        <ToggleRight className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.5"
                      max="30"
                      step="0.5"
                      value={timeLimit.perYard[key]?.timeLimitDays ?? 2}
                      onChange={(e) => {
                        const newPerYard = {
                          ...timeLimit.perYard,
                          [key]: { ...timeLimit.perYard[key], timeLimitDays: parseFloat(e.target.value) || 2 },
                        };
                        setTimeLimit({ ...timeLimit, perYard: newPerYard });
                      }}
                      disabled={!timeLimit.enabled || !timeLimit.perYard[key]?.enabled}
                      className="w-16 px-2 py-1.5 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-center disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-xs text-gray-600 dark:text-gray-400">days</span>
                    <button
                      onClick={async () => {
                        const days = timeLimit.perYard[key]?.timeLimitDays ?? 2;
                        if (days < 0.5 || days > 30) {
                          onMessage('error', 'Time limit must be between 0.5 and 30 days');
                          return;
                        }
                        setSavingTimeLimit(true);
                        try {
                          const updated = await configAPI.updateYardFuelTimeLimit({ perYard: timeLimit.perYard });
                          setTimeLimit(updated);
                          onMessage('success', `${label} time window updated to ${days} days`);
                        } catch (error: any) {
                          onMessage('error', error.response?.data?.message || 'Failed to update time window');
                        } finally {
                          setSavingTimeLimit(false);
                        }
                      }}
                      disabled={!timeLimit.enabled || !timeLimit.perYard[key]?.enabled || savingTimeLimit}
                      className="px-2 py-1.5 text-xs bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Set individual time limits per yard. When disabled for a yard, that yard has no time limit restriction even if the global setting is enabled.
            </p>
          </div>
        </div>
      </div>

      {/* Standard Allocations Configuration */}
      <StandardAllocationsSection
        allocations={allocations}
        editingAllocations={editingAllocations}
        isEditing={isEditingAllocations}
        saving={savingAllocations}
        onEdit={() => {
          setEditingAllocations(allocations ? { ...allocations } : null);
          setIsEditingAllocations(true);
        }}
        onCancel={() => {
          setEditingAllocations(allocations ? { ...allocations } : null);
          setIsEditingAllocations(false);
        }}
        onChange={(field, value) => {
          if (editingAllocations) {
            setEditingAllocations({ ...editingAllocations, [field]: value });
          }
        }}
        onSave={async () => {
          if (!editingAllocations) return;
          setSavingAllocations(true);
          try {
            const updated = await configAPI.updateStandardAllocations(editingAllocations);
            setAllocations(updated);
            setEditingAllocations(updated);
            setIsEditingAllocations(false);
            onMessage('success', 'Standard allocations updated successfully');
          } catch (error: any) {
            onMessage('error', error.response?.data?.message || 'Failed to update allocations');
          } finally {
            setSavingAllocations(false);
          }
        }}
        onReset={() => {
          setEditingAllocations(allocations ? { ...allocations } : null);
        }}
      />

      <ConfirmModal
        open={deleteStationTarget !== null}
        title="Delete Station"
        message="Are you sure you want to delete this station? This action cannot be undone."
        variant="danger"
        loading={deletingStation}
        onConfirm={confirmDeleteStation}
        onCancel={() => !deletingStation && setDeleteStationTarget(null)}
      />
    </div>
  );
}

// Field labels for standard allocations (all checkpoint columns from fuel record table)
const ALLOCATION_FIELDS: { key: keyof StandardAllocations; label: string }[] = [
  { key: 'mmsaYard', label: 'MMSA Yard' },
  { key: 'tangaYardToDar', label: 'Tanga Yard' },
  { key: 'darYardStandard', label: 'Dar Yard (Standard)' },
  { key: 'darYardKisarawe', label: 'Dar Yard (Kisarawe)' },
  { key: 'darGoing', label: 'Dar Going' },
  { key: 'moroGoing', label: 'Moro Going' },
  { key: 'mbeyaGoing', label: 'Mbeya Going' },
  { key: 'tdmGoing', label: 'Tunduma Going' },
  { key: 'zambiaGoing', label: 'Zambia Going' },
  { key: 'congoFuel', label: 'Congo Fuel' },
  { key: 'zambiaReturn', label: 'Zambia Return' },
  { key: 'tundumaReturn', label: 'Tunduma Return' },
  { key: 'mbeyaReturn', label: 'Mbeya Return' },
  { key: 'moroReturnToMombasa', label: 'Moro Return' },
  { key: 'darReturn', label: 'Dar Return' },
  { key: 'tangaReturnToMombasa', label: 'Tanga Return' },
];

function StandardAllocationsSection({
  allocations,
  editingAllocations,
  isEditing,
  saving,
  onEdit,
  onCancel,
  onChange,
  onSave,
  onReset,
}: {
  allocations: StandardAllocations | null;
  editingAllocations: StandardAllocations | null;
  isEditing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (field: keyof StandardAllocations, value: number) => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const data = isEditing ? editingAllocations : allocations;

  return (
    <div className="space-y-4 mt-20 pt-8 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Standard Fuel Allocations
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />Reset
              </button>
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <X className="w-3.5 h-3.5" />Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              <Edit2 className="w-3.5 h-3.5" />Edit Allocations
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        These are the standard fuel amounts expected at each checkpoint. The fuel record table will show a ⚠ caution icon when a record exceeds these thresholds.
      </p>

      {!data ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
          Loading standard allocations...
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {ALLOCATION_FIELDS.map(({ key, label }) => (
              <div key={key} className="bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</h3>
                  {isEditing ? (
                    <input
                      type="number"
                      value={data[key]}
                      onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
                      className="w-24 px-2 py-1.5 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-right"
                    />
                  ) : (
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{data[key]}L</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400">Checkpoint</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-600 dark:text-gray-400">Standard (Liters)</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {ALLOCATION_FIELDS.map(({ key, label }) => (
                  <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100">{label}</td>
                    <td className="px-3 py-2.5 text-sm text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={data[key]}
                          onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
                          className="w-28 px-2 py-1 text-sm border dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-right"
                        />
                      ) : (
                        <span className="font-medium text-gray-900 dark:text-gray-100">{data[key]}L</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
