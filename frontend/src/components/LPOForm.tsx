import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, User, Ban, Info, AlertTriangle, Loader, MapPin, FileText } from 'lucide-react';
import { LPOEntry, CancellationPoint, LPOSummary, FuelStationConfig } from '../types';
import { getAutoFillDataForLPO } from '../services/lpoAutoFetchService';
import { lpoDocumentsAPI, configAPI } from '../services/api';
import { formatTruckNumber } from '../utils/dataCleanup';
import { 
  getAvailableCancellationPoints, 
  getCancellationPointDisplayName,
  ZAMBIA_RETURNING_PARTS,
  FUEL_RECORD_COLUMNS
} from '../services/cancellationService';

interface LPOFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<LPOEntry> & { 
    isCashMode?: boolean;
    cancellationPoint?: CancellationPoint;
    isDriverAccount?: boolean;
    paymentMode?: 'STATION' | 'CASH' | 'DRIVER_ACCOUNT';
    lposToCancel?: { lpoId: string; truckNo: string }[];  // LPOs to auto-cancel
    // Custom station fields
    isCustomStation?: boolean;
    customStationName?: string;
    customGoingCheckpoint?: string;   // Fuel record field for going direction
    customReturnCheckpoint?: string;  // Fuel record field for return direction
  }) => void;
  initialData?: LPOEntry;
}

