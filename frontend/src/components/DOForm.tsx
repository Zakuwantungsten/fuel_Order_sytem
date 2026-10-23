import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'react-toastify';
import { X, Lock } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { deliveryOrdersAPI } from '../services/api';
import { useJourneyConfig } from '../hooks/useJourneyConfig';
import axios from 'axios';
import { cleanDeliveryOrder, isCorruptedDriverName, formatTruckNumber, isTonnageInput, parseTonnage, quantityToInputValue } from '../utils/dataCleanup';
import ConfirmModal from './SuperAdmin/ConfirmModal';
import RouteSuggestInput, { useRouteLocationSuggestions } from './RouteSuggestInput';

interface DOFormProps {
  order?: DeliveryOrder;
  isOpen: boolean;
  onClose: () => void;
  onSave: (order: Partial<DeliveryOrder>) => Promise<DeliveryOrder | void>;
  defaultDoType?: 'DO' | 'SDO'; // Default DO type when creating new order
  user?: any; // User object for role-based auto-selection
}

// Local storage key for persisting the new-DO form draft (create mode only)
const NEW_DO_FORM_STORAGE_KEY = 'new_do_form_draft';

interface StoredDOData {
  formData: Partial<DeliveryOrder>;
  savedAt: string;
}

// A draft is worth restoring only if the user actually typed something
const hasMeaningfulDO = (d: Partial<DeliveryOrder>): boolean =>
  !!(d.clientName || d.truckNo || d.trailerNo || d.destination || d.loadingPoint || d.driverName || d.haulier || d.invoiceNos);

