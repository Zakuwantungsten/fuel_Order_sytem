import { useState, useEffect } from 'react';
import { Search, Filter, Plus, Download, Eye, Edit, Printer, FileSpreadsheet, List, BarChart3, FileDown, Ban, RotateCcw, FileEdit } from 'lucide-react';
import { DeliveryOrder, DOWorkbook as DOWorkbookType } from '../types';
import { fuelRecordsAPI, deliveryOrdersAPI, doWorkbookAPI } from '../services/api';
import fuelRecordService from '../services/fuelRecordService';
import FuelConfigService from '../services/fuelConfigService';
import DODetailModal from '../components/DODetailModal';
import DOForm from '../components/DOForm';
import BulkDOForm from '../components/BulkDOForm';
import MonthlySummary from '../components/MonthlySummary';
import BatchDOPrint from '../components/BatchDOPrint';
import DOWorkbook from '../components/DOWorkbook';
import CancelDOModal from '../components/CancelDOModal';
import AmendedDOsModal from '../components/AmendedDOsModal';
import { useAmendedDOs } from '../contexts/AmendedDOsContext';
import { cleanDeliveryOrders, isCorruptedDriverName } from '../utils/dataCleanup';
import Pagination from '../components/Pagination';

const DeliveryOrders = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'cancelled'>('all');
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkFormOpen, setIsBulkFormOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isAmendedDOsModalOpen, setIsAmendedDOsModalOpen] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState<DeliveryOrder | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'summary' | 'workbook'>('list');
  const [selectedOrders, setSelectedOrders] = useState<(string | number)[]>([]);
  const [batchPrintOrders, setBatchPrintOrders] = useState<DeliveryOrder[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  
  // Amended DOs context for session tracking
  const { addAmendedDO, count: amendedDOsCount } = useAmendedDOs();
  
  // Workbook state
  const [workbooks, setWorkbooks] = useState<DOWorkbookType[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | number | null>(null);
  const [exportingYear, setExportingYear] = useState<number | null>(null);

  useEffect(() => {
    loadOrders();
    fetchWorkbooks();
    fetchAvailableYears();
  }, [filterType]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await deliveryOrdersAPI.getAll({
        importOrExport: filterType,
      });
      // Ensure data is always an array and clean any corrupted data
      const rawOrders = Array.isArray(data) ? data : [];
      
      // Clean corrupted data and log any issues found
      const cleanedOrders = cleanDeliveryOrders(rawOrders);
      const corruptedCount = rawOrders.filter(order => isCorruptedDriverName(order.driverName)).length;
      
      if (corruptedCount > 0) {
        console.warn(`Found and cleaned ${corruptedCount} delivery orders with corrupted driver names`);
      }
      
      setOrders(cleanedOrders);
    } catch (error) {
      console.error('Failed to load delivery orders:', error);
      setOrders([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkbooks = async () => {
    try {
      const data = await doWorkbookAPI.getAll();
      setWorkbooks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching DO workbooks:', error);
      setWorkbooks([]);
    }
  };

  const fetchAvailableYears = async () => {
    try {
      const years = await doWorkbookAPI.getAvailableYears();
      if (years.length > 0) {
        setAvailableYears(years);
        setSelectedYear(years[0]); // Most recent year
      } else {
        const currentYear = new Date().getFullYear();
        setAvailableYears([currentYear]);
        setSelectedYear(currentYear);
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      const currentYear = new Date().getFullYear();
      setAvailableYears([currentYear]);
      setSelectedYear(currentYear);
    }
  };

  const handleExportWorkbook = async (year: number) => {
    try {
      setExportingYear(year);
      await doWorkbookAPI.exportWorkbook(year);
      alert(`✓ Workbook DELIVERY_ORDERS_${year}.xlsx downloaded successfully!`);
    } catch (error: any) {
      console.error('Error exporting workbook:', error);
      if (error.response?.status === 404) {
        alert(`No delivery orders found for year ${year}`);
      } else {
        alert('Failed to export workbook. Please try again.');
      }
    } finally {
      setExportingYear(null);
    }
  };

  const handleOpenWorkbook = (year: number) => {
    setSelectedYear(year);
    setSelectedWorkbookId(year);
  };

  const handleCloseWorkbook = () => {
    setSelectedWorkbookId(null);
    setActiveTab('list');
    fetchWorkbooks(); // Refresh workbooks list
  };

  // Filter orders by search term and status
  const filteredOrders = Array.isArray(orders) ? orders.filter(order => {
    // Search filter
    const matchesSearch = order.doNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.truckNo.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Status filter
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && !order.isCancelled) ||
      (filterStatus === 'cancelled' && order.isCancelled);
    
    return matchesSearch && matchesStatus;
  }) : [];

  // Pagination calculations
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Reset to page 1 when filters change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  // Reset page when search or filters change
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleFilterStatusChange = (value: 'all' | 'active' | 'cancelled') => {
    setFilterStatus(value);
    setCurrentPage(1);
  };

  const handleViewOrder = (order: DeliveryOrder) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOrder(null);
  };

  const handlePrintOrder = () => {
    window.print();
  };

  const handleNewDO = () => {
    setEditingOrder(null);
    setIsFormOpen(true);
  };

  const handleEditOrder = (order: DeliveryOrder) => {
    console.log('Editing order:', order);
    console.log('Order ID:', order.id, 'Order _id:', (order as any)._id);
    setEditingOrder(order);
    setIsFormOpen(true);
  };

  const handleSaveOrder = async (orderData: Partial<DeliveryOrder>): Promise<DeliveryOrder | void> => {
    try {
      console.log('Saving order:', orderData);
      console.log('editingOrder:', editingOrder);
      console.log('editingOrder?.id:', editingOrder?.id);
      
      // Save the DO first
      let savedOrder: DeliveryOrder;
      let fieldsChanged: string[] = [];
      
      // Check for id in multiple formats
      const orderId = editingOrder?.id || (editingOrder as any)?._id;
      
      if (orderId) {
        // Track which fields changed for amended DOs tracking
        const originalOrder = editingOrder!;
        const editableFields = ['truckNo', 'trailerNo', 'destination', 'loadingPoint', 'tonnages', 'ratePerTon', 'driverName', 'clientName', 'haulier', 'containerNo', 'invoiceNos', 'cargoType'];
        
        editableFields.forEach(field => {
          const oldValue = originalOrder[field as keyof DeliveryOrder];
          const newValue = orderData[field as keyof DeliveryOrder];
          if (oldValue !== newValue && newValue !== undefined) {
            fieldsChanged.push(field);
          }
        });
        
        // Update existing DO - now returns { order, cascadeResults }
        const result = await deliveryOrdersAPI.update(orderId, orderData);
        savedOrder = result.order;
        
        // Add to amended DOs session list if any fields changed
        if (fieldsChanged.length > 0) {
          addAmendedDO(savedOrder, fieldsChanged);
          console.log(`DO ${savedOrder.doNumber} added to amended list. Changed fields:`, fieldsChanged);
        }
        
        // Log cascade results if any
        if (result.cascadeResults) {
          console.log('Cascade update results:', result.cascadeResults);
          if (result.cascadeResults.fuelRecordUpdated) {
            console.log('Fuel record updated with changes:', result.cascadeResults.fuelRecordChanges);
          }
          if (result.cascadeResults.lpoEntriesUpdated > 0) {
            console.log(`${result.cascadeResults.lpoEntriesUpdated} LPO entries updated`);
          }
        }
      } else {
        // Create new DO
        savedOrder = await deliveryOrdersAPI.create(orderData);
        
        // Handle fuel record creation/update based on import/export (only for new DOs)
        if (savedOrder.importOrExport === 'IMPORT') {
          // IMPORT = Going journey = Create new fuel record
          await handleCreateFuelRecordForImport(savedOrder);
        } else if (savedOrder.importOrExport === 'EXPORT') {
          // EXPORT = Return journey = Update existing fuel record
          await handleUpdateFuelRecordForExport(savedOrder);
        }
      }
      
      loadOrders();
      return savedOrder;
    } catch (error) {
      console.error('Failed to save order:', error);
      alert('Failed to save delivery order');
    }
  };

  // Cancel DO handler
  const handleOpenCancelModal = (order: DeliveryOrder) => {
    setCancellingOrder(order);
    setIsCancelModalOpen(true);
  };

  const handleCloseCancelModal = () => {
    setIsCancelModalOpen(false);
    setCancellingOrder(null);
  };

  const handleConfirmCancel = async () => {
    const orderId = cancellingOrder?.id || (cancellingOrder as any)?._id;
    if (!orderId) return;
    
    setIsCancelling(true);
    try {
      const result = await deliveryOrdersAPI.cancel(orderId);
      
      console.log('DO cancelled:', result.order.doNumber);
      console.log('Cascade results:', result.cascadeResults);
      
      // Show success message with cascade info
      let message = `Delivery Order ${result.order.doType}-${result.order.doNumber} has been cancelled.`;
      if (result.cascadeResults) {
        if (result.cascadeResults.fuelRecordCancelled) {
          message += '\n• Associated fuel record cancelled';
        }
        if (result.cascadeResults.lpoEntriesCancelled > 0) {
          message += `\n• ${result.cascadeResults.lpoEntriesCancelled} LPO entries cancelled`;
        }
      }
      
      alert(message);
      handleCloseCancelModal();
      loadOrders();
    } catch (error: any) {
      console.error('Failed to cancel order:', error);
      const errorMessage = error.response?.data?.message || 'Failed to cancel delivery order';
      alert(errorMessage);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCreateFuelRecordForImport = async (deliveryOrder: DeliveryOrder) => {
    try {
      console.log('  → Generating fuel record for DO:', deliveryOrder.doNumber);
      
      // Check if truck already has an open fuel record (without returnDo)
      // This validation only applies to IMPORT DOs (going journey)
      const allRecords = await fuelRecordsAPI.getAll();
      const existingOpenRecord = allRecords.find(
        (record: any) => record.truckNo === deliveryOrder.truckNo && !record.returnDo
      );
      
      if (existingOpenRecord) {
        const message = `Truck ${deliveryOrder.truckNo} already has an open fuel record (Going DO: ${existingOpenRecord.goingDo}). Please complete the return journey (Export DO) first before creating a new IMPORT fuel record.`;
        console.warn('  ✗', message);
        alert(message);
        throw new Error(message);
      }
      
      // Get total liters based on destination
      const totalLiters = FuelConfigService.getTotalLitersByDestination(deliveryOrder.destination);
      console.log(`  → Destination: ${deliveryOrder.destination}, Total Liters: ${totalLiters}`);
      
      // For now, use default loading point. Later, this can come from a configuration dialog
      const loadingPoint: 'DAR_YARD' | 'KISARAWE' | 'DAR_STATION' = 'DAR_YARD';
      console.log('  → Loading point:', loadingPoint);
      
      // Generate fuel record (checkpoints will be empty until LPOs are created)
      const { fuelRecord, lposToGenerate } = fuelRecordService.createFuelRecordFromDO(
        deliveryOrder,
        loadingPoint,
        totalLiters
      );
      
      console.log('  → Fuel record to create:', JSON.stringify(fuelRecord, null, 2));
      console.log('  → LPOs to generate:', lposToGenerate.length);
      
      // Create the fuel record
      const createdRecord = await fuelRecordsAPI.create(fuelRecord);
      console.log('  ✓ Created fuel record with ID:', createdRecord.id);
      
      // Note: LPOs will be created manually as fuel is ordered, not automatically
      if (lposToGenerate.length > 0) {
        console.log(`  → ${lposToGenerate.length} LPOs can be generated when fuel is ordered`);
      } else {
        console.log('  → Fuel record created with empty checkpoints (ready for fuel orders)');
      }
      
      console.log(`  ✓✓ Fuel record created successfully for DO-${deliveryOrder.doNumber}`);
    } catch (error: any) {
      console.error('  ✗ Failed to create fuel record:', error);
      console.error('  ✗ Error details:', error.response?.data);
      throw error; // Re-throw to be caught by parent
    }
  };

  const handleUpdateFuelRecordForExport = async (deliveryOrder: DeliveryOrder) => {
    try {
      // Find the matching going record for this truck
      const allRecords = await fuelRecordsAPI.getAll();
      const matchingRecord = fuelRecordService.findMatchingGoingRecord(
        deliveryOrder.truckNo,
        allRecords
      );
      
      if (!matchingRecord) {
        console.warn('No matching going record found for truck:', deliveryOrder.truckNo);
        alert(`Warning: No fuel record found for truck ${deliveryOrder.truckNo}. Return DO saved, but fuel record not updated.`);
        return;
      }
      
      // Use the service function to properly update returnDo, from, and to fields
      const { updatedRecord } = fuelRecordService.updateFuelRecordWithReturnDO(
        matchingRecord,
        deliveryOrder
      );
      
      // Update the fuel record with proper from/to reversal
      // MongoDB returns _id but we need to check for both id and _id
      const recordId = matchingRecord.id || (matchingRecord as any)._id;
      
      if (!recordId) {
        console.error('❌ No ID found on fuel record:', matchingRecord);
        throw new Error('Fuel record has no ID');
      }
      
      console.log('→ Updating fuel record ID:', recordId);
      await fuelRecordsAPI.update(recordId, updatedRecord);
      console.log('✓ Updated fuel record with return DO:', deliveryOrder.doNumber);
      console.log('  - Updated from:', updatedRecord.from);
      console.log('  - Updated to:', updatedRecord.to);
      console.log('  - Return DO:', updatedRecord.returnDo);
      
      alert(`Fuel record updated with return DO-${deliveryOrder.doNumber}`);
    } catch (error) {
      console.error('❌ Failed to update fuel record:', error);
      alert('Delivery order saved, but fuel record update failed. Please update manually.');
    }
  };

  const handleSaveBulkOrders = async (orders: Partial<DeliveryOrder>[]): Promise<boolean> => {
    try {
      console.log('=== Starting Bulk DO Creation ===');
      console.log(`Total orders to create: ${orders.length}`);
      const createdOrders: DeliveryOrder[] = [];
      
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        console.log(`\n[${i + 1}/${orders.length}] Creating DO:`, order.doNumber, order.importOrExport);
        
        const savedOrder = await deliveryOrdersAPI.create(order);
        console.log(`✓ DO ${savedOrder.doNumber} saved successfully with ID:`, savedOrder.id);
        createdOrders.push(savedOrder);
        
        // Handle fuel record creation/update based on import/export
        if (savedOrder.importOrExport === 'IMPORT') {
          console.log(`→ Creating fuel record for IMPORT DO ${savedOrder.doNumber}`);
          await handleCreateFuelRecordForImport(savedOrder);
          console.log(`✓ Fuel record created for DO ${savedOrder.doNumber}`);
        } else if (savedOrder.importOrExport === 'EXPORT') {
          console.log(`→ Updating fuel record for EXPORT DO ${savedOrder.doNumber}`);
          await handleUpdateFuelRecordForExport(savedOrder);
          console.log(`✓ Fuel record updated for DO ${savedOrder.doNumber}`);
        }
      }
      
      console.log('\n=== Reloading orders list ===');
      await loadOrders();
      console.log(`\n✓✓✓ Successfully created ${createdOrders.length} delivery orders`);
      return true;
    } catch (error: any) {
      console.error('✗✗✗ Failed to save bulk orders:', error);
      console.error('Error details:', error.response?.data);
      const errorMessage = error.response?.data?.message || error.response?.data?.errors?.[0]?.msg || 'Failed to create some delivery orders';
      alert(errorMessage);
      return false;
    }
  };

  const handleSelectOrder = (orderId: string | number) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const handleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id).filter((id): id is string | number => id !== undefined));
    }
  };

  const handleBatchPrint = () => {
    const ordersToPrint = orders.filter(o => o.id && selectedOrders.includes(o.id));
    setBatchPrintOrders(ordersToPrint);
    setTimeout(() => {
      window.print();
      setBatchPrintOrders([]);
    }, 100);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Delivery Orders</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage all delivery orders and transportation records
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-3">
          {selectedOrders.length > 0 && (
            <button 
              onClick={handleBatchPrint}
              className="inline-flex items-center px-4 py-2 border border-primary-600 dark:border-primary-500 rounded-md shadow-sm text-sm font-medium text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-gray-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print {selectedOrders.length} DO{selectedOrders.length > 1 ? 's' : ''}
            </button>
          )}
          <button 
            onClick={() => handleExportWorkbook(new Date().getFullYear())}
            disabled={exportingYear !== null}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {exportingYear ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export
              </>
            )}
          </button>
          <button 
            onClick={() => setIsAmendedDOsModalOpen(true)}
            className="relative inline-flex items-center px-4 py-2 border border-orange-300 dark:border-orange-600 rounded-md shadow-sm text-sm font-medium text-orange-700 dark:text-orange-200 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40"
            title="Download amended DOs as PDF"
          >
            <FileEdit className="w-4 h-4 mr-2" />
            Amended DOs
            {amendedDOsCount > 0 && (
              <span className="absolute -top-2 -right-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-orange-600 rounded-full">
                {amendedDOsCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setIsBulkFormOpen(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Bulk Create
          </button>
          <button 
            onClick={handleNewDO}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New DO
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('list')}
            className={`${
              activeTab === 'list'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <List className="w-4 h-4 mr-2" />
            All Orders
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`${
              activeTab === 'summary'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Monthly Summary
          </button>
          <button
            onClick={() => setActiveTab('workbook')}
            className={`${
              activeTab === 'workbook'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Workbook
          </button>
        </nav>
      </div>

      {/* Conditional Content */}
      {activeTab === 'workbook' ? (
        selectedWorkbookId ? (
          <div className="h-[calc(100vh-200px)]">
            <DOWorkbook 
              workbookId={selectedWorkbookId} 
              onClose={handleCloseWorkbook}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-6 transition-colors">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">DO Workbooks by Year</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Each workbook contains individual sheets for each delivery order</p>
              </div>
            </div>
            
            {/* Year Selection for Export */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Export Workbook</h3>
              <div className="flex items-center gap-4">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>DELIVERY ORDERS {year}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleExportWorkbook(selectedYear)}
                  disabled={exportingYear !== null}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                >
                  {exportingYear === selectedYear ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Exporting...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4 mr-2" />
                      Download Excel
                    </>
                  )}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workbooks.map((workbook) => (
                <div
                  key={workbook.id || workbook.year}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {workbook.name}
                        </h3>
                      </div>
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        <p>{workbook.sheetCount || 0} delivery orders</p>
                        <p>Year: {workbook.year}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenWorkbook(workbook.year)}
                        className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleExportWorkbook(workbook.year)}
                        disabled={exportingYear === workbook.year}
                        className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                      >
                        {exportingYear === workbook.year ? '...' : 'Export'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {workbooks.length === 0 && (
                <div className="col-span-full text-center py-8">
                  <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 mb-2">No workbooks found</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Workbooks are generated automatically from your delivery orders</p>
                </div>
              )}
            </div>
          </div>
        )
      ) : activeTab === 'list' ? (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-4 mb-6 transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by DO#, Truck, Client..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>
              <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="ALL">All Types</option>
                <option value="IMPORT">Import</option>
                <option value="EXPORT">Export</option>
              </select>
              <select 
                value={filterStatus}
                onChange={(e) => handleFilterStatusChange(e.target.value as 'all' | 'active' | 'cancelled')}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <input
                type="date"
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <button className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                <Filter className="w-4 h-4 mr-2" />
                More Filters
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg overflow-hidden transition-colors">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">DO Number</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Client</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Truck</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Destination</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Tonnage</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {loading ? (
                    <tr key="loading-row">
                      <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        Loading data...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr key="empty-row">
                      <td colSpan={10} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                        No delivery orders found
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order) => (
                      <tr 
                        key={order.id || `order-${order.doNumber}`} 
                        className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                          order.isCancelled ? 'bg-red-50 dark:bg-red-900/10' : ''
                        }`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={order.id ? selectedOrders.includes(order.id) : false}
                            onChange={() => order.id && handleSelectOrder(order.id)}
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600"
                            disabled={order.isCancelled}
                          />
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                          order.isCancelled 
                            ? 'text-gray-400 dark:text-gray-500 line-through' 
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {order.doType}-{order.doNumber}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            order.isCancelled
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                              : order.importOrExport === 'IMPORT' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' 
                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          }`}>
                            {order.importOrExport}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {order.isCancelled ? (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                              <Ban className="w-3 h-3 mr-1" />
                              Cancelled
                            </span>
                          ) : (
                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                              Active
                            </span>
                          )}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.clientName}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.truckNo}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.destination}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.tonnages} tons
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button 
                            onClick={() => handleViewOrder(order)}
                            className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 mr-3"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!order.isCancelled && (
                            <>
                              <button 
                                onClick={() => handleEditOrder(order)}
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300 mr-3" 
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenCancelModal(order)}
                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300" 
                                title="Cancel DO"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {order.isCancelled && order.cancellationReason && (
                            <span 
                              className="text-gray-400 dark:text-gray-500 cursor-help" 
                              title={`Cancelled: ${order.cancellationReason}`}
                            >
                              <RotateCcw className="w-4 h-4 inline" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {!loading && filteredOrders.length > 0 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredOrders.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            )}
          </div>
        </>
      ) : activeTab === 'summary' ? (
        <MonthlySummary orders={orders} />
      ) : null}

      {/* DO Detail Modal */}
      {selectedOrder && (
        <DODetailModal
          order={selectedOrder}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onEdit={() => {
            handleCloseModal();
            handleEditOrder(selectedOrder);
          }}
          onPrint={handlePrintOrder}
        />
      )}

      {/* Batch DO Print */}
      {batchPrintOrders.length > 0 && (
        <BatchDOPrint 
          orders={batchPrintOrders}
          clientName={batchPrintOrders[0]?.clientName}
        />
      )}

      {/* DO Form for Create/Edit */}
      <DOForm
        order={editingOrder || undefined}
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSaveOrder}
      />

      {/* Bulk DO Form */}
      <BulkDOForm
        isOpen={isBulkFormOpen}
        onClose={() => setIsBulkFormOpen(false)}
        onSave={handleSaveBulkOrders}
      />

      {/* Cancel DO Modal */}
      {cancellingOrder && (
        <CancelDOModal
          order={cancellingOrder}
          isOpen={isCancelModalOpen}
          onClose={handleCloseCancelModal}
          onConfirm={handleConfirmCancel}
          isLoading={isCancelling}
        />
      )}

      {/* Amended DOs Modal */}
      <AmendedDOsModal
        isOpen={isAmendedDOsModalOpen}
        onClose={() => setIsAmendedDOsModalOpen(false)}
      />
    </div>
  );
};

export default DeliveryOrders;