const LPOForm: React.FC<LPOFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<LPOEntry>>({
    sn: 0,
    date: '',
    lpoNo: '',
    dieselAt: '',
    doSdo: '',
    truckNo: '',
    ltrs: 0,
    pricePerLtr: 0,
    destinations: '',
  });

  // Cash mode and cancellation states
  const [isCashMode, setIsCashMode] = useState(false);
  const [cancellationDirection, setCancellationDirection] = useState<'going' | 'returning'>('going');
  const [cancellationPoint, setCancellationPoint] = useState<CancellationPoint | ''>('');
  const [isDriverAccount, setIsDriverAccount] = useState(false);
  const [showCancellationInfo, setShowCancellationInfo] = useState(false);
  // Reference DO for CASH/Driver Account entries (links to journey even though DO shows NIL)
  const [useDoReference, setUseDoReference] = useState(false);
  const [referenceDo, setReferenceDo] = useState('');

  // Custom station states
  const [isCustomStation, setIsCustomStation] = useState(false);
  const [customStationName, setCustomStationName] = useState('');
  const [customGoingEnabled, setCustomGoingEnabled] = useState(false);  // Custom1 - for Going direction
  const [customReturnEnabled, setCustomReturnEnabled] = useState(false); // Custom2 - for Return direction
  const [customGoingCheckpoint, setCustomGoingCheckpoint] = useState(''); // Fuel record field for Going
  const [customReturnCheckpoint, setCustomReturnCheckpoint] = useState(''); // Fuel record field for Return

  // Auto-cancellation state: LPOs at checkpoint that have this truck
  const [existingLPOsAtCheckpoint, setExistingLPOsAtCheckpoint] = useState<LPOSummary[]>([]);
  const [isFetchingLPOs, setIsFetchingLPOs] = useState(false);

  // Configured stations from backend
  const [configuredStations, setConfiguredStations] = useState<FuelStationConfig[]>([]);

  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [autoFillResult, setAutoFillResult] = useState<{
    doNumber: string;
    doType: 'going' | 'returning';
    liters: number;
    rate: number;
    destination: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  } | null>(null);
  const [useCustom, setUseCustom] = useState(false);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setUseCustom(true); // Editing mode, allow custom
    }
    // Fetch configured stations
    loadConfiguredStations();
  }, [initialData]);

  const loadConfiguredStations = async () => {
    try {
      const stations = await configAPI.getStations();
      setConfiguredStations(stations.filter((s: FuelStationConfig) => s.isActive));
    } catch (error) {
      console.error('Failed to load configured stations:', error);
    }
  };

  // Auto-fetch when truck number and station are both filled
  useEffect(() => {
    const fetchDOAndDefaults = async () => {
      if (formData.truckNo && formData.dieselAt && !initialData && !useCustom) {
        setIsAutoFetching(true);
        try {
          const result = await getAutoFillDataForLPO(
            formData.truckNo,
            formData.dieselAt
          );
          
          if (result) {
            setAutoFillResult(result);
            // Auto-fill the form
            setFormData(prev => ({
              ...prev,
              doSdo: result.doNumber,
              ltrs: result.liters,
              pricePerLtr: result.rate,
              destinations: result.destination
            }));
          }
        } catch (error) {
          console.error('Error fetching DO and defaults:', error);
        } finally {
          setIsAutoFetching(false);
        }
      }
    };

    fetchDOAndDefaults();
  }, [formData.truckNo, formData.dieselAt, initialData, useCustom]);

  // Fetch existing LPOs when CASH mode is selected and truck number is filled
  useEffect(() => {
    const fetchExistingLPOs = async () => {
      if (isCashMode && formData.truckNo && formData.truckNo.length >= 4 && cancellationPoint) {
        setIsFetchingLPOs(true);
        try {
          const lpos = await lpoDocumentsAPI.findAtCheckpoint(formData.truckNo);
          setExistingLPOsAtCheckpoint(lpos);
        } catch (error) {
          console.error('Error fetching existing LPOs:', error);
          setExistingLPOsAtCheckpoint([]);
        } finally {
          setIsFetchingLPOs(false);
        }
      } else {
        setExistingLPOsAtCheckpoint([]);
      }
    };

    fetchExistingLPOs();
  }, [isCashMode, formData.truckNo, cancellationPoint]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['sn', 'ltrs', 'pricePerLtr'].includes(name)
        ? parseFloat(value) || 0
        : name === 'truckNo' ? formatTruckNumber(value) : value,
    }));
    
    // When CASH station is selected, enable cash mode
    if (name === 'dieselAt') {
      if (value === 'CASH') {
        setIsCashMode(true);
        setIsCustomStation(false);
        setUseCustom(true); // Cash mode requires manual entry of liters
      } else if (value === 'CUSTOM') {
        setIsCustomStation(true);
        setIsCashMode(false);
        setUseCustom(true); // Custom mode requires manual entry
        setIsDriverAccount(false);
        setCancellationPoint('');
      } else {
        setIsCashMode(false);
        setIsCustomStation(false);
        setIsDriverAccount(false);
        setCancellationPoint('');
        // Reset custom station fields
        setCustomStationName('');
        setCustomGoingEnabled(false);
        setCustomReturnEnabled(false);
        setCustomGoingCheckpoint('');
        setCustomReturnCheckpoint('');
      }
    }
  };

  // Handle driver's account toggle
  const handleDriverAccountToggle = () => {
    const newDriverAccount = !isDriverAccount;
    setIsDriverAccount(newDriverAccount);
    if (newDriverAccount) {
      // Driver's account entries show NIL for DO and destination
      setFormData(prev => ({
        ...prev,
        // Keep the DO reference internally but it won't be displayed
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Determine payment mode
    let paymentMode: 'STATION' | 'CASH' | 'DRIVER_ACCOUNT' = 'STATION';
    if (isDriverAccount) {
      paymentMode = 'DRIVER_ACCOUNT';
    } else if (isCashMode || formData.dieselAt === 'CASH') {
      paymentMode = 'CASH';
    }

    // Validate: CASH mode requires cancellation point
    if (paymentMode === 'CASH' && !cancellationPoint) {
      alert('For CASH payments, you must select a checkpoint (going/returning direction and specific checkpoint). This determines which fuel record column gets updated for the truck.');
      return;
    }

    // Validate: Custom station requires name and at least one direction enabled
    if (isCustomStation) {
      if (!customStationName.trim()) {
        alert('For Custom station, you must enter the station name.');
        return;
      }
      if (!customGoingEnabled && !customReturnEnabled) {
        alert('For Custom station, you must enable at least one direction (Custom1 for Going or Custom2 for Return).');
        return;
      }
      if (customGoingEnabled && !customGoingCheckpoint) {
        alert('For Custom1 (Going), you must select which fuel record column to update.');
        return;
      }
      if (customReturnEnabled && !customReturnCheckpoint) {
        alert('For Custom2 (Return), you must select which fuel record column to update.');
        return;
      }
    }

    // Prepare LPOs to cancel (for auto-cancellation when CASH mode)
    const lposToCancel = existingLPOsAtCheckpoint.map(lpo => ({
      lpoId: lpo.id as string,
      truckNo: formData.truckNo as string
    }));
    
    // For custom station, set the dieselAt to the custom station name for display
    const submissionData = {
      ...formData,
      dieselAt: isCustomStation ? customStationName : formData.dieselAt,
      isCashMode: isCashMode || formData.dieselAt === 'CASH',
      cancellationPoint: isCustomStation 
        ? (customGoingEnabled ? 'CUSTOM_GOING' : 'CUSTOM_RETURN') as CancellationPoint
        : (cancellationPoint || undefined),
      isDriverAccount,
      paymentMode,
      lposToCancel: lposToCancel.length > 0 ? lposToCancel : undefined,
      // Custom station fields
      isCustomStation,
      customStationName: isCustomStation ? customStationName : undefined,
      customGoingCheckpoint: customGoingEnabled ? customGoingCheckpoint : undefined,
      customReturnCheckpoint: customReturnEnabled ? customReturnCheckpoint : undefined,
      // Reference DO for CASH/Driver Account entries (links to journey even with NIL DO)
      referenceDo: useDoReference && referenceDo ? referenceDo : undefined,
    };
    
    onSubmit(submissionData);
    onClose();
  };

  const toggleCustomMode = () => {
    setUseCustom(!useCustom);
    if (!useCustom) {
      // Switching to custom mode, clear auto-fill result
      setAutoFillResult(null);
    }
  };

  if (!isOpen) return null;

  // Build stations list: configured stations + CASH + CUSTOM
  const stations = [
    ...configuredStations.map(s => s.stationName),
    'CASH',
    'CUSTOM'  // Custom station option at the bottom - for unlisted stations
  ];

  const destinations = ['DAR', 'MSA', 'Kpm', 'Likasi', 'Kolwezi', 'NIL'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto transition-colors">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {initialData ? 'Edit LPO Entry' : 'New LPO Entry'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Auto-fill Status Banner */}
          {autoFillResult && !useCustom && (
            <div className={`mb-4 p-3 rounded-md flex items-start space-x-2 ${
              autoFillResult.confidence === 'high' 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50' 
                : autoFillResult.confidence === 'medium'
                ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50'
                : 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50'
            }`}>
              {autoFillResult.confidence === 'high' ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Auto-filled: {autoFillResult.doType === 'going' ? 'Going' : 'Returning'} DO {autoFillResult.doNumber}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{autoFillResult.reason}</p>
              </div>
              <button
                type="button"
                onClick={toggleCustomMode}
                className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
              >
                Use Custom
              </button>
            </div>
          )}

          {/* Custom Mode Toggle */}
          {!initialData && (
            <div className="mb-4 flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={toggleCustomMode}
                  className="w-4 h-4 text-primary-600 border-gray-300 dark:border-gray-600 rounded focus:ring-primary-500 dark:bg-gray-700"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Manual Entry Mode
                </span>
              </label>
              {isAutoFetching && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Fetching DO...</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                S/No *
              </label>
              <input
                type="number"
                name="sn"
                value={formData.sn}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Date *
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                LPO No. *
              </label>
              <input
                type="text"
                name="lpoNo"
                value={formData.lpoNo}
                onChange={handleChange}
                required
                placeholder="e.g., 2150"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Diesel @ (Station) *
              </label>
              <select
                name="dieselAt"
                value={formData.dieselAt}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              >
                <option value="">Select Station</option>
                {stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cash Mode & Driver's Account Section */}
          {(formData.dieselAt === 'CASH' || isCashMode) && (
            <div className="mt-4 p-4 border-2 border-orange-300 dark:border-orange-700 rounded-lg bg-orange-50 dark:bg-orange-900/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Ban className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <span className="font-medium text-orange-800 dark:text-orange-300">
                    Cash Mode Payment (Checkpoint Required)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCancellationInfo(!showCancellationInfo)}
                  className="text-sm text-orange-600 hover:text-orange-800 flex items-center"
                >
                  <Info className="w-4 h-4 mr-1" />
                  {showCancellationInfo ? 'Hide' : 'Show'} Info
                </button>
              </div>
              
              {showCancellationInfo && (
                <div className="mb-4 p-3 bg-orange-100 dark:bg-orange-900/30 rounded-md text-sm text-orange-700 dark:text-orange-300">
                  <p className="mb-2">
                    <strong>Cash Mode:</strong> Used when assigned station is out of fuel and fuel is bought from another station through cash.
                  </p>
                  <p className="mb-2">
                    <strong>Important:</strong> You must select a checkpoint. This determines which fuel record column gets updated for this truck.
                  </p>
                  <p>
                    <strong>Driver's Account:</strong> Check this for fuel given due to misuse or theft. DO and destination will show as NIL.
                  </p>
                </div>
              )}

              {/* Cancellation Point Selection - Required */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">
                  Checkpoint (where fuel was purchased) *
                </label>
                
                {/* Direction Toggle */}
                <div className="flex space-x-4 mb-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cancellationDirection"
                      value="going"
                      checked={cancellationDirection === 'going'}
                      onChange={() => {
                        setCancellationDirection('going');
                        setCancellationPoint('');
                      }}
                      className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Going</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cancellationDirection"
                      value="returning"
                      checked={cancellationDirection === 'returning'}
                      onChange={() => {
                        setCancellationDirection('returning');
                        setCancellationPoint('');
                      }}
                      className="w-4 h-4 text-orange-600 border-gray-300 focus:ring-orange-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Returning</span>
                  </label>
                </div>

                {/* Cancellation Point Dropdown - Required */}
                <select
                  required
                  value={cancellationPoint}
                  onChange={(e) => setCancellationPoint(e.target.value as CancellationPoint)}
                  className={`w-full px-3 py-2 border bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                    !cancellationPoint ? 'border-red-400 dark:border-red-600' : 'border-orange-300 dark:border-orange-600'
                  }`}
                >
                  <option value="">Select checkpoint (required)...</option>
                  {getAvailableCancellationPoints('CASH')[cancellationDirection].map((point) => (
                    <option key={point} value={point}>
                      {getCancellationPointDisplayName(point)}
                    </option>
                  ))}
                </select>
                {!cancellationPoint && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    ⚠ Please select the checkpoint where cash was used. This determines which fuel record column gets updated.
                  </p>
                )}

                {/* Zambia Returning Note */}
                {cancellationDirection === 'returning' && (
                  <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                    Note: Zambia returning has two parts - Ndola ({ZAMBIA_RETURNING_PARTS.ndola.liters}L) and Kapiri ({ZAMBIA_RETURNING_PARTS.kapiri.liters}L). Select which part to cancel.
                  </p>
                )}

                {/* Existing LPOs to Cancel - Auto-cancellation Preview */}
                {isFetchingLPOs && (
                  <div className="mt-3 flex items-center space-x-2 text-sm text-orange-600">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Checking for existing LPOs...</span>
                  </div>
                )}

                {!isFetchingLPOs && existingLPOsAtCheckpoint.length > 0 && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800 dark:text-red-300">
                          Auto-Cancellation: {existingLPOsAtCheckpoint.length} LPO(s) will be cancelled
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          The following LPOs have truck {formData.truckNo} at checkpoint stations. They will be automatically cancelled when you create this CASH LPO:
                        </p>
                        <ul className="mt-2 space-y-1">
                          {existingLPOsAtCheckpoint.map((lpo, idx) => {
                            // Case-insensitive truck number matching
                            const formTruckNormalized = (formData.truckNo || '').replace(/\s+/g, '').toUpperCase();
                            const matchingEntry = lpo.entries.find(e => 
                              (e.truckNo || '').replace(/\s+/g, '').toUpperCase() === formTruckNormalized
                            );
                            return (
                              <li key={idx} className="text-xs text-red-700 dark:text-red-300 flex items-center space-x-2">
                                <span className="font-medium">LPO #{lpo.lpoNo}</span>
                                <span>-</span>
                                <span>{lpo.station}</span>
                                <span>-</span>
                                <span>{matchingEntry?.liters || 0}L</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {!isFetchingLPOs && existingLPOsAtCheckpoint.length === 0 && cancellationPoint && formData.truckNo && (
                  <div className="mt-3 flex items-center space-x-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>No existing LPOs found for this truck to cancel</span>
                  </div>
                )}
              </div>

              {/* Driver's Account Checkbox */}
              <div className="border-t border-orange-300 dark:border-orange-600 pt-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDriverAccount}
                    onChange={handleDriverAccountToggle}
                    className="w-5 h-5 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <div className="flex items-center space-x-2">
                    <User className="w-5 h-5 text-red-600 dark:text-red-400" />
                    <span className="font-medium text-red-700 dark:text-red-400">
                      Driver's Account (Misuse/Theft)
                    </span>
                  </div>
                </label>
                {isDriverAccount && (
                  <p className="mt-2 ml-8 text-sm text-red-600 dark:text-red-400">
                    ⚠️ Fuel record will NOT be updated. DO and destination will show as NIL in exports.
                  </p>
                )}
              </div>

              {/* Reference DO Option - For linking NIL entries to a journey */}
              <div className="border-t border-orange-300 dark:border-orange-600 pt-4 mt-4">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDoReference}
                    onChange={() => {
                      setUseDoReference(!useDoReference);
                      if (useDoReference) setReferenceDo('');
                    }}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-blue-700 dark:text-blue-400">
                      Use DO Reference (Optional)
                    </span>
                  </div>
                </label>
                
                {useDoReference && (
                  <div className="mt-3 ml-8">
                    <p className="text-sm text-blue-600 dark:text-blue-400 mb-2">
                      💡 Enter a reference DO to link this entry to a specific journey. DO/Destination will still show as NIL, but this helps track which journey this entry belongs to.
                    </p>
                    <input
                      type="text"
                      value={referenceDo}
                      onChange={(e) => setReferenceDo(e.target.value.toUpperCase())}
                      placeholder="e.g., DO-12345 or SDO-67890"
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom Station Section */}
          {(formData.dieselAt === 'CUSTOM' || isCustomStation) && (
            <div className="mt-4 p-4 border-2 border-purple-300 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center space-x-2 mb-4">
                <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <span className="font-medium text-purple-800 dark:text-purple-300">
                  Custom Station (Unlisted Station)
                </span>
              </div>
              
              <p className="text-sm text-purple-600 dark:text-purple-400 mb-4">
                Use this for small stations in Zambia or other unlisted locations. Enter the station name and select which fuel record column(s) should be updated based on truck direction.
              </p>

              {/* Custom Station Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">
                  Station Name *
                </label>
                <input
                  type="text"
                  value={customStationName}
                  onChange={(e) => setCustomStationName(e.target.value)}
                  placeholder="e.g., Lake Station Near Kapiri"
                  className="w-full px-3 py-2 border border-purple-300 dark:border-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Direction Selection */}
              <div className="space-y-4">
                {/* Custom1 - Going Direction */}
                <div className={`p-3 rounded-lg border ${customGoingEnabled ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/50'}`}>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customGoingEnabled}
                      onChange={(e) => {
                        setCustomGoingEnabled(e.target.checked);
                        if (!e.target.checked) setCustomGoingCheckpoint('');
                      }}
                      className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Custom1 - Going Direction
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        For trucks with Going DO - fuel amount will be recorded in the selected column
                      </p>
                    </div>
                  </label>
                  
                  {customGoingEnabled && (
                    <div className="mt-3 ml-8">
                      <label className="block text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                        Select Fuel Record Column for Going *
                      </label>
                      <select
                        value={customGoingCheckpoint}
                        onChange={(e) => setCustomGoingCheckpoint(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 ${
                          !customGoingCheckpoint ? 'border-red-300 dark:border-red-600' : 'border-green-300 dark:border-green-600'
                        }`}
                      >
                        <option value="">Select checkpoint column...</option>
                        {FUEL_RECORD_COLUMNS.going.map((col) => (
                          <option key={col.field} value={col.field}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                      {!customGoingCheckpoint && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          ⚠ Please select where Going fuel amounts should be recorded
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Custom2 - Return Direction */}
                <div className={`p-3 rounded-lg border ${customReturnEnabled ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/50'}`}>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customReturnEnabled}
                      onChange={(e) => {
                        setCustomReturnEnabled(e.target.checked);
                        if (!e.target.checked) setCustomReturnCheckpoint('');
                      }}
                      className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        Custom2 - Return Direction
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        For trucks with Return DO - fuel amount will be recorded in the selected column
                      </p>
                    </div>
                  </label>
                  
                  {customReturnEnabled && (
                    <div className="mt-3 ml-8">
                      <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                        Select Fuel Record Column for Return *
                      </label>
                      <select
                        value={customReturnCheckpoint}
                        onChange={(e) => setCustomReturnCheckpoint(e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${
                          !customReturnCheckpoint ? 'border-red-300 dark:border-red-600' : 'border-blue-300 dark:border-blue-600'
                        }`}
                      >
                        <option value="">Select checkpoint column...</option>
                        {FUEL_RECORD_COLUMNS.return.map((col) => (
                          <option key={col.field} value={col.field}>
                            {col.label}
                          </option>
                        ))}
                      </select>
                      {!customReturnCheckpoint && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          ⚠ Please select where Return fuel amounts should be recorded
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Summary of custom station config */}
              {(customGoingEnabled || customReturnEnabled) && customStationName && (
                <div className="mt-4 p-3 bg-purple-100 dark:bg-purple-900/30 rounded-md">
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-2">
                    Configuration Summary:
                  </p>
                  <ul className="text-xs text-purple-700 dark:text-purple-400 space-y-1">
                    <li>📍 Station: <strong>{customStationName}</strong></li>
                    {customGoingEnabled && customGoingCheckpoint && (
                      <li>➡️ Going trucks → <strong>{FUEL_RECORD_COLUMNS.going.find(c => c.field === customGoingCheckpoint)?.label}</strong></li>
                    )}
                    {customReturnEnabled && customReturnCheckpoint && (
                      <li>⬅️ Return trucks → <strong>{FUEL_RECORD_COLUMNS.return.find(c => c.field === customReturnCheckpoint)?.label}</strong></li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                DO/SDO *
              </label>
              <input
                type="text"
                name="doSdo"
                value={formData.doSdo}
                onChange={handleChange}
                required
                placeholder="e.g., 6376"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Truck No. *
              </label>
              <input
                type="text"
                name="truckNo"
                value={formData.truckNo}
                onChange={handleChange}
                required
                placeholder="e.g., T530 DRF"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Liters *
              </label>
              <input
                type="number"
                name="ltrs"
                value={formData.ltrs}
                onChange={handleChange}
                required
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Price per Ltr *
              </label>
              <input
                type="number"
                name="pricePerLtr"
                value={formData.pricePerLtr}
                onChange={handleChange}
                required
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Destinations *
              </label>
              <select
                name="destinations"
                value={formData.destinations}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors"
              >
                <option value="">Select Destination</option>
                {destinations.map((dest) => (
                  <option key={dest} value={dest}>
                    {dest}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Calculated Amount Display */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-md transition-colors">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Amount:</span>
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {(formData.ltrs! * formData.pricePerLtr!).toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'TZS',
                })}
              </span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              {initialData ? 'Update' : 'Create'} LPO Entry
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LPOForm;
