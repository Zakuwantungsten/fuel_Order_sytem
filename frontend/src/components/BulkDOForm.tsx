import { useState, useEffect, useRef } from 'react';
import { X, FileDown, Plus, ChevronDown, Check } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI } from '../services/api';
import { parseDONumber, formatDONumber } from '../utils/doNumberFormatter';

interface BulkDOFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (orders: Partial<DeliveryOrder>[], onProgress?: (current: number, total: number, status: string) => void) => Promise<{ success: boolean; createdOrders: Partial<DeliveryOrder>[] }>;
  user?: any;
}

interface BulkDORow {
  truckNo: string;
  trailerNo: string;
  driverName: string;
  tonnages: number;
  ratePerTon: number;
  totalAmount?: number;
}

const BulkDOForm = ({ isOpen, onClose, onSave, user }: BulkDOFormProps) => {
  // Auto-select importOrExport based on user role
  const getDefaultImportExport = (): 'IMPORT' | 'EXPORT' => {
    if (user?.role === 'export_officer') return 'EXPORT';
    if (user?.role === 'import_officer') return 'IMPORT';
    return 'IMPORT';
  };

  const [commonData, setCommonData] = useState({
    date: (() => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      return `${year}-${month}-${day}`;
    })(),
    importOrExport: getDefaultImportExport(),
    doType: 'DO' as 'DO' | 'SDO',
    clientName: '',
    loadingPoint: '',
    destination: '',
    haulier: '',
    containerNo: 'LOOSE CARGO',
    cargoType: 'loosecargo' as 'loosecargo' | 'container',
    rateType: 'per_ton' as 'per_ton' | 'fixed_total',
    startingNumber: '',
  });

  // Fetch next DO/SDO number when component opens or doType changes
  useEffect(() => {
    if (isOpen) {
      const fetchNextNumber = async () => {
        const nextNumber = await deliveryOrdersAPI.getNextNumber(commonData.doType);
        setCommonData(prev => ({
          ...prev,
          startingNumber: nextNumber, // Already in XXXX/YY format from backend
        }));
      };
      fetchNextNumber();
    }
  }, [isOpen]); // Remove commonData.doType to avoid interference

  // Separate effect for when DO type changes within the open modal
  useEffect(() => {
    if (isOpen && commonData.doType) {
      const fetchNextNumber = async () => {
        const nextNumber = await deliveryOrdersAPI.getNextNumber(commonData.doType);
        setCommonData(prev => ({
          ...prev,
          startingNumber: nextNumber,
        }));
      };
      fetchNextNumber();
    }
  }, [commonData.doType]);

  const [bulkInput, setBulkInput] = useState('');
  const [parsedRows, setParsedRows] = useState<BulkDORow[]>([]);
  const [createdOrders, setCreatedOrders] = useState<Partial<DeliveryOrder>[]>([]);
  
  // Progress tracking state
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  
  // Dropdown states
  const [showCargoTypeDropdown, setShowCargoTypeDropdown] = useState(false);
  const [showRateTypeDropdown, setShowRateTypeDropdown] = useState(false);
  const [showImportExportDropdown, setShowImportExportDropdown] = useState(false);

  // Reset form when closing
  useEffect(() => {
    if (!isOpen) {
      // Reset all form data when the modal closes
      setBulkInput('');
      setParsedRows([]);
      setCreatedOrders([]);
      setProgress({ current: 0, total: 0, status: '' });
      setIsCreating(false);
      
      // Reset commonData to defaults
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      
      setCommonData(prev => ({
        date: `${year}-${month}-${day}`,
        importOrExport: getDefaultImportExport(),
        doType: 'DO' as 'DO' | 'SDO',
        clientName: '',
        loadingPoint: '',
        destination: '',
        haulier: '',
        containerNo: 'LOOSE CARGO',
        cargoType: 'loosecargo' as 'loosecargo' | 'container',
        rateType: 'per_ton' as 'per_ton' | 'fixed_total',
        startingNumber: prev.startingNumber, // Keep the starting number, will be refreshed when opening
      }));
    }
  }, [isOpen]);
  
  // Dropdown refs
  const cargoTypeDropdownRef = useRef<HTMLDivElement>(null);
  const rateTypeDropdownRef = useRef<HTMLDivElement>(null);
  const importExportDropdownRef = useRef<HTMLDivElement>(null);
  
  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cargoTypeDropdownRef.current && !cargoTypeDropdownRef.current.contains(event.target as Node)) {
        setShowCargoTypeDropdown(false);
      }
      if (rateTypeDropdownRef.current && !rateTypeDropdownRef.current.contains(event.target as Node)) {
        setShowRateTypeDropdown(false);
      }
      if (importExportDropdownRef.current && !importExportDropdownRef.current.contains(event.target as Node)) {
        setShowImportExportDropdown(false);
      }
    };

    const handleScroll = () => {
      setShowCargoTypeDropdown(false);
      setShowRateTypeDropdown(false);
      setShowImportExportDropdown(false);
    };

    const scrollEl = document.getElementById('main-scroll-container');
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    scrollEl?.addEventListener('scroll', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      scrollEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleCommonChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    // Auto-uppercase text fields for consistency
    const uppercaseFields = ['clientName', 'loadingPoint', 'destination', 'haulier', 'containerNo'];
    const finalValue = uppercaseFields.includes(name) ? value.toUpperCase() : value;
    setCommonData((prev) => ({ ...prev, [name]: finalValue }));
  };

  const handleDOTypeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'DO' | 'SDO';
    
    // Fetch next number for the selected type
    const nextNumber = await deliveryOrdersAPI.getNextNumber(newType);
    
    // Update both doType and startingNumber together
    setCommonData(prev => ({ 
      ...prev, 
      doType: newType,
      startingNumber: nextNumber // Already in XXXX/YY format
    }));
  };

  const parseBulkData = () => {
    try {
      console.log('=== Parsing Bulk Data ===');
      console.log('Input length:', bulkInput.length);
      console.log('Rate Type:', commonData.rateType);
      
      if (!bulkInput.trim()) {
        alert('Please enter truck data to parse');
        return;
      }
      
      const lines = bulkInput.trim().split('\n');
      console.log('Number of lines:', lines.length);
      
      const rows: BulkDORow[] = [];

      for (const line of lines) {
        const parts = line.split('\t').map(p => p.trim());
        console.log('Line parts:', parts.length, parts);
        
        if (commonData.rateType === 'per_ton') {
          // Format: Truck | Trailer | Driver | Tonnage | Rate Per Ton
          if (parts.length >= 5) {
            const tonnage = parseFloat(parts[3]) || 0;
            const rate = parseFloat(parts[4]) || 0;
            rows.push({
              truckNo: parts[0].toUpperCase(),
              trailerNo: parts[1].toUpperCase(),
              driverName: parts[2].toUpperCase(),
              tonnages: tonnage,
              ratePerTon: rate,
              totalAmount: tonnage * rate,
            });
          }
        } else {
          // fixed_total: Format: Truck | Trailer | Driver | Tonnage | Total Amount
          if (parts.length >= 5) {
            const tonnage = parseFloat(parts[3]) || 0;
            const totalAmount = parseFloat(parts[4]) || 0;
            rows.push({
              truckNo: parts[0].toUpperCase(),
              trailerNo: parts[1].toUpperCase(),
              driverName: parts[2].toUpperCase(),
              tonnages: tonnage,
              ratePerTon: totalAmount,
              totalAmount: totalAmount,
            });
          }
        }
      }

      console.log('Parsed rows:', rows.length, rows);
      
      if (rows.length === 0) {
        const expectedFormat = commonData.rateType === 'per_ton'
          ? 'Truck No | Trailer No | Driver Name | Tonnage | Rate Per Ton'
          : 'Truck No | Trailer No | Driver Name | Tonnage | Total Amount';
        alert(`No valid data found. Please ensure data is tab-separated:\n${expectedFormat}`);
        return;
      }
      
      setParsedRows(rows);
      alert(`✓ Successfully parsed ${rows.length} truck entries`);
    } catch (error) {
      console.error('Error parsing bulk data:', error);
      alert('Error parsing data. Please check the format and try again.');
    }
  };

  const generateDOs = async () => {
    try {
      console.log('=== Starting Bulk DO Generation ===');
      console.log('Order Type:', commonData.doType);
      console.log('Common Data:', commonData);
      console.log('Parsed Rows:', parsedRows);
      
      if (parsedRows.length === 0) {
        alert('Please parse the truck data first by clicking "Parse Data"');
        return;
      }
      
      // Validate required fields
      if (!commonData.clientName || !commonData.loadingPoint || !commonData.destination) {
        alert('Please fill in all required fields:\n- Client Name\n- Loading Point\n- Destination');
        return;
      }
      
      if (!commonData.startingNumber) {
        alert('Please enter a starting number for the orders');
        return;
      }
      
      // Parse the starting DO number (format: XXXX/YY)
      const parsed = parseDONumber(commonData.startingNumber);
      if (!parsed) {
        alert('Invalid DO number format. Expected format: XXXX/YY (e.g., 0001/26)');
        return;
      }

      const { sequentialNumber: startNum, year } = parsed;
      
      const orders: Partial<DeliveryOrder>[] = parsedRows.map((row, index) => ({
        sn: index + 1,
        date: commonData.date,
        importOrExport: commonData.importOrExport,
        doType: commonData.doType,
        doNumber: formatDONumber(startNum + index, year), // Use new format: XXXX/YY
        clientName: commonData.clientName,
        truckNo: row.truckNo,
        trailerNo: row.trailerNo,
        driverName: row.driverName,
        containerNo: commonData.containerNo || undefined,
        cargoType: commonData.cargoType,
        rateType: commonData.rateType,
        loadingPoint: commonData.loadingPoint,
        destination: commonData.destination,
        haulier: commonData.haulier || '',
        tonnages: row.tonnages,
        ratePerTon: row.ratePerTon,
        totalAmount: row.totalAmount,
      }));

      console.log(`Generated ${orders.length} orders to save`);
      console.log('Sample order:', orders[0]);
      
      // Orders are already in the correct format, no need for padding
      const paddedOrders = orders;
      
      // Initialize progress tracking
      setIsCreating(true);
      setProgress({ current: 0, total: paddedOrders.length, status: 'Preparing...' });
      setCreatedOrders([]);
      
      // Save to backend with progress callback
      console.log('Calling onSave with orders...');
      const result = await onSave(paddedOrders, (current, total, status) => {
        setProgress({ current, total, status });
      });
      
      if (!result.success || result.createdOrders.length === 0) {
        console.error('No orders were created');
        setIsCreating(false);
        setCreatedOrders([]);
        alert('Failed to create any delivery orders. Check console for details.');
        return;
      }
      
      console.log(`✓ Successfully created ${result.createdOrders.length} out of ${paddedOrders.length} orders!`);
      
      // Set only the actually created orders for display and PDF generation
      setCreatedOrders(result.createdOrders);
      setProgress({ current: result.createdOrders.length, total: paddedOrders.length, status: 'Generating PDF...' });
      
      // Automatically download PDF from backend - use only the successfully created orders
      console.log('Starting PDF download from backend...');
      try {
        await downloadAllAsPDF(result.createdOrders);
        console.log('✓ PDF downloaded successfully!');
        
        setProgress({ current: result.createdOrders.length, total: paddedOrders.length, status: 'Complete!' });
        setIsCreating(false);
        
        // Show success message with download confirmation - dynamic based on order type
        const orderTypeLabel = commonData.doType === 'SDO' ? 'special delivery orders (SDOs)' : 'delivery orders';
        const additionalInfo = commonData.doType === 'SDO' 
          ? '' 
          : ' with fuel records and LPOs';
        
        const successMsg = result.createdOrders.length === paddedOrders.length
          ? `✓ Success!\n\nCreated ${result.createdOrders.length} ${orderTypeLabel}${additionalInfo}.\n\nPDF file has been downloaded to your Downloads folder.`
          : `✓ Partially Complete\n\nCreated ${result.createdOrders.length} out of ${paddedOrders.length} ${orderTypeLabel}.\n\nPDF includes only successfully created orders.\n\nSee summary for skipped/failed orders.`;
        
        alert(successMsg);
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
        setIsCreating(false);
        alert(`Orders created successfully, but PDF download failed.\n\nYou can download the PDF again using the button below.`);
      }
      
      // Don't close automatically - let user review and close manually
      // onClose();
    } catch (error) {
      console.error('✗ Error in generateDOs:', error);
      alert('Failed to create delivery orders. Please try again.');
      setCreatedOrders([]);
    }
  };

  const downloadAllAsPDF = async (ordersToDownload?: Partial<DeliveryOrder>[]) => {
    // Use passed orders or fall back to state (for manual download button)
    const orders = ordersToDownload || createdOrders;
    
    if (orders.length === 0) {
      console.warn('No orders available for PDF generation');
      return;
    }

    try {
      console.log(`Downloading PDF for ${orders.length} orders from backend...`);
      
      // Extract DO numbers from the orders
      const doNumbers = orders.map(order => order.doNumber).filter(Boolean) as string[];
      
      if (doNumbers.length === 0) {
        throw new Error('No valid DO numbers found');
      }
      
      // Call backend API to generate PDF
      const pdfBlob = await deliveryOrdersAPI.downloadBulkPDF(doNumbers);
      
      // Create download link and trigger download
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename using the first and last DO numbers
      const firstDO = orders[0]?.doNumber || commonData.startingNumber;
      const lastDO = orders[orders.length - 1]?.doNumber || commonData.startingNumber;
      const fileName = `${commonData.doType}_${firstDO}_to_${lastDO}.pdf`;
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(url);
      
      console.log(`✓ Successfully downloaded PDF: ${fileName}`);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      throw error;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-80"
          onClick={isCreating ? undefined : onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          {/* Header */}
          <div className="bg-primary-600 dark:bg-primary-700 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Bulk Delivery Order Creation
            </h3>
            <button 
              onClick={onClose} 
              disabled={isCreating}
              className={`p-2 text-white rounded ${isCreating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-700 dark:hover:bg-primary-600'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress Bar */}
          {isCreating && (
            <div className="bg-blue-50 dark:bg-blue-900/20 px-6 py-4 border-b border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 dark:border-blue-400 mr-3"></div>
                  <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {progress.status}
                  </span>
                </div>
                <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                  {progress.current} / {progress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-900/40 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-2">
                Please wait while the delivery orders are being created. Do not close this window.
              </p>
            </div>
          )}

          {/* Form */}
          <div className="bg-white dark:bg-gray-800 px-6 py-6 max-h-[80vh] overflow-y-auto">
            {/* Common Information */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 uppercase">
                Common Information (Applied to All DOs)
              </h4>
              
              {/* DO/SDO Type Selector - Full width */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Order Type *
                </label>
                <div className="flex items-center space-x-6">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="doType"
                      value="DO"
                      checked={commonData.doType === 'DO'}
                      onChange={handleDOTypeChange}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">DO (Delivery Order)</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="doType"
                      value="SDO"
                      checked={commonData.doType === 'SDO'}
                      onChange={handleDOTypeChange}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">SDO (Special Delivery Order)</span>
                  </label>
                </div>
              </div>
              
              {/* Cargo Type and Rate Type Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="relative" ref={cargoTypeDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Cargo Type *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCargoTypeDropdown(!showCargoTypeDropdown)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                  >
                    <span>{commonData.cargoType === 'loosecargo' ? 'Loose Cargo' : 'Container'}</span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showCargoTypeDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showCargoTypeDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          const cargoType = 'loosecargo';
                          setCommonData(prev => ({ 
                            ...prev, 
                            cargoType,
                            containerNo: 'LOOSE CARGO'
                          }));
                          setShowCargoTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          commonData.cargoType === 'loosecargo' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>Loose Cargo</span>
                        {commonData.cargoType === 'loosecargo' && <Check className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const cargoType = 'container';
                          setCommonData(prev => ({ 
                            ...prev, 
                            cargoType,
                            containerNo: 'CONTAINER'
                          }));
                          setShowCargoTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          commonData.cargoType === 'container' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>Container</span>
                        {commonData.cargoType === 'container' && <Check className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative" ref={rateTypeDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Rate Structure *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowRateTypeDropdown(!showRateTypeDropdown)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                  >
                    <span>{commonData.rateType === 'per_ton' ? 'Per Ton Rate (Tonnage × Rate)' : 'Fixed Total Amount'}</span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showRateTypeDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  {showRateTypeDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setCommonData(prev => ({ 
                            ...prev, 
                            rateType: 'per_ton'
                          }));
                          setParsedRows([]);
                          setBulkInput('');
                          setShowRateTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          commonData.rateType === 'per_ton' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>Per Ton Rate (Tonnage × Rate)</span>
                        {commonData.rateType === 'per_ton' && <Check className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCommonData(prev => ({ 
                            ...prev, 
                            rateType: 'fixed_total'
                          }));
                          setParsedRows([]);
                          setBulkInput('');
                          setShowRateTypeDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          commonData.rateType === 'fixed_total' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>Fixed Total Amount</span>
                        {commonData.rateType === 'fixed_total' && <Check className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {commonData.rateType === 'per_ton' 
                      ? 'Calculate: Tonnage × Rate Per Ton'
                      : 'Single fixed amount per DO'}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Starting {commonData.doType} Number *
                  </label>
                  <input
                    type="text"
                    name="startingNumber"
                    value={commonData.startingNumber}
                    readOnly
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                    placeholder={`e.g., 0001/26`}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Auto-generated from last DO. Format: XXXX/YY
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    name="clientName"
                    value={commonData.clientName}
                    onChange={handleCommonChange}
                    required
                    style={{ textTransform: 'uppercase' }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter client name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={commonData.date}
                    onChange={handleCommonChange}
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
                        value={commonData.importOrExport}
                        readOnly
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Auto-selected based on your role (cannot be changed)
                      </p>
                    </>
                  ) : (
                    <div className="relative" ref={importExportDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowImportExportDropdown(!showImportExportDropdown)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                      >
                        <span>{commonData.importOrExport}</span>
                        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showImportExportDropdown ? 'rotate-180' : ''}`} />
                      </button>
                      {showImportExportDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setCommonData(prev => ({ ...prev, importOrExport: 'IMPORT' }));
                              setShowImportExportDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                              commonData.importOrExport === 'IMPORT' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            <span>IMPORT</span>
                            {commonData.importOrExport === 'IMPORT' && <Check className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCommonData(prev => ({ ...prev, importOrExport: 'EXPORT' }));
                              setShowImportExportDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                              commonData.importOrExport === 'EXPORT' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            <span>EXPORT</span>
                            {commonData.importOrExport === 'EXPORT' && <Check className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                    Loading Point *
                  </label>
                  <input
                    type="text"
                    name="loadingPoint"
                    value={commonData.loadingPoint}
                    onChange={handleCommonChange}
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
                    value={commonData.destination}
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., CCR KOLWEZI"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Haulier</label>
                  <input
                    type="text"
                    name="haulier"
                    value={commonData.haulier}
                    onChange={handleCommonChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter haulier name (optional)"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Data Input */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 uppercase">
                Truck Details (Paste from Excel/Spreadsheet)
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <strong>Format:</strong> Paste tab-separated data from Excel/Spreadsheet
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {commonData.rateType === 'per_ton' 
                  ? 'Required columns: Truck No | Trailer No | Driver Name | Tonnage | Rate Per Ton'
                  : 'Required columns: Truck No | Trailer No | Driver Name | Tonnage | Total Amount'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                <strong>Example:</strong> {commonData.rateType === 'per_ton' 
                  ? 'T538 EKT [TAB] T637 ELE [TAB] John Doe [TAB] 32 [TAB] 185'
                  : 'T538 EKT [TAB] T637 ELE [TAB] John Doe [TAB] 32 [TAB] 5920'}
              </p>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                disabled={isCreating}
                rows={8}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                placeholder={commonData.rateType === 'per_ton'
                  ? "T844 EKS\tT629 ELE\tJohn Doe\t30\t1850\nT845 ABC\tT630 DEF\tJane Smith\t28\t1850"
                  : "T844 EKS\tT629 ELE\tJohn Doe\t30\t55500\nT845 ABC\tT630 DEF\tJane Smith\t28\t51800"}
              />
              <button
                type="button"
                onClick={parseBulkData}
                disabled={isCreating}
                className={`mt-2 px-4 py-2 text-white rounded-md ${isCreating ? 'opacity-50 cursor-not-allowed bg-gray-400 dark:bg-gray-600' : 'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600'}`}
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Parse Data ({bulkInput.split('\n').filter(l => l.trim()).length} rows)
              </button>
            </div>

            {/* Preview of created orders */}
            {createdOrders.length > 0 && (
              <div className="mb-6 border-2 border-green-500 dark:border-green-400 rounded-lg">
                <div className="bg-green-50 dark:bg-green-900/20 px-4 py-3 border-b border-green-200 dark:border-green-700">
                  <h4 className="text-base font-semibold text-green-800 dark:text-green-300 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Successfully Created {createdOrders.length} Delivery Orders!
                  </h4>
                </div>
                <div className="p-4">
                  <div className="mb-3">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 font-medium">What was created:</p>
                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                      <li><strong>{createdOrders.length}</strong> Delivery Orders ({createdOrders[0]?.doNumber} to {createdOrders[createdOrders.length - 1]?.doNumber})</li>
                      <li><strong>{createdOrders.length}</strong> Fuel Records with automatic fuel allocations</li>
                      <li>LPO entries for station fuel purchases (if applicable)</li>
                      <li>PDF file downloaded with all DOs</li>
                    </ul>
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    View these orders in the <strong>Delivery Orders</strong> tab, fuel records in <strong>Fuel Records</strong>, and LPOs in <strong>LPO Management</strong>.
                  </p>
                  
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium">Show all created DOs</summary>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {createdOrders.map((order, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-700 p-2 rounded border border-gray-200 dark:border-gray-600">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">{order.doType}-{order.doNumber}</span>
                          <br />
                          <span className="text-gray-600 dark:text-gray-400">{order.truckNo}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 flex justify-between items-center">
            <div>
              {createdOrders.length > 0 && !isCreating && (
                <button
                  onClick={() => downloadAllAsPDF()}
                  className="px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded-md hover:bg-green-700 dark:hover:bg-green-600 flex items-center"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Download PDF Again
                </button>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isCreating}
                className={`px-4 py-2 border rounded-md shadow-sm text-sm font-medium ${
                  isCreating
                    ? 'opacity-50 cursor-not-allowed bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600'
                    : createdOrders.length > 0
                    ? 'bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 border-transparent'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600'
                }`}
              >
                {createdOrders.length > 0 ? 'Done' : 'Cancel'}
              </button>
              {parsedRows.length > 0 && createdOrders.length === 0 && (
                <button
                  onClick={generateDOs}
                  disabled={isCreating}
                  className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                    isCreating
                      ? 'opacity-50 cursor-not-allowed bg-gray-400 dark:bg-gray-600'
                      : 'bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600'
                  }`}
                >
                  {isCreating ? 'Creating...' : `Create ${parsedRows.length} ${commonData.doType}s`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkDOForm;
