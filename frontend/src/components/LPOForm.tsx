import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, User, Ban, Info, AlertTriangle, Loader } from 'lucide-react';
import { LPOEntry, CancellationPoint, LPOSummary } from '../types';
import { getAutoFillDataForLPO } from '../services/lpoAutoFetchService';
import { lpoDocumentsAPI } from '../services/api';
import { 
  getAvailableCancellationPoints, 
  getCancellationPointDisplayName,
  ZAMBIA_RETURNING_PARTS
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

  // Auto-cancellation state: LPOs at checkpoint that have this truck
  const [existingLPOsAtCheckpoint, setExistingLPOsAtCheckpoint] = useState<LPOSummary[]>([]);
  const [isFetchingLPOs, setIsFetchingLPOs] = useState(false);

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
  }, [initialData]);

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
        : value,
    }));
    
    // When CASH station is selected, enable cash mode
    if (name === 'dieselAt') {
      if (value === 'CASH') {
        setIsCashMode(true);
        setUseCustom(true); // Cash mode requires manual entry of liters
      } else {
        setIsCashMode(false);
        setIsDriverAccount(false);
        setCancellationPoint('');
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

    // Prepare LPOs to cancel (for auto-cancellation when CASH mode)
    const lposToCancel = existingLPOsAtCheckpoint.map(lpo => ({
      lpoId: lpo.id as string,
      truckNo: formData.truckNo as string
    }));
    
    onSubmit({
      ...formData,
      isCashMode: isCashMode || formData.dieselAt === 'CASH',
      cancellationPoint: cancellationPoint || undefined,
      isDriverAccount,
      paymentMode,
      lposToCancel: lposToCancel.length > 0 ? lposToCancel : undefined
    });
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

  const stations = [
    'LAKE CHILABOMBWE',
    'LAKE NDOLA',
    'LAKE KAPIRI',
    'CASH',
    'TCC',
    'ZHANFEI',
    'KAMOA',
    'COMIKA'
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
                    Cash Mode Payment
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
                    When you select a cancellation point, the truck's order at that station will be cancelled in the original LPO.
                  </p>
                  <p>
                    <strong>Driver's Account:</strong> Check this for fuel given due to misuse or theft. DO and destination will show as NIL.
                  </p>
                </div>
              )}

              {/* Cancellation Point Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">
                  Cancellation Point (Where to cancel original order)
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

                {/* Cancellation Point Dropdown */}
                <select
                  value={cancellationPoint}
                  onChange={(e) => setCancellationPoint(e.target.value as CancellationPoint)}
                  className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">Select cancellation point...</option>
                  {getAvailableCancellationPoints('CASH')[cancellationDirection].map((point) => (
                    <option key={point} value={point}>
                      {getCancellationPointDisplayName(point)}
                    </option>
                  ))}
                </select>

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
                          {existingLPOsAtCheckpoint.map((lpo, idx) => (
                            <li key={idx} className="text-xs text-red-700 dark:text-red-300 flex items-center space-x-2">
                              <span className="font-medium">LPO #{lpo.lpoNo}</span>
                              <span>-</span>
                              <span>{lpo.station}</span>
                              <span>-</span>
                              <span>{lpo.entries.find(e => e.truckNo === formData.truckNo)?.liters || 0}L</span>
                            </li>
                          ))}
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
