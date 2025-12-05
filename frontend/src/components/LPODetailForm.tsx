import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, CheckCircle, ArrowLeft, ArrowRight, AlertTriangle, Ban, MapPin, Eye, Fuel } from 'lucide-react';
import { LPOSummary, LPODetail, FuelRecord, CancellationPoint } from '../types';
import { lpoDocumentsAPI, fuelRecordsAPI } from '../services/api';
import { formatTruckNumber } from '../utils/dataCleanup';
import { 
  getAvailableCancellationPoints, 
  getCancellationPointDisplayName,
  ZAMBIA_RETURNING_PARTS,
  FUEL_RECORD_COLUMNS
} from '../services/cancellationService';
import FuelRecordInspectModal, { calculateMbeyaReturnBalance } from './FuelRecordInspectModal';

// Station defaults mapping based on direction
// Correct rates: USD stations = 1.2, TZS stations have specific rates
const STATION_DEFAULTS: Record<string, { going?: number; returning?: number; rate: number; currency: 'USD' | 'TZS' }> = {
  // Zambia stations (USD)
  'LAKE CHILABOMBWE': { going: 260, returning: 0, rate: 1.2, currency: 'USD' },
  'LAKE NDOLA': { going: 0, returning: 50, rate: 1.2, currency: 'USD' },  // Return: 50L for Zambia Return split
  'LAKE KAPIRI': { going: 0, returning: 350, rate: 1.2, currency: 'USD' }, // Return: 350L for Zambia Return split
  'LAKE KITWE': { going: 260, returning: 0, rate: 1.2, currency: 'USD' },
  'LAKE KABANGWA': { going: 260, returning: 0, rate: 1.2, currency: 'USD' },
  'LAKE CHINGOLA': { going: 260, returning: 0, rate: 1.2, currency: 'USD' },
  // Tanzania stations (TZS)
  'LAKE TUNDUMA': { going: 0, returning: 100, rate: 2875, currency: 'TZS' }, // Tunduma Return
  'INFINITY': { going: 450, returning: 400, rate: 2757, currency: 'TZS' },   // Mbeya (both directions)
  'GBP MOROGORO': { going: 0, returning: 100, rate: 2710, currency: 'TZS' }, // Morogoro Return
  'GBP KANGE': { going: 0, returning: 70, rate: 2730, currency: 'TZS' },     // Tanga Return (70L for Mombasa/MSA)
  'GPB KANGE': { going: 0, returning: 70, rate: 2730, currency: 'TZS' },     // Typo version - Tanga Return
  // Cash payment (variable rate)
  'CASH': { going: 0, returning: 0, rate: 0, currency: 'TZS' }, // Rate entered manually
};

// Standard fuel allocations by checkpoint - exported for use in fuel record display
export const STANDARD_ALLOCATIONS = {
  darYard: { standard: 550, kisarawe: 580 },
  mbeyaGoing: 450,
  zambiaReturn: { ndola: 50, kapiri: 350, total: 400 },
  tundumaReturn: 100,
  mbeyaReturn: 400,
  moroReturn: 100,
  tangaReturn: 70,
};

// Zambia Going calculation helper - exported for use in fuel record forms
export const calculateZambiaGoing = (totalLts: number, extra: number, destination: string): number => {
  // Special destinations
  if (destination.toLowerCase().includes('lusaka')) return 60;
  if (destination.toLowerCase().includes('lubumbashi')) return 260;
  // Standard calculation: (total + extra) - 900 (Dar 550 + Mbeya 450 - buffer)
  return Math.max(0, (totalLts + extra) - 900);
};

// Available stations - Valid station names only (no going/return suffixes)
const STATIONS = [
  // Zambia stations (USD rate: 1.2)
  'LAKE CHILABOMBWE',
  'LAKE NDOLA',
  'LAKE KAPIRI',
  'LAKE KITWE',
  'LAKE KABANGWA',
  'LAKE CHINGOLA',
  // Tanzania stations (TZS rates)
  'LAKE TUNDUMA',   // Rate: 2875 TZS - for Tunduma checkpoint
  'INFINITY',       // Rate: 2757 TZS - for Mbeya checkpoint (both directions)
  'GBP MOROGORO',   // Rate: 2710 TZS - for Morogoro checkpoint
  'GBP KANGE',      // Rate: 2730 TZS - for Morogoro area
  'GPB KANGE',      // Rate: 2730 TZS - typo version for compatibility
  // Cash payment (variable rate)
  'CASH',
  // Custom station (for unlisted stations)
  'CUSTOM',
];

interface TruckFetchResult {
  fuelRecord: FuelRecord | null;
  goingDo: string;
  returnDo: string;
  destination: string;
  goingDestination: string;  // Original going destination (for fuel allocation when direction is 'going')
  balance: number;
  message: string;
  success: boolean;
  warningType?: 'not_found' | 'journey_completed' | 'no_active_record' | null;
}

interface EntryAutoFillData {
  direction: 'going' | 'returning';
  loading: boolean;
  fetched: boolean;
  fuelRecord: FuelRecord | null;
  fuelRecordId?: string | number;  // Store fuel record ID for inspect modal
  goingDestination?: string;  // Store original going destination for proper fuel allocation
  returnDoMissing?: boolean;  // Track if return DO is not yet inputted
  // Warning states for trucks without valid fuel records
  warningType?: 'not_found' | 'journey_completed' | 'no_active_record' | null;
  warningMessage?: string;
  // Balance info for Mbeya returning and other checkpoints
  balanceInfo?: {
    availableBalance: number;
    standardAllocation: number;
    suggestedLiters: number;
    reason: string;
  };
}

// Inspect modal state
interface InspectModalState {
  isOpen: boolean;
  truckNo: string;
  fuelRecord: FuelRecord | null;
  fuelRecordId?: string | number;
  direction: 'going' | 'returning';
  entryIndex: number;
}

// Cash currency conversion state
interface CashConversion {
  localRate: number;       // Rate per liter in local currency (e.g., ZMW)
  conversionRate: number;  // Conversion rate to TZS (e.g., 1 USD = X TZS or 1 ZMW = Y TZS)
  currency: string;        // Local currency code (e.g., 'ZMW', 'USD')
  calculatedRate: number;  // Final rate in TZS for LPO
}

interface LPODetailFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<LPOSummary>) => void;
  initialData?: LPOSummary;
}

// Local storage key for persisting form draft
const LPO_FORM_STORAGE_KEY = 'lpo_form_draft';

// Interface for stored form data
interface StoredFormData {
  formData: Partial<LPOSummary>;
  entryAutoFillData: Record<number, EntryAutoFillData>;
  goingEnabled: boolean;
  returningEnabled: boolean;
  goingCheckpoint: CancellationPoint | '';
  returningCheckpoint: CancellationPoint | '';
  cashConversion: CashConversion;
  customStationName: string;
  customGoingEnabled: boolean;
  customReturnEnabled: boolean;
  customGoingCheckpoint: string;
  customReturnCheckpoint: string;
  savedAt: string;
}

