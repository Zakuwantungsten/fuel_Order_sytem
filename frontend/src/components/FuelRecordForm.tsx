import React, { useState, useEffect } from 'react';
import { X, Zap, Lock, Unlock } from 'lucide-react';
import { FuelRecord } from '../types';

interface FuelRecordFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<FuelRecord>) => void;
  initialData?: FuelRecord;
  autoCalculated?: boolean; // Indicates if this was auto-created from a DO
}

const FuelRecordForm: React.FC<FuelRecordFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  autoCalculated = false,
}) => {
  const getCurrentDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState<Partial<FuelRecord>>({
    date: getCurrentDate(),
    truckNo: '',
    goingDo: '',
    returnDo: '',
    start: '',
    from: '',
    to: '',
    totalLts: 0,
    extra: 0,
    mmsaYard: 0,
    tangaYard: 0,
    darYard: 0,
    darGoing: 0,
    moroGoing: 0,
    mbeyaGoing: 0,
    tdmGoing: 0,
    zambiaGoing: 0,
    congoFuel: 0,
    zambiaReturn: 0,
    tundumaReturn: 0,
    mbeyaReturn: 0,
    moroReturn: 0,
    darReturn: 0,
    tangaReturn: 0,
    balance: 0,
  });

  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      
      // If auto-calculated, lock all allocation fields by default
      if (autoCalculated) {
        setLockedFields(new Set([
          'extra', 'tangaYard', 'darYard', 'darGoing', 'moroGoing', 
          'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
          'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn',
          'darReturn', 'tangaReturn'
        ]));
      }
    }
  }, [initialData, autoCalculated]);

  // Auto-calculate balance whenever allocation fields change
  useEffect(() => {
    const totalFuel = (formData.totalLts || 0) + (formData.extra || 0);
    const allocations = (
      (formData.mmsaYard || 0) +
      (formData.tangaYard || 0) +
      (formData.darYard || 0) +
      (formData.darGoing || 0) +
      (formData.moroGoing || 0) +
      (formData.mbeyaGoing || 0) +
      (formData.tdmGoing || 0) +
      (formData.zambiaGoing || 0) +
      (formData.congoFuel || 0) +
      (formData.zambiaReturn || 0) +
      (formData.tundumaReturn || 0) +
      (formData.mbeyaReturn || 0) +
      (formData.moroReturn || 0) +
      (formData.darReturn || 0) +
      (formData.tangaReturn || 0)
    );
    const calculatedBalance = totalFuel + allocations; // allocations are negative in CSV
    
    setFormData(prev => ({
      ...prev,
      balance: calculatedBalance
    }));
  }, [
    formData.totalLts, formData.extra, formData.mmsaYard, formData.tangaYard,
    formData.darYard, formData.darGoing, formData.moroGoing, formData.mbeyaGoing,
    formData.tdmGoing, formData.zambiaGoing, formData.congoFuel, formData.zambiaReturn,
    formData.tundumaReturn, formData.mbeyaReturn, formData.moroReturn,
    formData.darReturn, formData.tangaReturn
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Don't allow changes to locked fields
    if (lockedFields.has(name)) {
      return;
    }
    
    setFormData((prev) => ({
      ...prev,
      [name]: ['totalLts', 'extra', 'mmsaYard', 'tangaYard', 'darYard', 'darGoing', 
               'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
               'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 
               'darReturn', 'tangaReturn', 'balance'].includes(name)
        ? parseFloat(value) || 0
        : value,
    }));
  };

  const toggleFieldLock = (fieldName: string) => {
    setLockedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return newSet;
    });
  };

  const renderFuelInput = (
    label: string,
    fieldName: keyof FuelRecord,
    isAutoCalculated: boolean = false
  ) => {
    const isLocked = lockedFields.has(fieldName as string);
    const value = formData[fieldName] as number || 0;
    
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
          <span className="flex items-center">
            {label}
            {isAutoCalculated && (
              <span title="Auto-calculated">
                <Zap className="w-3 h-3 ml-1 text-blue-500" />
              </span>
            )}
          </span>
          {isAutoCalculated && (
            <button
              type="button"
              onClick={() => toggleFieldLock(fieldName as string)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              title={isLocked ? "Unlock to edit" : "Lock to prevent changes"}
            >
              {isLocked ? (
                <Lock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
              ) : (
                <Unlock className="w-3 h-3 text-green-500" />
              )}
            </button>
          )}
        </label>
        <input
          type="number"
          name={fieldName as string}
          value={value}
          onChange={handleChange}
          disabled={isLocked}
          className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
            isLocked ? 'bg-gray-100 dark:bg-gray-600 cursor-not-allowed' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          } ${isAutoCalculated && !isLocked ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20' : ''}`}
        />
      </div>
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto transition-colors">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {initialData ? 'Edit Fuel Record' : 'New Fuel Record'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Auto-calculation notice */}
          {autoCalculated && (
            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-start">
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    Auto-Calculated Values
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    This fuel record was automatically calculated based on the delivery order. 
                    Fields marked with <Zap className="inline w-3 h-3" /> are auto-calculated and locked by default. 
                    Click <Unlock className="inline w-3 h-3" /> to unlock and manually override any value.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Basic Information */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                  placeholder="e.g., T705 DXY"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Going DO *
                </label>
                <input
                  type="text"
                  name="goingDo"
                  value={formData.goingDo}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 6395"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Return DO
                </label>
                <input
                  type="text"
                  name="returnDo"
                  value={formData.returnDo || ''}
                  onChange={handleChange}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start *
                </label>
                <input
                  type="text"
                  name="start"
                  value={formData.start}
                  onChange={handleChange}
                  required
                  placeholder="e.g., DAR"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  From *
                </label>
                <input
                  type="text"
                  name="from"
                  value={formData.from}
                  onChange={handleChange}
                  required
                  placeholder="e.g., DAR"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  To *
                </label>
                <input
                  type="text"
                  name="to"
                  value={formData.to}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Kpm, Likasi, Kolwezi"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Total Ltrs *
                </label>
                <input
                  type="number"
                  name="totalLts"
                  value={formData.totalLts ?? ''}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              {renderFuelInput('Extra', 'extra', autoCalculated)}
            </div>
          </div>

          {/* Yard Allocations */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Yard Allocations</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderFuelInput('MMSA Yard', 'mmsaYard', autoCalculated)}
              {renderFuelInput('Tanga Yard', 'tangaYard', autoCalculated)}
              {renderFuelInput('Dar Yard', 'darYard', autoCalculated)}
            </div>
          </div>

          {/* Going Fuel Allocations */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Going Fuel Allocations</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderFuelInput('Dar Going', 'darGoing', autoCalculated)}
              {renderFuelInput('Moro Going', 'moroGoing', autoCalculated)}
              {renderFuelInput('Mbeya Going', 'mbeyaGoing', autoCalculated)}
              {renderFuelInput('Tdm Going', 'tdmGoing', autoCalculated)}
              {renderFuelInput('Zambia Going', 'zambiaGoing', autoCalculated)}
              {renderFuelInput('Congo Fuel', 'congoFuel', autoCalculated)}
            </div>
          </div>

          {/* Return Fuel Allocations */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Return Fuel Allocations</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderFuelInput('Zambia Return', 'zambiaReturn', autoCalculated)}
              {renderFuelInput('Tunduma Return', 'tundumaReturn', autoCalculated)}
              {renderFuelInput('Mbeya Return', 'mbeyaReturn', autoCalculated)}
              {renderFuelInput('Moro Return', 'moroReturn', autoCalculated)}
              {renderFuelInput('Dar Return', 'darReturn', autoCalculated)}
              {renderFuelInput('Tanga Return', 'tangaReturn', autoCalculated)}
            </div>
          </div>

          {/* Balance */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Balance (Auto-calculated)</h3>
            <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Total Fuel: {((formData.totalLts || 0) + (formData.extra || 0)).toLocaleString()} Ltrs
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    (Total Ltrs + Extra) - All Allocations
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Remaining Balance:</p>
                  <p className={`text-3xl font-bold ${(formData.balance || 0) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    {(formData.balance || 0).toLocaleString()} Ltrs
                  </p>
                </div>
              </div>
            </div>
            <input
              type="hidden"
              name="balance"
              value={formData.balance || 0}
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
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
              {initialData ? 'Update' : 'Create'} Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FuelRecordForm;
