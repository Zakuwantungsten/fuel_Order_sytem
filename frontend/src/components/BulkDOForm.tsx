import { useState, useEffect } from 'react';
import { X, FileDown, Plus } from 'lucide-react';
import { DeliveryOrder } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import DeliveryNotePrint from './DeliveryNotePrint';
import { deliveryOrdersAPI } from '../services/api';

interface BulkDOFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (orders: Partial<DeliveryOrder>[]) => Promise<boolean>;
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
          startingNumber: nextNumber.toString(),
        }));
      };
      fetchNextNumber();
    }
  }, [isOpen, commonData.doType]);

  const [bulkInput, setBulkInput] = useState('');
  const [parsedRows, setParsedRows] = useState<BulkDORow[]>([]);
  const [createdOrders, setCreatedOrders] = useState<Partial<DeliveryOrder>[]>([]);

  const handleCommonChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setCommonData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDOTypeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newType = e.target.value as 'DO' | 'SDO';
    
    // Fetch next number for the selected type
    const nextNumber = await deliveryOrdersAPI.getNextNumber(newType);
    
    // Update both doType and startingNumber together
    setCommonData(prev => ({ 
      ...prev, 
      doType: newType,
      startingNumber: nextNumber.toString()
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
              truckNo: parts[0],
              trailerNo: parts[1],
              driverName: parts[2],
              tonnages: tonnage,
              ratePerTon: rate,
              totalAmount: tonnage * rate,
            });
          }
        } else {
          // fixed_total: Format: Truck | Trailer | Driver | Total Amount
          if (parts.length >= 4) {
            const totalAmount = parseFloat(parts[3]) || 0;
            rows.push({
              truckNo: parts[0],
              trailerNo: parts[1],
              driverName: parts[2],
              tonnages: 0,
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
          : 'Truck No | Trailer No | Driver Name | Total Amount';
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
      
      const startNum = parseInt(commonData.startingNumber) || 0;
      
      const orders: Partial<DeliveryOrder>[] = parsedRows.map((row, index) => ({
        sn: index + 1,
        date: commonData.date,
        importOrExport: commonData.importOrExport,
        doType: commonData.doType,
        doNumber: (startNum + index).toString(),
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
      
      // Pad DO numbers with leading zeros
      const paddedOrders = orders.map(order => ({
        ...order,
        doNumber: order.doNumber?.toString().padStart(4, '0') || '0001'
      }));
      
      // Set created orders for display and manual re-download
      setCreatedOrders(paddedOrders);
      
      // Save to backend
      console.log('Calling onSave with orders...');
      const success = await onSave(paddedOrders);
      
      if (!success) {
        console.error('onSave returned false');
        setCreatedOrders([]);
        alert('Failed to create delivery orders. Check console for details.');
        return;
      }
      
      console.log('✓ All orders saved successfully!');
      
      // Wait for DOM to render the hidden DO elements
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Automatically download PDF - pass orders directly to avoid state timing issues
      console.log('Starting PDF download...');
      try {
        await downloadAllAsPDF(paddedOrders);
        console.log('✓ PDF downloaded successfully!');
        
        // Show success message with download confirmation - dynamic based on order type
        const orderTypeLabel = commonData.doType === 'SDO' ? 'special delivery orders (SDOs)' : 'delivery orders';
        const additionalInfo = commonData.doType === 'SDO' 
          ? '' 
          : ' with fuel records and LPOs';
        
        alert(`✓ Success!\n\nCreated ${orders.length} ${orderTypeLabel}${additionalInfo}.\n\nPDF file has been downloaded to your Downloads folder.`);
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
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
      console.log(`Generating PDF for ${orders.length} orders...`);
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      let isFirstPage = true;
      let successCount = 0;

      // Get the container with hidden elements and move it into view temporarily
      const hiddenContainer = document.getElementById('bulk-do-hidden-container');
      const containerOriginalStyle = hiddenContainer?.style.cssText || '';
      
      if (hiddenContainer) {
        // Move container into view but make it invisible to user
        hiddenContainer.style.position = 'absolute';
        hiddenContainer.style.left = '0';
        hiddenContainer.style.top = '0';
        hiddenContainer.style.visibility = 'visible';
        hiddenContainer.style.opacity = '0';
        hiddenContainer.style.pointerEvents = 'none';
        hiddenContainer.style.zIndex = '-9999';
      }
      
      // Wait for container repositioning
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        for (let i = 0; i < orders.length; i++) {
          const element = document.getElementById(`bulk-do-${i}`);
          
          if (!element) {
            console.error(`Element bulk-do-${i} not found - skipping`);
            continue;
          }
          
          // Wait for images and content to load
          await new Promise(resolve => setTimeout(resolve, 150));
          
          const canvas = await html2canvas(element, {
            scale: 3,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            imageTimeout: 0,
            windowWidth: 816,
            onclone: (_clonedDoc, clonedElement) => {
              // Ensure cloned element is properly visible in the clone
              clonedElement.style.visibility = 'visible';
              clonedElement.style.opacity = '1';
            }
          });
          
          const imgData = canvas.toDataURL('image/png', 1.0);
          
          // A4 dimensions in mm
          const pdfWidth = 210;
          
          // Calculate dimensions to fit the content (3/4 width as per image)
          const targetWidth = pdfWidth * 0.75; // 157.5mm width
          const imgHeight = (canvas.height * targetWidth) / canvas.width;
          
          // Center horizontally
          const xOffset = (pdfWidth - targetWidth) / 2;
          const yOffset = 10; // Top margin
          
          if (!isFirstPage) {
            pdf.addPage();
          }
          isFirstPage = false;
          
          pdf.addImage(imgData, 'PNG', xOffset, yOffset, targetWidth, imgHeight);
          successCount++;
          
          console.log(`Added DO ${i + 1}/${orders.length} to PDF`);
        }
      } finally {
        // Restore original container styles
        if (hiddenContainer) {
          hiddenContainer.style.cssText = containerOriginalStyle;
        }
      }

      const startNum = parseInt(commonData.startingNumber);
      const endNum = startNum + orders.length - 1;
      const paddedStart = startNum.toString().padStart(4, '0');
      const paddedEnd = endNum.toString().padStart(4, '0');
      const fileName = `${commonData.doType}-${paddedStart}-${paddedEnd}.pdf`;
      pdf.save(fileName);
      
      console.log(`✓ Successfully generated PDF with ${successCount} delivery orders`);
      console.log(`PDF filename: ${fileName}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
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
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          {/* Header */}
          <div className="bg-primary-600 dark:bg-primary-700 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Bulk Delivery Order Creation
            </h3>
            <button onClick={onClose} className="p-2 text-white hover:bg-primary-700 dark:hover:bg-primary-600 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Cargo Type *
                  </label>
                  <select
                    name="cargoType"
                    value={commonData.cargoType}
                    onChange={(e) => {
                      const cargoType = e.target.value as 'loosecargo' | 'container';
                      setCommonData(prev => ({ 
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Rate Structure *
                  </label>
                  <select
                    name="rateType"
                    value={commonData.rateType}
                    onChange={(e) => {
                      setCommonData(prev => ({ 
                        ...prev, 
                        rateType: e.target.value as 'per_ton' | 'fixed_total'
                      }));
                      // Clear parsed rows when changing rate type
                      setParsedRows([]);
                      setBulkInput('');
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="per_ton">Per Ton Rate (Tonnage × Rate)</option>
                    <option value="fixed_total">Fixed Total Amount</option>
                  </select>
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
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={`e.g., 6433`}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Numbers will increment from this value
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
                    <select
                      name="importOrExport"
                      value={commonData.importOrExport}
                      onChange={handleCommonChange}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="IMPORT">IMPORT</option>
                      <option value="EXPORT">EXPORT</option>
                    </select>
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
                  : 'Required columns: Truck No | Trailer No | Driver Name | Total Amount'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                <strong>Example:</strong> {commonData.rateType === 'per_ton' 
                  ? 'T538 EKT [TAB] T637 ELE [TAB] John Doe [TAB] 32 [TAB] 185'
                  : 'T538 EKT [TAB] T637 ELE [TAB] John Doe [TAB] 5920'}
              </p>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                placeholder={commonData.rateType === 'per_ton'
                  ? "T844 EKS\tT629 ELE\tJohn Doe\t30\t1850\nT845 ABC\tT630 DEF\tJane Smith\t28\t1850"
                  : "T844 EKS\tT629 ELE\tJohn Doe\t55500\nT845 ABC\tT630 DEF\tJane Smith\t51800"}
              />
              <button
                type="button"
                onClick={parseBulkData}
                className="mt-2 px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600"
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
                      <li><strong>{createdOrders.length}</strong> Delivery Orders ({commonData.doType}-{commonData.startingNumber} to {commonData.doType}-{parseInt(commonData.startingNumber) + createdOrders.length - 1})</li>
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

            {/* Hidden elements for PDF generation */}
            {createdOrders.length > 0 && (
              <div 
                id="bulk-do-hidden-container"
                style={{ 
                  position: 'fixed', 
                  left: '-9999px', 
                  top: 0, 
                  width: '816px',
                  visibility: 'hidden'
                }}
              >
                {createdOrders.map((order, idx) => (
                  <div key={idx} id={`bulk-do-${idx}`} style={{ 
                    width: '816px', 
                    backgroundColor: 'white',
                    padding: '20px',
                    marginBottom: '20px'
                  }}>
                    <DeliveryNotePrint order={order as DeliveryOrder} showOnScreen={true} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-4 flex justify-between items-center">
            <div>
              {createdOrders.length > 0 && (
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
                className={`px-4 py-2 border rounded-md shadow-sm text-sm font-medium ${
                  createdOrders.length > 0
                    ? 'bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 border-transparent'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600'
                }`}
              >
                {createdOrders.length > 0 ? 'Done' : 'Cancel'}
              </button>
              {parsedRows.length > 0 && createdOrders.length === 0 && (
                <button
                  onClick={generateDOs}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600"
                >
                  Create {parsedRows.length} {commonData.doType}s
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
