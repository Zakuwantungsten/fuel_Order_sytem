import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { LPOEntry } from '../types';
import { getAutoFillDataForLPO } from '../services/lpoAutoFetchService';

interface LPOFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<LPOEntry>) => void;
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: ['sn', 'ltrs', 'pricePerLtr'].includes(name)
        ? parseFloat(value) || 0
        : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                ? 'bg-green-50 border border-green-200' 
                : autoFillResult.confidence === 'medium'
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-orange-50 border border-orange-200'
            }`}>
              {autoFillResult.confidence === 'high' ? (
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Auto-filled: {autoFillResult.doType === 'going' ? 'Going' : 'Returning'} DO {autoFillResult.doNumber}
                </p>
                <p className="text-xs text-gray-600 mt-1">{autoFillResult.reason}</p>
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
                  className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Manual Entry Mode
                </span>
              </label>
              {isAutoFetching && (
                <span className="text-xs text-gray-500">Fetching DO...</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                S/No *
              </label>
              <input
                type="number"
                name="sn"
                value={formData.sn}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                LPO No. *
              </label>
              <input
                type="text"
                name="lpoNo"
                value={formData.lpoNo}
                onChange={handleChange}
                required
                placeholder="e.g., 2150"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Diesel @ (Station) *
              </label>
              <select
                name="dieselAt"
                value={formData.dieselAt}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">Select Station</option>
                {stations.map((station) => (
                  <option key={station} value={station}>
                    {station}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DO/SDO *
              </label>
              <input
                type="text"
                name="doSdo"
                value={formData.doSdo}
                onChange={handleChange}
                required
                placeholder="e.g., 6376"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Truck No. *
              </label>
              <input
                type="text"
                name="truckNo"
                value={formData.truckNo}
                onChange={handleChange}
                required
                placeholder="e.g., T530 DRF"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Liters *
              </label>
              <input
                type="number"
                name="ltrs"
                value={formData.ltrs}
                onChange={handleChange}
                required
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price per Ltr *
              </label>
              <input
                type="number"
                name="pricePerLtr"
                value={formData.pricePerLtr}
                onChange={handleChange}
                required
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destinations *
              </label>
              <select
                name="destinations"
                value={formData.destinations}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Total Amount:</span>
              <span className="text-lg font-semibold text-gray-900">
                {(formData.ltrs! * formData.pricePerLtr!).toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'TZS',
                })}
              </span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 mt-6 pt-4 border-t">
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