// Save form data to local storage
const saveFormToStorage = (data: StoredFormData) => {
  try {
    localStorage.setItem(LPO_FORM_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving form to local storage:', error);
  }
};

// Load form data from local storage
const loadFormFromStorage = (): StoredFormData | null => {
  try {
    const stored = localStorage.getItem(LPO_FORM_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as StoredFormData;
      // Check if data is less than 24 hours old
      const savedAt = new Date(parsed.savedAt);
      const now = new Date();
      const hoursDiff = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 24) {
        return parsed;
      } else {
        // Data is too old, clear it
        localStorage.removeItem(LPO_FORM_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.error('Error loading form from local storage:', error);
  }
  return null;
};

// Clear form data from local storage
const clearFormStorage = () => {
  try {
    localStorage.removeItem(LPO_FORM_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing form from local storage:', error);
  }
};

const LPODetailForm: React.FC<LPODetailFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<LPOSummary>>(() => {
    // Try to load from local storage on initial mount (only if not editing)
    if (!initialData) {
      const stored = loadFormFromStorage();
      if (stored) {
        return stored.formData;
      }
    }
    return {
      lpoNo: '',
      date: new Date().toISOString().split('T')[0],
      station: '',
      orderOf: 'TAHMEED',
      entries: [],
      total: 0,
    };
  });

  // Track auto-fill data for each entry
  const [entryAutoFillData, setEntryAutoFillData] = useState<Record<number, EntryAutoFillData>>(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      if (stored) {
        return stored.entryAutoFillData;
      }
    }
    return {};
  });
  const [isLoadingLpoNumber, setIsLoadingLpoNumber] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Cash cancellation state - now supports both directions simultaneously
  const [goingEnabled, setGoingEnabled] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.goingEnabled ?? false;
    }
    return false;
  });
  const [returningEnabled, setReturningEnabled] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.returningEnabled ?? false;
    }
    return false;
  });
  const [goingCheckpoint, setGoingCheckpoint] = useState<CancellationPoint | ''>(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.goingCheckpoint ?? '';
    }
    return '';
  });
  const [returningCheckpoint, setReturningCheckpoint] = useState<CancellationPoint | ''>(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.returningCheckpoint ?? '';
    }
    return '';
  });
  const [existingLPOsForTrucks, setExistingLPOsForTrucks] = useState<Map<string, { lpos: LPOSummary[], direction: string }[]>>(new Map());
  const [trucksWithoutLPOs, setTrucksWithoutLPOs] = useState<Set<string>>(new Set());
  const [isFetchingLPOs, setIsFetchingLPOs] = useState(false);
  
  // Track which entries have been created (to prevent auto-update of their rates)
  const [lockedEntryRates, setLockedEntryRates] = useState<Map<number, number>>(new Map());

  // Duplicate allocation warning state
  const [duplicateWarnings, setDuplicateWarnings] = useState<Map<string, {
    lpoNo: string;
    date: string;
    liters: number;
    isDifferentAmount: boolean; // true if new amount differs from existing (allowed)
    newLiters: number; // the new liters being entered
  }>>(new Map());
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Inspect modal state - for viewing fuel record details without leaving the form
  const [inspectModal, setInspectModal] = useState<InspectModalState>({
    isOpen: false,
    truckNo: '',
    fuelRecord: null,
    fuelRecordId: undefined,
    direction: 'going',
    entryIndex: -1,
  });

  // Cash currency conversion state
  const [cashConversion, setCashConversion] = useState<CashConversion>(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.cashConversion ?? {
        localRate: 0,
        conversionRate: 1,
        currency: 'ZMW',
        calculatedRate: 0,
      };
    }
    return {
      localRate: 0,
      conversionRate: 1,
      currency: 'ZMW',
      calculatedRate: 0,
    };
  });

  // Forwarding state - tracks if we're in "forwarding mode" after creating an LPO at a forwardable station
  const [isForwardingMode, setIsForwardingMode] = useState(false);
  const [forwardedFromInfo, setForwardedFromInfo] = useState<{
    lpoNo: string;
    station: string;
  } | null>(null);

  // Custom station state - for unlisted stations
  const [customStationName, setCustomStationName] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customStationName ?? '';
    }
    return '';
  });
  const [customGoingEnabled, setCustomGoingEnabled] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customGoingEnabled ?? false;
    }
    return false;
  });
  const [customReturnEnabled, setCustomReturnEnabled] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customReturnEnabled ?? false;
    }
    return false;
  });
  const [customGoingCheckpoint, setCustomGoingCheckpoint] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customGoingCheckpoint ?? '';
    }
    return '';
  });
  const [customReturnCheckpoint, setCustomReturnCheckpoint] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customReturnCheckpoint ?? '';
    }
    return '';
  });

  // Handle inspect modal open - view fuel record details
  const handleInspectRecord = (index: number) => {
    const autoFill = entryAutoFillData[index];
    const entry = formData.entries?.[index];
    
    if (!entry) return;
    
    setInspectModal({
      isOpen: true,
      truckNo: entry.truckNo,
      fuelRecord: autoFill?.fuelRecord || null,
      fuelRecordId: autoFill?.fuelRecordId,
      direction: autoFill?.direction || 'going',
      entryIndex: index,
    });
  };

  // Close inspect modal
  const handleCloseInspectModal = () => {
    setInspectModal(prev => ({ ...prev, isOpen: false }));
  };

  // Reset all form state to initial values
  const resetForm = (clearStorage = true) => {
    setFormData({
      lpoNo: '',
      date: new Date().toISOString().split('T')[0],
      station: '',
      orderOf: 'TAHMEED',
      entries: [],
      total: 0,
    });
    setEntryAutoFillData({});
    setGoingEnabled(false);
    setReturningEnabled(false);
    setGoingCheckpoint('');
    setReturningCheckpoint('');
    setExistingLPOsForTrucks(new Map());
    setTrucksWithoutLPOs(new Set());
    setDuplicateWarnings(new Map());
    setLockedEntryRates(new Map());
    setCashConversion({
      localRate: 0,
      conversionRate: 1,
      currency: 'ZMW',
      calculatedRate: 0,
    });
    setIsForwardingMode(false);
    setForwardedFromInfo(null);
    setCustomStationName('');
    setCustomGoingEnabled(false);
    setCustomReturnEnabled(false);
    setCustomGoingCheckpoint('');
    setCustomReturnCheckpoint('');
    setHasDraft(false);
    // Clear local storage if requested
    if (clearStorage) {
      clearFormStorage();
    }
  };

  // Check for existing draft on mount and when modal opens
  useEffect(() => {
    if (isOpen && !initialData) {
      const stored = loadFormFromStorage();
      if (stored && stored.formData.entries && stored.formData.entries.length > 0) {
        // Found a draft with entries - keep the loaded data and show indicator
        setHasDraft(true);
        // Entries are already loaded from useState initializers
      } else {
        // No draft or empty draft - reset and fetch new LPO number
        resetForm(false); // Don't clear storage since there's nothing there
        fetchNextLpoNumber();
      }
    }
  }, [isOpen, initialData]);

  // Auto-save form data to local storage on changes (debounced)
  useEffect(() => {
    // Don't save if editing existing LPO or if form is empty
    if (initialData) return;
    if (!formData.entries || formData.entries.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      saveFormToStorage({
        formData,
        entryAutoFillData,
        goingEnabled,
        returningEnabled,
        goingCheckpoint,
        returningCheckpoint,
        cashConversion,
        customStationName,
        customGoingEnabled,
        customReturnEnabled,
        customGoingCheckpoint,
        customReturnCheckpoint,
        savedAt: new Date().toISOString(),
      });
      setHasDraft(true);
    }, 1000); // Save after 1 second of no changes
    
    return () => clearTimeout(timeoutId);
  }, [
    formData, 
    entryAutoFillData, 
    goingEnabled, 
    returningEnabled, 
    goingCheckpoint, 
    returningCheckpoint,
    cashConversion,
    customStationName,
    customGoingEnabled,
    customReturnEnabled,
    customGoingCheckpoint,
    customReturnCheckpoint,
    initialData
  ]);

  // Handle cancel button click - reset and close
  const handleCancel = () => {
    resetForm();
    onClose();
  };

  // Handle discard draft
  const handleDiscardDraft = () => {
    resetForm();
    fetchNextLpoNumber();
  };

  // Calculate TZS rate when cash conversion values change
  // Only update entries that haven't been locked (new entries only)
  useEffect(() => {
    if (formData.station === 'CASH' && cashConversion.localRate > 0 && cashConversion.conversionRate > 0) {
      // If currency is ZMW, convert to TZS: localRate * conversionRate
      // Example: 26 ZMW/liter * 116 (TZS per ZMW) = 3016 TZS/liter
      const calculatedRate = cashConversion.localRate * cashConversion.conversionRate;
      setCashConversion(prev => ({ ...prev, calculatedRate }));
      
      // Only update entries that are NOT locked (entries added after rate was set keep their original rate)
      const updatedEntries = formData.entries?.map((entry, index) => {
        const lockedRate = lockedEntryRates.get(index);
        if (lockedRate !== undefined) {
          // Entry is locked, keep its original rate
          return entry;
        }
        // Entry is not locked, update with new calculated rate
        return {
          ...entry,
          rate: calculatedRate,
          amount: entry.liters * calculatedRate
        };
      }) || [];
      
      const total = updatedEntries.reduce((sum, entry) => sum + entry.amount, 0);
      setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
    }
  }, [cashConversion.localRate, cashConversion.conversionRate, formData.station, lockedEntryRates]);

  // Fetch existing LPOs for trucks when CASH is selected and checkpoint(s) are chosen
  useEffect(() => {
    const fetchExistingLPOs = async () => {
      // Check if at least one direction is enabled with a checkpoint
      const hasGoingCheckpoint = goingEnabled && goingCheckpoint;
      const hasReturningCheckpoint = returningEnabled && returningCheckpoint;
      
      if (formData.station === 'CASH' && (hasGoingCheckpoint || hasReturningCheckpoint) && formData.entries && formData.entries.length > 0) {
        setIsFetchingLPOs(true);
        const newMap = new Map<string, { lpos: LPOSummary[], direction: string }[]>();
        const trucksWithoutLPOsSet = new Set<string>();
        
        try {
          for (const entry of formData.entries) {
            if (entry.truckNo && entry.truckNo.length >= 4) {
              const truckLPOs: { lpos: LPOSummary[], direction: string }[] = [];
              
              // Check going direction if enabled
              if (hasGoingCheckpoint) {
                const goingLpos = await lpoDocumentsAPI.findAtCheckpoint(entry.truckNo);
                if (goingLpos.length > 0) {
                  truckLPOs.push({ lpos: goingLpos, direction: 'Going' });
                }
              }
              
              // Check returning direction if enabled
              if (hasReturningCheckpoint) {
                const returningLpos = await lpoDocumentsAPI.findAtCheckpoint(entry.truckNo);
                if (returningLpos.length > 0) {
                  truckLPOs.push({ lpos: returningLpos, direction: 'Returning' });
                }
              }
              
              if (truckLPOs.length > 0) {
                newMap.set(entry.truckNo, truckLPOs);
              } else {
                // Truck has no LPOs at selected checkpoints
                trucksWithoutLPOsSet.add(entry.truckNo);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching existing LPOs:', error);
        } finally {
          setExistingLPOsForTrucks(newMap);
          setTrucksWithoutLPOs(trucksWithoutLPOsSet);
          setIsFetchingLPOs(false);
        }
      } else {
        setExistingLPOsForTrucks(new Map());
        setTrucksWithoutLPOs(new Set());
      }
    };

    fetchExistingLPOs();
  }, [formData.station, goingEnabled, returningEnabled, goingCheckpoint, returningCheckpoint, formData.entries?.map(e => e.truckNo).join(',')]);

  // Check for duplicate allocations when station or entries change (for non-CASH stations)
  useEffect(() => {
    const checkDuplicates = async () => {
      // Skip for CASH station - duplicates are handled differently there
      if (!formData.station || formData.station.toUpperCase() === 'CASH' || !formData.entries || formData.entries.length === 0) {
        setDuplicateWarnings(new Map());
        return;
      }

      setIsCheckingDuplicates(true);
      const warnings = new Map<string, { lpoNo: string; date: string; liters: number; isDifferentAmount: boolean; newLiters: number }>();

      try {
        for (const entry of formData.entries) {
          if (entry.truckNo && entry.truckNo.length >= 4) {
            const result = await lpoDocumentsAPI.checkDuplicateAllocation(
              entry.truckNo, 
              formData.station,
              initialData?.id?.toString(),
              entry.liters // Pass the new liters amount to check
            );
            
            if (result.hasDuplicate && result.existingLpos.length > 0) {
              const existingLpo = result.existingLpos[0];
              const existingEntry = existingLpo.entries[0];
              warnings.set(entry.truckNo, {
                lpoNo: existingLpo.lpoNo,
                date: existingLpo.date,
                liters: existingEntry?.liters || 0,
                isDifferentAmount: result.isDifferentAmount || false,
                newLiters: entry.liters
              });
            }
          }
        }
        setDuplicateWarnings(warnings);
      } catch (error) {
        console.error('Error checking duplicates:', error);
      } finally {
        setIsCheckingDuplicates(false);
      }
    };

    // Debounce the check to avoid too many API calls
    const timeoutId = setTimeout(checkDuplicates, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.station, formData.entries?.map(e => `${e.truckNo}:${e.liters}`).join(','), initialData?.id]);

  // Load initial data when editing an existing LPO
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const fetchNextLpoNumber = async () => {
    setIsLoadingLpoNumber(true);
    try {
      const nextLpoNo = await lpoDocumentsAPI.getNextLpoNumber();
      setFormData(prev => ({ ...prev, lpoNo: nextLpoNo }));
    } catch (error) {
      console.error('Error fetching next LPO number:', error);
      // If error or no data, start from a default number
      setFormData(prev => ({ ...prev, lpoNo: '2445' }));
    } finally {
      setIsLoadingLpoNumber(false);
    }
  };

  // Fetch truck data when truck number changes
  // Search logic: current month → previous month → month before that
  // If found with balance=0, journey is complete (no fuel allocation needed)
  const fetchTruckData = useCallback(async (truckNo: string): Promise<TruckFetchResult> => {
    if (!truckNo || truckNo.length < 3) {
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: 'Enter a valid truck number',
        success: false
      };
    }

    try {
      // Fetch all fuel records for this truck
      const fuelRecords = await fuelRecordsAPI.getAll({ truckNo: truckNo.trim() });
      
      // Filter out cancelled fuel records - ignore them as if they don't exist
      const activeFuelRecords = (fuelRecords || []).filter((r: FuelRecord) => !r.isCancelled);
      
      if (!activeFuelRecords || activeFuelRecords.length === 0) {
        return {
          fuelRecord: null,
          goingDo: 'NIL',
          returnDo: 'NIL',
          destination: 'NIL',
          goingDestination: 'NIL',
          balance: 0,
          message: '⚠️ No fuel record found - truck may not be on a journey. You can still add fuel manually.',
          success: false,
          warningType: 'not_found' as const
        };
      }

      // Check if any active fuel record is locked (pending admin configuration)
      const lockedRecord = activeFuelRecords.find((r: any) => r.isLocked);
      if (lockedRecord) {
        const reasonText = lockedRecord.pendingConfigReason === 'both' 
          ? 'route total liters and truck batch assignment'
          : lockedRecord.pendingConfigReason === 'missing_total_liters'
          ? 'route total liters configuration'
          : 'truck batch assignment';
        
        return {
          fuelRecord: lockedRecord,
          goingDo: lockedRecord.goingDo || 'NIL',
          returnDo: lockedRecord.returnDo || 'NIL',
          destination: lockedRecord.to || 'NIL',
          goingDestination: lockedRecord.originalGoingTo || lockedRecord.to || 'NIL',
          balance: 0,
          message: `🔒 LOCKED: This fuel record is waiting for admin to configure ${reasonText}.\n\nDO: ${lockedRecord.goingDo}\nTruck: ${lockedRecord.truckNo}\nDestination: ${lockedRecord.to}\n\nPlease contact admin to unlock this record before creating LPOs.`,
          success: false,
          warningType: 'not_found' as const
        };
      }

      // Get current date and calculate month boundaries (4 months for better searching)
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

      // Helper to check if a date is within a specific month
      const isInMonth = (dateStr: string, monthStart: Date): boolean => {
        const date = new Date(dateStr);
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        return date >= monthStart && date <= monthEnd;
      };

      /**
       * Check if a journey is complete based on return checkpoints
       * - For non-MSA destinations: mbeyaReturn must be filled (not 0)
       * - For MSA destinations: tangaReturn must be filled (not 0)
       * - balance === 0 is also required
       * - Negative balance is acceptable (not journey complete)
       */
      const isJourneyComplete = (record: FuelRecord): boolean => {
        // Balance must be exactly 0 for journey to be complete
        // Negative balance is acceptable and means journey is still active
        if (record.balance !== 0) {
          return false;
        }
        
        const destination = (record.originalGoingTo || record.to || '').toUpperCase();
        const isMSADestination = destination.includes('MSA') || destination.includes('MOMBASA');
        
        if (isMSADestination) {
          // For MSA destinations, check if tangaReturn is filled
          return (record as any).tangaReturn !== 0 && (record as any).tangaReturn !== undefined;
        } else {
          // For non-MSA destinations, check if mbeyaReturn is filled
          return (record as any).mbeyaReturn !== 0 && (record as any).mbeyaReturn !== undefined;
        }
      };

      // Sort records by date descending (most recent first)
      const sortedRecords = [...activeFuelRecords].sort((a: FuelRecord, b: FuelRecord) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Search for active fuel record: current month → previous month → two months ago → three months ago
      // Active record = balance !== 0 (negative is acceptable) AND journey not complete
      let activeRecord: FuelRecord | null = null;
      let searchMonth = 'current';

      // Helper to check if a record is active (balance != 0 OR journey not complete based on return checkpoints)
      const isActiveRecord = (r: FuelRecord): boolean => {
        // If balance is not 0 (including negative), it's active
        if (r.balance !== 0) {
          return true;
        }
        // If balance is 0, check if journey is truly complete based on return checkpoints
        return !isJourneyComplete(r);
      };

      // First, try to find a record in current month that is active
      activeRecord = sortedRecords.find((r: FuelRecord) => 
        isInMonth(r.date, currentMonth) && isActiveRecord(r)
      ) || null;

      if (!activeRecord) {
        // Try previous month
        searchMonth = 'previous';
        activeRecord = sortedRecords.find((r: FuelRecord) => 
          isInMonth(r.date, previousMonth) && isActiveRecord(r)
        ) || null;
      }

      if (!activeRecord) {
        // Try two months ago
        searchMonth = 'two months ago';
        activeRecord = sortedRecords.find((r: FuelRecord) => 
          isInMonth(r.date, twoMonthsAgo) && isActiveRecord(r)
        ) || null;
      }

      if (!activeRecord) {
        // Try three months ago (4 months total search window)
        searchMonth = 'three months ago';
        activeRecord = sortedRecords.find((r: FuelRecord) => 
          isInMonth(r.date, threeMonthsAgo) && isActiveRecord(r)
        ) || null;
      }

      // If still no active record, check if we have any record at all
      if (!activeRecord) {
        // Get the most recent record regardless of month
        const mostRecent = sortedRecords[0];
        
        if (mostRecent && isJourneyComplete(mostRecent)) {
          // Journey truly completed - return checkpoint is filled
          const goingDest = mostRecent.originalGoingTo || mostRecent.to || 'NIL';
          const destination = (mostRecent.originalGoingTo || mostRecent.to || '').toUpperCase();
          const isMSA = destination.includes('MSA') || destination.includes('MOMBASA');
          const returnCheckpoint = isMSA ? 'Tanga Return' : 'Mbeya Return';
          return {
            fuelRecord: mostRecent,
            goingDo: mostRecent.goingDo || 'NIL',
            returnDo: mostRecent.returnDo || 'NIL',
            destination: mostRecent.to || 'NIL',
            goingDestination: goingDest,
            balance: 0,
            message: `⚠️ Journey completed (${returnCheckpoint} filled). Last trip: ${mostRecent.goingDo}. You can still add fuel manually if needed.`,
            success: false,  // Mark as not successful since no fuel allocation is needed
            warningType: 'journey_completed' as const
          };
        }

        // No active record found in last 4 months
        return {
          fuelRecord: null,
          goingDo: 'NIL',
          returnDo: 'NIL',
          destination: 'NIL',
          goingDestination: 'NIL',  // Added: original going destination
          balance: 0,
          message: '⚠️ No active journey found in last 4 months. You can still add fuel manually.',
          success: false,
          warningType: 'no_active_record' as const
        };
      }

      // Found active record with balance > 0
      // IMPORTANT: Use originalGoingTo for the going destination if available
      // This handles the case where EXPORT DO has changed from/to fields
      const goingDestination = activeRecord.originalGoingTo || activeRecord.to || 'NIL';
      const currentDestination = activeRecord.to || 'NIL';
      
      return {
        fuelRecord: activeRecord,
        goingDo: activeRecord.goingDo || 'NIL',
        returnDo: activeRecord.returnDo || 'NIL',
        destination: currentDestination,  // Current destination (might have changed for return)
        goingDestination: goingDestination,  // Original going destination for fuel allocation
        balance: activeRecord.balance || 0,
        message: `Found (${searchMonth} month): Going DO ${activeRecord.goingDo}, Balance: ${activeRecord.balance}L`,
        success: true
      };
    } catch (error) {
      console.error('Error fetching truck data:', error);
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: 'Error fetching truck data',
        success: false
      };
    }
  }, []);

  // Get default fuel amount based on station, direction, and destination
  // Special rules:
  // - Lusaka destination: 60L at Zambia Going
  // - Lubumbashi destination: 260L at Zambia Going  
  // - Mombasa/MSA destination: 70L at GBP KANGE (Tanga Return)
  const getStationDefaults = (
    station: string, 
    direction: 'going' | 'returning',
    destination?: string
  ): { liters: number; rate: number } => {
    const stationUpper = station.toUpperCase();
    const defaults = STATION_DEFAULTS[stationUpper];
    const dest = destination?.toLowerCase() || '';
    
    if (defaults) {
      let liters = direction === 'going' ? (defaults.going || 0) : (defaults.returning || 0);
      
      // Special destination-based adjustments for Zambia Going stations
      if (direction === 'going' && stationUpper.includes('LAKE') && !stationUpper.includes('TUNDUMA')) {
        if (dest.includes('lusaka')) {
          liters = 60;  // Lusaka: 60L
        } else if (dest.includes('lubumbashi')) {
          liters = 260; // Lubumbashi: 260L
        }
      }
      
      // GBP KANGE for Mombasa/MSA is 70L (Tanga Return)
      if ((stationUpper === 'GBP KANGE' || stationUpper === 'GPB KANGE') && direction === 'returning') {
        if (dest.includes('mombasa') || dest.includes('msa') || dest === '') {
          liters = 70; // Default Tanga Return for Mombasa/MSA
        }
      }
      
      return { liters, rate: defaults.rate };
    }
    
    // Default values if station not found
    return { liters: 350, rate: 1.2 };
  };

  // Zambia Return Split: Same trucks get fuel at TWO stations in sequence
  // Lake Ndola (50L) → Lake Kapiri (350L) = 400L total for Zambia Return
  // Source stations that can forward trucks to the next station
  const FORWARDABLE_STATIONS: Record<string, { 
    targetStation: string; 
    targetLiters: number; 
    targetRate: number;
    description: string;
  }> = {
    'LAKE NDOLA': { 
      targetStation: 'LAKE KAPIRI', 
      targetLiters: 350, 
      targetRate: 1.2,
      description: 'Forward to Kapiri (350L) - Total Zambia Return: 400L'
    },
    'LAKE TUNDUMA': { 
      targetStation: 'INFINITY', 
      targetLiters: 400, 
      targetRate: 2757,
      description: 'Forward to Infinity/Mbeya (400L)'
    },
  };

  // Fuel allocation reference:
  // GOING: Dar Yard (550/580), Dar Going (variable), Mbeya Going (450), Zambia Going (calculated)
  // RETURNING: Zambia Return (400 = Ndola 50 + Kapiri 350), Tunduma Return (100), 
  //            Mbeya Return (400), Moro Return (100), Tanga Return (70), Dar Return (variable)

  // Check if current station is a forwardable station (can forward trucks to next station)
  const isForwardableStation = useCallback((): boolean => {
    const station = formData.station?.toUpperCase();
    return station ? !!FORWARDABLE_STATIONS[station] : false;
  }, [formData.station]);

  // Get forwarding config for current station
  const getForwardingConfig = useCallback(() => {
    const station = formData.station?.toUpperCase();
    return station ? FORWARDABLE_STATIONS[station] : null;
  }, [formData.station]);

  // Prepare forwarded entries for the modal
  const prepareForwardedEntries = useCallback((): LPODetail[] => {
    const config = getForwardingConfig();
    if (!config || !formData.entries) return [];
    
    // Only include active (non-cancelled) entries
    const activeEntries = formData.entries.filter(e => !e.isCancelled);
    
    return activeEntries.map(entry => ({
      doNo: entry.doNo,
      truckNo: entry.truckNo,
      liters: config.targetLiters,
      rate: config.targetRate,
      amount: config.targetLiters * config.targetRate,
      dest: entry.dest,
      isCancelled: false,
      isDriverAccount: false,
    }));
  }, [formData.entries, getForwardingConfig]);

  const handleHeaderChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // When station changes, update rates for existing entries (no auto-forwarding)
    if (name === 'station' && value) {
      // Regular station change - update rates for existing entries
      const updatedEntries = formData.entries?.map((entry, idx) => {
        const direction = entryAutoFillData[idx]?.direction || 'going';
        const defaults = getStationDefaults(value, direction, entry.dest);
        return {
          ...entry,
          rate: defaults.rate,
          liters: entry.liters || defaults.liters,
          amount: (entry.liters || defaults.liters) * defaults.rate
        };
      }) || [];
      
      const total = updatedEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
    }
  };

  const handleAddEntry = () => {
    const newEntry: LPODetail = {
      doNo: 'NIL',
      truckNo: '',
      liters: 0,
      rate: formData.station ? getStationDefaults(formData.station, 'going').rate : 1.2,
      amount: 0,
      dest: 'NIL',
    };
    
    const newIndex = formData.entries?.length || 0;
    
    setEntryAutoFillData(prev => ({
      ...prev,
      [newIndex]: { direction: 'going', loading: false, fetched: false, fuelRecord: null }
    }));
    
    setFormData((prev) => ({
      ...prev,
      entries: [...(prev.entries || []), newEntry],
    }));
  };

  // Handle truck number change with auto-fetch
  const handleTruckNoChange = async (index: number, truckNo: string) => {
    // Format the truck number to standard format: T(number)(space)(letters)
    const formattedTruckNo = formatTruckNumber(truckNo);
    
    // Update the truck number immediately
    const updatedEntries = [...(formData.entries || [])];
    updatedEntries[index] = { ...updatedEntries[index], truckNo: formattedTruckNo };
    setFormData(prev => ({ ...prev, entries: updatedEntries }));

    // If truck number is valid, fetch data
    if (formattedTruckNo && formattedTruckNo.length >= 5) {
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { ...prev[index], loading: true, fetched: false }
      }));

      const result = await fetchTruckData(formattedTruckNo);
      
      const direction = entryAutoFillData[index]?.direction || 'going';
      const doNumber = direction === 'going' ? result.goingDo : (result.returnDo || result.goingDo);
      
      // Check if return DO is missing
      const returnDoMissing = !result.returnDo || result.returnDo === 'NIL' || result.returnDo === '';
      
      // IMPORTANT: Use goingDestination for going journey fuel allocation
      // This ensures we use the original destination before EXPORT DO changed it
      const destinationForAllocation = direction === 'going'
        ? result.goingDestination 
        : result.destination;
      
      const defaults = formData.station 
        ? getStationDefaults(formData.station, direction, destinationForAllocation) 
        : { liters: 350, rate: 1.2 };

      // Auto-fill the entry
      const newEntries = [...(formData.entries || [])];
      newEntries[index] = {
        ...newEntries[index],
        truckNo,
        doNo: doNumber,
        dest: destinationForAllocation,  // Use correct destination based on direction
        liters: defaults.liters,
        rate: defaults.rate,
        amount: defaults.liters * defaults.rate
      };

      const total = newEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      
      // Calculate balance info for Mbeya returning (INFINITY station)
      let balanceInfo = undefined;
      if (result.fuelRecord && formData.station?.toUpperCase() === 'INFINITY' && direction === 'returning') {
        balanceInfo = calculateMbeyaReturnBalance(result.fuelRecord);
        // If suggested liters differs from standard, update the entry
        if (balanceInfo.suggestedLiters !== defaults.liters && balanceInfo.suggestedLiters > 0) {
          newEntries[index].liters = balanceInfo.suggestedLiters;
          newEntries[index].amount = balanceInfo.suggestedLiters * newEntries[index].rate;
        }
      }
      
      setFormData(prev => ({ ...prev, entries: newEntries, total }));
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { 
          direction, 
          loading: false, 
          fetched: result.success, 
          fuelRecord: result.fuelRecord,
          fuelRecordId: result.fuelRecord?.id,  // Store fuel record ID for inspect modal
          goingDestination: result.goingDestination,  // Store for later use when toggling direction
          returnDoMissing,  // Track if return DO is missing
          warningType: result.warningType || null,
          warningMessage: result.message,
          balanceInfo,  // Store balance info for display
        }
      }));
    }
  };

  // Toggle direction (going/returning) for an entry
  const toggleDirection = async (index: number) => {
    const currentDirection = entryAutoFillData[index]?.direction || 'going';
    const newDirection = currentDirection === 'going' ? 'returning' : 'going';
    const fuelRecord = entryAutoFillData[index]?.fuelRecord;
    const storedGoingDestination = entryAutoFillData[index]?.goingDestination;

    // Update the DO number and liters based on new direction
    if (fuelRecord) {
      const doNumber = newDirection === 'going' ? fuelRecord.goingDo : (fuelRecord.returnDo || fuelRecord.goingDo);
      
      // IMPORTANT: Use correct destination based on direction
      // For going: use originalGoingTo (stored goingDestination) to get original going destination
      // For returning: use the current 'to' field
      const destinationForAllocation = newDirection === 'going'
        ? (storedGoingDestination || fuelRecord.originalGoingTo || fuelRecord.to)
        : fuelRecord.to;
      
      const defaults = formData.station 
        ? getStationDefaults(formData.station, newDirection, destinationForAllocation) 
        : { liters: 350, rate: 1.2 };

      let litersToSet = defaults.liters;
      
      // Calculate balance info for Mbeya returning (INFINITY station)
      let balanceInfo = undefined;
      if (formData.station?.toUpperCase() === 'INFINITY' && newDirection === 'returning') {
        balanceInfo = calculateMbeyaReturnBalance(fuelRecord);
        // If suggested liters differs from standard, use it
        if (balanceInfo.suggestedLiters !== defaults.liters && balanceInfo.suggestedLiters > 0) {
          litersToSet = balanceInfo.suggestedLiters;
        }
      }

      const newEntries = [...(formData.entries || [])];
      newEntries[index] = {
        ...newEntries[index],
        doNo: doNumber,
        dest: destinationForAllocation,  // Update destination based on direction
        liters: litersToSet,
        amount: litersToSet * defaults.rate
      };

      const total = newEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      setFormData(prev => ({ ...prev, entries: newEntries, total }));
      
      // Update autofill data with new direction and balance info
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { 
          ...prev[index], 
          direction: newDirection,
          balanceInfo: newDirection === 'returning' ? balanceInfo : undefined
        }
      }));
    } else {
      // Just update direction if no fuel record
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { ...prev[index], direction: newDirection }
      }));
    }
  };

  const handleEntryChange = (index: number, field: keyof LPODetail, value: string | number) => {
    const updatedEntries = [...(formData.entries || [])];
    updatedEntries[index] = {
      ...updatedEntries[index],
      [field]: value,
    };

    // Auto-calculate amount when liters or rate changes
    if (field === 'liters' || field === 'rate') {
      const liters = field === 'liters' ? Number(value) : updatedEntries[index].liters;
      const rate = field === 'rate' ? Number(value) : updatedEntries[index].rate;
      updatedEntries[index].amount = liters * rate;
    }

    // Calculate total
    const total = updatedEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);

    setFormData((prev) => ({
      ...prev,
      entries: updatedEntries,
      total,
    }));
  };

  const handleRemoveEntry = (index: number) => {
    const updatedEntries = formData.entries!.filter((_, i) => i !== index);
    const total = updatedEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    
    // Reindex the auto-fill data
    const newAutoFillData: Record<number, EntryAutoFillData> = {};
    Object.keys(entryAutoFillData).forEach(key => {
      const idx = parseInt(key);
      if (idx < index) {
        newAutoFillData[idx] = entryAutoFillData[idx];
      } else if (idx > index) {
        newAutoFillData[idx - 1] = entryAutoFillData[idx];
      }
    });
    
    setEntryAutoFillData(newAutoFillData);
    setFormData((prev) => ({
      ...prev,
      entries: updatedEntries,
      total,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate entries
    if (!formData.entries || formData.entries.length === 0) {
      alert('Please add at least one entry');
      return;
    }

    // Validate required fields
    if (!formData.lpoNo || !formData.lpoNo.trim()) {
      alert('LPO number is required');
      return;
    }
    if (!formData.date) {
      alert('Date is required');
      return;
    }
    if (!formData.station || !formData.station.trim()) {
      alert('Station is required');
      return;
    }
    if (!formData.orderOf || !formData.orderOf.trim()) {
      alert('Order of is required');
      return;
    }

    // CASH station requires at least one direction with checkpoint selection
    if (formData.station === 'CASH') {
      if (!goingEnabled && !returningEnabled) {
        alert('For CASH payments, you must enable at least one direction (Going or Returning).');
        return;
      }
      if (goingEnabled && !goingCheckpoint) {
        alert('Going direction is enabled but no checkpoint is selected. Please select a checkpoint or disable Going direction.');
        return;
      }
      if (returningEnabled && !returningCheckpoint) {
        alert('Returning direction is enabled but no checkpoint is selected. Please select a checkpoint or disable Returning direction.');
        return;
      }
    }

    // CUSTOM station validation
    if (formData.station === 'CUSTOM') {
      if (!customStationName || !customStationName.trim()) {
        alert('For CUSTOM station, you must enter a station name.');
        return;
      }
      if (!customGoingEnabled && !customReturnEnabled) {
        alert('For CUSTOM station, you must select at least one direction (Going or Return).');
        return;
      }
      if (customGoingEnabled && !customGoingCheckpoint) {
        alert('For CUSTOM station Going direction, you must select which fuel record column to update.');
        return;
      }
      if (customReturnEnabled && !customReturnCheckpoint) {
        alert('For CUSTOM station Return direction, you must select which fuel record column to update.');
        return;
      }
    }

    // Block submission if there are exact duplicate allocations (same liters at same station)
    // Different amounts are allowed (top-up/adjustment scenario)
    if (formData.station?.toUpperCase() !== 'CASH' && duplicateWarnings.size > 0) {
      // Filter to only get exact duplicates (same liters)
      const exactDuplicates = Array.from(duplicateWarnings.entries())
        .filter(([_, info]) => !info.isDifferentAmount);
      
      if (exactDuplicates.length > 0) {
        const duplicateTrucks = exactDuplicates.map(([truckNo, info]) => 
          `${truckNo} (${info.liters}L in LPO #${info.lpoNo})`
        ).join('\n');
        alert(`Cannot create LPO: The following trucks already have the SAME fuel amount allocated at ${formData.station}:\n\n${duplicateTrucks}\n\nThis looks like a duplicate entry. If you need to add extra fuel, please change the liters amount.`);
        return;
      }
    }

    // Validate each entry has required fields
    const invalidEntries = formData.entries.filter(
      (entry) => !entry.truckNo || !entry.truckNo.trim()
    );
    if (invalidEntries.length > 0) {
      alert('All entries must have a truck number');
      return;
    }

    // Ensure all entries have required fields with proper defaults
    // For CASH mode, include both direction checkpoints (can have one or both)
    // For CUSTOM mode, include the custom station checkpoint mappings
    const validEntries = formData.entries.map(entry => ({
      ...entry,
      doNo: (entry.doNo && entry.doNo.trim()) || 'NIL',
      truckNo: entry.truckNo.trim(),
      dest: (entry.dest && entry.dest.trim()) || 'NIL',
      liters: Number(entry.liters) || 0,
      rate: Number(entry.rate) || 0,
      amount: (Number(entry.liters) || 0) * (Number(entry.rate) || 0),
      // Include checkpoint(s) for CASH entries - can have going, returning, or both
      goingCheckpoint: formData.station === 'CASH' && goingEnabled && goingCheckpoint ? goingCheckpoint : undefined,
      returningCheckpoint: formData.station === 'CASH' && returningEnabled && returningCheckpoint ? returningCheckpoint : undefined,
      // Include custom station data for CUSTOM entries
      isCustomStation: formData.station === 'CUSTOM',
      customStationName: formData.station === 'CUSTOM' ? customStationName : undefined,
      customGoingCheckpoint: formData.station === 'CUSTOM' && customGoingEnabled ? customGoingCheckpoint : undefined,
      customReturnCheckpoint: formData.station === 'CUSTOM' && customReturnEnabled ? customReturnCheckpoint : undefined,
    }));

    const total = validEntries.reduce((sum, entry) => sum + entry.amount, 0);

    // Perform auto-cancellation for CASH mode if checkpoint(s) are selected
    if (formData.station === 'CASH' && existingLPOsForTrucks.size > 0) {
      try {
        // Cancel trucks in existing LPOs for all directions
        for (const [truckNo, directionLPOs] of existingLPOsForTrucks) {
          for (const { lpos, direction } of directionLPOs) {
            const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
            for (const lpo of lpos) {
              await lpoDocumentsAPI.cancelTruck(
                lpo.id as string,
                truckNo,
                checkpoint as CancellationPoint,
                `Cash mode payment - station was out of fuel (${direction})`
              );
            }
          }
        }
        console.log('Auto-cancellation completed for both directions');
      } catch (error) {
        console.error('Error during auto-cancellation:', error);
        // Continue with LPO creation even if cancellation fails
      }
    }

    // For CUSTOM station, use the custom station name as the station value
    // The station field will show the actual custom name (not "CUSTOM")
    const actualStation = formData.station === 'CUSTOM' ? customStationName : formData.station;
    
    const submitData: Partial<LPOSummary> = {
      ...formData,
      station: actualStation,
      entries: validEntries.map(entry => ({
        ...entry,
        // Ensure custom station info is properly set with actual station name
        customStationName: formData.station === 'CUSTOM' ? customStationName : undefined,
      })),
      total,
      // Include custom station metadata at the LPO level
      isCustomStation: formData.station === 'CUSTOM',
      customStationName: formData.station === 'CUSTOM' ? customStationName : undefined,
      customGoingCheckpoint: formData.station === 'CUSTOM' && customGoingEnabled ? customGoingCheckpoint : undefined,
      customReturnCheckpoint: formData.station === 'CUSTOM' && customReturnEnabled ? customReturnCheckpoint : undefined,
    };

    // Include forwardedFrom info if in forwarding mode (without lpoId - we only have lpoNo)
    if (isForwardingMode && forwardedFromInfo) {
      submitData.forwardedFrom = {
        lpoNo: forwardedFromInfo.lpoNo,
        station: forwardedFromInfo.station,
      };
    }

    onSubmit(submitData);
    
    // Clear the draft from local storage after successful submit
    clearFormStorage();
    setHasDraft(false);

    // Reset forwarding mode after submit
    if (isForwardingMode) {
      setIsForwardingMode(false);
      setForwardedFromInfo(null);
    }
  };

  // Handle "Forward Trucks" button click - creates LPO and resets form with forwarded data
  const handleForwardAndSubmit = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Same validation as handleSubmit
    if (!formData.entries || formData.entries.length === 0) {
      alert('Please add at least one entry');
      return;
    }
    if (!formData.lpoNo || !formData.lpoNo.trim()) {
      alert('LPO number is required');
      return;
    }
    if (!formData.date) {
      alert('Date is required');
      return;
    }
    if (!formData.station || !formData.station.trim()) {
      alert('Station is required');
      return;
    }
    if (!formData.orderOf || !formData.orderOf.trim()) {
      alert('Order of is required');
      return;
    }
    
    // Validate each entry has truck number
    const invalidEntries = formData.entries.filter(
      (entry) => !entry.truckNo || !entry.truckNo.trim()
    );
    if (invalidEntries.length > 0) {
      alert('All entries must have a truck number');
      return;
    }

    // Check if this is a forwardable station
    const forwardConfig = getForwardingConfig();
    if (!forwardConfig) {
      alert('This station does not support forwarding');
      return;
    }

    // Prepare forwarded entries before submitting
    const forwardedEntries = prepareForwardedEntries();
    if (forwardedEntries.length === 0) {
      alert('No active entries to forward');
      return;
    }

    // Prepare the submit data (same as handleSubmit)
    const validEntries = formData.entries.map(entry => ({
      ...entry,
      doNo: (entry.doNo && entry.doNo.trim()) || 'NIL',
      truckNo: entry.truckNo.trim(),
      dest: (entry.dest && entry.dest.trim()) || 'NIL',
      liters: Number(entry.liters) || 0,
      rate: Number(entry.rate) || 0,
      amount: (Number(entry.liters) || 0) * (Number(entry.rate) || 0),
    }));
    const total = validEntries.reduce((sum, entry) => sum + entry.amount, 0);

    const submitData = {
      ...formData,
      entries: validEntries,
      total,
    };

    // Store source LPO info for reference
    const sourceInfo = {
      lpoNo: formData.lpoNo || '',
      station: formData.station || '',
    };

    // Submit the current LPO
    onSubmit(submitData);
    
    // Clear the draft from local storage
    clearFormStorage();
    setHasDraft(false);

    // Fetch next LPO number for the forwarded LPO
    setIsLoadingLpoNumber(true);
    let nextLpoNo = '';
    try {
      nextLpoNo = await lpoDocumentsAPI.getNextLpoNumber();
    } catch (error) {
      console.error('Error fetching next LPO number:', error);
      nextLpoNo = '2445';
    } finally {
      setIsLoadingLpoNumber(false);
    }

    // Calculate forwarded total
    const forwardedTotal = forwardedEntries.reduce((sum, entry) => sum + entry.amount, 0);

    // Reset the form with forwarded data - same form, new station and entries
    setFormData({
      lpoNo: nextLpoNo,
      date: new Date().toISOString().split('T')[0],
      station: forwardConfig.targetStation,
      orderOf: formData.orderOf || 'TAHMEED',
      entries: forwardedEntries,
      total: forwardedTotal,
    });

    // Reset auto-fill data for forwarded entries
    const newAutoFillData: Record<number, EntryAutoFillData> = {};
    forwardedEntries.forEach((_, index) => {
      newAutoFillData[index] = {
        direction: 'returning', // Forwarding is typically for returning journeys
        loading: false,
        fetched: true,
        fuelRecord: null,
      };
    });
    setEntryAutoFillData(newAutoFillData);

    // Set forwarding mode and source info
    setIsForwardingMode(true);
    setForwardedFromInfo(sourceInfo);

    // Reset other states
    setDuplicateWarnings(new Map());
    setExistingLPOsForTrucks(new Map());
    setTrucksWithoutLPOs(new Set());
    setLockedEntryRates(new Map());
  };

  // Cancel forwarding mode and close the form
  const handleCancelForwarding = () => {
    setIsForwardingMode(false);
    setForwardedFromInfo(null);
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={isForwardingMode ? handleCancelForwarding : handleCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto transition-colors" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {/* Back button when in forwarding mode */}
            {isForwardingMode && (
              <button
                type="button"
                onClick={handleCancelForwarding}
                className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title="Cancel forwarding"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isForwardingMode 
                ? `Forward to ${formData.station}` 
                : (initialData ? 'Edit LPO Document' : 'New LPO Document')}
            </h2>
            {/* Forwarding indicator */}
            {isForwardingMode && forwardedFromInfo && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                LPO #{forwardedFromInfo.lpoNo} created
              </span>
            )}
            {/* Draft indicator */}
            {hasDraft && !initialData && !isForwardingMode && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                Draft saved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Discard draft button */}
            {hasDraft && !initialData && !isForwardingMode && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-3 py-1 rounded border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Discard Draft
              </button>
            )}
            <button
              onClick={isForwardingMode ? handleCancelForwarding : handleCancel}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Duplicate Allocation Warning Banner */}
          {duplicateWarnings.size > 0 && formData.station?.toUpperCase() !== 'CASH' && (() => {
            const exactDuplicates = Array.from(duplicateWarnings.entries()).filter(([_, info]) => !info.isDifferentAmount);
            const differentAmounts = Array.from(duplicateWarnings.entries()).filter(([_, info]) => info.isDifferentAmount);
            
            return (
              <>
                {/* Exact duplicates - ERROR (blocks submission) */}
                {exactDuplicates.length > 0 && (
                  <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-300 dark:border-red-700">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-red-800 dark:text-red-200">
                          Duplicate Allocation - Blocked
                        </h3>
                        <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                          These trucks already have the <strong>same fuel amount</strong> at <strong>{formData.station}</strong>:
                        </p>
                        <ul className="mt-2 text-sm text-red-600 dark:text-red-400 space-y-1">
                          {exactDuplicates.map(([truckNo, info]) => (
                            <li key={truckNo} className="flex items-center space-x-2">
                              <span className="font-mono font-medium">{truckNo}</span>
                              <span>→ Already has {info.liters}L in LPO #{info.lpoNo}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                          ⚠️ This looks like a duplicate entry. Remove these trucks or change the liters amount if adding extra fuel.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Different amounts - INFO (allowed, just informational) */}
                {differentAmounts.length > 0 && (
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-300 dark:border-blue-700">
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-blue-800 dark:text-blue-200">
                          Additional Fuel Allocation
                        </h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          These trucks have existing allocations but with <strong>different amounts</strong> (top-up allowed):
                        </p>
                        <ul className="mt-2 text-sm text-blue-600 dark:text-blue-400 space-y-1">
                          {differentAmounts.map(([truckNo, info]) => (
                            <li key={truckNo} className="flex items-center space-x-2">
                              <span className="font-mono font-medium">{truckNo}</span>
                              <span>→ Existing: {info.liters}L (LPO #{info.lpoNo}) + New: {info.newLiters}L</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Forwarding Mode Banner - Shows when form has been reset for forwarding */}
          {isForwardingMode && forwardedFromInfo && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-green-800 dark:text-green-200">
                    Forwarded from LPO #{forwardedFromInfo.lpoNo} at {forwardedFromInfo.station}
                  </h3>
                  <p className="text-sm text-green-600 dark:text-green-300 mt-1">
                    Review and edit the entries below, then click <strong>"Create LPO Document"</strong> to complete the forwarding.
                  </p>
                  <p className="text-xs text-green-500 dark:text-green-400 mt-1">
                    You can add more trucks, remove entries, or adjust liters as needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Forwardable Station Notice - Shows when creating LPO at a station that can forward trucks */}
          {!initialData && !isForwardingMode && isForwardableStation() && formData.entries && formData.entries.length > 0 && (
            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
              <div className="flex items-start space-x-3">
                <ArrowRight className="w-6 h-6 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-indigo-800 dark:text-indigo-200">
                    Forward Available: {formData.station} → {getForwardingConfig()?.targetStation}
                  </h3>
                  <p className="text-sm text-indigo-600 dark:text-indigo-300 mt-1">
                    After creating this LPO, you can forward these trucks to {getForwardingConfig()?.targetStation} ({getForwardingConfig()?.targetLiters}L @ {getForwardingConfig()?.targetRate}/L).
                  </p>
                  <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
                    Use the <strong>"Forward Trucks"</strong> button below to create both LPOs in sequence.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Header Information */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">LPO Header</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  LPO No. *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="lpoNo"
                    value={formData.lpoNo}
                    onChange={handleHeaderChange}
                    required
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold"
                  />
                  {isLoadingLpoNumber && (
                    <Loader2 className="absolute right-3 top-2.5 w-5 h-5 text-gray-400 animate-spin" />
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">Auto-generated LPO number</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleHeaderChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Station *
                </label>
                <select
                  name="station"
                  value={formData.station}
                  onChange={handleHeaderChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select Station</option>
                  {STATIONS.map(station => (
                    <option key={station} value={station}>{station}</option>
                  ))}
                </select>
                {formData.station && STATION_DEFAULTS[formData.station.toUpperCase()] && (
                  <p className="text-xs text-green-600 mt-1">
                    Default: Going {STATION_DEFAULTS[formData.station.toUpperCase()]?.going || 0}L, 
                    Returning {STATION_DEFAULTS[formData.station.toUpperCase()]?.returning || 0}L @ 
                    {STATION_DEFAULTS[formData.station.toUpperCase()]?.rate}/L
                    ({STATION_DEFAULTS[formData.station.toUpperCase()]?.currency})
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Order Of *
                </label>
                <input
                  type="text"
                  name="orderOf"
                  value={formData.orderOf}
                  onChange={handleHeaderChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Cash Currency Converter - Only shown when CASH is selected */}
            {formData.station === 'CASH' && (
              <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-3">💱 Cash Currency Converter</h4>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-3">
                  Enter the local rate and conversion rate to calculate the final TZS rate for the LPO.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Currency
                    </label>
                    <select
                      value={cashConversion.currency}
                      onChange={(e) => setCashConversion(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-full px-2 py-1.5 text-sm border border-yellow-300 dark:border-yellow-600 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="ZMW">ZMW (Zambian Kwacha)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="CDF">CDF (Congolese Franc)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Local Rate ({cashConversion.currency}/Liter)
                    </label>
                    <input
                      type="number"
                      value={cashConversion.localRate || ''}
                      onChange={(e) => setCashConversion(prev => ({ ...prev, localRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="e.g., 26"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-sm border border-yellow-300 dark:border-yellow-600 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Conversion Rate (TZS per {cashConversion.currency})
                    </label>
                    <input
                      type="number"
                      value={cashConversion.conversionRate || ''}
                      onChange={(e) => setCashConversion(prev => ({ ...prev, conversionRate: parseFloat(e.target.value) || 0 }))}
                      placeholder="e.g., 116"
                      step="0.01"
                      className="w-full px-2 py-1.5 text-sm border border-yellow-300 dark:border-yellow-600 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                      Calculated Rate (TZS/Liter)
                    </label>
                    <div className="w-full px-2 py-1.5 text-sm bg-yellow-100 dark:bg-yellow-800/30 border border-yellow-300 dark:border-yellow-600 rounded-md font-semibold text-yellow-900 dark:text-yellow-200">
                      {cashConversion.calculatedRate.toFixed(2)} TZS
                    </div>
                  </div>
                </div>
                {cashConversion.calculatedRate > 0 && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                    Formula: {cashConversion.localRate} {cashConversion.currency}/L × {cashConversion.conversionRate} TZS/{cashConversion.currency} = {cashConversion.calculatedRate.toFixed(2)} TZS/L
                  </p>
                )}
              </div>
            )}

            {/* Cash Cancellation Point - Only shown when CASH is selected */}
            {formData.station === 'CASH' && (
              <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-300 dark:border-orange-600 rounded-lg">
                <div className="flex items-center space-x-2 mb-3">
                  <Ban className="w-5 h-5 text-orange-600" />
                  <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200">Cash Purchase Checkpoint (Required)</h4>
                </div>
                <p className="text-xs text-orange-700 dark:text-orange-300 mb-4">
                  <strong>Required:</strong> Select direction(s) and checkpoint(s) where cash fuel was purchased. You can select one or both directions. Any existing LPOs at selected checkpoints will be automatically cancelled.
                </p>
                
                {/* Direction Checkboxes - Can select one or both */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Going Direction */}
                  <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                    <label className="flex items-center space-x-2 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={goingEnabled}
                        onChange={(e) => {
                          setGoingEnabled(e.target.checked);
                          if (!e.target.checked) setGoingCheckpoint('');
                        }}
                        className="w-4 h-4 text-orange-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Going Direction</span>
                    </label>
                    
                    {goingEnabled && (
                      <div>
                        <label className="block text-xs font-medium text-orange-800 dark:text-orange-300 mb-1">
                          Going Checkpoint *
                        </label>
                        <select
                          value={goingCheckpoint}
                          onChange={(e) => setGoingCheckpoint(e.target.value as CancellationPoint)}
                          className={`w-full px-2 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            !goingCheckpoint ? 'border-red-400 dark:border-red-600' : 'border-orange-300 dark:border-orange-600'
                          }`}
                        >
                          <option value="">Select checkpoint...</option>
                          {getAvailableCancellationPoints('CASH').going.map((point) => (
                            <option key={point} value={point}>
                              {getCancellationPointDisplayName(point)}
                            </option>
                          ))}
                        </select>
                        {!goingCheckpoint && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            ⚠ Select checkpoint
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Returning Direction */}
                  <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-3 bg-white dark:bg-gray-800">
                    <label className="flex items-center space-x-2 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={returningEnabled}
                        onChange={(e) => {
                          setReturningEnabled(e.target.checked);
                          if (!e.target.checked) setReturningCheckpoint('');
                        }}
                        className="w-4 h-4 text-orange-600"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Returning Direction</span>
                    </label>
                    
                    {returningEnabled && (
                      <div>
                        <label className="block text-xs font-medium text-orange-800 dark:text-orange-300 mb-1">
                          Returning Checkpoint *
                        </label>
                        <select
                          value={returningCheckpoint}
                          onChange={(e) => setReturningCheckpoint(e.target.value as CancellationPoint)}
                          className={`w-full px-2 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            !returningCheckpoint ? 'border-red-400 dark:border-red-600' : 'border-orange-300 dark:border-orange-600'
                          }`}
                        >
                          <option value="">Select checkpoint...</option>
                          {getAvailableCancellationPoints('CASH').returning.map((point) => (
                            <option key={point} value={point}>
                              {getCancellationPointDisplayName(point)}
                            </option>
                          ))}
                        </select>
                        {!returningCheckpoint && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            ⚠ Select checkpoint
                          </p>
                        )}
                        {returningCheckpoint && returningCheckpoint.includes('ZAMBIA') && (
                          <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                            Note: Zambia returning has two parts - Ndola ({ZAMBIA_RETURNING_PARTS.ndola.liters}L) and Kapiri ({ZAMBIA_RETURNING_PARTS.kapiri.liters}L).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Show existing LPOs that will be cancelled */}
                {isFetchingLPOs && (
                  <div className="mt-3 flex items-center space-x-2 text-sm text-orange-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Checking for existing LPOs...</span>
                  </div>
                )}

                {!isFetchingLPOs && existingLPOsForTrucks.size > 0 && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800 dark:text-red-300">
                          Auto-Cancellation: {existingLPOsForTrucks.size} truck(s) have existing LPOs
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          The following will be automatically cancelled when you create this CASH LPO:
                        </p>
                        <ul className="mt-2 space-y-1">
                          {Array.from(existingLPOsForTrucks.entries()).map(([truckNo, directionLPOs]) => (
                            <li key={truckNo} className="text-xs text-red-700 dark:text-red-300">
                              <span className="font-medium">{truckNo}</span>:
                              {directionLPOs.map(({ lpos, direction }) => (
                                <span key={direction} className="ml-1">
                                  [{direction}] {lpos.map(l => `LPO #${l.lpoNo}`).join(', ')}
                                </span>
                              ))}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show trucks without existing LPOs (green message) */}
                {!isFetchingLPOs && trucksWithoutLPOs.size > 0 && (
                  <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                    <div className="flex items-start space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">
                          No Previous Orders: {trucksWithoutLPOs.size} truck(s)
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          The following trucks had no previous fuel order/LPO at the selected checkpoint(s). Cash payment will be recorded:
                        </p>
                        <ul className="mt-2 space-y-1">
                          {Array.from(trucksWithoutLPOs).map((truckNo) => (
                            <li key={truckNo} className="text-xs text-green-700 dark:text-green-300">
                              ✓ <span className="font-medium">{truckNo}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {!isFetchingLPOs && existingLPOsForTrucks.size === 0 && trucksWithoutLPOs.size === 0 && (goingEnabled || returningEnabled) && formData.entries && formData.entries.length > 0 && (
                  <div className="mt-3 flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle className="w-4 h-4" />
                    <span>Add truck entries to check for existing LPOs</span>
                  </div>
                )}
              </div>
            )}

            {/* Custom Station Section - Only shown when CUSTOM is selected */}
            {formData.station === 'CUSTOM' && (
              <div className="mt-4 p-4 border-2 border-purple-300 dark:border-purple-700 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                <div className="flex items-center space-x-2 mb-4">
                  <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="font-medium text-purple-800 dark:text-purple-300">
                    Custom Station (Unlisted Station)
                  </span>
                </div>
                
                <p className="text-sm text-purple-600 dark:text-purple-400 mb-4">
                  Use this for small stations in Zambia or other unlisted locations. Enter the station name and select which fuel record column(s) should be updated based on truck direction.
                </p>

                {/* Custom Station Name */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">
                    Station Name *
                  </label>
                  <input
                    type="text"
                    value={customStationName}
                    onChange={(e) => setCustomStationName(e.target.value)}
                    placeholder="e.g., Lake Station Near Kapiri"
                    required
                    className="w-full px-3 py-2 border border-purple-300 dark:border-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Direction Selection */}
                <div className="space-y-4">
                  {/* Custom1 - Going Direction */}
                  <div className={`p-3 rounded-lg border ${customGoingEnabled ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/50'}`}>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customGoingEnabled}
                        onChange={(e) => {
                          setCustomGoingEnabled(e.target.checked);
                          if (!e.target.checked) setCustomGoingCheckpoint('');
                        }}
                        className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          Custom1 - Going Direction
                        </span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          For trucks with Going DO - fuel amount will be recorded in the selected column
                        </p>
                      </div>
                    </label>
                    
                    {customGoingEnabled && (
                      <div className="mt-3 ml-8">
                        <label className="block text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                          Select Fuel Record Column for Going *
                        </label>
                        <select
                          value={customGoingCheckpoint}
                          onChange={(e) => setCustomGoingCheckpoint(e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 ${
                            !customGoingCheckpoint ? 'border-red-300 dark:border-red-600' : 'border-green-300 dark:border-green-600'
                          }`}
                        >
                          <option value="">Select checkpoint column...</option>
                          {FUEL_RECORD_COLUMNS.going.map((col) => (
                            <option key={col.field} value={col.field}>
                              {col.label}
                            </option>
                          ))}
                        </select>
                        {!customGoingCheckpoint && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            ⚠ Please select where Going fuel amounts should be recorded
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Custom2 - Return Direction */}
                  <div className={`p-3 rounded-lg border ${customReturnEnabled ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/50'}`}>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customReturnEnabled}
                        onChange={(e) => {
                          setCustomReturnEnabled(e.target.checked);
                          if (!e.target.checked) setCustomReturnCheckpoint('');
                        }}
                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          Custom2 - Return Direction
                        </span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          For trucks with Return DO - fuel amount will be recorded in the selected column
                        </p>
                      </div>
                    </label>
                    
                    {customReturnEnabled && (
                      <div className="mt-3 ml-8">
                        <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                          Select Fuel Record Column for Return *
                        </label>
                        <select
                          value={customReturnCheckpoint}
                          onChange={(e) => setCustomReturnCheckpoint(e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 ${
                            !customReturnCheckpoint ? 'border-red-300 dark:border-red-600' : 'border-blue-300 dark:border-blue-600'
                          }`}
                        >
                          <option value="">Select checkpoint column...</option>
                          {FUEL_RECORD_COLUMNS.return.map((col) => (
                            <option key={col.field} value={col.field}>
                              {col.label}
                            </option>
                          ))}
                        </select>
                        {!customReturnCheckpoint && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            ⚠ Please select where Return fuel amounts should be recorded
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary of custom station config */}
                {(customGoingEnabled || customReturnEnabled) && customStationName && (
                  <div className="mt-4 p-3 bg-purple-100 dark:bg-purple-900/30 rounded-md">
                    <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-2">
                      Configuration Summary:
                    </p>
                    <ul className="text-xs text-purple-700 dark:text-purple-400 space-y-1">
                      <li>📍 Station: <strong>{customStationName}</strong></li>
                      {customGoingEnabled && customGoingCheckpoint && (
                        <li>➡️ Going trucks → <strong>{FUEL_RECORD_COLUMNS.going.find(c => c.field === customGoingCheckpoint)?.label}</strong></li>
                      )}
                      {customReturnEnabled && customReturnCheckpoint && (
                        <li>⬅️ Return trucks → <strong>{FUEL_RECORD_COLUMNS.return.find(c => c.field === customReturnCheckpoint)?.label}</strong></li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Validation warning */}
                {!customStationName && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    ⚠ Please enter a station name
                  </p>
                )}
                {customStationName && !customGoingEnabled && !customReturnEnabled && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                    ⚠ Please select at least one direction (Going or Return)
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Instructions:</strong> Enter a truck number to auto-fetch DO number and destination. 
              Use the <ArrowRight className="inline w-4 h-4" /> / <ArrowLeft className="inline w-4 h-4" /> 
              button to toggle between Going and Returning DO.
            </p>
          </div>

          {/* LPO Entries */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Fuel Supply Details</h3>
              <button
                type="button"
                onClick={handleAddEntry}
                className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Entry
              </button>
              {isCheckingDuplicates && (
                <span className="ml-3 text-sm text-gray-500 dark:text-gray-400 flex items-center">
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Checking for duplicates...
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Truck No.
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Direction
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      DO No.
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Liters
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Rate
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Dest.
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.entries && formData.entries.length > 0 ? (
                    formData.entries.map((entry, index) => {
                      const autoFill = entryAutoFillData[index] || { direction: 'going', loading: false, fetched: false };
                      const duplicateInfo = duplicateWarnings.get(entry.truckNo);
                      const hasDuplicate = !!duplicateInfo && formData.station?.toUpperCase() !== 'CASH';
                      const isExactDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount;
                      const isDifferentAmount = hasDuplicate && duplicateInfo?.isDifferentAmount;
                      const hasNoRecordWarning = autoFill.warningType && !autoFill.loading && entry.truckNo.length >= 5;
                      return (
                        <tr key={index} className={`${autoFill.fetched ? 'bg-green-50 dark:bg-green-900/20' : ''} ${hasNoRecordWarning ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${isExactDuplicate ? 'bg-red-50 dark:bg-red-900/20' : ''} ${isDifferentAmount ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${!autoFill.fetched && !hasNoRecordWarning && !isExactDuplicate && !isDifferentAmount ? 'dark:bg-gray-800' : ''}`}>
                          <td className="px-3 py-3">
                            <div className="relative">
                              <input
                                type="text"
                                value={entry.truckNo}
                                onChange={(e) => handleTruckNoChange(index, e.target.value)}
                                placeholder="T762 DWK"
                                className={`w-28 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${isExactDuplicate ? 'border-red-500 dark:border-red-400' : ''} ${isDifferentAmount ? 'border-blue-500 dark:border-blue-400' : ''} ${hasNoRecordWarning ? 'border-amber-500 dark:border-amber-400' : ''} ${!hasDuplicate && !hasNoRecordWarning ? 'border-gray-300 dark:border-gray-600' : ''}`}
                              />
                              {autoFill.loading && (
                                <Loader2 className="absolute right-1 top-1.5 w-4 h-4 text-primary-500 animate-spin" />
                              )}
                              {autoFill.fetched && !autoFill.loading && !hasDuplicate && (
                                <CheckCircle className="absolute right-1 top-1.5 w-4 h-4 text-green-500" />
                              )}
                              {hasNoRecordWarning && !autoFill.loading && (
                                <AlertTriangle className="absolute right-1 top-1.5 w-4 h-4 text-amber-500" />
                              )}
                              {isExactDuplicate && (
                                <AlertTriangle className="absolute right-1 top-1.5 w-4 h-4 text-red-500" />
                              )}
                              {isDifferentAmount && (
                                <CheckCircle className="absolute right-1 top-1.5 w-4 h-4 text-blue-500" />
                              )}
                            </div>
                            {/* No fuel record warning - allow manual entry */}
                            {hasNoRecordWarning && (
                              <div className="mt-1 text-xs text-amber-600 dark:text-amber-400" title={autoFill.warningMessage}>
                                {autoFill.warningType === 'not_found' && '⚠️ No record found'}
                                {autoFill.warningType === 'journey_completed' && '⚠️ Journey complete (0L)'}
                                {autoFill.warningType === 'no_active_record' && '⚠️ No active journey'}
                                <span className="block text-[10px] text-gray-500 dark:text-gray-400">Manual entry allowed</span>
                              </div>
                            )}
                            {/* Duplicate allocation warning */}
                            {isExactDuplicate && duplicateInfo && (
                              <div className="mt-1 text-xs text-red-600 dark:text-red-400" title={`Blocked: Same amount in LPO ${duplicateInfo.lpoNo}`}>
                                ⛔ Same amount in LPO #{duplicateInfo.lpoNo} ({duplicateInfo.liters}L)
                              </div>
                            )}
                            {isDifferentAmount && duplicateInfo && (
                              <div className="mt-1 text-xs text-blue-600 dark:text-blue-400" title={`Top-up allowed: Different amount from LPO ${duplicateInfo.lpoNo}`}>
                                ➕ Top-up: +{duplicateInfo.newLiters}L (existing: {duplicateInfo.liters}L)
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => toggleDirection(index)}
                                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  autoFill.direction === 'going'
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40'
                                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/40'
                                }`}
                                title="Click to toggle direction"
                              >
                                {autoFill.direction === 'going' ? (
                                  <>Going <ArrowRight className="w-3 h-3 ml-1" /></>
                                ) : (
                                  <><ArrowLeft className="w-3 h-3 mr-1" /> Return</>
                                )}
                              </button>
                              {/* Warning when Return DO is not yet inputted */}
                              {autoFill.direction === 'returning' && autoFill.returnDoMissing && autoFill.fetched && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 mt-1" title="Return DO not yet inputted in fuel record">
                                  ⚠️ No Return DO
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={entry.doNo}
                              onChange={(e) => handleEntryChange(index, 'doNo', e.target.value)}
                              placeholder="NIL"
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry.liters}
                              onChange={(e) => handleEntryChange(index, 'liters', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry.rate}
                              onChange={(e) => handleEntryChange(index, 'rate', parseFloat(e.target.value) || 0)}
                              step="0.01"
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry.amount.toFixed(2)}
                              readOnly
                              className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={entry.dest}
                              onChange={(e) => handleEntryChange(index, 'dest', e.target.value)}
                              placeholder="NIL"
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center space-x-1">
                              {/* Inspect button - Quick view fuel record */}
                              {autoFill.fuelRecord && (
                                <button
                                  type="button"
                                  onClick={() => handleInspectRecord(index)}
                                  className="p-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                                  title="Inspect fuel record (view consumption & balance)"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              {/* Delete entry button */}
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(index)}
                                className="p-1.5 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                title="Remove entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            {/* Show balance info hint for Mbeya Return */}
                            {autoFill.balanceInfo && autoFill.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY' && (
                              <div className={`mt-1 text-xs ${
                                autoFill.balanceInfo.suggestedLiters < autoFill.balanceInfo.standardAllocation
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-green-600 dark:text-green-400'
                              }`} title={autoFill.balanceInfo.reason}>
                                <Fuel className="w-3 h-3 inline mr-1" />
                                {autoFill.balanceInfo.suggestedLiters < autoFill.balanceInfo.standardAllocation
                                  ? `${autoFill.balanceInfo.suggestedLiters}L (reduced)`
                                  : `${autoFill.balanceInfo.suggestedLiters}L`
                                }
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No entries added. Click "Add Entry" to add fuel supply details.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total Display */}
          <div className="mb-6 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">TOTAL:</span>
              <span className="text-2xl font-bold text-primary-700 dark:text-primary-400">
                {formData.total?.toFixed(2)}
              </span>
            </div>
            {formData.entries && formData.entries.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Liters: {formData.entries.reduce((sum, e) => sum + e.liters, 0)}L
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t dark:border-gray-700">
            {isForwardingMode ? (
              // Forwarding mode actions
              <>
                <button
                  type="button"
                  onClick={handleCancelForwarding}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Skip (Don't Create)
                </button>
                <button
                  type="submit"
                  disabled={!formData.entries || formData.entries.length === 0}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Create LPO at {formData.station}
                </button>
              </>
            ) : (
              // Normal mode actions
              <>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
                
                {/* Forward Trucks Button - Only show for forwardable stations (LAKE NDOLA, LAKE TUNDUMA) */}
                {!initialData && isForwardableStation() && formData.entries && formData.entries.length > 0 && (
                  <button
                    type="button"
                    onClick={handleForwardAndSubmit}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 flex items-center gap-2"
                    title={getForwardingConfig()?.description}
                  >
                    <ArrowRight className="w-4 h-4" />
                    Forward Trucks to {getForwardingConfig()?.targetStation}
                  </button>
                )}
                
                <button
                  type="submit"
                  disabled={!formData.entries || formData.entries.length === 0}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {initialData ? 'Update' : 'Create'} LPO Document
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      {/* Fuel Record Inspect Modal */}
      <FuelRecordInspectModal
        isOpen={inspectModal.isOpen}
        onClose={handleCloseInspectModal}
        truckNumber={inspectModal.truckNo}
        fuelRecordId={inspectModal.fuelRecordId || ''}
      />
    </div>
  );
};

export default LPODetailForm;
