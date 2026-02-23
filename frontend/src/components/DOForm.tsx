import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI } from '../services/api';
import axios from 'axios';
import { cleanDeliveryOrder, isCorruptedDriverName } from '../utils/dataCleanup';

interface DOFormProps {
  order?: DeliveryOrder;
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Partial<DeliveryOrder>) => Promise<DeliveryOrder | void>;
  defaultDoType?: 'DO' | 'SDO'; // Default DO type when creating new order
  user?: any; // User object for role-based auto-selection
}

const DOForm = ({ order, isOpen, onClose, onSave, defaultDoType = 'DO', user }: DOFormProps) => {
  const getCurrentDate = useCallback(() => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${year}-${month}-${day}`;
  }, []);

  const getDefaultFormData = useCallback((): Partial<DeliveryOrder> => {
    // Auto-select IMPORT/EXPORT based on user role
    let defaultImportExport: 'IMPORT' | 'EXPORT' = 'IMPORT';
    if (user?.role === 'export_officer') {
      defaultImportExport = 'EXPORT';
    } else if (user?.role === 'import_officer') {
      defaultImportExport = 'IMPORT';
    }

    return {
      // Explicitly no id for new orders
      date: getCurrentDate(),
      importOrExport: defaultImportExport,
      doType: defaultDoType, // Use the passed default type
      doNumber: '', // Will be populated by useEffect
      clientName: '',
      truckNo: '',
      trailerNo: '',
      containerNo: 'LOOSE CARGO',
      cargoType: 'loosecargo',
      rateType: 'per_ton',
      loadingPoint: '',
      destination: '',
      haulier: '',
      driverName: '',
      tonnages: 0,
      ratePerTon: 0,
    };
  }, [defaultDoType, getCurrentDate, user]);

  const [formData, setFormData] = useState<Partial<DeliveryOrder>>(getDefaultFormData());
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = !!order;
  
  // Dropdown states
  const [showRateTypeDropdown, setShowRateTypeDropdown] = useState(false);
  
  // Dropdown refs
  const rateTypeDropdownRef = useRef<HTMLDivElement>(null);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rateTypeDropdownRef.current && !rateTypeDropdownRef.current.contains(event.target as Node)) {
        setShowRateTypeDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update form data when order prop changes (for edit mode)
  useEffect(() => {
    if (isOpen) {
      if (order) {
        // Edit mode - populate with existing order data
        setFormData({
          ...order,
          // Ensure date is in correct format for input
          date: order.date ? order.date.split('T')[0] : getCurrentDate(),
        });
      } else {
        // Create mode - reset to defaults with correct doType
        const defaults = getDefaultFormData();
        defaults.doType = defaultDoType; // Ensure we use the passed default
        setFormData(defaults);
      }
    }
  }, [isOpen, order, defaultDoType, getDefaultFormData]);

  // Fetch next DO/SDO number when component opens
  // Note: When doType changes via handleDOTypeChange, it fetches directly, so we don't need doType in dependencies
  useEffect(() => {
    if (isOpen && !order) {
      const fetchNextNumber = async () => {
        const nextDONumber = await deliveryOrdersAPI.getNextNumber(formData.doType || 'DO');
        setFormData(prev => ({
          ...prev,
          doNumber: nextDONumber, // Already in XXXX/YY format
        }));
      };
      fetchNextNumber();
    }
  }, [isOpen, order]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    
    // Special handling for DO number - only numbers, pad with zeros
    if (name === 'doNumber') {
      const numericValue = value.replace(/\D/g, '');
      const paddedValue = numericValue.padStart(4, '0');
      setFormData((prev) => ({
        ...prev,
        [name]: paddedValue,
      }));
      return;
    }
    
    // Auto-uppercase text fields for consistency
    const uppercaseFields = ['truckNo', 'trailerNo', 'destination', 'loadingPoint', 'clientName', 'haulier', 'containerNo', 'driverName', 'invoiceNos', 'borderEntryDRC'];
    const finalValue = ['tonnages', 'ratePerTon'].includes(name) 
      ? parseFloat(value) || 0 
      : uppercaseFields.includes(name) 
        ? value.toUpperCase() 
        : value;
    
    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
  };

  const handleDOTypeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'DO' | 'SDO';
    setFormData(prev => ({ ...prev, doType: newType }));
    
    // Fetch next number for the selected type
    if (!order) {
      const nextDONumber = await deliveryOrdersAPI.getNextNumber(newType);
      setFormData(prev => ({ ...prev, doNumber: nextDONumber })); // Already in XXXX/YY format
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    console.log('=== DOForm handleSubmit START ===');
    console.log('Form data before clean:', formData);
    
    // Check for corrupted data and alert user if found
    if (isCorruptedDriverName(formData.driverName)) {
      alert('Driver name field contains invalid data (appears to be tonnage data). Please enter a valid driver name.');
      return;
    }
    
    // Clean and validate data before saving
    const cleanedFormData = cleanDeliveryOrder(formData);
    
    console.log('Cleaned form data:', cleanedFormData);
    
    // For new orders, remove id/_id to prevent MongoDB conflicts
    if (!order) {
      delete cleanedFormData.id;
      delete (cleanedFormData as any)._id;
      console.log('Creating new DO (removed id/_id)');
    } else {
      console.log('Updating existing DO:', order.id || (order as any)._id);
    }
    
    console.log('Calling onSave with data:', cleanedFormData);
    
    try {
      const savedOrder = await onSave(cleanedFormData);
      console.log('onSave returned:', savedOrder);
      
      if (!order && savedOrder) {
        // For new DOs, auto-download PDF then close
        console.log('Auto-downloading PDF for new DO...');
        await handleDownload(savedOrder as DeliveryOrder);
        onClose();
      } else {
        // For edits, just close
        console.log('Edit complete, closing form');
        onClose();
      }
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      alert('Failed to save delivery order. Check console for details.');
    } finally {
      setIsSubmitting(false);
    }
    
    console.log('=== DOForm handleSubmit END ===');
  };

  const handleDownload = async (targetOrder: DeliveryOrder) => {
    setIsDownloading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
      const token = sessionStorage.getItem('fuel_order_token');

      if (!token) {
        alert('Authentication required. Please log in again.');
        return;
      }

      const orderId = (targetOrder as any)._id || targetOrder.id;
      if (!orderId) {
        alert('Error: Could not find the delivery order ID. You can download it from the orders list.');
        return;
      }

      const response = await axios.get(
        `${API_BASE_URL}/delivery-orders/${orderId}/pdf`,
        {
          responseType: 'blob',
          withCredentials: true,
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const doType = targetOrder.doType || 'DO';
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `${doType}_${targetOrder.doNumber}_${timestamp}.pdf`;
      link.download = fileName;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      console.log(`✓ PDF downloaded: ${fileName}`);
    } catch (error: any) {
      console.error('Error downloading PDF:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      alert(`Failed to download PDF: ${errorMessage}\n\nYou can download it from the orders list.`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-2 md:px-4 pt-2 md:pt-4 pb-10 md:pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-80"
          onClick={handleClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle w-full max-w-[98%] md:max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-primary-600 dark:bg-primary-700 px-3 md:px-6 py-3 md:py-4 flex items-center justify-between">
            <h3 className="text-base md:text-lg font-semibold text-white">
              {order ? `Edit ${order.doType || 'DO'}-${order.doNumber}` : 'New Delivery Order'}
            </h3>
            <button onClick={handleClose} className="p-1 md:p-2 text-white hover:bg-primary-700 dark:hover:bg-primary-600 rounded">
              <X className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 px-3 md:px-6 py-4 md:py-6 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
              {/* Basic Information */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 uppercase">
                  Basic Information
                </h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Type *
                </label>
                <div className="flex items-center space-x-6">
                  <label className={`inline-flex items-center ${isEditMode ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="doType"
                      value="DO"
                      checked={formData.doType === 'DO'}
                      onChange={handleDOTypeChange}
                      disabled={isEditMode}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">DO (Delivery Order)</span>
                  </label>
                  <label className={`inline-flex items-center ${isEditMode ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="doType"
                      value="SDO"
                      checked={formData.doType === 'SDO'}
                      onChange={handleDOTypeChange}
                      disabled={isEditMode}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">SDO (Special Delivery Order)</span>
                  </label>
                </div>
                {isEditMode && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    DO type cannot be changed after creation
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  {formData.doType || 'DO'} Number *
                </label>
                <input
                  type="text"
                  name="doNumber"
                  value={formData.doNumber || ''}
                  onChange={handleChange}
                  required
                  readOnly={isEditMode}
                  disabled={isEditMode}
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    isEditMode ? 'bg-gray-100 dark:bg-gray-600 cursor-not-allowed' : ''
                  }`}
                  placeholder="e.g., 0001/26"
                />
                {isEditMode && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    DO number cannot be changed after creation
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Date *</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date || ''}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Import/Export *</label>
                {(user?.role === 'import_officer' || user?.role === 'export_officer') ? (
                  <>
                    <input
                      type="text"
                      value={formData.importOrExport || 'IMPORT'}
                      readOnly
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Auto-selected based on your role (cannot be changed)
                    </p>
                  </>
                ) : (
                  <select
                    name="importOrExport"
                    value={formData.importOrExport || 'IMPORT'}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="IMPORT">IMPORT</option>
                    <option value="EXPORT">EXPORT</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Invoice Numbers
                </label>
                <input
                  type="text"
                  name="invoiceNos"
                  value={formData.invoiceNos || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>

              {/* Client Information */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 mt-4 uppercase">
                  Client & Haulier Information
                </h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter client name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Haulier</label>
                <input
                  type="text"
                  name="haulier"
                  value={formData.haulier || ''}
                  onChange={handleChange}
                  style={{ textTransform: 'uppercase' }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter haulier name"
                />
              </div>

              {/* Vehicle Information */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 mt-4 uppercase">
                  Vehicle Information
                </h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Truck Number *
                </label>
                <input
                  type="text"
                  name="truckNo"
                  value={formData.truckNo || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., T844 EKS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Trailer Number *
                </label>
                <input
                  type="text"
                  name="trailerNo"
                  value={formData.trailerNo || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., T629 ELE"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Cargo Type *
                </label>
                <select
                  name="cargoType"
                  value={formData.cargoType || 'loosecargo'}
                  onChange={(e) => {
                    const cargoType = e.target.value as 'loosecargo' | 'container';
                    setFormData(prev => ({ 
                      ...prev, 
                      cargoType,
                      containerNo: cargoType === 'container' ? 'CONTAINER' : 'LOOSE CARGO'
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="loosecargo">Loose Cargo</option>
                  <option value="container">Container</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Container Number
                </label>
                <input
                  type="text"
                  name="containerNo"
                  value={formData.containerNo || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., LOOSE CARGO or CONTAINER"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Border Entry DRC
                </label>
                <input
                  type="text"
                  name="borderEntryDRC"
                  value={formData.borderEntryDRC || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Driver Name
                </label>
                <input
                  type="text"
                  name="driverName"
                  value={formData.driverName || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter driver name"
                />
              </div>

              {/* Route Information */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 mt-4 uppercase">
                  Route Information
                </h4>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Loading Point *
                </label>
                <input
                  type="text"
                  name="loadingPoint"
                  value={formData.loadingPoint || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., DAR"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Destination *
                </label>
                <input
                  type="text"
                  name="destination"
                  value={formData.destination || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., CCR KOLWEZI"
                />
              </div>

              {/* Financial Information */}
              <div className="md:col-span-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 mt-4 uppercase">
                  Financial Information
                </h4>
              </div>

              <div className="relative" ref={rateTypeDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Rate Structure *
                </label>
                <button
                  type="button"
                  onClick={() => setShowRateTypeDropdown(!showRateTypeDropdown)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                >
                  <span>
                    {formData.rateType === 'per_ton' ? 'Per Ton Rate (Tonnage × Rate)' : 'Fixed Total Amount'}
                  </span>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showRateTypeDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showRateTypeDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, rateType: 'per_ton' }));
                        setShowRateTypeDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        formData.rateType === 'per_ton' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span>Per Ton Rate (Tonnage × Rate)</span>
                      {formData.rateType === 'per_ton' && <Check className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, rateType: 'fixed_total' }));
                        setShowRateTypeDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                        formData.rateType === 'fixed_total' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      <span>Fixed Total Amount</span>
                      {formData.rateType === 'fixed_total' && <Check className="w-4 h-4" />}
                    </button>
                  </div>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {formData.rateType === 'per_ton' 
                    ? 'Calculate: Tonnage × Rate Per Ton'
                    : 'Single fixed amount for this DO'}
                </p>
              </div>

              <div></div>

              {formData.rateType === 'per_ton' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Tonnage *
                    </label>
                    <input
                      type="number"
                      name="tonnages"
                      value={formData.tonnages || ''}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Enter tonnage"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Rate Per Ton ($) *
                    </label>
                    <input
                      type="number"
                      name="ratePerTon"
                      value={formData.ratePerTon || ''}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Enter rate per ton"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 rounded-md">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        <strong>Total Amount:</strong> ${((formData.tonnages || 0) * (formData.ratePerTon || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Total Amount ($) *
                    </label>
                    <input
                      type="number"
                      name="ratePerTon"
                      value={formData.ratePerTon || ''}
                      onChange={handleChange}
                      required
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Enter fixed total amount"
                    />
                  </div>
                  <div></div>
                </>
              )}

            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting || isDownloading}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isDownloading}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting || isDownloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    {isDownloading ? 'Downloading PDF...' : (order ? 'Updating...' : 'Creating...')}
                  </>
                ) : (
                  <>{order ? 'Update' : 'Create'} DO</>
                )}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
};

export default DOForm;
