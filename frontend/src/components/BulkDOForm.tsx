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
}

interface BulkDORow {
  truckNo: string;
  trailerNo: string;
  driverName: string;
  tonnages: number;
  ratePerTon: number;
}

const BulkDOForm = ({ isOpen, onClose, onSave }: BulkDOFormProps) => {
  const [commonData, setCommonData] = useState({
    date: (() => {
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      return `${year}-${month}-${day}`;
    })(),
    importOrExport: 'IMPORT' as 'IMPORT' | 'EXPORT',
    doType: 'DO' as 'DO' | 'SDO',
    clientName: '',
    loadingPoint: '',
    destination: '',
    haulier: '',
    containerNo: 'LOOSE CARGO',
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
    setCommonData(prev => ({ ...prev, doType: newType }));
    
    // Fetch next number for the selected type
    const nextNumber = await deliveryOrdersAPI.getNextNumber(newType);
    setCommonData(prev => ({ ...prev, startingNumber: nextNumber.toString() }));
  };

  const parseBulkData = () => {
    const lines = bulkInput.trim().split('\n');
    const rows: BulkDORow[] = [];

    for (const line of lines) {
      const parts = line.split('\t').map(p => p.trim());
      if (parts.length >= 5) {
        rows.push({
          truckNo: parts[0],
          trailerNo: parts[1],
          driverName: parts[2],
          tonnages: parseFloat(parts[3]) || 0,
          ratePerTon: parseFloat(parts[4]) || 0,
        });
      }
    }

    setParsedRows(rows);
  };

  const generateDOs = async () => {
    try {
      console.log('=== Starting Bulk DO Generation ===');
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
        containerNo: commonData.containerNo,
        loadingPoint: commonData.loadingPoint,
        destination: commonData.destination,
        haulier: commonData.haulier || '',
        tonnages: row.tonnages,
        ratePerTon: row.ratePerTon,
      }));

      console.log(`Generated ${orders.length} orders to save`);
      
      // Pad DO numbers with leading zeros
      const paddedOrders = orders.map(order => ({
        ...order,
        doNumber: order.doNumber?.toString().padStart(4, '0') || '0001'
      }));
      
      // Set created orders FIRST before saving
      setCreatedOrders(paddedOrders);
      
      // Wait for state update to propagate
      await new Promise(resolve => setTimeout(resolve, 100));
      
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
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Automatically download PDF
      console.log('Starting PDF download...');
      try {
        await downloadAllAsPDF();
        console.log('✓ PDF downloaded successfully!');
        
        // Show success message with download confirmation
        alert(`✓ Success!\n\nCreated ${orders.length} delivery orders with fuel records and LPOs.\n\nPDF file has been downloaded to your Downloads folder.`);
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

  const downloadAllAsPDF = async () => {
    if (createdOrders.length === 0) {
      console.warn('No orders available for PDF generation');
      return;
    }

    try {
      console.log(`Generating PDF for ${createdOrders.length} orders...`);
      
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
        for (let i = 0; i < createdOrders.length; i++) {
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
          
          console.log(`Added DO ${i + 1}/${createdOrders.length} to PDF`);
        }
      } finally {
        // Restore original container styles
        if (hiddenContainer) {
          hiddenContainer.style.cssText = containerOriginalStyle;
        }
      }

      const startNum = parseInt(commonData.startingNumber);
      const endNum = startNum + createdOrders.length - 1;
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
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          {/* Header */}
          <div className="bg-primary-600 px-6 py-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Bulk Delivery Order Creation
            </h3>
            <button onClick={onClose} className="p-2 text-white hover:bg-primary-700 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <div className="bg-white px-6 py-6 max-h-[80vh] overflow-y-auto">
            {/* Common Information */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase">
                Common Information (Applied to All DOs)
              </h4>
              
              {/* DO/SDO Type Selector - Full width */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">DO (Delivery Order)</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      name="doType"
                      value="SDO"
                      checked={commonData.doType === 'SDO'}
                      onChange={handleDOTypeChange}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">SDO (Special Delivery Order)</span>
                  </label>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Starting {commonData.doType} Number *
                  </label>
                  <input
                    type="text"
                    name="startingNumber"
                    value={commonData.startingNumber}
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={`e.g., 6433`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Numbers will increment from this value
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    name="clientName"
                    value={commonData.clientName}
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter client name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={commonData.date}
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Import/Export *</label>
                  <select
                    name="importOrExport"
                    value={commonData.importOrExport}
                    onChange={handleCommonChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="IMPORT">IMPORT</option>
                    <option value="EXPORT">EXPORT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loading Point *
                  </label>
                  <input
                    type="text"
                    name="loadingPoint"
                    value={commonData.loadingPoint}
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., DAR"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Destination *
                  </label>
                  <input
                    type="text"
                    name="destination"
                    value={commonData.destination}
                    onChange={handleCommonChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., CCR KOLWEZI"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Haulier</label>
                  <input
                    type="text"
                    name="haulier"
                    value={commonData.haulier}
                    onChange={handleCommonChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter haulier name (optional)"
                  />
                </div>
              </div>
            </div>

            {/* Bulk Data Input */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase">
                Truck Details (Paste from Excel/Spreadsheet)
              </h4>
              <p className="text-sm text-gray-600 mb-2">
                Paste data with columns: <span className="font-mono bg-gray-100 px-2 py-1 rounded">Truck No &nbsp;&nbsp; Trailer No &nbsp;&nbsp; Driver Name &nbsp;&nbsp; Tonnage &nbsp;&nbsp; Rate Per Ton</span>
              </p>
              <textarea
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                placeholder="T844 EKS&#9;T629 ELE&#9;John Doe&#9;30&#9;1850&#10;T845 ABC&#9;T630 DEF&#9;Jane Smith&#9;28&#9;1850"
              />
              <button
                type="button"
                onClick={parseBulkData}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Parse Data ({bulkInput.split('\n').filter(l => l.trim()).length} rows)
              </button>
            </div>

            {/* Preview of created orders */}
            {createdOrders.length > 0 && (
              <div className="mb-6 border-2 border-green-500 rounded-lg">
                <div className="bg-green-50 px-4 py-3 border-b border-green-200">
                  <h4 className="text-base font-semibold text-green-800 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Successfully Created {createdOrders.length} Delivery Orders!
                  </h4>
                </div>
                <div className="p-4">
                  <div className="mb-3">
                    <p className="text-sm text-gray-700 mb-1 font-medium">What was created:</p>
                    <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                      <li><strong>{createdOrders.length}</strong> Delivery Orders ({commonData.doType}-{commonData.startingNumber} to {commonData.doType}-{parseInt(commonData.startingNumber) + createdOrders.length - 1})</li>
                      <li><strong>{createdOrders.length}</strong> Fuel Records with automatic fuel allocations</li>
                      <li>LPO entries for station fuel purchases (if applicable)</li>
                      <li>PDF file downloaded with all DOs</li>
                    </ul>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">
                    View these orders in the <strong>Delivery Orders</strong> tab, fuel records in <strong>Fuel Records</strong>, and LPOs in <strong>LPO Management</strong>.
                  </p>
                  
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-medium">Show all created DOs</summary>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {createdOrders.map((order, idx) => (
                        <div key={idx} className="bg-white p-2 rounded border border-gray-200">
                          <span className="font-semibold">{order.doType}-{order.doNumber}</span>
                          <br />
                          <span className="text-gray-600">{order.truckNo}</span>
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
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
            <div>
              {createdOrders.length > 0 && (
                <button
                  onClick={downloadAllAsPDF}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
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
                    ? 'bg-primary-600 text-white hover:bg-primary-700 border-transparent'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300'
                }`}
              >
                {createdOrders.length > 0 ? 'Done' : 'Cancel'}
              </button>
              {parsedRows.length > 0 && createdOrders.length === 0 && (
                <button
                  onClick={generateDOs}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                >
                  Create {parsedRows.length} DOs
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
