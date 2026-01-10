import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import { FuelStationConfig } from '../types';
import { configService } from '../services/configService';

interface StationSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStation: (station: string, stationName?: string) => void;
  currentStation: string;
  title?: string;
  description?: string;
}

const StationSelectorModal: React.FC<StationSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelectStation,
  currentStation,
  title = 'Select Target Station',
  description = 'Choose the station to forward trucks to',
}) => {
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [customStationName, setCustomStationName] = useState<string>('');
  const [availableStations, setAvailableStations] = useState<FuelStationConfig[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);

  // Load fuel stations on mount
  useEffect(() => {
    const loadStations = async () => {
      setLoadingStations(true);
      try {
        const stations = await configService.getFuelStations();
        setAvailableStations(stations);
      } catch (error) {
        console.error('Error loading fuel stations:', error);
      } finally {
        setLoadingStations(false);
      }
    };
    
    if (isOpen) {
      loadStations();
      setSelectedStation('');
      setCustomStationName('');
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (!selectedStation) {
      alert('Please select a target station');
      return;
    }
    
    if (selectedStation === 'CUSTOM' && !customStationName.trim()) {
      alert('Please enter a custom station name');
      return;
    }
    
    onSelectStation(selectedStation, selectedStation === 'CUSTOM' ? customStationName : undefined);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity" 
          onClick={onClose}
        />

        {/* Modal */}
        <div 
          className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-green-600 to-emerald-600 rounded-t-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="text-sm text-green-100">{description}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Station *
              </label>
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                disabled={loadingStations}
              >
                <option value="">{loadingStations ? 'Loading stations...' : 'Select target station...'}</option>
                {availableStations
                  .filter(s => s.stationName !== currentStation)
                  .map((station) => (
                    <option key={station._id} value={station.stationName}>
                      {station.stationName}
                    </option>
                  ))}
                {/* Add CASH as an option */}
                {currentStation !== 'CASH' && (
                  <option value="CASH">CASH</option>
                )}
                {/* Add CUSTOM as an option */}
                {currentStation !== 'CUSTOM' && (
                  <option value="CUSTOM">CUSTOM (Unlisted Station)</option>
                )}
              </select>
            </div>

            {/* Custom Station Name Input */}
            {selectedStation === 'CUSTOM' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Custom Station Name *
                </label>
                <input
                  type="text"
                  value={customStationName}
                  onChange={(e) => setCustomStationName(e.target.value.toUpperCase())}
                  placeholder="e.g., LAKE MWERU"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Name of unlisted fuel station
                </p>
              </div>
            )}

            {/* Info Box */}
            <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 After selecting the station, the form will reset with your trucks pre-filled for the target station. You can edit liters, add/remove trucks, and make any changes before creating the LPO.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedStation || (selectedStation === 'CUSTOM' && !customStationName.trim())}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Continue</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StationSelectorModal;
