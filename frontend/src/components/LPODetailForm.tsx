import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, CheckCircle, ArrowLeft, ArrowRight, AlertTriangle, Ban, MapPin, Eye, Fuel, ChevronDown, Check } from 'lucide-react';
import type { LPOSummary, LPODetail, FuelRecord, CancellationPoint, FuelStationConfig } from '../types';
import { lpoDocumentsAPI, fuelRecordsAPI, deliveryOrdersAPI } from '../services/api';
import { formatTruckNumber } from '../utils/dataCleanup';
import { useActiveFuelStations, fuelStationKeys } from '../hooks/useFuelStations';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { 
  getAvailableCancellationPoints, 
  getCancellationPointDisplayName,
  getStationsForCancellationPoint,
  FUEL_RECORD_COLUMNS
} from '../services/cancellationService';
import FuelRecordInspectModal, { calculateMbeyaReturnBalance } from './FuelRecordInspectModal';
import ForwardLPOModal from './ForwardLPOModal';

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

// STATIONS array removed - now using dynamic stations from database
// CASH and CUSTOM are always available in the dropdown

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
  queueInfo?: {
    hasQueue: boolean;
    queuedCount: number;
    nextJourney: FuelRecord;
  };
  // Journey navigation: all available journeys for this truck
  allJourneys?: {
    active: FuelRecord | null;
    queued: FuelRecord[];
  };
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
  // Journey navigation: track available journeys and current selection
  allJourneys?: {
    active: FuelRecord | null;
    queued: FuelRecord[];
  };
  selectedJourneyIndex?: number; // -1 for active, 0+ for queued[index]
  selectedJourneyType?: 'active' | 'queued';
  // Formula evaluation status
  formulaStatus?: 'applied' | 'missing_data' | 'error' | null;
  formulaMessage?: string;
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
  const [existingLPOsForTrucks, setExistingLPOsForTrucks] = useState<Map<string, { lpos: LPOSummary[], direction: string, doNo: string }[]>>(new Map());
  const [selectedLPOsToCancel, setSelectedLPOsToCancel] = useState<Map<string, Set<string>>>(new Map()); // truckNo -> Set of LPO IDs
  const [trucksWithoutLPOs, setTrucksWithoutLPOs] = useState<Set<string>>(new Set());
  const [isFetchingLPOs, setIsFetchingLPOs] = useState(false);
  
  // Track which entries have been created (to prevent auto-update of their rates)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setLockedEntryRates] = useState<Map<number, number>>(new Map());

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

  // Forwarding mode state - tracks inline forwarding workflow
  const [isForwardingMode, setIsForwardingMode] = useState(false);
  const [forwardedFromInfo, setForwardedFromInfo] = useState<{
    lpoNo: string;
    station: string;
  } | null>(null);
  const [isCreatingAndForwarding, setIsCreatingAndForwarding] = useState(false);

  // Forward LPO Modal state
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [lpoToForward, setLpoToForward] = useState<LPOSummary | null>(null);

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

  // Dropdown state for custom button-based dropdowns (mobile-friendly)
  const [showStationDropdown, setShowStationDropdown] = useState(false);
  const [showGoingCheckpointDropdown, setShowGoingCheckpointDropdown] = useState(false);
  const [showReturningCheckpointDropdown, setShowReturningCheckpointDropdown] = useState(false);
  const [showCustomGoingDropdown, setShowCustomGoingDropdown] = useState(false);
  const [showCustomReturnDropdown, setShowCustomReturnDropdown] = useState(false);
  
  // Refs for dropdown positioning
  const stationDropdownRef = React.useRef<HTMLDivElement>(null);
  const goingCheckpointRef = React.useRef<HTMLDivElement>(null);
  const returningCheckpointRef = React.useRef<HTMLDivElement>(null);
  const customGoingRef = React.useRef<HTMLDivElement>(null);
  const customReturnRef = React.useRef<HTMLDivElement>(null);
  
  // Ref to prevent double-paste operations
  const isPastingRef = React.useRef(false);

  // Close dropdowns when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stationDropdownRef.current && !stationDropdownRef.current.contains(event.target as Node)) {
        setShowStationDropdown(false);
      }
      if (goingCheckpointRef.current && !goingCheckpointRef.current.contains(event.target as Node)) {
        setShowGoingCheckpointDropdown(false);
      }
      if (returningCheckpointRef.current && !returningCheckpointRef.current.contains(event.target as Node)) {
        setShowReturningCheckpointDropdown(false);
      }
      if (customGoingRef.current && !customGoingRef.current.contains(event.target as Node)) {
        setShowCustomGoingDropdown(false);
      }
      if (customReturnRef.current && !customReturnRef.current.contains(event.target as Node)) {
        setShowCustomReturnDropdown(false);
      }
    };
    const handleScroll = (event: Event) => {
      const target = event.target as Node;
      if (
        stationDropdownRef.current?.contains(target) ||
        goingCheckpointRef.current?.contains(target) ||
        returningCheckpointRef.current?.contains(target) ||
        customGoingRef.current?.contains(target) ||
        customReturnRef.current?.contains(target)
      ) return;
      setShowStationDropdown(false);
      setShowGoingCheckpointDropdown(false);
      setShowReturningCheckpointDropdown(false);
      setShowCustomGoingDropdown(false);
      setShowCustomReturnDropdown(false);
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

  // Close inspect modal - prevent event propagation to parent modal
  const handleCloseInspectModal = (e?: React.MouseEvent | React.KeyboardEvent) => {
    // Stop event propagation to prevent closing parent LPO form
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
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
    setSelectedLPOsToCancel(new Map());
    setTrucksWithoutLPOs(new Set());
    setDuplicateWarnings(new Map());
    setLockedEntryRates(new Map());
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

  // Load stations from database using React Query
  const queryClient = useQueryClient();
  const { data: fuelStations, isLoading: loadingStations } = useActiveFuelStations();
  const availableStations: FuelStationConfig[] = fuelStations || [];

  // Real-time sync: invalidate React Query cache when stations change
  const invalidateStations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
    queryClient.invalidateQueries({ queryKey: fuelStationKeys.active });
  }, [queryClient]);
  useRealtimeSync('fuel_stations', invalidateStations);

  // When station rates refresh (admin changed rate), update all existing entry rates
  useEffect(() => {
    if (!formData.station || formData.station === 'CASH' || formData.station === 'CUSTOM') return;
    if (!formData.entries || formData.entries.length === 0) return;

    const currentStation = availableStations.find(
      s => s.stationName.toUpperCase() === formData.station!.toUpperCase()
    );
    if (!currentStation) return;

    const newRate = currentStation.defaultRate;
    // Only update if any entry has a different rate
    const needsUpdate = formData.entries.some(entry => entry.rate !== newRate);
    if (!needsUpdate) return;

    const updatedEntries = formData.entries.map((entry, idx) => {
      const liters = entry.liters || 0;
      return {
        ...entry,
        rate: newRate,
        amount: liters * newRate,
      };
    });
    const total = updatedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
  }, [availableStations]);

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

  // Fetch existing LPOs for trucks when CASH is selected and checkpoint(s) are chosen
  useEffect(() => {
    const fetchExistingLPOs = async () => {
      // Check if at least one direction is enabled with a checkpoint
      const hasGoingCheckpoint = goingEnabled && goingCheckpoint;
      const hasReturningCheckpoint = returningEnabled && returningCheckpoint;
      
      if (formData.station === 'CASH' && (hasGoingCheckpoint || hasReturningCheckpoint) && formData.entries && formData.entries.length > 0) {
        setIsFetchingLPOs(true);
        const newMap = new Map<string, { lpos: LPOSummary[], direction: string, doNo: string }[]>();
        const trucksWithoutLPOsSet = new Set<string>();
        const newSelectedLPOs = new Map<string, Set<string>>();
        
        try {
          for (const entry of formData.entries) {
            if (entry.truckNo && entry.truckNo.length >= 4 && entry.doNo && entry.doNo !== 'NIL') {
              const truckLPOs: { lpos: LPOSummary[], direction: string, doNo: string }[] = [];
              
              // Check going direction if enabled
              if (hasGoingCheckpoint) {
                // Get stations that correspond to this checkpoint
                const goingStations = getStationsForCancellationPoint(goingCheckpoint);
                
                const goingLpos = await lpoDocumentsAPI.findAtCheckpoint(
                  entry.truckNo,
                  entry.doNo, // Filter by DO number - current journey only
                  undefined,
                  goingCheckpoint
                );
                
                // Filter LPOs to only include those at stations matching this checkpoint
                const filteredGoingLpos = goingLpos.filter(lpo => {
                  const lpoStationUpper = lpo.station.toUpperCase().trim();
                  return goingStations.some(station => {
                    const checkpointStation = station.toUpperCase().trim();
                    // Check exact match or partial match (for variations like GBP/GPB)
                    return lpoStationUpper === checkpointStation || 
                           lpoStationUpper.includes(checkpointStation) ||
                           checkpointStation.includes(lpoStationUpper);
                  });
                });
                
                if (filteredGoingLpos.length > 0) {
                  truckLPOs.push({ lpos: filteredGoingLpos, direction: 'Going', doNo: entry.doNo });
                  
                  // Initialize empty selection set - user must manually select
                  if (!newSelectedLPOs.has(entry.truckNo)) {
                    newSelectedLPOs.set(entry.truckNo, new Set());
                  }
                }
              }
              
              // Check returning direction if enabled
              if (hasReturningCheckpoint) {
                // Get stations that correspond to this checkpoint
                const returningStations = getStationsForCancellationPoint(returningCheckpoint);
                
                const returningLpos = await lpoDocumentsAPI.findAtCheckpoint(
                  entry.truckNo,
                  entry.doNo, // Filter by DO number - current journey only
                  undefined,
                  returningCheckpoint
                );
                
                // Filter LPOs to only include those at stations matching this checkpoint
                const filteredReturningLpos = returningLpos.filter(lpo => {
                  const lpoStationUpper = lpo.station.toUpperCase().trim();
                  return returningStations.some(station => {
                    const checkpointStation = station.toUpperCase().trim();
                    // Check exact match or partial match
                    return lpoStationUpper === checkpointStation || 
                           lpoStationUpper.includes(checkpointStation) ||
                           checkpointStation.includes(lpoStationUpper);
                  });
                });
                
                if (filteredReturningLpos.length > 0) {
                  truckLPOs.push({ lpos: filteredReturningLpos, direction: 'Returning', doNo: entry.doNo });
                  
                  // Initialize empty selection set - user must manually select
                  if (!newSelectedLPOs.has(entry.truckNo)) {
                    newSelectedLPOs.set(entry.truckNo, new Set());
                  }
                }
              }
              
              if (truckLPOs.length > 0) {
                newMap.set(entry.truckNo, truckLPOs);
              } else {
                // Truck has no LPOs at selected checkpoints for this journey
                trucksWithoutLPOsSet.add(entry.truckNo);
              }
            }
          }
        } catch (error) {
          console.error('Error fetching existing LPOs:', error);
        } finally {
          setExistingLPOsForTrucks(newMap);
          setTrucksWithoutLPOs(trucksWithoutLPOsSet);
          setSelectedLPOsToCancel(newSelectedLPOs);
          setIsFetchingLPOs(false);
        }
      } else {
        setExistingLPOsForTrucks(new Map());
        setTrucksWithoutLPOs(new Set());
        setSelectedLPOsToCancel(new Map());
      }
    };

    fetchExistingLPOs();
  }, [formData.station, goingEnabled, returningEnabled, goingCheckpoint, returningCheckpoint, formData.entries?.map(e => `${e?.truckNo || ''}-${e?.doNo || ''}`).join(',')]);

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
              entry.liters, // Pass the new liters amount to check
              entry.doNo // Pass the DO number to check for same journey
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
  }, [formData.station, formData.entries?.map(e => e ? `${e.truckNo}:${e.liters}` : '').join(','), initialData?.id]);

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
      const response = await fuelRecordsAPI.getAll({ truckNo: truckNo.trim(), limit: 10000 });
      const fuelRecords = response.data;
      
      // Debug: Log response structure to identify data flow issues
      console.log(`[LPO Truck Lookup] Truck: ${truckNo}, Records fetched: ${fuelRecords?.length || 0}`);
      if (fuelRecords && fuelRecords.length > 0) {
        console.log(`[LPO Truck Lookup] First record:`, {
          goingDo: fuelRecords[0]?.goingDo,
          truckNo: fuelRecords[0]?.truckNo,
          journeyStatus: fuelRecords[0]?.journeyStatus,
          balance: fuelRecords[0]?.balance,
          isCancelled: fuelRecords[0]?.isCancelled
        });
      }
      
      // Filter out cancelled fuel records - ignore them as if they don't exist
      const activeFuelRecords = (fuelRecords || []).filter((r: FuelRecord) => !r.isCancelled);
      console.log(`[LPO Truck Lookup] Active (non-cancelled) records: ${activeFuelRecords.length}`);
      
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
          ? 'route total liters'
          : 'truck batch assignment';
        
        console.log('[LPO Truck Lookup] Found locked record:', lockedRecord.goingDo);
        return {
          fuelRecord: lockedRecord,
          goingDo: lockedRecord.goingDo || 'NIL',
          returnDo: lockedRecord.returnDo || 'NIL',
          destination: lockedRecord.to || 'NIL',
          goingDestination: lockedRecord.originalGoingTo || lockedRecord.to || 'NIL',
          balance: lockedRecord.balance || 0,
          message: `🔒 LOCKED: Missing configuration (${reasonText}).\n\nDO: ${lockedRecord.goingDo} | Truck: ${lockedRecord.truckNo} | Destination: ${lockedRecord.to}\n\nYou can:\n• Enter fuel amounts manually in this LPO form\n• Contact admin to configure the missing ${reasonText}\n\nℹ️ Manual entry allowed - auto-calculated values will be available after admin configures settings.`,
          success: true,
          // No warningType - locked records are not warnings, they're just pending config
          // This prevents the "⚠️ No record found" badge from showing
          // Add journey info so UI shows proper status indicator
          allJourneys: {
            active: lockedRecord, // Locked record is the active journey (pending config)
            queued: []
          }
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
       * - For non-MSA destinations: mbeyaReturn must be filled (not 0, not null, not undefined)
       * - For MSA destinations: tangaReturn must be filled (not 0, not null, not undefined)
       * - We only check if the checkpoint is FILLED, not the actual value
       * - Balance can be 0, negative, or positive - we don't check balance anymore
       * 
       * IMPORTANT: Locked records with balance=0 should NOT be marked as complete
       * A fresh DO import with missing config creates balance=0 + all checkpoints=0
       * This is NOT a completed journey - it's a pending/locked journey
       */
      const isJourneyComplete = (record: FuelRecord): boolean => {
        // CRITICAL FIX: Locked records are NEVER complete - they're pending configuration
        // Fresh fuel records created with missing route/truck config have balance=0
        // but all checkpoints are also 0, which would falsely trigger "journey complete"
        if ((record as any).isLocked) {
          return false; // Locked = pending admin config, not completed
        }
        
        // Journey status 'completed' explicitly marks completion
        if (record.journeyStatus === 'completed') {
          return true;
        }
        
        // Journey status 'active' or 'queued' means NOT complete
        if (record.journeyStatus === 'active' || record.journeyStatus === 'queued') {
          return false;
        }
        
        // Check if return checkpoint is FILLED (regardless of balance)
        // The key indicator is whether the truck took fuel on the return journey
        const destination = (record.originalGoingTo || record.to || '').toUpperCase();
        const isMSADestination = destination.includes('MSA') || destination.includes('MOMBASA');
        
        if (isMSADestination) {
          // For MSA destinations, check if tangaReturn is filled (not 0, not null, not undefined)
          const tangaReturn = (record as any).tangaReturn;
          return tangaReturn !== 0 && tangaReturn !== null && tangaReturn !== undefined;
        } else {
          // For non-MSA destinations, check if mbeyaReturn is filled (not 0, not null, not undefined)
          const mbeyaReturn = (record as any).mbeyaReturn;
          return mbeyaReturn !== 0 && mbeyaReturn !== null && mbeyaReturn !== undefined;
        }
      };

      // Sort records by date descending (most recent first)
      const sortedRecords = [...activeFuelRecords].sort((a: FuelRecord, b: FuelRecord) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Search for active fuel record: current month → previous month → two months ago → three months ago
      // Priority: ACTIVE status first, then QUEUED if no active exists
      let activeRecord: FuelRecord | null = null;
      let queuedRecord: FuelRecord | null = null;
      let searchMonth = 'current';

      // Helper to check if a record is ACTIVE (not queued, not completed)
      const isActiveRecord = (r: FuelRecord): boolean => {
        // If has journeyStatus, use it (prioritize active over queued)
        if (r.journeyStatus === 'active') {
          return true; // Active journey
        }
        if (r.journeyStatus === 'queued' || r.journeyStatus === 'completed') {
          return false; // Skip queued and completed
        }
        // Fallback for records without journeyStatus (backwards compatibility)
        if (r.balance !== 0) {
          return true; // Non-zero balance (including negative) = active
        }
        // If balance is 0, check if journey is truly complete based on return checkpoints
        return !isJourneyComplete(r);
      };

      // Helper to check if a record is QUEUED
      const isQueuedRecord = (r: FuelRecord): boolean => {
        return r.journeyStatus === 'queued';
      };

      // STEP 1: Search for ACTIVE records across all months (highest priority)
      // First, try to find an ACTIVE record in current month
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

      // STEP 2: If no ACTIVE record, search for QUEUED records (fallback)
      if (!activeRecord) {
        console.log('[LPO Truck Lookup] No active journey found, searching for queued journeys...');
        searchMonth = 'current';
        queuedRecord = sortedRecords.find((r: FuelRecord) => 
          isInMonth(r.date, currentMonth) && isQueuedRecord(r)
        ) || null;

        if (!queuedRecord) {
          searchMonth = 'previous';
          queuedRecord = sortedRecords.find((r: FuelRecord) => 
            isInMonth(r.date, previousMonth) && isQueuedRecord(r)
          ) || null;
        }

        if (!queuedRecord) {
          searchMonth = 'two months ago';
          queuedRecord = sortedRecords.find((r: FuelRecord) => 
            isInMonth(r.date, twoMonthsAgo) && isQueuedRecord(r)
          ) || null;
        }

        if (!queuedRecord) {
          searchMonth = 'three months ago';
          queuedRecord = sortedRecords.find((r: FuelRecord) => 
            isInMonth(r.date, threeMonthsAgo) && isQueuedRecord(r)
          ) || null;
        }
      }

      // Use queued record if no active record found
      const selectedRecord = activeRecord || queuedRecord;

      // If still no active or queued record, check if we have any record at all
      if (!selectedRecord) {
        console.log('[LPO Truck Lookup] No active or queued record found');
        // Get the most recent record regardless of month
        const mostRecent = sortedRecords[0];
        
        if (mostRecent && isJourneyComplete(mostRecent)) {
          // Journey truly completed - return checkpoint is filled
          const goingDest = mostRecent.originalGoingTo || mostRecent.to || 'NIL';
          const destination = (mostRecent.originalGoingTo || mostRecent.to || '').toUpperCase();
          const isMSA = destination.includes('MSA') || destination.includes('MOMBASA');
          const returnCheckpoint = isMSA ? 'Tanga Return' : 'Mbeya Return';
          console.log('[LPO Truck Lookup] Most recent journey is completed');
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

        // No active or queued record found in last 4 months
        console.log('[LPO Truck Lookup] No active/queued journeys in last 4 months');
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

      // Found record (active or queued)
      // IMPORTANT: Use originalGoingTo for the going destination if available
      // This handles the case where EXPORT DO has changed from/to fields
      const goingDestination = selectedRecord.originalGoingTo || selectedRecord.to || 'NIL';
      const currentDestination = selectedRecord.to || 'NIL';
      
      // Check for other queued journeys for this truck (if selected record is active)
      const queuedJourneys = activeFuelRecords.filter((r: FuelRecord) => 
        r.journeyStatus === 'queued' && r.truckNo === selectedRecord.truckNo
      ).sort((a: any, b: any) => (a.queueOrder || 0) - (b.queueOrder || 0));
      
      // Build message with journey status
      let statusMessage = `Found (${searchMonth} month): Going DO ${selectedRecord.goingDo}, Balance: ${selectedRecord.balance}L`;
      
      if (selectedRecord.journeyStatus === 'queued') {
        statusMessage = `QUEUED Journey (Position #${selectedRecord.queueOrder || '?'}): ${selectedRecord.goingDo} - Waiting to activate`;
        console.log('[LPO Truck Lookup] Using queued journey:', selectedRecord.goingDo);
      } else if (selectedRecord.journeyStatus === 'active') {
        statusMessage = `ACTIVE Journey: DO ${selectedRecord.goingDo}, Balance: ${selectedRecord.balance}L`;
        if (queuedJourneys.length > 0) {
          statusMessage += ` | ${queuedJourneys.length} queued`;
        }
        console.log('[LPO Truck Lookup] Using active journey:', selectedRecord.goingDo);
      } else if (selectedRecord.journeyStatus === 'completed') {
        statusMessage = `✓ COMPLETED Journey: DO ${selectedRecord.goingDo}`;
      }
      
      return {
        fuelRecord: selectedRecord,
        goingDo: selectedRecord.goingDo || 'NIL',
        returnDo: selectedRecord.returnDo || 'NIL',
        destination: currentDestination,  // Current destination (might have changed for return)
        goingDestination: goingDestination,  // Original going destination for fuel allocation
        balance: selectedRecord.balance || 0,
        message: statusMessage,
        success: true,
        queueInfo: queuedJourneys.length > 0 ? {
          hasQueue: true,
          queuedCount: queuedJourneys.length,
          nextJourney: queuedJourneys[0],
        } : undefined,
        // Return all available journeys for navigation
        allJourneys: {
          active: activeRecord,
          queued: queuedJourneys,
        },
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

  /**
   * Fetch journey data by DO number (for DO-first search)
   * Returns same TruckFetchResult structure for consistency
   */
  const fetchJourneyByDO = useCallback(async (doNumber: string): Promise<TruckFetchResult & { truckNo?: string }> => {
    if (!doNumber || doNumber.length < 3) {
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: 'Enter a valid DO number',
        success: false
      };
    }

    try {
      const journeyData = await deliveryOrdersAPI.getJourneyByDO(doNumber.trim().toUpperCase());

      if (!journeyData.found) {
        return {
          fuelRecord: null,
          goingDo: 'NIL',
          returnDo: 'NIL',
          destination: 'NIL',
          goingDestination: 'NIL',
          balance: 0,
          message: `⚠️ DO ${doNumber} not found`,
          success: false,
          warningType: 'not_found' as const
        };
      }

      if (!journeyData.fuelRecord) {
        return {
          fuelRecord: null,
          truckNo: journeyData.truckNo,
          goingDo: journeyData.goingDO?.doNumber || 'NIL',
          returnDo: journeyData.returningDO?.doNumber || 'NIL',
          destination: journeyData.destination || 'NIL',
          goingDestination: journeyData.goingDestination || 'NIL',
          balance: 0,
          message: `⚠️ No fuel record found for DO ${doNumber} (Truck: ${journeyData.truckNo})`,
          success: false,
          warningType: 'not_found' as const
        };
      }

      // Build status message based on journey status
      let statusMessage = '';
      if (journeyData.journeyStatus === 'queued') {
        statusMessage = `QUEUED Journey (Position #${journeyData.queuePosition || '?'}): ${doNumber}`;
        if (journeyData.hasActiveJourney) {
          statusMessage += ` | Active: ${journeyData.activeJourneyDO}`;
        }
      } else if (journeyData.journeyStatus === 'active') {
        statusMessage = `ACTIVE Journey: DO ${doNumber}, Balance: ${journeyData.balance}L`;
        if (journeyData.queuedJourneys && journeyData.queuedJourneys.length > 0) {
          statusMessage += ` | ${journeyData.queuedJourneys.length} queued`;
        }
      } else if (journeyData.journeyStatus === 'completed') {
        statusMessage = `✓ COMPLETED Journey: DO ${doNumber}`;
      } else {
        statusMessage = `Found: DO ${doNumber}, Balance: ${journeyData.balance}L`;
      }

      return {
        fuelRecord: journeyData.fuelRecord,
        truckNo: journeyData.truckNo,
        goingDo: journeyData.goingDO?.doNumber || 'NIL',
        returnDo: journeyData.returningDO?.doNumber || 'NIL',
        destination: journeyData.destination || 'NIL',
        goingDestination: journeyData.goingDestination || 'NIL',
        balance: journeyData.balance || 0,
        message: statusMessage,
        success: true,
        queueInfo: journeyData.queuedJourneys && journeyData.queuedJourneys.length > 0 ? {
          hasQueue: true,
          queuedCount: journeyData.queuedJourneys.length,
          nextJourney: journeyData.fuelRecord,
        } : undefined,
      };
    } catch (error) {
      console.error('Error fetching journey by DO:', error);
      return {
        fuelRecord: null,
        goingDo: 'NIL',
        returnDo: 'NIL',
        destination: 'NIL',
        goingDestination: 'NIL',
        balance: 0,
        message: `Error fetching DO ${doNumber}`,
        success: false
      };
    }
  }, []);

  /**
   * Safely evaluate a mathematical formula with given context variables
   * @param formula - The formula string (e.g., "balance - 900" or "((totalLiters + extraLiters) - 900)")
   * @param context - Variables available in the formula (e.g., { totalLiters: 3500, extraLiters: 500, balance: 1560 })
   * @returns The evaluated number or null if evaluation fails
   */
  const evaluateFormula = (formula: string, context: Record<string, number>): number | null => {
    try {
      // Create a safe function that evaluates the formula with context
      const contextKeys = Object.keys(context);
      const contextValues = Object.values(context);
      
      // Build a function that has access to the context variables
      const evaluator = new Function(...contextKeys, `'use strict'; return (${formula});`);
      
      // Execute with context values
      const result = evaluator(...contextValues);
      
      // Validate result is a number
      if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
        return Math.round(result); // Round to nearest integer for liters
      }
      
      return null;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      return null;
    }
  };

  // Get default fuel amount based on station, direction, and destination
  // Special rules:
  // - Lusaka destination: 60L at Zambia Going
  // - Lubumbashi destination: 260L at Zambia Going  
  // - Mombasa/MSA destination: 70L at GBP KANGE (Tanga Return)
  // - If totalLiters/extraLiters/balance provided and formula exists, evaluate formula
  const getStationDefaults = (
    station: string, 
    direction: 'going' | 'returning',
    destination?: string,
    totalLiters?: number,
    extraLiters?: number,
    balance?: number
  ): { liters: number; rate: number; formulaStatus?: 'applied' | 'missing_data' | 'error' | null; formulaMessage?: string } => {
    const stationUpper = station.toUpperCase();
    
    // First try to get from dynamic stations
    const dynamicStation = availableStations.find(s => s.stationName.toUpperCase() === stationUpper);
    if (dynamicStation) {
      const formula = direction === 'going' ? dynamicStation.formulaGoing : dynamicStation.formulaReturning;
      
      // If formula exists, attempt evaluation
      if (formula && formula.trim()) {
        // Check if we have any context passed at all
        if (totalLiters !== undefined || extraLiters !== undefined || balance !== undefined) {
          const context = {
            totalLiters: totalLiters || 0,
            extraLiters: extraLiters || 0,
            balance: balance || 0
          };
          
          // Check which variables the formula references
          const needsTotalLiters = formula.includes('totalLiters');
          const needsExtraLiters = formula.includes('extraLiters');
          const needsBalance = formula.includes('balance');
          
          // Check if required variables are missing (null/undefined/0)
          const missingVars: string[] = [];
          if (needsTotalLiters && (!totalLiters || totalLiters === 0)) missingVars.push('totalLiters');
          if (needsExtraLiters && (!extraLiters || extraLiters === 0)) missingVars.push('extraLiters');
          if (needsBalance && (!balance || balance === 0)) missingVars.push('balance');
          
          // If ALL formula-referenced variables are missing, return 0 with missing_data status
          const allRequiredMissing = missingVars.length > 0 && (
            (needsTotalLiters && needsExtraLiters && missingVars.includes('totalLiters') && missingVars.includes('extraLiters')) ||
            (needsTotalLiters && !needsExtraLiters && !needsBalance && missingVars.includes('totalLiters')) ||
            (needsBalance && !needsTotalLiters && !needsExtraLiters && missingVars.includes('balance')) ||
            (!needsTotalLiters && !needsExtraLiters && !needsBalance) // formula uses no known variables
          );
          
          if (allRequiredMissing) {
            console.warn(`⚠️ Formula for ${stationUpper} (${direction}) missing required data: ${missingVars.join(', ')}`);
            return { 
              liters: 0, 
              rate: dynamicStation.defaultRate, 
              formulaStatus: 'missing_data', 
              formulaMessage: `Missing: ${missingVars.join(', ')} — enter liters manually` 
            };
          }
          
          // Evaluate formula with available context
          const evaluatedLiters = evaluateFormula(formula, context);
          
          if (evaluatedLiters !== null) {
            console.log(`✓ Using formula-calculated liters for ${stationUpper} (${direction}): ${evaluatedLiters}L`);
            return { liters: evaluatedLiters, rate: dynamicStation.defaultRate, formulaStatus: 'applied', formulaMessage: `Formula: ${formula} = ${evaluatedLiters}L` };
          } else {
            console.warn(`⚠️ Formula evaluation failed for ${stationUpper}`);
            return { liters: 0, rate: dynamicStation.defaultRate, formulaStatus: 'error', formulaMessage: `Formula error: ${formula}` };
          }
        } else {
          // Formula exists but no fuel record context passed (truck not fetched yet)
          const liters = direction === 'going' ? dynamicStation.defaultLitersGoing : dynamicStation.defaultLitersReturning;
          return { liters, rate: dynamicStation.defaultRate };
        }
      }
      
      // No formula — use default liters
      const liters = direction === 'going' ? dynamicStation.defaultLitersGoing : dynamicStation.defaultLitersReturning;
      return { liters, rate: dynamicStation.defaultRate };
    }
    
    // Fall back to hardcoded STATION_DEFAULTS for backward compatibility and CASH/CUSTOM stations
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
  // Fuel allocation reference:
  // GOING: Dar Yard (550/580), Dar Going (variable), Mbeya Going (450), Zambia Going (calculated)
  // RETURNING: Zambia Return (400 = Ndola 50 + Kapiri 350), Tunduma Return (100), 
  //            Mbeya Return (400), Moro Return (100), Tanga Return (70), Dar Return (variable)

  const handleHeaderChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    // Auto-uppercase text fields for consistency
    const uppercaseFields = ['lpoNo'];
    const finalValue = uppercaseFields.includes(name) ? value.toUpperCase() : value;
    
    setFormData((prev) => ({
      ...prev,
      [name]: finalValue,
    }));

    // When station changes, update rates for existing entries
    if (name === 'station' && value) {
      // If in forwarding mode and station is selected, automatically fetch LPO number
      if (isForwardingMode && value && value !== 'CASH' && value !== 'CUSTOM') {
        try {
          const nextLpoNo = await lpoDocumentsAPI.getNextLpoNumber();
          setFormData(prev => ({ 
            ...prev, 
            lpoNo: nextLpoNo,
            station: value 
          }));
        } catch (error) {
          console.error('Failed to fetch next LPO number:', error);
        }
      }

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
      doNo: '',  // Start empty so user can type immediately
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

  // Handle multi-line paste (Excel-style) - paste multiple trucks at once
  const handleTruckPaste = async (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    // Prevent double-paste
    if (isPastingRef.current) {
      console.log('Paste already in progress, ignoring');
      return;
    }
    
    // Get pasted text from clipboard
    const pastedText = event.clipboardData.getData('text');
    
    // Check if it contains multiple lines or tabs (Excel columns)
    const hasMultipleLines = pastedText.includes('\n') || pastedText.includes('\t');
    
    if (!hasMultipleLines) {
      // Single line paste - let default behavior handle it
      return;
    }
    
    // Prevent default paste behavior for multi-line
    event.preventDefault();
    event.stopPropagation(); // IMPORTANT: Stop event from bubbling
    
    // Set pasting flag
    isPastingRef.current = true;
    
    // Split by newlines and tabs (Excel can have both)
    const lines = pastedText
      .split(/[\n\r\t]+/)  // Split by newlines or tabs
      .map(line => line.trim())  // Trim whitespace
      .filter(line => line.length > 0);  // Remove empty lines
    
    if (lines.length === 0) {
      isPastingRef.current = false;
      return;
    }
    
    // Format all truck numbers first
    const formattedTrucks = lines.map(line => formatTruckNumber(line).toUpperCase());
    
    console.log('Pasting trucks:', formattedTrucks); // Debug log
    console.log('At index:', index); // Debug log
    
    // Update form data in a single batch - use callback to ensure we have latest state
    setFormData(prev => {
      const currentEntries = [...(prev.entries || [])];
      
      console.log('Current entries before paste:', currentEntries.length); // Debug log
      
      // Ensure the index exists
      if (index > currentEntries.length) {
        console.error('Invalid paste index:', index);
        return prev; // Don't update if index is invalid
      }
      
      // Build the new entries array
      const newEntriesArray: LPODetail[] = [];
      
      // Keep all entries before the paste index unchanged
      for (let i = 0; i < index; i++) {
        if (currentEntries[i]) {
          newEntriesArray.push(currentEntries[i]);
        }
      }
      
      // Add all pasted trucks starting at the paste index
      formattedTrucks.forEach((truckNo) => {
        const newEntry: LPODetail = {
          doNo: '',  // Start empty
          truckNo: truckNo,
          liters: 0,
          rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
          amount: 0,
          dest: 'NIL',
        };
        newEntriesArray.push(newEntry);
      });
      
      // Add remaining entries after the paste position (skip the original entry at paste index)
      for (let i = index + 1; i < currentEntries.length; i++) {
        if (currentEntries[i]) {
          newEntriesArray.push(currentEntries[i]);
        }
      }
      
      console.log('New entries after paste:', newEntriesArray.length); // Debug log
      console.log('New entries truck numbers:', newEntriesArray.filter(e => e).map(e => e.truckNo)); // Debug log with filter
      
      return { ...prev, entries: newEntriesArray };
    });
    
    // Update auto-fill data for all entries - use callback to ensure we have latest state
    setEntryAutoFillData(prev => {
      const newAutoFillData: Record<number, EntryAutoFillData> = {};
      
      // Keep auto-fill data for entries before paste index
      Object.keys(prev).forEach(key => {
        const idx = parseInt(key);
        if (idx < index) {
          newAutoFillData[idx] = prev[idx];
        }
      });
      
      // Initialize auto-fill data for all pasted entries
      for (let i = 0; i < formattedTrucks.length; i++) {
        newAutoFillData[index + i] = {
          direction: 'going',
          loading: false,
          fetched: false,
          fuelRecord: null
        };
      }
      
      // Shift auto-fill data for entries after the paste position
      Object.keys(prev).forEach(key => {
        const idx = parseInt(key);
        if (idx > index) {
          // Shift by (number of pasted trucks - 1) because we're replacing the entry at paste index
          newAutoFillData[idx + formattedTrucks.length - 1] = prev[idx];
        }
      });
      
      console.log('Auto-fill data indices:', Object.keys(newAutoFillData)); // Debug log
      
      return newAutoFillData;
    });
    
    // Trigger auto-fetch for all pasted trucks after state has settled
    setTimeout(() => {
      console.log('Starting auto-fetch for', formattedTrucks.length, 'trucks'); // Debug log
      
      formattedTrucks.forEach((formattedTruckNo, i) => {
        const targetIndex = index + i;
        
        console.log(`Scheduling fetch for truck ${formattedTruckNo} at index ${targetIndex}`); // Debug log
        
        // Stagger each fetch to avoid overwhelming the server
        setTimeout(() => {
          console.log(`Fetching truck ${formattedTruckNo} at index ${targetIndex}`); // Debug log
          handleTruckNoChange(targetIndex, formattedTruckNo);
          
          // Reset flag after last fetch is scheduled
          if (i === formattedTrucks.length - 1) {
            setTimeout(() => {
              isPastingRef.current = false;
              console.log('Paste operation complete');
            }, 300);
          }
        }, i * 250); // Increased stagger time to 250ms for more reliable fetching
      });
    }, 200); // Increased initial delay to 200ms
  };

  // Handle truck number change with auto-fetch
  const handleTruckNoChange = async (index: number, truckNo: string) => {
    // Format the truck number to standard format: T(number)(space)(letters) and uppercase
    const formattedTruckNo = formatTruckNumber(truckNo).toUpperCase();
    
    // Check for duplicate truck numbers within the current form entries
    const currentEntries = formData.entries || [];
    const duplicateIndex = currentEntries.findIndex((entry, idx) => 
      idx !== index && 
      entry?.truckNo && 
      entry.truckNo.toUpperCase() === formattedTruckNo.toUpperCase() && 
      formattedTruckNo.length >= 5
    );
    
    // Update the truck number immediately - USE CALLBACK FORM to avoid race conditions
    setFormData(prev => {
      const updatedEntries = [...(prev.entries || [])];
      // Ensure the entry exists before updating
      if (!updatedEntries[index]) {
        updatedEntries[index] = {
          doNo: '',  // Start empty
          truckNo: '',
          liters: 0,
          rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
          amount: 0,
          dest: 'NIL',
        };
      }
      updatedEntries[index] = { ...updatedEntries[index], truckNo: formattedTruckNo };
      return { ...prev, entries: updatedEntries };
    });
    
    // If duplicate found within form, show warning and don't fetch data
    if (duplicateIndex !== -1) {
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { 
          direction: prev[index]?.direction || 'going',
          loading: false, 
          fetched: false,
          fuelRecord: null,
          warningType: 'not_found' as const,
          warningMessage: `⚠️ DUPLICATE: Truck ${formattedTruckNo} is already entered in row ${duplicateIndex + 1}. Please use a different truck number or remove the duplicate entry.`
        }
      }));
      return;
    }

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
        ? getStationDefaults(
            formData.station, 
            direction, 
            destinationForAllocation,
            result.fuelRecord?.totalLts ?? undefined,
            result.fuelRecord?.extra ?? undefined,
            result.fuelRecord?.balance ?? undefined
          ) 
        : { liters: 350, rate: 1.2 };

      // Calculate balance info for Mbeya returning (INFINITY station)
      let balanceInfo = undefined;
      if (result.fuelRecord && formData.station?.toUpperCase() === 'INFINITY' && direction === 'returning') {
        balanceInfo = calculateMbeyaReturnBalance(result.fuelRecord);
      }

      // Auto-fill the entry - USE CALLBACK FORM to avoid race conditions
      setFormData(prev => {
        const newEntries = [...(prev.entries || [])];
        
        // Ensure entry exists
        if (!newEntries[index]) {
          newEntries[index] = {
            doNo: '',  // Start empty
            truckNo: '',
            liters: 0,
            rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
            amount: 0,
            dest: 'NIL',
          };
        }
        
        newEntries[index] = {
          ...newEntries[index],
          truckNo: formattedTruckNo,  // Use formatted truck number to maintain consistent format
          doNo: doNumber,
          dest: destinationForAllocation,  // Use correct destination based on direction
          liters: defaults.liters,
          rate: defaults.rate,
          amount: defaults.liters * defaults.rate
        };
        
        // If Mbeya balance info suggests different liters, update
        if (balanceInfo && balanceInfo.suggestedLiters !== defaults.liters && balanceInfo.suggestedLiters > 0) {
          newEntries[index].liters = balanceInfo.suggestedLiters;
          newEntries[index].amount = balanceInfo.suggestedLiters * newEntries[index].rate;
        }

        const total = newEntries.reduce((sum, entry) => sum + (entry?.amount || 0), 0);
        
        return { ...prev, entries: newEntries, total };
      });
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
          formulaStatus: defaults.formulaStatus || null,
          formulaMessage: defaults.formulaMessage,
          // Journey navigation: store all available journeys
          allJourneys: result.allJourneys,
          selectedJourneyIndex: result.allJourneys?.active ? -1 : 0, // -1 for active, 0 for first queued
          selectedJourneyType: result.allJourneys?.active ? 'active' : 'queued',
        }
      }));
    }
  };

  /**
   * Handle DO number change (for DO-first search)
   * Fetches journey by DO and auto-fills truck number
   */
  const handleDONoChange = async (index: number, doNo: string) => {
    const doNoUpper = doNo.trim().toUpperCase();
    
    // Update DO number immediately (keep empty if user clears it, only default to NIL on blur if still empty)
    setFormData(prev => {
      const updatedEntries = [...(prev.entries || [])];
      if (!updatedEntries[index]) {
        updatedEntries[index] = {
          doNo: '',  // Start empty
          truckNo: '',
          liters: 0,
          rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
          amount: 0,
          dest: 'NIL',
        };
      }
      updatedEntries[index] = { ...updatedEntries[index], doNo: doNoUpper || '' };
      return { ...prev, entries: updatedEntries };
    });

    // If DO number is valid, fetch journey data
    if (doNoUpper && doNoUpper !== 'NIL' && doNoUpper.length >= 3) {
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { ...prev[index], loading: true, fetched: false }
      }));

      const result = await fetchJourneyByDO(doNoUpper);
      
      // Detect direction from DO type (IMPORT = going, EXPORT = returning)
      const direction = result.fuelRecord 
        ? (result.fuelRecord.returnDo === doNoUpper ? 'returning' : 'going')
        : 'going';
      
      // Check if return DO is missing
      const returnDoMissing = !result.returnDo || result.returnDo === 'NIL' || result.returnDo === '';
      
      // Use correct destination based on direction
      const destinationForAllocation = direction === 'going'
        ? result.goingDestination 
        : result.destination;
      
      const defaults = formData.station 
        ? getStationDefaults(
            formData.station, 
            direction, 
            destinationForAllocation,
            result.fuelRecord?.totalLts ?? undefined,
            result.fuelRecord?.extra ?? undefined,
            result.fuelRecord?.balance ?? undefined
          ) 
        : { liters: 350, rate: 1.2 };

      // Calculate balance info for Mbeya returning
      let balanceInfo = undefined;
      if (result.fuelRecord && formData.station?.toUpperCase() === 'INFINITY' && direction === 'returning') {
        balanceInfo = calculateMbeyaReturnBalance(result.fuelRecord);
      }

      // Auto-fill the entry with truck number and details
      setFormData(prev => {
        const newEntries = [...(prev.entries || [])];
        
        if (!newEntries[index]) {
          newEntries[index] = {
            doNo: '',  // Start empty
            truckNo: '',
            liters: 0,
            rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
            amount: 0,
            dest: 'NIL',
          };
        }
        
        newEntries[index] = {
          ...newEntries[index],
          truckNo: result.truckNo || '',  // Auto-fill truck number from journey
          doNo: doNoUpper,
          dest: destinationForAllocation,
          liters: defaults.liters,
          rate: defaults.rate,
          amount: defaults.liters * defaults.rate
        };
        
        // If Mbeya balance info suggests different liters, update
        if (balanceInfo && balanceInfo.suggestedLiters !== defaults.liters && balanceInfo.suggestedLiters > 0) {
          newEntries[index].liters = balanceInfo.suggestedLiters;
          newEntries[index].amount = balanceInfo.suggestedLiters * newEntries[index].rate;
        }

        const total = newEntries.reduce((sum, entry) => sum + (entry?.amount || 0), 0);
        
        return { ...prev, entries: newEntries, total };
      });
      
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { 
          direction, 
          loading: false, 
          fetched: result.success, 
          fuelRecord: result.fuelRecord,
          fuelRecordId: result.fuelRecord?.id || result.fuelRecord?._id,  // Handle both id and _id
          goingDestination: result.goingDestination,
          returnDoMissing,
          warningType: result.warningType || null,
          warningMessage: result.message,
          balanceInfo,
          formulaStatus: defaults.formulaStatus || null,
          formulaMessage: defaults.formulaMessage,
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
        ? getStationDefaults(
            formData.station, 
            newDirection, 
            destinationForAllocation,
            fuelRecord.totalLts ?? undefined,
            fuelRecord.extra ?? undefined,
            fuelRecord.balance ?? undefined
          ) 
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

      // USE CALLBACK FORM to avoid race conditions
      setFormData(prev => {
        const newEntries = [...(prev.entries || [])];
        
        // Ensure entry exists
        if (!newEntries[index]) {
          newEntries[index] = {
            doNo: '',  // Start empty
            truckNo: '',
            liters: 0,
            rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
            amount: 0,
            dest: 'NIL',
          };
        }
        
        newEntries[index] = {
          ...newEntries[index],
          doNo: doNumber,
          dest: destinationForAllocation,  // Update destination based on direction
          liters: litersToSet,
          amount: litersToSet * defaults.rate
        };

        const total = newEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
        return { ...prev, entries: newEntries, total };
      });
      
      // Update autofill data with new direction and balance info
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { 
          ...prev[index], 
          direction: newDirection,
          balanceInfo: newDirection === 'returning' ? balanceInfo : undefined,
          formulaStatus: defaults.formulaStatus || null,
          formulaMessage: defaults.formulaMessage,
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

  /**
   * Navigate between active and queued journeys for a truck
   * Allows switching between different journeys when truck has multiple bookings
   */
  const handleJourneyNavigation = async (index: number, targetJourneyType: 'active' | 'queued', queuedIndex?: number) => {
    const autoFill = entryAutoFillData[index];
    if (!autoFill?.allJourneys) return;

    const { active, queued } = autoFill.allJourneys;
    
    // Determine which journey to use
    let selectedJourney: FuelRecord | null = null;
    let journeyIndex = -1; // -1 for active, 0+ for queued
    
    if (targetJourneyType === 'active' && active) {
      selectedJourney = active;
      journeyIndex = -1;
    } else if (targetJourneyType === 'queued' && queued && queued.length > 0) {
      const targetIndex = queuedIndex ?? 0;
      if (targetIndex < queued.length) {
        selectedJourney = queued[targetIndex];
        journeyIndex = targetIndex;
      }
    }

    if (!selectedJourney) return;

    const direction = autoFill.direction || 'going';
    const doNumber = direction === 'going' ? selectedJourney.goingDo : (selectedJourney.returnDo || selectedJourney.goingDo);
    
    // Get destination
    const goingDestination = selectedJourney.originalGoingTo || selectedJourney.to || 'NIL';
    const currentDestination = selectedJourney.to || 'NIL';
    const destinationForAllocation = direction === 'going' ? goingDestination : currentDestination;
    
    // Get defaults for this journey
    const defaults = formData.station 
      ? getStationDefaults(
          formData.station, 
          direction, 
          destinationForAllocation,
          selectedJourney.totalLts ?? undefined,
          selectedJourney.extra ?? undefined,
          selectedJourney.balance ?? undefined
        ) 
      : { liters: 350, rate: 1.2 };

    // Calculate balance info for Mbeya returning
    let balanceInfo = undefined;
    if (selectedJourney && formData.station?.toUpperCase() === 'INFINITY' && direction === 'returning') {
      balanceInfo = calculateMbeyaReturnBalance(selectedJourney);
    }

    let litersToSet = defaults.liters;
    if (balanceInfo && balanceInfo.suggestedLiters !== defaults.liters && balanceInfo.suggestedLiters > 0) {
      litersToSet = balanceInfo.suggestedLiters;
    }

    // Update form data
    setFormData(prev => {
      const newEntries = [...(prev.entries || [])];
      if (newEntries[index]) {
        newEntries[index] = {
          ...newEntries[index],
          doNo: doNumber,
          dest: destinationForAllocation,
          liters: litersToSet,
          amount: litersToSet * defaults.rate
        };
      }
      const total = newEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      return { ...prev, entries: newEntries, total };
    });

    // Update autofill data
    setEntryAutoFillData(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        fuelRecord: selectedJourney,
        fuelRecordId: selectedJourney.id || selectedJourney._id,
        selectedJourneyIndex: journeyIndex,
        selectedJourneyType: targetJourneyType,
        balanceInfo,
        warningType: null, // Clear warning when explicitly selecting a journey
        formulaStatus: defaults.formulaStatus || null,
        formulaMessage: defaults.formulaMessage,
      }
    }));

    console.log(`[Journey Navigation] Switched to ${targetJourneyType} journey:`, selectedJourney.goingDo);
  };

  const handleEntryChange = (index: number, field: keyof LPODetail, value: string | number) => {
    const updatedEntries = [...(formData.entries || [])];
    // Ensure the entry exists before updating
    if (!updatedEntries[index]) {
      updatedEntries[index] = {
        doNo: '',  // Start empty
        truckNo: '',
        liters: 0,
        rate: formData.station ? getStationDefaults(formData.station, 'going').rate : 1.2,
        amount: 0,
        dest: 'NIL',
      };
    }
    // Auto-uppercase text fields for consistency
    const uppercaseFields = ['doNo', 'dest'];
    const finalValue = (typeof value === 'string' && uppercaseFields.includes(field)) ? value.toUpperCase() : value;
    
    updatedEntries[index] = {
      ...updatedEntries[index],
      [field]: finalValue,
    };

    // Auto-calculate amount when liters or rate changes
    if (field === 'liters' || field === 'rate') {
      const liters = field === 'liters' ? Number(value) : updatedEntries[index].liters;
      const rate = field === 'rate' ? Number(value) : updatedEntries[index].rate;
      updatedEntries[index].amount = liters * rate;
    }

    // Calculate total
    const total = updatedEntries.reduce((sum, entry) => sum + (entry?.amount || 0), 0);

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
    const invalidEntries = formData.entries.filter(e => e != null).filter(
      (entry) => !entry.truckNo || !entry.truckNo.trim()
    );
    if (invalidEntries.length > 0) {
      alert('All entries must have a truck number');
      return;
    }
    
    // Check for duplicate truck numbers within the form
    const truckNumbers = formData.entries.filter(e => e != null).map(e => e.truckNo.toUpperCase());
    const duplicateTrucks = truckNumbers.filter((truck, index) => 
      truckNumbers.indexOf(truck) !== index
    );
    if (duplicateTrucks.length > 0) {
      const uniqueDuplicates = [...new Set(duplicateTrucks)];
      alert(`Cannot submit: The following trucks are entered multiple times in this form:\n\n${uniqueDuplicates.join(', ')}\n\nPlease remove the duplicate entries before submitting.`);
      return;
    }

    // Block submission if any entry is set to 'returning' but has no Return DO
    const trucksWithMissingReturnDo = formData.entries
      .filter(e => e != null)
      .map((entry, idx) => ({ entry, af: entryAutoFillData[idx] }))
      .filter(({ af }) => af && af.direction === 'returning' && af.returnDoMissing && af.fetched)
      .map(({ entry }) => entry.truckNo);
    if (trucksWithMissingReturnDo.length > 0) {
      alert(`Cannot submit: The following trucks are set to "Return" direction but have no Return DO in the system:\n\n${trucksWithMissingReturnDo.join(', ')}\n\nPlease switch them back to "Going" or wait until the Return DO is entered.`);
      return;
    }

    // Ensure all entries have required fields with proper defaults
    // For CASH mode, include both direction checkpoints (can have one or both)
    // For CUSTOM mode, include the custom station checkpoint mappings
    const validEntries = formData.entries.filter(e => e != null).map(entry => ({
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

    // Perform cancellation for CASH mode if any LPOs are selected
    if (formData.station === 'CASH' && selectedLPOsToCancel.size > 0) {
      // Check if any LPOs are actually selected
      const hasAnySelection = Array.from(selectedLPOsToCancel.values()).some(set => set.size > 0);
      
      if (hasAnySelection) {
        try {
          // Cancel only selected LPOs
          for (const [truckNo, selectedLPOIds] of selectedLPOsToCancel) {
            if (selectedLPOIds.size === 0) continue; // Skip trucks with no selections
            
            const truckDirections = existingLPOsForTrucks.get(truckNo);
            if (!truckDirections) continue;
            
            for (const { lpos, direction, doNo } of truckDirections) {
              const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
              for (const lpo of lpos) {
                // Only cancel if this LPO is selected
                if (selectedLPOIds.has(lpo.id as string)) {
                  await lpoDocumentsAPI.cancelTruck(
                    lpo.id as string,
                    truckNo,
                    checkpoint as CancellationPoint,
                    `Cash mode payment - station was out of fuel (${direction}, DO: ${doNo})`
                  );
                }
              }
            }
          }
          console.log('Cancellation completed for selected LPOs');
        } catch (error) {
          console.error('Error during cancellation:', error);
          // Continue with LPO creation even if cancellation fails
        }
      } else {
        console.log('No LPOs selected for cancellation - proceeding with CASH LPO creation only');
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

    onSubmit(submitData);
    
    // Clear the draft from local storage after successful submit
    clearFormStorage();
    setHasDraft(false);
  };

  // Handle forward button click for NEW LPOs - create and reload form with trucks
  const handleCreateAndForward = async () => {
    if (!formData.lpoNo || !formData.station || !formData.entries || formData.entries.length === 0) {
      alert('Please ensure the LPO has a number, station, and at least one entry before forwarding');
      return;
    }

    if (isCreatingAndForwarding) {
      return; // Prevent double-clicks
    }

    setIsCreatingAndForwarding(true);

    try {
      // Validate each entry has truck number (same as normal submit validation)
      const invalidEntries = formData.entries.filter(e => e != null).filter(
        (entry) => !entry.truckNo || !entry.truckNo.trim()
      );
      if (invalidEntries.length > 0) {
        alert('All entries must have a truck number');
        return;
      }

      // Submit the current LPO using the same format as handleSubmit
      const validEntries = formData.entries.filter(e => e != null).map(entry => ({
        ...entry,
        doNo: (entry.doNo && entry.doNo.trim()) || 'NIL',
        truckNo: entry.truckNo.trim(),
        dest: (entry.dest && entry.dest.trim()) || 'NIL',
        liters: Number(entry.liters) || 0,
        rate: Number(entry.rate) || 0,
        amount: (Number(entry.liters) || 0) * (Number(entry.rate) || 0),
      }));

      const total = validEntries.reduce((sum, entry) => sum + entry.amount, 0);

      const lpoData: Partial<LPOSummary> = {
        lpoNo: formData.lpoNo,
        date: formData.date || new Date().toISOString().split('T')[0],
        station: formData.station,
        orderOf: formData.orderOf || 'TAHMEED',
        entries: validEntries,
        total,
      };

      const createdLpo = await lpoDocumentsAPI.create(lpoData);
      console.log('Source LPO created:', createdLpo);

      // Fetch the next LPO number immediately for the forwarded LPO
      const nextLpoNo = await lpoDocumentsAPI.getNextLpoNumber();

      // Keep the same trucks for forwarding, preserve all fields properly
      const forwardedEntries = formData.entries.map(entry => ({
        id: undefined, // Remove ID so it's treated as new
        doNo: entry.doNo || 'NIL',
        truckNo: entry.truckNo,
        dest: entry.dest || 'NIL',
        liters: entry.liters || 0,
        rate: entry.rate || 0,
        amount: entry.amount || 0,
      }));

      // Reset form with the trucks pre-filled AND the next LPO number ready
      setFormData({
        id: undefined,
        lpoNo: nextLpoNo, // Already fetched, ready to use
        date: new Date().toISOString().split('T')[0],
        station: '', // User will select this
        orderOf: formData.orderOf || 'TAHMEED',
        entries: forwardedEntries,
        total: undefined,
      });

      // Set forwarding mode
      setIsForwardingMode(true);
      setForwardedFromInfo({
        lpoNo: createdLpo.lpoNo,
        station: createdLpo.station,
      });

      // Save as draft with the LPO number
      const forwardedDraft = {
        lpoNo: nextLpoNo,
        date: new Date().toISOString().split('T')[0],
        station: '',
        orderOf: formData.orderOf || 'TAHMEED',
        entries: forwardedEntries,
      };
      localStorage.setItem('lpo_draft', JSON.stringify(forwardedDraft));

      alert(`LPO #${createdLpo.lpoNo} created successfully!\n\nForm reloaded with LPO #${nextLpoNo} and the same trucks.\nSelect the target station and submit when ready.`);

    } catch (error: any) {
      console.error('Error during create and forward:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      alert(`Failed to create LPO: ${error.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setIsCreatingAndForwarding(false);
    }
  };

  // Handle forward LPO button click for EXISTING LPOs - opens full forward modal
  const handleOpenForwardModal = () => {
    if (!formData.lpoNo || !formData.station || !formData.entries || formData.entries.length === 0) {
      alert('Please ensure the LPO has a number, station, and at least one entry before forwarding');
      return;
    }
    
    // Create a temporary LPO object from current form data for the modal
    const currentLpo: LPOSummary = {
      id: formData.id || 'temp',
      lpoNo: formData.lpoNo,
      date: formData.date || new Date().toISOString().split('T')[0],
      station: formData.station,
      orderOf: formData.orderOf || 'TAHMEED',
      entries: formData.entries,
      total: formData.total || 0,
    };
    
    setLpoToForward(currentLpo);
    setIsForwardModalOpen(true);
  };

  // Handle forward completion - refresh or close form
  const handleForwardComplete = (forwardedLpo: LPOSummary) => {
    setIsForwardModalOpen(false);
    setLpoToForward(null);
    // Optionally show success message
    alert(`Successfully forwarded to LPO #${forwardedLpo.lpoNo} at ${forwardedLpo.station}`);
  };

  if (!isOpen) return null;

  // Compute whether any entry has status info that needs the Status column
  const hasAnyIssue = (formData.entries || []).some((entry, idx) => {
    if (!entry) return false;
    const af = entryAutoFillData[idx] || { direction: 'going' as const, loading: false, fetched: false };
    const dupInfo = duplicateWarnings.get(entry?.truckNo || '');
    const hasDup = !!dupInfo && formData.station?.toUpperCase() !== 'CASH';
    return !!(
      (af.warningType && !af.loading && (entry?.truckNo?.length || 0) >= 5) ||
      hasDup ||
      (af.fetched && af.allJourneys) ||
      (af.direction === 'returning' && af.returnDoMissing && af.fetched) ||
      (af.allJourneys && (
        (af.allJourneys.active && af.allJourneys.queued.length > 0) ||
        (!af.allJourneys.active && af.allJourneys.queued.length > 1)
      )) ||
      (af.balanceInfo && af.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY') ||
      (af.formulaStatus === 'missing_data' || af.formulaStatus === 'error')
    );
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4" onClick={handleCancel}>
      <div className="bg-white dark:bg-gray-800 rounded-none sm:rounded-lg shadow-xl max-w-6xl w-full h-full sm:h-auto max-h-screen sm:max-h-[90vh] overflow-y-auto transition-colors" onClick={(e) => e.stopPropagation()}>
        {/* Forwarding mode banner */}
        {isForwardingMode && forwardedFromInfo && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <ArrowRight className="w-4 h-4" />
              <span className="text-sm font-medium">
                Forwarded from LPO #{forwardedFromInfo.lpoNo} at {forwardedFromInfo.station}
              </span>
            </div>
          </div>
        )}

        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {initialData ? 'Edit LPO Document' : 'New LPO Document'}
            </h2>
            {/* Draft indicator */}
            {hasDraft && !initialData && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                Draft saved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Discard draft button */}
            {hasDraft && !initialData && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 px-3 py-1 rounded border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Discard Draft
              </button>
            )}
            <button
              onClick={handleCancel}
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
                <div className="relative" ref={stationDropdownRef}>
                  <button
                    type="button"
                    onClick={() => !loadingStations && setShowStationDropdown(!showStationDropdown)}
                    disabled={loadingStations}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className={!formData.station ? 'text-gray-400' : ''}>
                      {loadingStations ? 'Loading stations...' : (formData.station || 'Select Station')}
                    </span>
                    <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showStationDropdown ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showStationDropdown && !loadingStations && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange({ target: { name: 'station', value: '' } } as any);
                          setShowStationDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          !formData.station ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>Select Station</span>
                        {!formData.station && <Check className="w-4 h-4" />}
                      </button>
                      {availableStations.map(station => (
                        <button
                          key={station._id}
                          type="button"
                          onClick={() => {
                            handleHeaderChange({ target: { name: 'station', value: station.stationName } } as any);
                            setShowStationDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                            formData.station === station.stationName ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          <span>{station.stationName}</span>
                          {formData.station === station.stationName && <Check className="w-4 h-4" />}
                        </button>
                      ))}
                      <div className="border-t border-gray-200 dark:border-gray-600"></div>
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange({ target: { name: 'station', value: 'CASH' } } as any);
                          setShowStationDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          formData.station === 'CASH' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>CASH</span>
                        {formData.station === 'CASH' && <Check className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange({ target: { name: 'station', value: 'CUSTOM' } } as any);
                          setShowStationDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          formData.station === 'CUSTOM' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        <span>CUSTOM</span>
                        {formData.station === 'CUSTOM' && <Check className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                  {formData.station && (() => {
                    const station = availableStations.find(s => s.stationName === formData.station);
                    if (station) {
                      const currency = station.defaultRate < 10 ? 'USD' : 'TZS';
                      return (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          Default: Going {station.defaultLitersGoing}L, Returning {station.defaultLitersReturning}L @ {station.defaultRate}/L ({currency})
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
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
          </div>

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
                      <div className="relative" ref={goingCheckpointRef}>
                        <label className="block text-xs font-medium text-orange-800 dark:text-orange-300 mb-1">
                          Going Checkpoint *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowGoingCheckpointDropdown(!showGoingCheckpointDropdown)}
                          className={`w-full px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between ${
                            !goingCheckpoint ? 'border-red-400 dark:border-red-600' : 'border-orange-300 dark:border-orange-600'
                          }`}
                        >
                          <span className={!goingCheckpoint ? 'text-gray-400' : ''}>
                            {goingCheckpoint ? getCancellationPointDisplayName(goingCheckpoint) : 'Select checkpoint...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showGoingCheckpointDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showGoingCheckpointDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {getAvailableCancellationPoints('CASH').going.map((point) => (
                              <button
                                key={point}
                                type="button"
                                onClick={() => {
                                  setGoingCheckpoint(point as CancellationPoint);
                                  setShowGoingCheckpointDropdown(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                                  goingCheckpoint === point ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'
                                }`}
                              >
                                <span>{getCancellationPointDisplayName(point)}</span>
                                {goingCheckpoint === point && <Check className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        )}
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
                      <div className="relative" ref={returningCheckpointRef}>
                        <label className="block text-xs font-medium text-orange-800 dark:text-orange-300 mb-1">
                          Returning Checkpoint *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowReturningCheckpointDropdown(!showReturningCheckpointDropdown)}
                          className={`w-full px-2 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between ${
                            !returningCheckpoint ? 'border-red-400 dark:border-red-600' : 'border-orange-300 dark:border-orange-600'
                          }`}
                        >
                          <span className={!returningCheckpoint ? 'text-gray-400' : ''}>
                            {returningCheckpoint ? getCancellationPointDisplayName(returningCheckpoint) : 'Select checkpoint...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showReturningCheckpointDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showReturningCheckpointDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {getAvailableCancellationPoints('CASH').returning.map((point) => (
                              <button
                                key={point}
                                type="button"
                                onClick={() => {
                                  setReturningCheckpoint(point as CancellationPoint);
                                  setShowReturningCheckpointDropdown(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                                  returningCheckpoint === point ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-gray-100'
                                }`}
                              >
                                <span>{getCancellationPointDisplayName(point)}</span>
                                {returningCheckpoint === point && <Check className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        )}
                        {!returningCheckpoint && (
                          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                            ⚠ Select checkpoint
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
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-800 dark:text-red-300">
                          Existing LPOs Found: {existingLPOsForTrucks.size} truck(s) have LPOs at this checkpoint
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Select which LPOs to cancel (if truck actually used that station). Leave unchecked if cash fuel was purchased elsewhere.
                        </p>
                        <div className="mt-2 space-y-3">
                          {Array.from(existingLPOsForTrucks.entries()).map(([truckNo, directionLPOs]) => {
                            const selectedForTruck = selectedLPOsToCancel.get(truckNo) || new Set();
                            
                            return (
                              <div key={truckNo} className="border-l-2 border-red-300 dark:border-red-700 pl-3">
                                <div className="font-medium text-red-800 dark:text-red-300 text-sm mb-2">
                                  {truckNo} (DO: {directionLPOs[0]?.doNo})
                                  {selectedForTruck.size === 0 && <span className="ml-2 text-xs text-amber-600">(None selected - CASH fuel will be recorded without cancelling)</span>}
                                  {selectedForTruck.size > 0 && <span className="ml-2 text-xs text-red-600">({selectedForTruck.size} selected for cancellation)</span>}
                                </div>
                                
                                {directionLPOs.map(({ lpos, direction }) => (
                                  <div key={direction} className="ml-2">
                                    <div className="text-xs text-red-700 dark:text-red-400 mb-1">
                                      [{direction}] - {lpos.length} LPO{lpos.length > 1 ? 's' : ''} found at this checkpoint:
                                    </div>
                                    
                                    {/* Always show checkboxes - user chooses what to cancel */}
                                    <div className="space-y-1 ml-4">
                                      {lpos.map((lpo) => (
                                        <label key={lpo.id} className="flex items-center space-x-2 text-xs cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 p-1 rounded">
                                          <input
                                            type="checkbox"
                                            checked={selectedForTruck.has(lpo.id as string)}
                                            onChange={(e) => {
                                              const newSelected = new Map(selectedLPOsToCancel);
                                              // CRITICAL: Create a NEW Set instance, don't modify the existing one
                                              const currentTruckSet = newSelected.get(truckNo) || new Set();
                                              const newTruckSet = new Set(currentTruckSet); // Clone the Set
                                              
                                              if (e.target.checked) {
                                                newTruckSet.add(lpo.id as string);
                                              } else {
                                                newTruckSet.delete(lpo.id as string);
                                              }
                                              
                                              newSelected.set(truckNo, newTruckSet);
                                              setSelectedLPOsToCancel(newSelected);
                                            }}
                                            className="rounded border-red-300 text-red-600 focus:ring-red-500"
                                          />
                                          <span className="text-red-700 dark:text-red-300">
                                            LPO #{lpo.lpoNo} ({lpo.station}, {lpo.date})
                                            {lpo.entries?.find((e: any) => e.truckNo === truckNo && !e.isCancelled) && 
                                              ` - ${lpo.entries.find((e: any) => e.truckNo === truckNo)?.liters || 0}L`
                                            }
                                          </span>
                                        </label>
                                      ))}
                                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-2 italic bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                                        ℹ️ Only select LPOs if the truck actually refueled at that station and it ran out of fuel. 
                                        If cash fuel was purchased elsewhere (roadside, different station), leave unchecked.
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
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
                      <div className="mt-3 ml-8 relative" ref={customGoingRef}>
                        <label className="block text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                          Select Fuel Record Column for Going *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCustomGoingDropdown(!showCustomGoingDropdown)}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between ${
                            !customGoingCheckpoint ? 'border-red-300 dark:border-red-600' : 'border-green-300 dark:border-green-600'
                          }`}
                        >
                          <span className={!customGoingCheckpoint ? 'text-gray-400' : ''}>
                            {customGoingCheckpoint ? FUEL_RECORD_COLUMNS.going.find(c => c.field === customGoingCheckpoint)?.label : 'Select checkpoint column...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showCustomGoingDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showCustomGoingDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {FUEL_RECORD_COLUMNS.going.map((col) => (
                              <button
                                key={col.field}
                                type="button"
                                onClick={() => {
                                  setCustomGoingCheckpoint(col.field);
                                  setShowCustomGoingDropdown(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                                  customGoingCheckpoint === col.field ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'
                                }`}
                              >
                                <span>{col.label}</span>
                                {customGoingCheckpoint === col.field && <Check className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        )}
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
                      <div className="mt-3 ml-8 relative" ref={customReturnRef}>
                        <label className="block text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
                          Select Fuel Record Column for Return *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCustomReturnDropdown(!showCustomReturnDropdown)}
                          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between ${
                            !customReturnCheckpoint ? 'border-red-300 dark:border-red-600' : 'border-blue-300 dark:border-blue-600'
                          }`}
                        >
                          <span className={!customReturnCheckpoint ? 'text-gray-400' : ''}>
                            {customReturnCheckpoint ? FUEL_RECORD_COLUMNS.return.find(c => c.field === customReturnCheckpoint)?.label : 'Select checkpoint column...'}
                          </span>
                          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showCustomReturnDropdown ? 'rotate-180' : ''}`} />
                        </button>
                        {showCustomReturnDropdown && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {FUEL_RECORD_COLUMNS.return.map((col) => (
                              <button
                                key={col.field}
                                type="button"
                                onClick={() => {
                                  setCustomReturnCheckpoint(col.field);
                                  setShowCustomReturnDropdown(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between ${
                                  customReturnCheckpoint === col.field ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'
                                }`}
                              >
                                <span>{col.label}</span>
                                {customReturnCheckpoint === col.field && <Check className="w-4 h-4" />}
                              </button>
                            ))}
                          </div>
                        )}
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

            {/* Mobile Card View (< md) */}
            <div className="md:hidden space-y-1.5">
              {formData.entries && formData.entries.length > 0 ? formData.entries.filter(entry => entry != null).map((entry, index) => {
                const autoFill = entryAutoFillData[index] || { direction: 'going', loading: false, fetched: false };
                const duplicateInfo = duplicateWarnings.get(entry?.truckNo || '');
                const hasDuplicate = !!duplicateInfo && formData.station?.toUpperCase() !== 'CASH';
                const isExactDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount;
                const isDifferentAmount = hasDuplicate && duplicateInfo?.isDifferentAmount;
                const hasNoRecordWarning = autoFill.warningType && !autoFill.loading && (entry?.truckNo?.length || 0) >= 5;
                return (
                  <div key={index} className={`border rounded-lg p-2 transition-colors ${
                    autoFill.fetched && !hasNoRecordWarning && !isExactDuplicate && !isDifferentAmount ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                    : hasNoRecordWarning ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10'
                    : isExactDuplicate ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                    : isDifferentAmount ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                  }`}>
                    {/* Header row: # + Truck + DO + Direction + Actions all on one line */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 w-4 flex-shrink-0">#{index + 1}</span>
                      {/* Truck */}
                      <div className="relative flex-1 min-w-0">
                        <input type="text" value={entry?.truckNo || ''} onChange={(e) => handleTruckNoChange(index, e.target.value)} onPaste={(e) => handleTruckPaste(index, e)}
                          placeholder="Truck" title="Paste multiple trucks (one per line) to auto-fill multiple rows"
                          className={`w-full pr-4 px-1.5 py-0.5 border rounded text-[10px] focus:ring-1 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                            isExactDuplicate ? 'border-red-500 dark:border-red-400' : isDifferentAmount ? 'border-blue-500 dark:border-blue-400' : hasNoRecordWarning ? 'border-amber-500 dark:border-amber-400' : 'border-gray-300 dark:border-gray-600'
                          }`} />
                        {autoFill.loading && <Loader2 className="absolute right-1 top-1 w-3 h-3 text-primary-500 animate-spin" />}
                        {autoFill.fetched && !autoFill.loading && !hasDuplicate && <CheckCircle className="absolute right-1 top-1 w-3 h-3 text-green-500" />}
                        {hasNoRecordWarning && !autoFill.loading && <AlertTriangle className="absolute right-1 top-1 w-3 h-3 text-amber-500" />}
                        {isExactDuplicate && <AlertTriangle className="absolute right-1 top-1 w-3 h-3 text-red-500" />}
                        {isDifferentAmount && <CheckCircle className="absolute right-1 top-1 w-3 h-3 text-blue-500" />}
                      </div>
                      {/* DO */}
                      <div className="relative flex-1 min-w-0">
                        <input type="text" value={entry?.doNo || ''} onChange={(e) => handleDONoChange(index, e.target.value)}
                          onBlur={(e) => { if (!e.target.value.trim()) handleEntryChange(index, 'doNo', 'NIL'); }}
                          placeholder="DO#" title="Enter DO number to auto-fill"
                          className="w-full px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-[10px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                      {/* Direction toggle */}
                      <button type="button" onClick={() => toggleDirection(index)}
                        className={`flex-shrink-0 inline-flex items-center px-1.5 py-1 rounded text-[10px] font-medium ${
                          autoFill.direction === 'going'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                        }`}>
                        {autoFill.direction === 'going' ? <><ArrowRight className="w-3 h-3" /></> : <><ArrowLeft className="w-3 h-3" /></>}
                      </button>
                      {/* Actions */}
                      {autoFill.fuelRecord && (
                        <button type="button" onClick={() => handleInspectRecord(index)}
                          className="flex-shrink-0 p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded" title="Inspect fuel record">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={() => handleRemoveEntry(index)}
                        className="flex-shrink-0 p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" title="Remove entry">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Warnings (only show when needed) */}
                    {(hasNoRecordWarning || isExactDuplicate || isDifferentAmount) && (
                      <div className="mb-1.5 text-[10px] leading-tight">
                        {hasNoRecordWarning && (autoFill.warningMessage?.includes('DUPLICATE')
                          ? <span className="text-red-600 dark:text-red-400 font-semibold">⚠️ Duplicate — use different truck</span>
                          : <span className="text-amber-600 dark:text-amber-400">
                              {autoFill.warningType === 'not_found' && '⚠️ No record — manual entry allowed'}
                              {autoFill.warningType === 'journey_completed' && '⚠️ Journey complete (0L)'}
                              {autoFill.warningType === 'no_active_record' && '⚠️ No active journey'}
                            </span>
                        )}
                        {isExactDuplicate && duplicateInfo && <span className="text-red-600 dark:text-red-400">⛔ Dup LPO #{duplicateInfo.lpoNo} ({duplicateInfo.liters}L)</span>}
                        {isDifferentAmount && duplicateInfo && <span className="text-blue-600 dark:text-blue-400">➕ Top-up +{duplicateInfo.newLiters}L (existing {duplicateInfo.liters}L)</span>}
                      </div>
                    )}

                    {/* Journey navigation (only when applicable) */}
                    {autoFill.allJourneys && (autoFill.allJourneys.active || autoFill.allJourneys.queued.length > 1) && (
                      <div className="flex items-center gap-1 mb-1.5 flex-wrap">
                        {autoFill.allJourneys.active && (
                          <button type="button" onClick={() => handleJourneyNavigation(index, 'active')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${autoFill.selectedJourneyType === 'active' ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                            🚛 Active
                          </button>
                        )}
                        {autoFill.allJourneys.queued.map((qJ, qIdx) => (
                          <button key={qIdx} type="button" onClick={() => handleJourneyNavigation(index, 'queued', qIdx)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${autoFill.selectedJourneyType === 'queued' && autoFill.selectedJourneyIndex === qIdx ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                            ⏳ Q{qJ.queueOrder || qIdx + 1}
                          </button>
                        ))}
                        {autoFill.fetched && (
                          <span className={`text-[10px] ${(autoFill.fuelRecord as any)?.isLocked ? 'text-amber-600 dark:text-amber-400' : autoFill.selectedJourneyType === 'queued' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                            {(autoFill.fuelRecord as any)?.isLocked ? '🔒 Locked' : autoFill.selectedJourneyType === 'queued' ? '⏳ Queued' : '🚛 Active'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Liters + Rate + Amount + Dest in one compact row */}
                    <div className="grid grid-cols-4 gap-1">
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Ltrs</label>
                        <input type="number" value={entry?.liters || 0} onChange={(e) => handleEntryChange(index, 'liters', parseFloat(e.target.value) || 0)}
                          className="w-full px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-[10px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Rate</label>
                        <input type="number" value={entry?.rate || 0} step="0.01" onChange={(e) => handleEntryChange(index, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-[10px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Amt</label>
                        <input type="number" value={(entry?.amount || 0).toFixed(2)} readOnly
                          className="w-full px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-[10px] bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 dark:text-gray-500 mb-0.5">Dest</label>
                        <input type="text" value={entry?.dest || 'NIL'} onChange={(e) => handleEntryChange(index, 'dest', e.target.value)} placeholder="NIL"
                          className="w-full px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-[10px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                    </div>
                    {/* Balance hint (rare — only for Infinity return) */}
                    {autoFill.balanceInfo && autoFill.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY' && (
                      <div className={`mt-1 text-[10px] ${autoFill.balanceInfo.suggestedLiters < autoFill.balanceInfo.standardAllocation ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                        <Fuel className="w-3 h-3 inline mr-0.5" />
                        {autoFill.balanceInfo.suggestedLiters < autoFill.balanceInfo.standardAllocation ? `${autoFill.balanceInfo.suggestedLiters}L (reduced)` : `${autoFill.balanceInfo.suggestedLiters}L`}
                      </div>
                    )}
                    {/* Return DO missing hint */}
                    {autoFill.direction === 'returning' && autoFill.returnDoMissing && autoFill.fetched && (
                      <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">⚠️ No Return DO</div>
                    )}
                  </div>
                );
              }) : (
                <div className="text-center py-6 text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                  No entries. Tap "Add Entry" to begin.
                </div>
              )}
            </div>

            {/* Desktop Table View (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Truck No.
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      DO No.
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Direction
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
                    {hasAnyIssue && (
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                        Status
                      </th>
                    )}
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-200 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {formData.entries && formData.entries.length > 0 ? (
                    formData.entries.filter(entry => entry != null).map((entry, index) => {
                      const autoFill = entryAutoFillData[index] || { direction: 'going', loading: false, fetched: false };
                      const duplicateInfo = duplicateWarnings.get(entry?.truckNo || '');
                      const hasDuplicate = !!duplicateInfo && formData.station?.toUpperCase() !== 'CASH';
                      const isExactDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount;
                      const isDifferentAmount = hasDuplicate && duplicateInfo?.isDifferentAmount;
                      const hasNoRecordWarning = autoFill.warningType && !autoFill.loading && (entry?.truckNo?.length || 0) >= 5;
                      return (
                        <tr key={index} className={`${autoFill.fetched ? 'bg-green-50 dark:bg-green-900/20' : ''} ${hasNoRecordWarning ? 'bg-amber-50 dark:bg-amber-900/20' : ''} ${isExactDuplicate ? 'bg-red-50 dark:bg-red-900/20' : ''} ${isDifferentAmount ? 'bg-blue-50 dark:bg-blue-900/20' : ''} ${!autoFill.fetched && !hasNoRecordWarning && !isExactDuplicate && !isDifferentAmount ? 'dark:bg-gray-800' : ''}`}>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={entry?.truckNo || ''}
                                onChange={(e) => handleTruckNoChange(index, e.target.value)}
                                onPaste={(e) => handleTruckPaste(index, e)}
                                placeholder="T762 DWK"
                                title="Paste multiple trucks (one per line) to auto-fill multiple rows"
                                className={`w-28 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${isExactDuplicate ? 'border-red-500 dark:border-red-400' : ''} ${isDifferentAmount ? 'border-blue-500 dark:border-blue-400' : ''} ${hasNoRecordWarning ? 'border-amber-500 dark:border-amber-400' : ''} ${!hasDuplicate && !hasNoRecordWarning ? 'border-gray-300 dark:border-gray-600' : ''}`}
                              />
                              {autoFill.loading && (
                                <Loader2 className="w-4 h-4 text-primary-500 animate-spin flex-shrink-0" />
                              )}
                              {autoFill.fetched && !autoFill.loading && !hasDuplicate && (
                                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                              )}
                              {hasNoRecordWarning && !autoFill.loading && (
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                              )}
                              {isExactDuplicate && (
                                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                              )}
                              {isDifferentAmount && (
                                <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                              )}
                            </div>
                          </td>
                          
                          {/* DO Number Input Cell - for DO-first search */}
                          <td className="px-3 py-3">
                            <div className="relative">
                              <input
                                type="text"
                                value={entry?.doNo || ''}
                                onChange={(e) => handleDONoChange(index, e.target.value)}
                                onBlur={(e) => {
                                  // Set to NIL only on blur if field is still empty
                                  if (!e.target.value.trim()) {
                                    handleEntryChange(index, 'doNo', 'NIL');
                                  }
                                }}
                                placeholder="0001/26"
                                title="Enter DO number to auto-fill truck and details"
                                className="w-24 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
                              />
                              {autoFill.loading && (
                                <Loader2 className="absolute right-1 top-1.5 w-4 h-4 text-primary-500 animate-spin" />
                              )}
                            </div>
                          </td>
                          
                          <td className="px-3 py-3">
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
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry?.liters || 0}
                              onChange={(e) => handleEntryChange(index, 'liters', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry?.rate || 0}
                              onChange={(e) => handleEntryChange(index, 'rate', parseFloat(e.target.value) || 0)}
                              step="0.01"
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={(entry?.amount || 0).toFixed(2)}
                              readOnly
                              className="w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={entry?.dest || 'NIL'}
                              onChange={(e) => handleEntryChange(index, 'dest', e.target.value)}
                              placeholder="NIL"
                              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                            />
                          </td>
                          {/* Status column — warnings, journey info, navigation */}
                          {hasAnyIssue && (
                            <td className="px-3 py-3 max-w-[180px]">
                              <div className="flex flex-col gap-1 text-xs">
                                {/* No fuel record / in-form duplicate warning */}
                                {hasNoRecordWarning && (
                                  <div className="text-amber-600 dark:text-amber-400" title={autoFill.warningMessage}>
                                    {autoFill.warningMessage?.includes('DUPLICATE') ? (
                                      <span className="text-red-600 dark:text-red-400 font-semibold">⚠️ Already entered</span>
                                    ) : (
                                      <>
                                        {autoFill.warningType === 'not_found' && '⚠️ No record found'}
                                        {autoFill.warningType === 'journey_completed' && '⚠️ Journey complete (0L)'}
                                        {autoFill.warningType === 'no_active_record' && '⚠️ No active journey'}
                                      </>
                                    )}
                                    <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                                      {autoFill.warningMessage?.includes('DUPLICATE') ? 'Remove duplicate or use different truck' : 'Manual entry allowed'}
                                    </span>
                                  </div>
                                )}
                                {/* Duplicate allocation warning */}
                                {isExactDuplicate && duplicateInfo && (
                                  <div className="text-red-600 dark:text-red-400" title={`Blocked: Same amount in LPO ${duplicateInfo.lpoNo}`}>
                                    ⛔ Same amount in LPO #{duplicateInfo.lpoNo} ({duplicateInfo.liters}L)
                                  </div>
                                )}
                                {isDifferentAmount && duplicateInfo && (
                                  <div className="text-blue-600 dark:text-blue-400" title={`Top-up allowed: Different amount from LPO ${duplicateInfo.lpoNo}`}>
                                    ➕ Top-up: +{duplicateInfo.newLiters}L (existing: {duplicateInfo.liters}L)
                                  </div>
                                )}
                                {/* Journey selection indicator */}
                                {autoFill.fetched && autoFill.allJourneys && (
                                  <div className="text-[10px] text-gray-600 dark:text-gray-400">
                                    {autoFill.selectedJourneyType === 'active' && autoFill.allJourneys.active && (
                                      <span className={`font-medium ${(autoFill.fuelRecord as any)?.isLocked ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                                        {(autoFill.fuelRecord as any)?.isLocked ? '🔒 Locked (Manual entry)' : '🚛 Active Journey'}
                                      </span>
                                    )}
                                    {autoFill.selectedJourneyType === 'queued' && autoFill.allJourneys.queued[autoFill.selectedJourneyIndex || 0] && (
                                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                                        ⏳ Queued #{autoFill.allJourneys.queued[autoFill.selectedJourneyIndex || 0]?.queueOrder || (autoFill.selectedJourneyIndex || 0) + 1}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* No Return DO warning */}
                                {autoFill.direction === 'returning' && autoFill.returnDoMissing && autoFill.fetched && (
                                  <span className="text-amber-600 dark:text-amber-400" title="Return DO not yet inputted in fuel record">
                                    ⚠️ No Return DO
                                  </span>
                                )}
                                {/* Journey navigation: active + queued */}
                                {autoFill.allJourneys && (autoFill.allJourneys.active && autoFill.allJourneys.queued.length > 0) && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleJourneyNavigation(index, 'active')}
                                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                        autoFill.selectedJourneyType === 'active'
                                          ? 'bg-green-500 text-white'
                                          : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                                      }`}
                                      title="Switch to active journey"
                                    >
                                      🚛 Active
                                    </button>
                                    {autoFill.allJourneys.queued.map((queuedJourney, qIdx) => (
                                      <button
                                        key={qIdx}
                                        type="button"
                                        onClick={() => handleJourneyNavigation(index, 'queued', qIdx)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                          autoFill.selectedJourneyType === 'queued' && autoFill.selectedJourneyIndex === qIdx
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                                        }`}
                                        title={`Switch to queued journey #${queuedJourney.queueOrder || qIdx + 1}: ${queuedJourney.goingDo}`}
                                      >
                                        ⏳ Q{queuedJourney.queueOrder || qIdx + 1}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {/* Show only queued journeys if no active */}
                                {autoFill.allJourneys && !autoFill.allJourneys.active && autoFill.allJourneys.queued.length > 1 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {autoFill.allJourneys.queued.map((queuedJourney, qIdx) => (
                                      <button
                                        key={qIdx}
                                        type="button"
                                        onClick={() => handleJourneyNavigation(index, 'queued', qIdx)}
                                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                          autoFill.selectedJourneyType === 'queued' && autoFill.selectedJourneyIndex === qIdx
                                            ? 'bg-blue-500 text-white'
                                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                                        }`}
                                        title={`Switch to queued journey #${queuedJourney.queueOrder || qIdx + 1}: ${queuedJourney.goingDo}`}
                                      >
                                        ⏳ Q{queuedJourney.queueOrder || qIdx + 1}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {/* Formula status */}
                                {autoFill.formulaStatus === 'missing_data' && (
                                  <div className="text-amber-600 dark:text-amber-400" title={autoFill.formulaMessage}>
                                    ⚠️ {autoFill.formulaMessage}
                                  </div>
                                )}
                                {autoFill.formulaStatus === 'error' && (
                                  <div className="text-red-600 dark:text-red-400" title={autoFill.formulaMessage}>
                                    ❌ {autoFill.formulaMessage}
                                  </div>
                                )}
                                {autoFill.formulaStatus === 'applied' && (
                                  <div className="text-green-600 dark:text-green-400" title={autoFill.formulaMessage}>
                                    ✓ {autoFill.formulaMessage}
                                  </div>
                                )}
                                {/* Balance info hint (Infinity return) */}
                                {autoFill.balanceInfo && autoFill.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY' && (
                                  <div className={`${
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
                              </div>
                            </td>
                          )}
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
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={hasAnyIssue ? 9 : 8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
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
                {(() => {
                  const stationUpper = (formData.station || '').toUpperCase();
                  const stationDefaults = STATION_DEFAULTS[stationUpper];
                  const currency = stationDefaults?.currency || (stationUpper.startsWith('LAKE') && !stationUpper.includes('TUNDUMA') ? 'USD' : 'TZS');
                  const total = formData.total || 0;
                  return currency === 'USD'
                    ? `$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `TZS ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                })()}
              </span>
            </div>
            {formData.entries && formData.entries.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Liters: {formData.entries.filter(e => e != null).reduce((sum, e) => sum + e.liters, 0)}L
              </p>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-shrink-0 px-2 py-1.5 sm:px-4 sm:py-2 border border-gray-300 dark:border-gray-600 rounded-md text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            
            {/* Forward LPO Button - Show for EXISTING saved LPOs */}
            {initialData && initialData.id && formData.entries && formData.entries.filter(e => !e.isCancelled).length > 0 && (
              <button
                type="button"
                onClick={handleOpenForwardModal}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 sm:px-4 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
                title="Forward this LPO to another station"
              >
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="whitespace-nowrap">Forward LPO</span>
              </button>
            )}
            
            {/* Create & Forward Button - Show for NEW LPOs with entries */}
            {!initialData && formData.entries && formData.entries.length > 0 && formData.station && formData.lpoNo && !isForwardingMode && (
              <button
                type="button"
                onClick={handleCreateAndForward}
                disabled={isCreatingAndForwarding}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 sm:px-4 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Create this LPO and forward trucks to another station"
              >
                {isCreatingAndForwarding ? (
                  <>
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin flex-shrink-0" />
                    <span className="whitespace-nowrap">Creating...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">Create & Forward</span>
                  </>
                )}
              </button>
            )}
            
            <button
              type="submit"
              disabled={
                !formData.entries || formData.entries.length === 0 ||
                (formData.entries || []).some((_, idx) => {
                  const af = entryAutoFillData[idx];
                  return af && af.direction === 'returning' && af.returnDoMissing && af.fetched;
                })
              }
              className="flex-shrink-0 px-2 py-1.5 sm:px-4 sm:py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed whitespace-nowrap"
              title={
                (formData.entries || []).some((_, idx) => {
                  const af = entryAutoFillData[idx];
                  return af && af.direction === 'returning' && af.returnDoMissing && af.fetched;
                }) ? 'Cannot submit: Some trucks have no Return DO. Switch them to Going or wait for Return DO entry.' : undefined
              }
            >
              {initialData ? 'Update' : 'Create'} LPO Document
            </button>
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

      {/* Forward LPO Modal for EXISTING LPOs */}
      {lpoToForward && (
        <ForwardLPOModal
          isOpen={isForwardModalOpen}
          onClose={() => {
            setIsForwardModalOpen(false);
            setLpoToForward(null);
          }}
          sourceLpo={lpoToForward}
          onForwardComplete={handleForwardComplete}
        />
      )}
    </div>
  );
};

export default LPODetailForm;
