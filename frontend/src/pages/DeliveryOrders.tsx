import { useState, useEffect } from 'react';
import { Search, Plus, Download, Eye, Edit, Printer, FileSpreadsheet, List, BarChart3, FileDown, Ban, RotateCcw, FileEdit } from 'lucide-react';
import { DeliveryOrder, DOWorkbook as DOWorkbookType } from '../types';
import { fuelRecordsAPI, deliveryOrdersAPI, doWorkbookAPI, sdoWorkbookAPI } from '../services/api';
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
  const [filterDoType, setFilterDoType] = useState<'ALL' | 'DO' | 'SDO'>('DO'); // Filter by DO or SDO type
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
  const [previousFilterDoType, setPreviousFilterDoType] = useState<'ALL' | 'DO' | 'SDO'>('DO'); // Remember filter before opening workbook
  const [exportingYear, setExportingYear] = useState<number | null>(null);

  useEffect(() => {
    loadOrders();
    fetchWorkbooks();
    fetchAvailableYears();
  }, [filterType, filterDoType]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await deliveryOrdersAPI.getAll({
        importOrExport: filterType,
        doType: filterDoType === 'ALL' ? undefined : filterDoType,
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
      // Fetch workbooks based on current filter
      if (filterDoType === 'ALL') {
        // Fetch both DO and SDO workbooks
        const [doData, sdoData] = await Promise.all([
          doWorkbookAPI.getAll().catch((err) => { console.error('DO workbook fetch error:', err); return []; }),
          sdoWorkbookAPI.getAll().catch((err) => { console.error('SDO workbook fetch error:', err); return []; })
        ]);
        console.log('Raw DO data:', doData);
        console.log('Raw SDO data:', sdoData);
        const allWorkbooks = [
          ...(Array.isArray(doData) ? doData.map(w => ({ ...w, type: 'DO' as const })) : []),
          ...(Array.isArray(sdoData) ? sdoData.map(w => ({ ...w, type: 'SDO' as const })) : [])
        ].sort((a, b) => (b.year || 0) - (a.year || 0)); // Sort by year descending
        setWorkbooks(allWorkbooks);
        console.log('Fetched ALL workbooks (DO + SDO):', allWorkbooks);
        console.log('DO workbooks count:', allWorkbooks.filter(w => w.type === 'DO').length);
        console.log('SDO workbooks count:', allWorkbooks.filter(w => w.type === 'SDO').length);
      } else {
        const data = filterDoType === 'SDO' 
          ? await sdoWorkbookAPI.getAll()
          : await doWorkbookAPI.getAll();
        const typedData = Array.isArray(data) ? data.map(w => ({ ...w, type: filterDoType as 'DO' | 'SDO' })) : [];
        setWorkbooks(typedData);
        console.log(`Fetched ${filterDoType} workbooks:`, typedData);
      }
    } catch (error) {
      console.error('Error fetching workbooks:', error);
      setWorkbooks([]);
    }
  };

  const fetchAvailableYears = async () => {
    try {
      // Fetch years based on current filter
      if (filterDoType === 'ALL') {
        // Fetch years from both DO and SDO
        const [doYears, sdoYears] = await Promise.all([
          doWorkbookAPI.getAvailableYears().catch(() => []),
          sdoWorkbookAPI.getAvailableYears().catch(() => [])
        ]);
        const allYears = [...new Set([...doYears, ...sdoYears])].sort((a, b) => b - a);
        console.log('Available ALL years:', allYears);
        if (allYears.length > 0) {
          setAvailableYears(allYears);
          setSelectedYear(allYears[0]);
        } else {
          const currentYear = new Date().getFullYear();
          setAvailableYears([currentYear]);
          setSelectedYear(currentYear);
        }
      } else {
        const years = filterDoType === 'SDO'
          ? await sdoWorkbookAPI.getAvailableYears()
          : await doWorkbookAPI.getAvailableYears();
        console.log(`Available ${filterDoType} years:`, years);
        if (years.length > 0) {
          setAvailableYears(years);
          setSelectedYear(years[0]); // Most recent year
        } else {
          const currentYear = new Date().getFullYear();
          setAvailableYears([currentYear]);
          setSelectedYear(currentYear);
        }
      }
    } catch (error) {
      console.error('Error fetching available years:', error);
      const currentYear = new Date().getFullYear();
      setAvailableYears([currentYear]);
      setSelectedYear(currentYear);
    }
  };

  const handleExportWorkbook = async (year: number, workbookType?: string) => {
    try {
      setExportingYear(year);
      // Determine which API to use
      const type = workbookType || filterDoType;
      
      if (type === 'SDO') {
        await sdoWorkbookAPI.exportWorkbook(year);
        alert(`✓ SDO Workbook SDO_${year}.xlsx downloaded successfully!`);
      } else {
        await doWorkbookAPI.exportWorkbook(year);
        alert(`✓ Workbook DELIVERY_ORDERS_${year}.xlsx downloaded successfully!`);
      }
    } catch (error: any) {
      console.error('Error exporting workbook:', error);
      const type = workbookType || filterDoType;
      if (error.response?.status === 404) {
        alert(`No ${type === 'SDO' ? 'SDO' : 'delivery'} orders found for year ${year}`);
      } else {
        alert('Failed to export workbook. Please try again.');
      }
    } finally {
      setExportingYear(null);
    }
  };

  const handleExportMonthlySummaries = async (year: number, workbookType?: string) => {
    try {
      setExportingYear(year);
      // Determine which API to use
      const type = workbookType || filterDoType;
      
      if (type === 'SDO') {
        await sdoWorkbookAPI.exportYearlyMonthlySummaries(year);
        alert(`✓ SDO Monthly Summaries SDO_Monthly_Summaries_${year}.xlsx downloaded successfully!`);
      } else {
        await doWorkbookAPI.exportYearlyMonthlySummaries(year);
        alert(`✓ Monthly Summaries DO_Monthly_Summaries_${year}.xlsx downloaded successfully!`);
      }
    } catch (error: any) {
      console.error('Error exporting monthly summaries:', error);
      const type = workbookType || filterDoType;
      if (error.response?.status === 404) {
        alert(`No ${type === 'SDO' ? 'SDO' : 'delivery'} orders found for year ${year}`);
      } else {
        alert('Failed to export monthly summaries. Please try again.');
      }
    } finally {
      setExportingYear(null);
    }
  };

  const handleOpenWorkbook = (year: number, workbookType?: string) => {
    setSelectedYear(year);
    setSelectedWorkbookId(year);
    // Remember current filter so we can restore it when closing
    setPreviousFilterDoType(filterDoType);
    // Store workbook type if provided for proper data fetching in DOWorkbook
    // This ensures the DOWorkbook component uses the correct API
    if (workbookType && (workbookType === 'DO' || workbookType === 'SDO')) {
      setFilterDoType(workbookType);
    }
  };

  const handleCloseWorkbook = () => {
    setSelectedWorkbookId(null);
    // Restore previous filter type
    setFilterDoType(previousFilterDoType);
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
        
        // Handle fuel record creation/update ONLY for DO type (not SDO)
        // SDO orders are standalone and don't interact with fuel records
        if (savedOrder.doType === 'DO') {
          if (savedOrder.importOrExport === 'IMPORT') {
            // IMPORT = Going journey = Create new fuel record
            await handleCreateFuelRecordForImport(savedOrder);
          } else if (savedOrder.importOrExport === 'EXPORT') {
            // EXPORT = Return journey = Update existing fuel record
            await handleUpdateFuelRecordForExport(savedOrder);
          }
        } else {
          console.log(`SDO ${savedOrder.doNumber} created - skipping fuel record operations`);
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
      
      // Get total liters based on destination with match information
      const destinationMatch = FuelConfigService.getTotalLitersByDestination(deliveryOrder.destination);
      let totalLiters: number | null = destinationMatch.matched ? destinationMatch.liters : null;
      let missingTotalLiters = !destinationMatch.matched;
      
      console.log(`  → Destination: ${deliveryOrder.destination}`);
      console.log(`  → Match Type: ${destinationMatch.matchType}`);
      
      if (missingTotalLiters) {
        console.log(`  ⚠️ Route "${deliveryOrder.destination}" not configured - will notify admin`);
      } else {
        console.log(`  → Total Liters: ${totalLiters}L`);
      }
      
      // Check truck batch configuration for extra fuel
      const truckBatchInfo = FuelConfigService.getExtraFuel(deliveryOrder.truckNo);
      let extraFuel: number | null = truckBatchInfo.matched ? truckBatchInfo.extraFuel : null;
      let missingExtraFuel = !truckBatchInfo.matched && truckBatchInfo.truckSuffix !== '';
      
      console.log(`  → Truck: ${deliveryOrder.truckNo}, Suffix: ${truckBatchInfo.truckSuffix.toUpperCase()}`);
      
      if (missingExtraFuel) {
        console.log(`  ⚠️ Truck suffix "${truckBatchInfo.truckSuffix}" not configured - will notify admin`);
      } else {
        console.log(`  → Extra fuel: ${extraFuel}L (${truckBatchInfo.batchName})`);
      }
      
      // Show info message if any configuration is missing
      if (missingTotalLiters || missingExtraFuel) {
        let infoMessage = '⚠️ Missing Configuration\n\n';
        if (missingTotalLiters) {
          infoMessage += `• Route "${deliveryOrder.destination}" needs total liters\n`;
        }
        if (missingExtraFuel) {
          infoMessage += `• Truck suffix "${truckBatchInfo.truckSuffix.toUpperCase()}" needs batch assignment\n`;
        }
        infoMessage += '\nFuel record will be created but LOCKED until admin configures these values.\n';
        infoMessage += 'Admin will be notified automatically.';
        
        alert(infoMessage);
      }
      
      // For now, use default loading point. Later, this can come from a configuration dialog
      const loadingPoint: 'DAR_YARD' | 'KISARAWE' | 'DAR_STATION' = 'DAR_YARD';
      console.log('  → Loading point:', loadingPoint);
      
      // Generate fuel record (checkpoints will be empty until LPOs are created)
      const { fuelRecord, lposToGenerate, isLocked, missingFields } = fuelRecordService.createFuelRecordFromDO(
        deliveryOrder,
        loadingPoint,
        totalLiters,
        extraFuel
      );
      
      console.log('  → Fuel record to create:', JSON.stringify(fuelRecord, null, 2));
      console.log('  → Is Locked:', isLocked);
      console.log('  → Missing Fields:', missingFields);
      console.log('  → LPOs to generate:', lposToGenerate.length);
      
      // Create the fuel record (even if locked)
      const createdRecord = await fuelRecordsAPI.create(fuelRecord);
      console.log('  ✓ Created fuel record with ID:', createdRecord.id);
      
      if (isLocked) {
        console.log(`  🔒 Fuel record LOCKED - pending admin configuration for: ${missingFields.join(', ')}`);
      }
      
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
      // This now includes fuel difference calculation logic
      const { updatedRecord, additionalFuelInfo } = fuelRecordService.updateFuelRecordWithReturnDO(
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
      
      // Display additional fuel information if any was added
      if (additionalFuelInfo && additionalFuelInfo.totalAdditionalFuel > 0) {
        const details = [];
        if (additionalFuelInfo.fuelDifference > 0) {
          details.push(`Base difference: ${additionalFuelInfo.fuelDifference}L (${additionalFuelInfo.requiredTotalLiters}L needed - ${additionalFuelInfo.originalTotalLiters}L original)`);
        }
        if (additionalFuelInfo.loadingPointExtra > 0) {
          details.push(`Loading point extra (${additionalFuelInfo.returnLoadingPoint}): +${additionalFuelInfo.loadingPointExtra}L`);
        }
        if (additionalFuelInfo.destinationExtra > 0) {
          details.push(`Destination extra (${additionalFuelInfo.finalDestination}): +${additionalFuelInfo.destinationExtra}L`);
        }
        
        const message = `Fuel record updated with return DO-${deliveryOrder.doNumber}\n\n` +
          `📊 Additional Fuel Allocated: ${additionalFuelInfo.totalAdditionalFuel}L\n` +
          `New Total: ${additionalFuelInfo.newTotalLiters}L (was ${additionalFuelInfo.originalTotalLiters}L)\n\n` +
          `Breakdown:\n${details.join('\n')}`;
        
        alert(message);
      } else {
        alert(`Fuel record updated with return DO-${deliveryOrder.doNumber}`);
      }
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
        
        // Handle fuel record creation/update ONLY for DO type (not SDO)
        if (savedOrder.doType === 'DO') {
          if (savedOrder.importOrExport === 'IMPORT') {
            console.log(`→ Creating fuel record for IMPORT DO ${savedOrder.doNumber}`);
            await handleCreateFuelRecordForImport(savedOrder);
            console.log(`✓ Fuel record created for DO ${savedOrder.doNumber}`);
          } else if (savedOrder.importOrExport === 'EXPORT') {
            console.log(`→ Updating fuel record for EXPORT DO ${savedOrder.doNumber}`);
            await handleUpdateFuelRecordForExport(savedOrder);
            console.log(`✓ Fuel record updated for DO ${savedOrder.doNumber}`);
          }
        } else {
          console.log(`✓ SDO ${savedOrder.doNumber} created - skipping fuel record operations`);
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
            {filterDoType === 'SDO' ? 'New SDO' : 'New DO'}
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
              workbookType={filterDoType === 'SDO' ? 'SDO' : 'DO'}
              onClose={handleCloseWorkbook}
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-6 transition-colors">
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {filterDoType === 'SDO' ? 'SDO Workbooks by Year' : filterDoType === 'ALL' ? 'All Workbooks by Year' : 'DO Workbooks by Year'}
                </h2>
                {filterDoType === 'SDO' && (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                    Special Delivery Orders
                  </span>
                )}
                {filterDoType === 'DO' && (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                    Delivery Orders
                  </span>
                )}
                {filterDoType === 'ALL' && (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      DO
                    </span>
                    <span className="text-gray-400">+</span>
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                      SDO
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {filterDoType === 'ALL'
                  ? 'Viewing all delivery order and special delivery order workbooks'
                  : filterDoType === 'SDO' 
                    ? 'Each workbook contains individual sheets for each special delivery order' 
                    : 'Each workbook contains individual sheets for each delivery order'}
              </p>
            </div>
            
            {/* Year Selection for Export */}
            {filterDoType !== 'ALL' && (
              <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Export Workbook</h3>
                <div className="flex items-center gap-4">
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {filterDoType === 'SDO' ? `SDO ${year}` : `DELIVERY ORDERS ${year}`}
                      </option>
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
            )}
            
            {/* Render workbooks grouped by type when ALL is selected */}
            {filterDoType === 'ALL' ? (
              <>
                {/* DO Workbooks Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">Delivery Order Workbooks</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                      {workbooks.filter(w => w.type === 'DO').length}
                    </span>
                  </div>
                  {workbooks.filter(w => w.type === 'DO').length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {workbooks.filter(w => w.type === 'DO').map((workbook) => (
                        <div
                          key={`${workbook.type || filterDoType}-${workbook.id || workbook.year}`}
                          className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-1" />
                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {workbook.name}
                                </h3>
                              </div>
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <p>{workbook.sheetCount || 0} delivery orders</p>
                                <p>Year: {workbook.year}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleOpenWorkbook(workbook.year, workbook.type)}
                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => handleExportWorkbook(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download individual DO sheets"
                              >
                                {exportingYear === workbook.year ? '...' : 'DOs'}
                              </button>
                              <button
                                onClick={() => handleExportMonthlySummaries(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download monthly summaries"
                              >
                                {exportingYear === workbook.year ? '...' : 'Months'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                      <p className="text-sm text-gray-500 dark:text-gray-400">No DO workbooks yet</p>
                    </div>
                  )}
                </div>
                
                {/* SDO Workbooks Section */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">Special Delivery Order Workbooks</h3>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                      {workbooks.filter(w => w.type === 'SDO').length}
                    </span>
                  </div>
                  {workbooks.filter(w => w.type === 'SDO').length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {workbooks.filter(w => w.type === 'SDO').map((workbook) => (
                        <div
                          key={`${workbook.type || filterDoType}-${workbook.id || workbook.year}`}
                          className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <FileSpreadsheet className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-1" />
                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {workbook.name}
                                </h3>
                              </div>
                              <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <p>{workbook.sheetCount || 0} SDO orders</p>
                                <p>Year: {workbook.year}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleOpenWorkbook(workbook.year, workbook.type)}
                                className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => handleExportWorkbook(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download individual SDO sheets"
                              >
                                {exportingYear === workbook.year ? '...' : 'SDOs'}
                              </button>
                              <button
                                onClick={() => handleExportMonthlySummaries(workbook.year, workbook.type)}
                                disabled={exportingYear === workbook.year}
                                className="px-3 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                                title="Download monthly summaries"
                              >
                                {exportingYear === workbook.year ? '...' : 'Months'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-purple-50 dark:bg-purple-900/10 rounded-lg border-2 border-dashed border-purple-200 dark:border-purple-800">
                      <FileSpreadsheet className="w-8 h-8 text-purple-300 dark:text-purple-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">No SDO workbooks yet</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">Create SDO orders using the filter dropdown above</p>
                    </div>
                  )}
                </div>
                
                {workbooks.length === 0 && (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No workbooks found</p>
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workbooks.map((workbook) => (
                  <div
                    key={`${workbook.type || filterDoType}-${workbook.id || workbook.year}`}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow bg-white dark:bg-gray-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className={`w-5 h-5 ${workbook.type === 'SDO' ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'} mr-1`} />
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {workbook.name}
                          </h3>
                        </div>
                        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <p>{workbook.sheetCount || 0} {workbook.type === 'SDO' ? 'SDO orders' : 'delivery orders'}</p>
                          <p>Year: {workbook.year}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => handleOpenWorkbook(workbook.year, workbook.type)}
                          className="px-3 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleExportWorkbook(workbook.year, workbook.type)}
                          disabled={exportingYear === workbook.year}
                          className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded hover:bg-green-100 dark:hover:bg-green-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                          title={`Download individual ${workbook.type === 'SDO' ? 'SDO' : 'DO'} sheets`}
                        >
                          {exportingYear === workbook.year ? '...' : (workbook.type === 'SDO' ? 'SDOs' : 'DOs')}
                        </button>
                        <button
                          onClick={() => handleExportMonthlySummaries(workbook.year, workbook.type)}
                          disabled={exportingYear === workbook.year}
                          className="px-3 py-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 rounded hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:bg-gray-100 dark:disabled:bg-gray-600"
                          title="Download monthly summaries"
                        >
                          {exportingYear === workbook.year ? '...' : 'Months'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                
                {workbooks.length === 0 && (
                  <div className="col-span-full text-center py-8">
                    <FileSpreadsheet className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No workbooks found</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      {filterDoType === 'SDO' 
                        ? 'Workbooks are generated automatically from your SDO orders' 
                        : 'Workbooks are generated automatically from your delivery orders'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      ) : activeTab === 'list' ? (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg p-4 mb-6 transition-colors">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                value={filterDoType}
                onChange={(e) => { setFilterDoType(e.target.value as 'ALL' | 'DO' | 'SDO'); setCurrentPage(1); }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="DO">DO - Delivery Orders</option>
                <option value="SDO">SDO - Special Delivery Orders</option>
                <option value="ALL">All Order Types</option>
              </select>
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
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 shadow dark:shadow-gray-700/30 rounded-lg overflow-hidden transition-colors">
            <div className="w-full">
              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700 table-fixed">
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
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">DO#</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Date</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Type</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Status</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Client</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Truck</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Dest.</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Tons</th>
                    <th className="px-2 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-100 uppercase tracking-wider">Act</th>
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
                        <td className="px-1 md:px-6 py-2 md:py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={order.id ? selectedOrders.includes(order.id) : false}
                            onChange={() => order.id && handleSelectOrder(order.id)}
                            className="h-3 w-3 md:h-4 md:w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-600"
                            disabled={order.isCancelled}
                          />
                        </td>
                        <td className={`px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm font-medium truncate max-w-[60px] md:max-w-none ${
                          order.isCancelled 
                            ? 'text-gray-400 dark:text-gray-500 line-through' 
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {order.doType}-{order.doNumber}
                        </td>
                        <td className={`px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm truncate max-w-[50px] md:max-w-none ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.date}
                        </td>
                        <td className="px-1 md:px-6 py-2 md:py-4 whitespace-nowrap">
                          <span className={`px-1 md:px-2 py-0.5 md:py-1 inline-flex text-[10px] md:text-xs leading-5 font-semibold rounded-full ${
                            order.isCancelled
                              ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                              : order.importOrExport === 'IMPORT' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' 
                                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                          }`}>
                            {order.importOrExport === 'IMPORT' ? 'IMP' : 'EXP'}
                          </span>
                        </td>
                        <td className="px-1 md:px-6 py-2 md:py-4 whitespace-nowrap">
                          {order.isCancelled ? (
                            <span className="px-1 md:px-2 py-0.5 md:py-1 inline-flex text-[10px] md:text-xs leading-5 font-semibold rounded-full bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300">
                              <Ban className="w-2 h-2 md:w-3 md:h-3 mr-0.5 md:mr-1" />
                              <span className="hidden md:inline">Cancelled</span>
                              <span className="md:hidden">X</span>
                            </span>
                          ) : (
                            <span className="px-1 md:px-2 py-0.5 md:py-1 inline-flex text-[10px] md:text-xs leading-5 font-semibold rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300">
                              <span className="hidden md:inline">Active</span>
                              <span className="md:hidden">✓</span>
                            </span>
                          )}
                        </td>
                        <td className={`px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm truncate max-w-[50px] md:max-w-none ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.clientName}
                        </td>
                        <td className={`px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm truncate max-w-[50px] md:max-w-none ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.truckNo}
                        </td>
                        <td className={`px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm truncate max-w-[50px] md:max-w-none ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.destination}
                        </td>
                        <td className={`px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm ${
                          order.isCancelled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {order.tonnages}<span className="hidden md:inline"> tons</span>
                        </td>
                        <td className="px-1 md:px-6 py-2 md:py-4 whitespace-nowrap text-sm font-medium">
                          <button 
                            onClick={() => handleViewOrder(order)}
                            className="text-primary-600 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 mr-1 md:mr-3"
                            title="View Details"
                          >
                            <Eye className="w-3 h-3 md:w-4 md:h-4" />
                          </button>
                          {!order.isCancelled && (
                            <>
                              <button 
                                onClick={() => handleEditOrder(order)}
                                className="text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300 mr-1 md:mr-3" 
                                title="Edit"
                              >
                                <Edit className="w-3 h-3 md:w-4 md:h-4" />
                              </button>
                              <button 
                                onClick={() => handleOpenCancelModal(order)}
                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300" 
                                title="Cancel DO"
                              >
                                <Ban className="w-3 h-3 md:w-4 md:h-4" />
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
        <MonthlySummary orders={orders} doType={filterDoType} />
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
        defaultDoType={filterDoType === 'SDO' ? 'SDO' : 'DO'}
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
