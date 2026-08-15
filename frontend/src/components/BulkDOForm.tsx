import { useState, useEffect, useRef, useMemo } from 'react';
import type { ChangeEvent } from 'react';
import { X, FileDown, ChevronDown, Check, Download, Upload } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI } from '../services/api';
import { useJourneyConfig } from '../hooks/useJourneyConfig';
import { parseDONumber, formatDONumber } from '../utils/doNumberFormatter';
import { formatTruckNumber, parseTonnage, formatTonnage } from '../utils/dataCleanup';
import { toast } from 'react-toastify';
import BulkDOEntryGrid, {
  BulkGridRow,
  createEmptyGridRows,
  countFilledGridRows,
  isGridRowEmpty,
  parseTabTextToGridRows,
  parseSpreadsheetFileToGridRows,
} from './BulkDOEntryGrid';

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

interface BulkCommonData {
  date: string;
  importOrExport: 'IMPORT' | 'EXPORT';
  doType: 'DO' | 'SDO';
  clientName: string;
  loadingPoint: string;
  destination: string;
  haulier: string;
  containerNo: string;
  cargoType: 'loosecargo' | 'container';
  rateType: 'per_ton' | 'fixed_total';
  startingNumber: string;
}

// Local storage key for persisting the bulk DO form draft
const BULK_DO_FORM_STORAGE_KEY = 'bulk_do_form_draft';

interface StoredBulkDOData {
  commonData: BulkCommonData;
  /** @deprecated kept for restoring older drafts */
  bulkInput?: string;
  gridRows?: BulkGridRow[];
  parsedRows: BulkDORow[];
  savedAt: string;
}

const getTemplateHeaders = (rateType: 'per_ton' | 'fixed_total') =>
  rateType === 'per_ton'
    ? ['Truck No', 'Trailer No', 'Driver Name', 'Tonnage', 'Rate Per Ton']
    : ['Truck No', 'Trailer No', 'Driver Name', 'Tonnage', 'Total Amount'];

const getTemplateExampleRow = (rateType: 'per_ton' | 'fixed_total') =>
  rateType === 'per_ton'
    ? ['T844 EKS', 'T629 ELE', 'John Doe', '30.001', '1850']
    : ['T844 EKS', 'T629 ELE', 'John Doe', '30.001', '55500'];

const gridRowToBulkRow = (
  row: BulkGridRow,
  rateType: 'per_ton' | 'fixed_total'
): BulkDORow | null => {
  if (isGridRowEmpty(row)) return null;
  if (!row.truckNo.trim()) return null;

  const tonnage = parseTonnage(row.tonnages);
  const amountOrRate = parseFloat(row.amountOrRate.replace(/,/g, '')) || 0;

  if (rateType === 'per_ton') {
    return {
      truckNo: formatTruckNumber(row.truckNo),
      trailerNo: row.trailerNo.toUpperCase(),
      driverName: row.driverName.toUpperCase(),
      tonnages: tonnage,
      ratePerTon: amountOrRate,
      totalAmount: tonnage * amountOrRate,
    };
  }

  return {
    truckNo: formatTruckNumber(row.truckNo),
    trailerNo: row.trailerNo.toUpperCase(),
    driverName: row.driverName.toUpperCase(),
    tonnages: tonnage,
    ratePerTon: amountOrRate,
    totalAmount: amountOrRate,
  };
};

