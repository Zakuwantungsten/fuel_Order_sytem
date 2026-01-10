import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Loader2, CheckCircle, AlertTriangle, Truck, Fuel } from 'lucide-react';
import { LPOSummary, FuelStationConfig } from '../types';
import { lpoDocumentsAPI } from '../services/api';
import { configService } from '../services/configService';
import {
  getAvailableForwardingRoutes,
  getRecommendedRoute,
  getStationDisplayInfo,
} from '../services/lpoForwardingService';

interface ForwardLPOModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceLpo: LPOSummary;
  onForwardComplete: (forwardedLpo: LPOSummary) => void;
}

const ForwardLPOModal: React.FC<ForwardLPOModalProps> = ({
  isOpen,
  onClose,
  sourceLpo,
  onForwardComplete,
}) => {
  const [targetStation, setTargetStation] = useState<string>('');
  const [defaultLiters, setDefaultLiters] = useState<number>(0);
  const [rate, setRate] = useState<number>(0);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [orderOf, setOrderOf] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    sourceLpo?: LPOSummary;  // Only present when creating source first
    forwardedLpo: LPOSummary;
    entriesForwarded: number;
  } | null>(null);
  const [creatingSource, setCreatingSource] = useState(false);  // Track source LPO creation

  // Station management
  const [availableStations, setAvailableStations] = useState<FuelStationConfig[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  
  // Custom station state
  const [customStationName, setCustomStationName] = useState<string>('');
  const [customGoingCheckpoint, setCustomGoingCheckpoint] = useState<string>('Custom1');
  const [customReturnCheckpoint, setCustomReturnCheckpoint] = useState<string>('Custom2');

  // Get available routes and recommended route
  const availableRoutes = getAvailableForwardingRoutes(sourceLpo.station);
  const recommendedRoute = getRecommendedRoute(sourceLpo);
  const activeEntries = sourceLpo.entries.filter(entry => !entry.isCancelled);
  
  // Check if source LPO is unsaved (no database ID)
  const isSourceUnsaved = !sourceLpo.id || sourceLpo.id === 'temp';

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
    }
  }, [isOpen]);

  // Initialize with recommended route or source LPO values
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(null);
      setOrderOf(sourceLpo.orderOf);
      setCustomStationName('');
      setCustomGoingCheckpoint('Custom1');
      setCustomReturnCheckpoint('Custom2');
      
      if (recommendedRoute) {
        setTargetStation(recommendedRoute.toStation);
        setDefaultLiters(recommendedRoute.defaultLiters);
        setRate(recommendedRoute.rate);
      } else {
        setTargetStation('');
        setDefaultLiters(0);
        setRate(0);
      }
    }
  }, [isOpen, sourceLpo, recommendedRoute]);

  // Update rate and common liters when station changes
  useEffect(() => {
    if (targetStation) {
      const stationInfo = getStationDisplayInfo(targetStation);
      setRate(stationInfo.rate);
      
      // If there's a matching route, use its default liters
      const matchingRoute = availableRoutes.find(r => r.toStation === targetStation);
      if (matchingRoute) {
        setDefaultLiters(matchingRoute.defaultLiters);
      } else if (stationInfo.commonLiters.length > 0 && defaultLiters === 0) {
        setDefaultLiters(stationInfo.commonLiters[0]);
      }
    }
  }, [targetStation, availableRoutes]);

  const handleForward = async () => {
    if (!targetStation || defaultLiters <= 0 || rate <= 0) {
      setError('Please fill in all required fields');
      return;
    }
    
    if (targetStation === 'CUSTOM' && !customStationName.trim()) {
      setError('Please enter a custom station name');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let sourceLpoId = sourceLpo.id;
      let createdSourceLpo: LPOSummary | null = null;
      
      // Step 1: If source LPO is unsaved, create it first
      if (isSourceUnsaved) {
        setCreatingSource(true);
        
        // Prepare source LPO data for creation
        const sourceLpoData: Partial<LPOSummary> = {
          lpoNo: sourceLpo.lpoNo,
          date: sourceLpo.date,
          station: sourceLpo.station,
          orderOf: sourceLpo.orderOf,
          entries: sourceLpo.entries,
          total: sourceLpo.total,
          isCustomStation: sourceLpo.isCustomStation,
          customStationName: sourceLpo.customStationName,
          customGoingCheckpoint: sourceLpo.customGoingCheckpoint,
          customReturnCheckpoint: sourceLpo.customReturnCheckpoint,
        };
        
        // Create source LPO via API
        createdSourceLpo = await lpoDocumentsAPI.create(sourceLpoData);
        sourceLpoId = createdSourceLpo.id;
        
        setCreatingSource(false);
      }
      
      // Step 2: Forward the LPO (now with valid ID)
      const result = await lpoDocumentsAPI.forward({
        sourceLpoId: sourceLpoId!,
        targetStation,
        defaultLiters,
        rate,
        date,
        orderOf: orderOf || sourceLpo.orderOf,
        includeOnlyActive: true,
        // Include custom station info if CUSTOM is selected
        ...(targetStation === 'CUSTOM' && {
          customStationName,
          customGoingCheckpoint,
          customReturnCheckpoint,
        }),
      });

      setSuccess({
        sourceLpo: createdSourceLpo || undefined,  // Include created source if applicable
        forwardedLpo: result.forwardedLpo,
        entriesForwarded: result.entriesForwarded,
      });

      // Notify parent after a short delay
      setTimeout(() => {
        onForwardComplete(result.forwardedLpo);
      }, 2500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to forward LPO. Please try again.');
      setCreatingSource(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Calculate estimated total
  const estimatedTotal = activeEntries.length * defaultLiters * rate;
  const stationInfo = targetStation ? getStationDisplayInfo(targetStation) : null;

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
          className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Forward LPO</h2>
                <p className="text-sm text-blue-100">
                  Forward LPO {sourceLpo.lpoNo} to another station
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Success State */}
          {success && (
            <div className="p-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  {success.sourceLpo ? 'LPOs Created Successfully!' : 'LPO Forwarded Successfully!'}
                </h3>
                {success.sourceLpo && (
                  <p className="text-gray-600 dark:text-gray-400 mb-2">
                    Created source LPO <span className="font-bold text-green-600">#{success.sourceLpo.lpoNo}</span> at{' '}
                    <span className="font-bold">{success.sourceLpo.station}</span>
                  </p>
                )}
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {success.sourceLpo ? 'Forwarded to' : 'Created'} LPO <span className="font-bold text-blue-600">#{success.forwardedLpo.lpoNo}</span> at{' '}
                  <span className="font-bold">{success.forwardedLpo.station}</span>
                </p>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-left mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Entries Forwarded:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                        {success.entriesForwarded} trucks
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Total:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-gray-100">
                        {success.forwardedLpo.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Closing automatically...
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          {!success && (
            <div className="p-6">
              {/* Unsaved LPO Notice */}
              {isSourceUnsaved && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        Create & Forward Mode
                      </h4>
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                        This will create <strong>two LPOs</strong>: First at <strong>{sourceLpo.station}</strong>, then forward trucks to your selected target station.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Source LPO Info */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Source LPO Information
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">LPO No:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{sourceLpo.lpoNo}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Station:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{sourceLpo.station}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Active Trucks:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {activeEntries.length} trucks
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block">Date:</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{sourceLpo.date}</span>
                  </div>
                </div>
              </div>

              {/* Recommended Routes */}
              {availableRoutes.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    📍 Recommended Routes
                  </h4>
                  <div className="space-y-2">
                    {availableRoutes.map((route) => (
                      <button
                        key={route.id}
                        onClick={() => {
                          setTargetStation(route.toStation);
                          setDefaultLiters(route.defaultLiters);
                          setRate(route.rate);
                        }}
                        className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                          targetStation === route.toStation
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                {route.fromStation}
                              </span>
                              <ArrowRight className="w-4 h-4 text-blue-500" />
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                {route.toStation}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                              {route.defaultLiters}L
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                              @ {route.rate} {route.currency}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {route.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Target Station *
                  </label>
                  <select
                    value={targetStation}
                    onChange={(e) => setTargetStation(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    disabled={loadingStations}
                  >
                    <option value="">{loadingStations ? 'Loading stations...' : 'Select target station...'}</option>
                    {availableStations
                      .filter(s => s.stationName !== sourceLpo.station)
                      .map((station) => (
                        <option key={station._id} value={station.stationName}>
                          {station.stationName}
                        </option>
                      ))}
                    {/* Add CASH as an option */}
                    {sourceLpo.station !== 'CASH' && (
                      <option value="CASH">CASH</option>
                    )}
                    {/* Add CUSTOM as an option */}
                    {sourceLpo.station !== 'CUSTOM' && (
                      <option value="CUSTOM">CUSTOM (Unlisted Station)</option>
                    )}
                  </select>
                  {stationInfo && targetStation !== 'CUSTOM' && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Rate: {stationInfo.rate} {stationInfo.currency}/L
                    </p>
                  )}
                  {targetStation === 'CUSTOM' && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Enter custom station name and checkpoints below
                    </p>
                  )}
                </div>

                {/* Custom Station Name - Show when CUSTOM is selected */}
                {targetStation === 'CUSTOM' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Custom Station Name *
                    </label>
                    <input
                      type="text"
                      value={customStationName}
                      onChange={(e) => setCustomStationName(e.target.value.toUpperCase())}
                      placeholder="e.g., LAKE MWERU"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 uppercase"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Name of unlisted fuel station
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Default Liters per Truck *
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      value={defaultLiters}
                      onChange={(e) => setDefaultLiters(parseInt(e.target.value) || 0)}
                      placeholder="e.g., 350"
                      min="1"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    <Fuel className="w-5 h-5 text-gray-400" />
                  </div>
                  {stationInfo && stationInfo.commonLiters.length > 0 && (
                    <div className="flex items-center space-x-1 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Common:</span>
                      {stationInfo.commonLiters.map((l) => (
                        <button
                          key={l}
                          onClick={() => setDefaultLiters(l)}
                          className={`text-xs px-2 py-0.5 rounded ${
                            defaultLiters === l
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300 hover:bg-gray-200'
                          }`}
                        >
                          {l}L
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Rate per Liter *
                  </label>
                  <input
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
                    placeholder="e.g., 1.2"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>

              {/* Custom Station Info Box */}
              {targetStation === 'CUSTOM' && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    📍 Custom Checkpoint Configuration
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-3">
                    Fuel records will be updated using the following checkpoints:
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-white dark:bg-gray-800 rounded p-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Going Direction:</span>
                      <span className="ml-2 text-blue-600 dark:text-blue-400 font-mono">{customGoingCheckpoint}</span>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded p-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Return Direction:</span>
                      <span className="ml-2 text-blue-600 dark:text-blue-400 font-mono">{customReturnCheckpoint}</span>
                    </div>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    💡 These checkpoints map to Custom1 and Custom2 fields in fuel records
                  </p>
                </div>
              )}

              {/* Trucks Preview */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                  <Truck className="w-4 h-4 mr-2" />
                  Trucks to Forward ({activeEntries.length})
                </h4>
                <div className="max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {activeEntries.map((entry, index) => (
                      <div
                        key={index}
                        className="flex items-center space-x-2 text-sm bg-white dark:bg-gray-600 rounded px-2 py-1"
                      >
                        <span className="font-mono text-gray-900 dark:text-gray-100">
                          {entry.truckNo}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold">
                          {defaultLiters}L
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Estimated Total */}
              {targetStation && defaultLiters > 0 && rate > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-700 dark:text-blue-300">Estimated Total:</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {estimatedTotal.toLocaleString()} {stationInfo?.currency}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {activeEntries.length} trucks × {defaultLiters}L × {rate}/L
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center space-x-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleForward}
                  disabled={isLoading || !targetStation || defaultLiters <= 0 || rate <= 0}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{creatingSource ? 'Creating Source LPO...' : 'Forwarding...'}</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight className="w-4 h-4" />
                      <span>{isSourceUnsaved ? 'Create & Forward' : 'Forward LPO'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForwardLPOModal;