const saveDODraft = (data: StoredDOData) => {
  try {
    localStorage.setItem(NEW_DO_FORM_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving DO draft:', error);
  }
};

const loadDODraft = (): StoredDOData | null => {
  try {
    const stored = localStorage.getItem(NEW_DO_FORM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredDOData;
      const hoursDiff = (Date.now() - new Date(parsed.savedAt).getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 24) return parsed;
      localStorage.removeItem(NEW_DO_FORM_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Error loading DO draft:', error);
  }
  return null;
};

const clearDODraft = () => {
  try {
    localStorage.removeItem(NEW_DO_FORM_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing DO draft:', error);
  }
};

// text-base on mobile keeps iOS Safari from zooming in when an input is focused
const inputClass =
  'w-full h-10 px-3 text-base sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent';
const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

const SectionTitle = ({ children, first }: { children: ReactNode; first?: boolean }) => (
  <h4
    className={`col-span-2 text-[11px] font-semibold tracking-wider uppercase text-gray-500 dark:text-gray-400 ${
      first ? '' : 'mt-2 pt-4 border-t border-gray-100 dark:border-gray-700'
    }`}
  >
    {children}
  </h4>
);

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}

function Segmented<T extends string>({ value, options, onChange, ariaLabel, disabled }: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`grid grid-flow-col auto-cols-fr gap-1 h-10 p-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/60 ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(opt.value)}
            className={`px-2 rounded-md text-xs sm:text-sm font-medium truncate transition-colors disabled:cursor-not-allowed ${
              active
                ? 'bg-white dark:bg-gray-900 text-primary-700 dark:text-primary-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
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
  const [tonnageInput, setTonnageInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Whether a saved draft was restored on open (drives the "draft restored" banner)
  const [hasDraft, setHasDraft] = useState(false);
  const [flipConfirmOpen, setFlipConfirmOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<Partial<DeliveryOrder> | null>(null);
  const { data: journeyConfig } = useJourneyConfig();
  const autoDownloadPdf = journeyConfig?.autoDownloadDOPdf ?? true;
  const fuelAutomation = journeyConfig?.fuelAutomation;
  const isEditMode = !!order;
  const routeSuggestions = useRouteLocationSuggestions(formData.importOrExport === 'EXPORT' ? 'EXPORT' : 'IMPORT');

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
        setTonnageInput(quantityToInputValue(order.tonnages));
      } else {
        // Create mode - restore a saved draft if the user has one, else reset to
        // defaults. The doNumber is (re)fetched by the effect below so a restored
        // draft always gets a fresh, un-claimed number.
        const draft = loadDODraft();
        if (draft && hasMeaningfulDO(draft.formData)) {
          setFormData({ ...draft.formData, doType: draft.formData.doType || defaultDoType });
          setTonnageInput(quantityToInputValue(draft.formData.tonnages));
          setHasDraft(true);
        } else {
          const defaults = getDefaultFormData();
          defaults.doType = defaultDoType; // Ensure we use the passed default
          setFormData(defaults);
          setTonnageInput('');
          setHasDraft(false);
        }
      }
    }
  }, [isOpen, order, defaultDoType, getDefaultFormData]);

  // Auto-save the draft (debounced) while creating a new DO. Never persists in
  // edit mode. We can't use a useState initializer because the modal stays
  // mounted across open/close, so restore happens in the effect above instead.
  useEffect(() => {
    if (!isOpen || order || isSubmitting) return;
    if (!hasMeaningfulDO(formData)) return;
    const timeoutId = setTimeout(() => {
      saveDODraft({ formData, savedAt: new Date().toISOString() });
      setHasDraft(true);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [isOpen, order, isSubmitting, formData]);

  // Discard the current draft and start a clean form (with a fresh DO number)
  const handleDiscardDraft = async () => {
    clearDODraft();
    const defaults = getDefaultFormData();
    defaults.doType = defaultDoType;
    setFormData(defaults);
    setTonnageInput('');
    setHasDraft(false);
    const nextDONumber = await deliveryOrdersAPI.getNextNumber(defaultDoType);
    setFormData(prev => ({ ...prev, doNumber: nextDONumber }));
  };

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

    if (name === 'tonnages') {
      if (!isTonnageInput(value)) return;
      setTonnageInput(value);
      setFormData((prev) => ({
        ...prev,
        tonnages: parseTonnage(value),
      }));
      return;
    }
    
    // Auto-uppercase text fields for consistency; truck plates → T{digits} {letters}
    const uppercaseFields = ['trailerNo', 'destination', 'loadingPoint', 'clientName', 'haulier', 'containerNo', 'driverName', 'invoiceNos', 'borderEntryDRC'];
    const finalValue = name === 'ratePerTon'
      ? parseFloat(value) || 0
      : name === 'truckNo'
        ? formatTruckNumber(value)
        : uppercaseFields.includes(name)
          ? value.toUpperCase()
          : value;
    
    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));
  };

  const handleDOTypeChange = async (newType: 'DO' | 'SDO') => {
    setFormData(prev => ({ ...prev, doType: newType }));
    
    // Fetch next number for the selected type
    if (!order) {
      const nextDONumber = await deliveryOrdersAPI.getNextNumber(newType);
      setFormData(prev => ({ ...prev, doNumber: nextDONumber })); // Already in XXXX/YY format
    }
  };

  const preventNumberInputScroll = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur();
  };

  const needsImportToExportConfirm =
    !!order &&
    order.doType === 'DO' &&
    order.importOrExport === 'IMPORT' &&
    formData.importOrExport === 'EXPORT' &&
    fuelAutomation?.doCancelCascade !== false;

  const getImportToExportConfirmMessage = () => {
    const doLabel = `${order?.doType || 'DO'}-${order?.doNumber}`;
    const truck = formData.truckNo || order?.truckNo || 'this truck';
    const lines = [
      `You are changing ${doLabel} from IMPORT to EXPORT.`,
      '',
      'If you continue:',
      `• The fuel journey created for this IMPORT DO will be cancelled`,
    ];
    if (fuelAutomation?.doExportUpdate !== false) {
      lines.push(`• This DO will be linked as the EXPORT return leg on truck ${truck}'s active going journey`);
    } else {
      lines.push(`• Export fuel automation is off — you will need to manually link this DO to truck ${truck} using the Link action`);
    }
    lines.push('', 'Click OK to confirm and save the update.');
    return lines.join('\n');
  };

  const executeSave = async (cleanedFormData: Partial<DeliveryOrder>) => {
    setIsSubmitting(true);
    try {
      const savedOrder = await onSave(cleanedFormData);

      if (!order && savedOrder) {
        clearDODraft();
        setHasDraft(false);
        if (autoDownloadPdf) {
          await handleDownload(savedOrder as DeliveryOrder);
        }
        onClose();
      } else {
        onClose();
      }
    } catch (error) {
      if ((error as any)?.__userCancelled) {
        // User explicitly declined a confirmation modal; keep form open and quiet.
        return;
      }
      console.error('Error in executeSave:', error);
      toast.error('Failed to save delivery order. Check console for details.');
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (isCorruptedDriverName(formData.driverName)) {
      toast.warn('Driver name field contains invalid data (appears to be tonnage data). Please enter a valid driver name.');
      return;
    }

    const cleanedFormData = cleanDeliveryOrder(formData);

    if (!order) {
      delete cleanedFormData.id;
      delete (cleanedFormData as any)._id;
    }

    if (needsImportToExportConfirm) {
      setPendingSaveData(cleanedFormData);
      setFlipConfirmOpen(true);
      return;
    }

    await executeSave(cleanedFormData);
  };

  const handleConfirmImportToExportFlip = async () => {
    if (!pendingSaveData) return;
    setFlipConfirmOpen(false);
    try {
      await executeSave(pendingSaveData);
    } finally {
      setPendingSaveData(null);
    }
  };

  const handleCancelImportToExportFlip = () => {
    setFlipConfirmOpen(false);
    setPendingSaveData(null);
  };

  const handleDownload = async (targetOrder: DeliveryOrder) => {
    setIsDownloading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
      const token = sessionStorage.getItem('fuel_order_token');

      if (!token) {
        toast.error('Authentication required. Please log in again.');
        return;
      }

      const orderId = (targetOrder as any)._id || targetOrder.id;
      if (!orderId) {
        toast.error('Error: Could not find the delivery order ID. You can download it from the orders list.');
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
      toast.error(`Failed to download PDF: ${errorMessage}. You can download it from the orders list.`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  const isDirectionRoleLocked = user?.role === 'import_officer' || user?.role === 'export_officer';
  const isPerTon = formData.rateType === 'per_ton';
  const totalAmount = isPerTon
    ? (formData.tonnages || 0) * (formData.ratePerTon || 0)
    : formData.ratePerTon || 0;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 transition-opacity bg-gray-500 dark:bg-gray-900 bg-opacity-75 dark:bg-opacity-80"
        onClick={handleClose}
      />

      {/* Bottom sheet on mobile, centered dialog from sm up */}
      <div className="relative flex flex-col w-full sm:max-w-3xl max-h-[94dvh] sm:max-h-[90vh] bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-xl shadow-xl overflow-hidden text-left">
        <div className="shrink-0 bg-primary-600 dark:bg-primary-700 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-white truncate">
              {order ? `Edit ${order.doType || 'DO'}-${order.doNumber}` : 'New Delivery Order'}
            </h3>
            {isEditMode && (
              <p className="flex items-center gap-1 text-xs text-white/80">
                <Lock className="w-3 h-3" />
                Type and number are locked after creation
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="shrink-0 p-1.5 text-white hover:bg-primary-700 dark:hover:bg-primary-600 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
            {hasDraft && !order && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                <span className="text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                  Restored your unsaved draft.
                </span>
                <button
                  type="button"
                  onClick={handleDiscardDraft}
                  className="shrink-0 text-xs sm:text-sm font-medium text-amber-800 dark:text-amber-300 hover:underline"
                >
                  Discard
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-3 sm:gap-x-4 gap-y-3">
              <SectionTitle first>Basic Information</SectionTitle>

              {!isEditMode && (
                <>
                  <div>
                    <label className={labelClass}>Type *</label>
                    <Segmented
                      ariaLabel="Order type"
                      value={formData.doType || 'DO'}
                      options={[
                        { value: 'DO', label: 'DO' },
                        { value: 'SDO', label: 'SDO' },
                      ]}
                      onChange={handleDOTypeChange}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      {formData.doType || 'DO'} Number * <span className="font-normal text-gray-400">(auto)</span>
                    </label>
                    <input
                      type="text"
                      name="doNumber"
                      value={formData.doNumber || ''}
                      onChange={handleChange}
                      required
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              <div>
                <label className={labelClass}>Date *</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date || ''}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`${labelClass} flex items-center gap-1`}>
                  Import/Export *
                  {isDirectionRoleLocked && <Lock className="w-3 h-3" aria-label="Set by your role" />}
                </label>
                <Segmented
                  ariaLabel="Import or export"
                  value={formData.importOrExport === 'EXPORT' ? 'EXPORT' : 'IMPORT'}
                  options={[
                    { value: 'IMPORT', label: 'Import' },
                    { value: 'EXPORT', label: 'Export' },
                  ]}
                  onChange={(v) => setFormData(prev => ({ ...prev, importOrExport: v }))}
                  disabled={isDirectionRoleLocked}
                />
              </div>

              <div className="col-span-2">
                <label className={labelClass}>Invoice Numbers</label>
                <input
                  type="text"
                  name="invoiceNos"
                  value={formData.invoiceNos || ''}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Optional"
                />
              </div>

              <SectionTitle>Client & Haulier</SectionTitle>

              <div className="col-span-2 md:col-span-1">
                <label className={labelClass}>Client Name *</label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className={inputClass}
                  placeholder="Enter client name"
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className={labelClass}>Haulier</label>
                <input
                  type="text"
                  name="haulier"
                  value={formData.haulier || ''}
                  onChange={handleChange}
                  style={{ textTransform: 'uppercase' }}
                  className={inputClass}
                  placeholder="Optional"
                />
              </div>

              <SectionTitle>Vehicle & Cargo</SectionTitle>

              <div>
                <label className={labelClass}>Truck No. *</label>
                <input
                  type="text"
                  name="truckNo"
                  value={formData.truckNo || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className={inputClass}
                  placeholder="T844 EKS"
                />
              </div>

              <div>
                <label className={labelClass}>Trailer No. *</label>
                <input
                  type="text"
                  name="trailerNo"
                  value={formData.trailerNo || ''}
                  onChange={handleChange}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className={inputClass}
                  placeholder="T629 ELE"
                />
              </div>

              <div>
                <label className={labelClass}>Cargo Type *</label>
                <Segmented
                  ariaLabel="Cargo type"
                  value={formData.cargoType || 'loosecargo'}
                  options={[
                    { value: 'loosecargo', label: 'Loose' },
                    { value: 'container', label: 'Container' },
                  ]}
                  onChange={(cargoType) =>
                    setFormData(prev => ({
                      ...prev,
                      cargoType,
                      containerNo: cargoType === 'container' ? 'CONTAINER' : 'LOOSE CARGO',
                    }))
                  }
                />
              </div>

              <div>
                <label className={labelClass}>Container No.</label>
                <input
                  type="text"
                  name="containerNo"
                  value={formData.containerNo || ''}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Container no."
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className={labelClass}>Driver Name</label>
                <input
                  type="text"
                  name="driverName"
                  value={formData.driverName || ''}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Optional"
                />
              </div>

              <div className="col-span-2 md:col-span-1">
                <label className={labelClass}>Border Entry DRC</label>
                <input
                  type="text"
                  name="borderEntryDRC"
                  value={formData.borderEntryDRC || ''}
                  onChange={handleChange}
                  className={inputClass}
                  placeholder="Optional"
                />
              </div>

              <SectionTitle>Route</SectionTitle>

              <div>
                <label className={labelClass}>Loading Point *</label>
                <RouteSuggestInput
                  name="loadingPoint"
                  value={formData.loadingPoint || ''}
                  onChange={(v) => setFormData(prev => ({ ...prev, loadingPoint: v.toUpperCase() }))}
                  suggestions={routeSuggestions.origins}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className={inputClass}
                  placeholder="DAR"
                />
              </div>

              <div>
                <label className={labelClass}>Destination *</label>
                <RouteSuggestInput
                  name="destination"
                  value={formData.destination || ''}
                  onChange={(v) => setFormData(prev => ({ ...prev, destination: v.toUpperCase() }))}
                  suggestions={routeSuggestions.destinations}
                  required
                  style={{ textTransform: 'uppercase' }}
                  className={inputClass}
                  placeholder="CCR KOLWEZI"
                />
              </div>

              <SectionTitle>Financial</SectionTitle>

              <div className="col-span-2">
                <label className={labelClass}>Rate Structure *</label>
                <Segmented
                  ariaLabel="Rate structure"
                  value={isPerTon ? 'per_ton' : 'fixed_total'}
                  options={[
                    { value: 'per_ton', label: 'Per ton × tonnage' },
                    { value: 'fixed_total', label: 'Fixed total' },
                  ]}
                  onChange={(rateType) => setFormData(prev => ({ ...prev, rateType }))}
                />
              </div>

              <div>
                <label className={labelClass}>Tonnage *</label>
                <input
                  type="text"
                  inputMode="decimal"
                  name="tonnages"
                  value={tonnageInput}
                  onChange={handleChange}
                  required
                  className={inputClass}
                  placeholder="30.001"
                />
              </div>

              <div>
                <label className={labelClass}>{isPerTon ? 'Rate per ton ($) *' : 'Total amount ($) *'}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  name="ratePerTon"
                  value={formData.ratePerTon || ''}
                  onChange={handleChange}
                  onWheel={preventNumberInputScroll}
                  required
                  min="0"
                  step="0.01"
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>

              <div className="col-span-2 flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700/50 px-3 py-2 text-sm">
                <span className="text-gray-600 dark:text-gray-300">
                  Total amount{isPerTon ? '' : ' (fixed)'}
                </span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 flex gap-2 sm:justify-end border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting || isDownloading}
              className="flex-1 sm:flex-none h-10 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isDownloading}
              className="flex-1 sm:flex-none inline-flex items-center justify-center h-10 px-5 rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || isDownloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  {isDownloading ? 'Downloading PDF...' : (order ? 'Updating...' : 'Creating...')}
                </>
              ) : (
                <>{order ? 'Update' : 'Create'} {formData.doType || 'DO'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>

    <ConfirmModal
      open={flipConfirmOpen}
      title="Change IMPORT to EXPORT?"
      message={getImportToExportConfirmMessage()}
      confirmLabel="OK, update DO"
      cancelLabel="Cancel"
      variant="warning"
      loading={isSubmitting}
      onConfirm={handleConfirmImportToExportFlip}
      onCancel={handleCancelImportToExportFlip}
    />
    </>
  );
};

export default DOForm;