const saveBulkDraft = (data: StoredBulkDOData) => {
  try {
    localStorage.setItem(BULK_DO_FORM_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving bulk DO draft:', error);
  }
};

const loadBulkDraft = (): StoredBulkDOData | null => {
  try {
    const stored = localStorage.getItem(BULK_DO_FORM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredBulkDOData;
      // Drafts expire after 24 hours
      const hoursDiff = (Date.now() - new Date(parsed.savedAt).getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 24) return parsed;
      localStorage.removeItem(BULK_DO_FORM_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Error loading bulk DO draft:', error);
  }
  return null;
};

const clearBulkDraft = () => {
  try {
    localStorage.removeItem(BULK_DO_FORM_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing bulk DO draft:', error);
  }
};

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

  const [gridRows, setGridRows] = useState<BulkGridRow[]>(() => createEmptyGridRows());
  const [parsedRows, setParsedRows] = useState<BulkDORow[]>([]);
  const [createdOrders, setCreatedOrders] = useState<Partial<DeliveryOrder>[]>([]);
  // Progress tracking state
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  // Whether a saved draft was restored on open (drives the "draft restored" banner)
  const [hasDraft, setHasDraft] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: journeyConfig } = useJourneyConfig();
  const autoDownloadPdf = journeyConfig?.autoDownloadDOPdf ?? true;
  
  // Dropdown states
  const [showCargoTypeDropdown, setShowCargoTypeDropdown] = useState(false);
  const [showRateTypeDropdown, setShowRateTypeDropdown] = useState(false);
  const [showImportExportDropdown, setShowImportExportDropdown] = useState(false);

  // Reset form when closing
  useEffect(() => {
    if (!isOpen) {
      // Reset all form data when the modal closes
      setGridRows(createEmptyGridRows());
      setParsedRows([]);
      setCreatedOrders([]);
      setProgress({ current: 0, total: 0, status: '' });
      setIsCreating(false);
      setUploadedFileName(null);
      
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

  // Restore a saved draft when the form opens. Declared AFTER the next-number
  // effects above so the auto-fetched startingNumber wins over the stored one
  // (DO numbers can be claimed by others while the draft sat idle). We can't use
  // useState initializers here because the modal stays mounted across open/close.
  useEffect(() => {
    if (!isOpen) return;
    const draft = loadBulkDraft();
    const hasGrid = (draft?.gridRows?.some((r) => !isGridRowEmpty(r))) ?? false;
    const hasLegacyInput = Boolean(draft?.bulkInput?.trim());
    const hasParsed = (draft?.parsedRows?.length ?? 0) > 0;

    if (draft && (hasGrid || hasLegacyInput || hasParsed)) {
      if (hasGrid && draft.gridRows) {
        setGridRows(draft.gridRows);
      } else if (hasLegacyInput && draft.bulkInput) {
        setGridRows(parseTabTextToGridRows(draft.bulkInput));
      } else {
        setGridRows(createEmptyGridRows());
      }
      setParsedRows(draft.parsedRows || []);
      setCommonData(prev => ({
        ...prev,
        ...draft.commonData,
        startingNumber: prev.startingNumber, // keep freshly-fetched number
      }));
      setHasDraft(true);
    } else {
      setHasDraft(false);
    }
  }, [isOpen]);

  // Live-sync parsed rows from the grid so preview + create stay current
  useEffect(() => {
    if (!isOpen || isCreating || createdOrders.length > 0) return;
    const rows: BulkDORow[] = [];
    for (const gridRow of gridRows) {
      const parsed = gridRowToBulkRow(gridRow, commonData.rateType);
      if (parsed) rows.push(parsed);
    }
    setParsedRows(rows);
  }, [gridRows, commonData.rateType, isOpen, isCreating, createdOrders.length]);

  // Auto-save the draft (debounced) whenever meaningful data changes. Skip while
  // creating or once orders have been created (that draft is spent).
  useEffect(() => {
    if (!isOpen || isCreating || createdOrders.length > 0) return;
    const hasData = countFilledGridRows(gridRows) > 0 || parsedRows.length > 0;
    if (!hasData) return;
    const timeoutId = setTimeout(() => {
      saveBulkDraft({
        commonData,
        gridRows,
        parsedRows,
        savedAt: new Date().toISOString(),
      });
      setHasDraft(true);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [isOpen, isCreating, createdOrders.length, gridRows, parsedRows, commonData]);

  // Discard the current draft and start fresh
  const handleDiscardDraft = () => {
    clearBulkDraft();
    setGridRows(createEmptyGridRows());
    setParsedRows([]);
    setHasDraft(false);
    setUploadedFileName(null);
    setCommonData(prev => ({ ...prev, clientName: '', loadingPoint: '', destination: '', haulier: '' }));
  };

  const previewOrders = useMemo(() => {
    if (parsedRows.length === 0) return [];
    const parsed = parseDONumber(commonData.startingNumber);
    if (!parsed) return [];
    const { sequentialNumber: startNum, year } = parsed;

    return parsedRows.map((row, index) => ({
      sn: index + 1,
      doNumber: formatDONumber(startNum + index, year),
      doType: commonData.doType,
      date: commonData.date,
      importOrExport: commonData.importOrExport,
      clientName: commonData.clientName || '—',
      truckNo: row.truckNo,
      trailerNo: row.trailerNo,
      driverName: row.driverName,
      tonnages: row.tonnages,
      ratePerTon: row.ratePerTon,
      totalAmount: row.totalAmount ?? 0,
      loadingPoint: commonData.loadingPoint || '—',
      destination: commonData.destination || '—',
      haulier: commonData.haulier || '—',
      cargoType: commonData.cargoType,
      rateType: commonData.rateType,
    }));
  }, [parsedRows, commonData]);

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

    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        cargoTypeDropdownRef.current?.contains(target) ||
        rateTypeDropdownRef.current?.contains(target) ||
        importExportDropdownRef.current?.contains(target)
      ) return;
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

  const downloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      const XLSX = (await import('xlsx-js-style')).default;
      const headers = getTemplateHeaders(commonData.rateType);
      const example = getTemplateExampleRow(commonData.rateType);
      // Header + one example row + several blank data rows (bank-style template)
      const blankRows = Array.from({ length: 20 }, () => headers.map(() => ''));
      const ws = XLSX.utils.aoa_to_sheet([headers, example, ...blankRows]);

      ws['!cols'] = [
        { wch: 14 },
        { wch: 14 },
        { wch: 18 },
        { wch: 12 },
        { wch: 16 },
      ];

      const borderStyle = {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      };
      const headerStyle = {
        border: borderStyle,
        alignment: { horizontal: 'center', vertical: 'center' },
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F4E79' } },
      };
      const exampleStyle = {
        border: borderStyle,
        alignment: { horizontal: 'center', vertical: 'center' },
        font: { italic: true, color: { rgb: '666666' } },
        fill: { fgColor: { rgb: 'FFF2CC' } },
      };
      const cellStyle = {
        border: borderStyle,
        alignment: { horizontal: 'center', vertical: 'center' },
      };

      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let row = range.s.r; row <= range.e.r; row++) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
          ws[cellRef].s = row === 0 ? headerStyle : row === 1 ? exampleStyle : cellStyle;
        }
      }

      // Instructions sheet
      const instructions = [
        ['Bulk Delivery Order Template'],
        [''],
        ['How to use'],
        ['1. Keep the header row exactly as provided — do not rename columns.'],
        ['2. Row 2 is an EXAMPLE (yellow). Replace it with your real data or delete it.'],
        ['3. Enter one truck per row.'],
        ['4. Copy the data rows and paste into the Bulk Create grid, or type directly in the form.'],
        [''],
        ['Required columns'],
        ...headers.map((h, i) => [`Column ${i + 1}`, h]),
        [''],
        ['Rate structure for this template', commonData.rateType === 'per_ton' ? 'Per Ton (Total = Tonnage × Rate Per Ton)' : 'Fixed Total Amount'],
        [''],
        ['Notes'],
        ['- Truck and trailer numbers will be normalized by the system.'],
        ['- Driver names are stored in uppercase.'],
        ['- Tonnage accepts up to three decimal places (e.g. 30.001) and is never rounded.'],
        ['- Shared DO fields (client, date, loading point, destination, etc.) are set in the form, not in this file.'],
      ];
      const wsInfo = XLSX.utils.aoa_to_sheet(instructions);
      wsInfo['!cols'] = [{ wch: 55 }, { wch: 40 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Truck Data');
      XLSX.utils.book_append_sheet(wb, wsInfo, 'Instructions');

      const rateLabel = commonData.rateType === 'per_ton' ? 'PerTon' : 'FixedTotal';
      const filename = `Bulk_DO_Template_${rateLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success('Template downloaded');
    } catch (error) {
      console.error('Template download error:', error);
      toast.error('Failed to download template');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleUploadSpreadsheet = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('Only Excel (.xlsx, .xls) or CSV (.csv) files are accepted');
      return;
    }

    try {
      setIsUploadingFile(true);
      const rows = await parseSpreadsheetFileToGridRows(file);
      const filled = countFilledGridRows(rows);
      if (filled === 0) {
        toast.warn('No truck rows found in the file. Check headers match the template.');
        return;
      }
      setGridRows(rows);
      setUploadedFileName(file.name);
      toast.success(`Loaded ${filled} truck row${filled === 1 ? '' : 's'} from ${file.name}`);
    } catch (error) {
      console.error('Spreadsheet upload error:', error);
      toast.error('Failed to read the uploaded file. Please use the Download Template format.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const onUploadInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleUploadSpreadsheet(file);
    e.target.value = '';
  };

  const generateDOs = async () => {
    try {
      console.log('=== Starting Bulk DO Generation ===');
      console.log('Order Type:', commonData.doType);
      console.log('Common Data:', commonData);
      console.log('Parsed Rows:', parsedRows);
      
      if (parsedRows.length === 0) {
        toast.warn('Please enter at least one truck row in the grid');
        return;
      }
      
      // Validate required fields
      if (!commonData.clientName || !commonData.loadingPoint || !commonData.destination) {
        toast.warn('Please fill in all required fields: Client Name, Loading Point, and Destination');
        return;
      }
      
      if (!commonData.startingNumber) {
        toast.warn('Please enter a starting number for the orders');
        return;
      }
      
      // Parse the starting DO number (format: XXXX/YY)
      const parsed = parseDONumber(commonData.startingNumber);
      if (!parsed) {
        toast.error('Invalid DO number format. Expected format: XXXX/YY (e.g., 0001/26)');
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
        toast.error('Failed to create any delivery orders. Check console for details.');
        return;
      }
      
      console.log(`✓ Successfully created ${result.createdOrders.length} out of ${paddedOrders.length} orders!`);
      
      // Orders were created successfully — the draft is spent, discard it so it
      // doesn't reappear next time the form opens.
      clearBulkDraft();
      setHasDraft(false);

      // Set only the actually created orders for display and PDF generation
      setCreatedOrders(result.createdOrders);
      setProgress({ current: result.createdOrders.length, total: paddedOrders.length, status: 'Generating PDF...' });
      
      // Conditionally download PDF based on config setting
      const orderTypeLabel = commonData.doType === 'SDO' ? 'special delivery orders (SDOs)' : 'delivery orders';
      const additionalInfo = commonData.doType === 'SDO' ? '' : ' with fuel records and LPOs';

      if (autoDownloadPdf) {
        console.log('Starting PDF download from backend...');
        try {
          await downloadAllAsPDF(result.createdOrders);
          console.log('✓ PDF downloaded successfully!');

          setProgress({ current: result.createdOrders.length, total: paddedOrders.length, status: 'Complete!' });
          setIsCreating(false);

          const successMsg = result.createdOrders.length === paddedOrders.length
            ? `✓ Success!\n\nCreated ${result.createdOrders.length} ${orderTypeLabel}${additionalInfo}.\n\nPDF file has been downloaded to your Downloads folder.`
            : `✓ Partially Complete\n\nCreated ${result.createdOrders.length} out of ${paddedOrders.length} ${orderTypeLabel}.\n\nPDF includes only successfully created orders.\n\nSee summary for skipped/failed orders.`;

          toast.success(successMsg);
        } catch (pdfError) {
          console.error('PDF generation error:', pdfError);
          setIsCreating(false);
          toast.warn('Orders created successfully, but PDF download failed. Use the button below to re-download.');
        }
      } else {
        setProgress({ current: result.createdOrders.length, total: paddedOrders.length, status: 'Complete!' });
        setIsCreating(false);

        const successMsg = result.createdOrders.length === paddedOrders.length
          ? `✓ Success!\n\nCreated ${result.createdOrders.length} ${orderTypeLabel}${additionalInfo}.`
          : `✓ Partially Complete\n\nCreated ${result.createdOrders.length} out of ${paddedOrders.length} ${orderTypeLabel}.\n\nSee summary for skipped/failed orders.`;

        toast.success(successMsg);
      }

      // Don't close automatically - let user review and close manually
      // onClose();
    } catch (error) {
      console.error('✗ Error in generateDOs:', error);
      toast.error('Failed to create delivery orders. Please try again.');
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
            {/* Restored draft banner */}
            {hasDraft && createdOrders.length === 0 && (
              <div className="mb-4 flex items-center justify-between rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-2">
                <span className="text-sm text-amber-800 dark:text-amber-300">
                  Restored your unsaved draft. Continue where you left off, or discard it.
                </span>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="text-sm font-medium text-amber-800 dark:text-amber-300 hover:underline"
                >
                  Discard draft
                </button>
              </div>
            )}
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
                          setGridRows(createEmptyGridRows());
                          setUploadedFileName(null);
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
                          setGridRows(createEmptyGridRows());
                          setUploadedFileName(null);
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
                    onChange={handleCommonChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={`e.g., 0001/26`}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Auto-generated — you can override if needed. Format: XXXX/YY
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

            {/* Truck entry grid */}
            <div className="mb-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase">
                  Truck Details
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={onUploadInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCreating || isUploadingFile || createdOrders.length > 0}
                    className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 ${
                      isCreating || isUploadingFile || createdOrders.length > 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Upload className="w-4 h-4 mr-1.5" />
                    {isUploadingFile ? 'Reading…' : 'Upload File'}
                  </button>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    disabled={isCreating || isDownloadingTemplate}
                    className={`inline-flex items-center px-3 py-1.5 text-sm rounded-md border border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/40 ${
                      isCreating || isDownloadingTemplate ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    {isDownloadingTemplate ? 'Preparing…' : 'Download Template'}
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                Type into the cells, paste from Excel, or upload the template file. Preview updates automatically.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                {commonData.rateType === 'per_ton'
                  ? 'Columns: Truck No · Trailer No · Driver Name · Tonnage · Rate Per Ton'
                  : 'Columns: Truck No · Trailer No · Driver Name · Tonnage · Total Amount'}
                {uploadedFileName ? ` · Loaded from: ${uploadedFileName}` : ''}
              </p>

              <BulkDOEntryGrid
                rateType={commonData.rateType}
                rows={gridRows}
                onChange={setGridRows}
                disabled={isCreating || createdOrders.length > 0}
              />
            </div>

            {/* Pre-create processed preview */}
            {previewOrders.length > 0 && createdOrders.length === 0 && (
              <div className="mb-6 border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden">
                <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 border-b border-indigo-200 dark:border-indigo-800 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
                      Preview — how data will be created ({previewOrders.length} {commonData.doType}
                      {previewOrders.length === 1 ? '' : 's'})
                    </h4>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                      Shared fields (client, route, cargo) are applied to every row. Numbers and truck fields are normalized as shown.
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs min-w-[900px]">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr className="text-left text-gray-600 dark:text-gray-300">
                        <th className="px-3 py-2 font-semibold">#</th>
                        <th className="px-3 py-2 font-semibold">{commonData.doType} No</th>
                        <th className="px-3 py-2 font-semibold">Truck</th>
                        <th className="px-3 py-2 font-semibold">Trailer</th>
                        <th className="px-3 py-2 font-semibold">Driver</th>
                        <th className="px-3 py-2 font-semibold">Tonnage</th>
                        <th className="px-3 py-2 font-semibold">
                          {commonData.rateType === 'per_ton' ? 'Rate/Ton' : 'Rate'}
                        </th>
                        <th className="px-3 py-2 font-semibold">Total</th>
                        <th className="px-3 py-2 font-semibold">Client</th>
                        <th className="px-3 py-2 font-semibold">Route</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewOrders.map((order) => (
                        <tr
                          key={`${order.doNumber}-${order.sn}`}
                          className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                        >
                          <td className="px-3 py-1.5 text-gray-400">{order.sn}</td>
                          <td className="px-3 py-1.5 font-medium whitespace-nowrap">
                            {order.doType}-{order.doNumber}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{order.truckNo}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{order.trailerNo || '—'}</td>
                          <td className="px-3 py-1.5">{order.driverName || '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums">{formatTonnage(order.tonnages)}</td>
                          <td className="px-3 py-1.5 tabular-nums">
                            {order.ratePerTon.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums font-medium">
                            {order.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-1.5">{order.clientName}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {order.loadingPoint} → {order.destination}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {commonData.doType === 'DO' && (
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-t border-indigo-100 dark:border-indigo-900 text-xs text-gray-600 dark:text-gray-400">
                    After create: each row becomes a Delivery Order; fuel records / LPO linking follow import-export automation rules.
                  </div>
                )}
              </div>
            )}

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
