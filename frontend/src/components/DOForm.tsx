import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI } from '../services/api';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import DeliveryNotePrint from './DeliveryNotePrint';
import { cleanDeliveryOrder, isCorruptedDriverName } from '../utils/dataCleanup';

interface DOFormProps {
  order?: DeliveryOrder;
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Partial<DeliveryOrder>) => void;
  defaultDoType?: 'DO' | 'SDO'; // Default DO type when creating new order
}

const DOForm = ({ order, isOpen, onClose, onSave, defaultDoType = 'DO' }: DOFormProps) => {
  const getCurrentDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const getDefaultFormData = (): Partial<DeliveryOrder> => ({
    // Explicitly no id for new orders
    date: getCurrentDate(),
    importOrExport: 'IMPORT',
    doType: defaultDoType, // Use the passed default type
    clientName: '',
    truckNo: '',
    trailerNo: '',
    containerNo: 'LOOSE CARGO',
    loadingPoint: '',
    destination: '',
    haulier: '',
    driverName: '',
    tonnages: 0,
    ratePerTon: 0,
  });

  const [formData, setFormData] = useState<Partial<DeliveryOrder>>(getDefaultFormData());
  const [createdOrder, setCreatedOrder] = useState<DeliveryOrder | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const isEditMode = !!order;

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
      setCreatedOrder(null);
    }
  }, [isOpen, order, defaultDoType]);

  // Fetch next DO/SDO number when component opens or doType changes
  useEffect(() => {
    if (isOpen && !order) {
      const fetchNextNumber = async () => {
        const nextNumber = await deliveryOrdersAPI.getNextNumber(formData.doType || 'DO');
        const paddedNumber = nextNumber.toString().padStart(4, '0');
        setFormData(prev => ({
          ...prev,
          sn: nextNumber,
          doNumber: paddedNumber,
        }));
      };
      fetchNextNumber();
    }
  }, [isOpen, formData.doType, order]);

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
    
    setFormData((prev) => ({
      ...prev,
      [name]: ['tonnages', 'ratePerTon'].includes(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const handleDOTypeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'DO' | 'SDO';
    setFormData(prev => ({ ...prev, doType: newType }));
    
    // Fetch next number for the selected type
    if (!order) {
      const nextNumber = await deliveryOrdersAPI.getNextNumber(newType);
      const paddedNumber = nextNumber.toString().padStart(4, '0');
      setFormData(prev => ({ ...prev, sn: nextNumber, doNumber: paddedNumber }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for corrupted data and alert user if found
    if (isCorruptedDriverName(formData.driverName)) {
      alert('Driver name field contains invalid data (appears to be tonnage data). Please enter a valid driver name.');
      return;
    }
    
    // Clean and validate data before saving
    const cleanedFormData = cleanDeliveryOrder(formData);
    
    // For new orders, remove id/_id to prevent MongoDB conflicts
    if (!order) {
      delete cleanedFormData.id;
      delete (cleanedFormData as any)._id;
    }
    
    const savedOrder = await onSave(cleanedFormData);
    if (!order && savedOrder) {
      // For new DOs, show download option
      setCreatedOrder(savedOrder as DeliveryOrder);
    } else {
      // For edits, just close
      onClose();
    }
  };

  const handleDownload = async () => {
    if (!createdOrder || isDownloading) return;
    
    setIsDownloading(true);
    try {
      const element = document.getElementById('do-print-preview');
      if (!element) {
        console.error('Print preview element not found');
        alert('Error: Could not find the delivery order to download.');
        return;
      }

      // Wait for rendering and ensure all content is loaded
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force layout recalculation
      element.style.display = 'block';
      element.style.visibility = 'visible';
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
        imageTimeout: 15000,
        windowWidth: 816,
        windowHeight: 1056,
        scrollX: 0,
        scrollY: 0,
        foreignObjectRendering: false,
        removeContainer: true,
        onclone: (clonedDoc) => {
          // Ensure cloned document has proper styles
          const clonedElement = clonedDoc.getElementById('do-print-preview');
          if (clonedElement) {
            clonedElement.style.display = 'block';
            clonedElement.style.visibility = 'visible';
            clonedElement.style.backgroundColor = 'white';
            clonedElement.style.color = 'black';
          }
        }
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdfWidth = 210;
      const targetWidth = pdfWidth * 0.75; // 3/4 width as per company format
      const imgHeight = (canvas.height * targetWidth) / canvas.width;
      const xOffset = (pdfWidth - targetWidth) / 2;
      const yOffset = 10;

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, targetWidth, imgHeight);
      
      const paddedNumber = createdOrder.doNumber.padStart(4, '0');
      const fileName = `${createdOrder.doType}-${paddedNumber}.pdf`;
      
      // Save only once
      pdf.save(fileName);
      
      console.log(`✓ PDF downloaded: ${fileName}`);
      
      // Small delay before showing alert to ensure PDF save completed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      alert(`✓ Success!\n\nDelivery Order PDF has been downloaded.\n\nFile: ${fileName}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error downloading DO. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    setCreatedOrder(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-80"
          onClick={handleClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-primary-600 dark:bg-primary-700 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              {order ? `Edit ${order.doType || 'DO'}-${order.doNumber}` : 'New Delivery Order'}
            </h3>
            <button onClick={handleClose} className="p-2 text-white hover:bg-primary-700 dark:hover:bg-primary-600 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  placeholder="e.g., 0001 or 1"
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., T629 ELE"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Container Number *
                </label>
                <input
                  type="text"
                  name="containerNo"
                  value={formData.containerNo || ''}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., LOOSE CARGO"
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
                <div className="bg-primary-50 dark:bg-primary-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-semibold">Total Amount:</span>{' '}
                    <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
                      ${((formData.tonnages || 0) * (formData.ratePerTon || 0)).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end space-x-3">
              {createdOrder ? (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isDownloading ? 'Downloading...' : 'Download DO'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
                  >
                    {order ? 'Update' : 'Create'} DO
                  </button>
                </>
              )}
            </div>
          </form>

          {/* Hidden print preview for PDF generation */}
          {createdOrder && (
            <div id="do-print-preview" className="hidden">
              <DeliveryNotePrint order={createdOrder} showOnScreen={true} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DOForm;
