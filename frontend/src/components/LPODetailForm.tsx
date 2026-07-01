import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { X, Plus, Trash2, Loader2, CheckCircle, ArrowLeft, ArrowRight, AlertTriangle, Ban, MapPin, Eye, Fuel, ChevronDown, Check, Save, Lock, FileCheck2, GitFork, Banknote, PlusCircle, ClipboardPaste, CheckCheck, ArrowLeftRight } from 'lucide-react';
import type { LPOSummary, LPODetail, FuelRecord, CancellationPoint, FuelStationConfig } from '../types';
import { lpoDocumentsAPI, fuelRecordsAPI, resourceLockAPI } from '../services/api';
import { useJourneyConfig } from '../hooks/useJourneyConfig';
import { formatTruckNumber } from '../utils/dataCleanup';
import { useActiveFuelStations, fuelStationKeys } from '../hooks/useFuelStations';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import {
  getAvailableCancellationPoints,
  getCancellationPointDisplayName,
  CANCELLATION_POINT_TO_FUEL_FIELD,
  FUEL_RECORD_COLUMNS
} from '../services/cancellationService';
import FuelRecordInspectModal, { calculateMbeyaReturnBalance } from './FuelRecordInspectModal';
import { useGridNav } from '../hooks/useGridNav';
import ForwardLPOModal from './ForwardLPOModal';
import ConfirmModal from './SuperAdmin/ConfirmModal';
import { toast } from 'react-toastify';

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
  warningType?: 'not_found' | 'journey_completed' | 'no_active_record' | 'ambiguous_do' | null;
  // Set when the same DO is on more than one truck/journey (dirty imported data).
  // The caller must let the user pick rather than silently committing the primary.
  ambiguous?: boolean;
  matches?: (TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' })[];
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
  // Entry type: regular (NORM), DA (driver account), REF (refer/partner truck),
  // or NIL (truck with no DO / not in fuel records — manual entry, no fetch)
  entryType?: 'regular' | 'da' | 'ref' | 'nil';
  referenceDoNo?: string;  // For DA: the real journey DO number
  // Warning states for trucks without valid fuel records
  warningType?: 'not_found' | 'journey_completed' | 'no_active_record' | 'ambiguous_do' | null;
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
  onSubmit: (data: Partial<LPOSummary>) => Promise<void> | void;
  initialData?: LPOSummary;
}

// Local storage key for persisting form draft
const LPO_FORM_STORAGE_KEY = 'lpo_form_draft';

// Per-row DO entry modes (selected explicitly via the mode chip)
type EntryMode = 'regular' | 'da' | 'ref' | 'nil';
const ENTRY_MODE_OPTIONS: { value: EntryMode; label: string; title: string }[] = [
  { value: 'regular', label: 'NORM', title: 'Normal — enter a DO number for a truck in the fuel records' },
  { value: 'da',      label: 'DA',   title: 'Driver Account — fuel charged to the driver (saved as NIL DO)' },
  { value: 'ref',     label: 'REF',  title: 'Reefer / partner truck' },
  { value: 'nil',     label: 'NIL',  title: 'No DO — truck not in the fuel records (manual entry)' },
];
// Border colour per mode (shared by both render copies)
const modeBorderClass = (mode?: EntryMode): string =>
  mode === 'da' ? 'border-blue-400 dark:border-blue-500'
  : mode === 'ref' ? 'border-orange-400 dark:border-orange-500'
  : mode === 'nil' ? 'border-purple-400 dark:border-purple-500'
  : 'border-gray-300 dark:border-gray-600';

// Interface for stored form data
interface StoredFormData {
  formData: Partial<LPOSummary>;
  entryAutoFillData: Record<number, EntryAutoFillData>;
  goingEnabled: boolean;
  returningEnabled: boolean;
  goingCheckpoint: CancellationPoint | '';
  returningCheckpoint: CancellationPoint | '';
  cashCurrency: 'TZS' | 'USD';
  cashRate: number;
  cashDefaultLiters: number;
  customStationName: string;
  customCurrency: 'USD' | 'TZS';
  customRate: number;
  customDefaultLiters: number;
  customGoingEnabled: boolean;
  customReturnEnabled: boolean;
  customGoingCheckpoint: string;
  customReturnCheckpoint: string;
  customCountry: string;
  noStationRate: number;
  noStationDefaultLiters: number;
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

// Scoped stylesheet for the redesigned desktop form. Everything is namespaced
// under `.lpo-rd` so it never leaks into the rest of the app, and theme-sensitive
// surfaces have explicit `.dark` overrides (inline styles alone can't react to the
// `dark` class on <html>). Inline `<style>` is permitted by the app CSP
// (style-src 'self' 'unsafe-inline'); the fonts are self-hosted (see index.css).
const LPO_RD_STYLES = `
.lpo-rd{font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;}
.lpo-rd .mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:-.2px;}
.lpo-rd input[type=number]::-webkit-inner-spin-button,.lpo-rd input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
.lpo-rd input[type=number]{-moz-appearance:textfield;}
.lpo-rd .lpo-scroll::-webkit-scrollbar{width:11px;height:11px;}
.lpo-rd .lpo-scroll::-webkit-scrollbar-thumb{background:#cdd5e0;border-radius:9px;border:3px solid #fff;}
.lpo-rd .lpo-scroll::-webkit-scrollbar-track{background:transparent;}
.dark .lpo-rd .lpo-scroll::-webkit-scrollbar-thumb{background:#334155;border-color:#0b1220;}
@keyframes lpospin{to{transform:rotate(360deg);}}
.lpo-rd .lpo-spin{animation:lpospin 1s linear infinite;}
/* Uppercase field label */
.lpo-rd .lbl{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;}
.dark .lpo-rd .lbl{color:#8a97a8;}
/* Header field */
.lpo-rd .fld{width:100%;box-sizing:border-box;height:40px;padding:0 13px;border:1px solid #e3e8ef;border-radius:10px;background:#fff;color:#0f1729;font-size:13.5px;font-weight:600;outline:none;transition:border-color .12s,box-shadow .12s;}
.lpo-rd .fld:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12);}
.lpo-rd .fld::placeholder{color:#a3aebd;font-weight:500;}
.dark .lpo-rd .fld{background:#0f172a;border-color:#334155;color:#e2e8f0;}
.lpo-rd .fld-ro{background:#f3f5f9;color:#475569;}
.dark .lpo-rd .fld-ro{background:#0b1220;border-color:#1e293b;color:#94a3b8;}
/* Table cell input */
.lpo-rd .cell-input{width:100%;box-sizing:border-box;height:34px;padding:0 10px;border:1px solid #e6eaf1;border-radius:8px;background:#fff;color:#0f1729;font-size:13px;font-weight:500;outline:none;transition:border-color .12s,box-shadow .12s;}
.lpo-rd .cell-input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12);}
.lpo-rd .cell-input::placeholder{color:#a3aebd;}
.dark .lpo-rd .cell-input{background:#0f172a;border-color:#334155;color:#e2e8f0;}
/* Small inline input (bulk bar / amend) */
.lpo-rd .mini-input{height:30px;border:1px solid #c9cdf6;border-radius:7px;padding:0 8px;font-size:12px;font-weight:600;color:#0f1729;outline:none;background:#fff;}
.dark .lpo-rd .mini-input{background:#0f172a;border-color:#4338ca;color:#e2e8f0;}
/* Section card surfaces */
.lpo-rd .panel{border:1px solid #eef1f6;border-radius:14px;background:#fbfcfe;}
.dark .lpo-rd .panel{border-color:#1e293b;background:#0f172a;}
/* Dropdown menu */
.lpo-rd .menu{background:#fff;border:1px solid #e6eaf1;border-radius:12px;box-shadow:0 18px 40px -12px rgba(15,23,42,.3);}
.dark .lpo-rd .menu{background:#0f172a;border-color:#334155;box-shadow:0 18px 40px -12px rgba(0,0,0,.6);}
.lpo-rd .menu-item:hover{background:#f1f4f9;}
.dark .lpo-rd .menu-item:hover{background:#1e293b;}
/* Entries table */
.lpo-rd .lpo-table{width:100%;border-collapse:collapse;min-width:1120px;}
.lpo-rd .lpo-table thead tr{background:#f7f9fc;}
.dark .lpo-rd .lpo-table thead tr{background:#0f172a;}
.lpo-rd .lpo-th{padding:11px 12px;text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8;white-space:nowrap;}
.lpo-rd .lpo-row{border-top:1px solid #eef1f6;}
.dark .lpo-rd .lpo-row{border-top-color:#1e293b;}
.lpo-rd .lpo-row td{padding:9px 12px;vertical-align:middle;}
.lpo-rd .row-green{background:#f6fdf9;} .dark .lpo-rd .row-green{background:rgba(34,197,94,.09);}
.lpo-rd .row-blue{background:#f5f8ff;} .dark .lpo-rd .row-blue{background:rgba(59,130,246,.11);}
.lpo-rd .row-orange{background:#fff8f1;} .dark .lpo-rd .row-orange{background:rgba(249,115,22,.11);}
.lpo-rd .row-amber{background:#fffaf0;} .dark .lpo-rd .row-amber{background:rgba(245,158,11,.12);}
.lpo-rd .row-red{background:#fef2f2;} .dark .lpo-rd .row-red{background:rgba(239,68,68,.11);}
.lpo-rd .amount-cell{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:600;color:#0f1729;}
.dark .lpo-rd .amount-cell{color:#e2e8f0;}
.lpo-rd .mode-chip{font-size:10px;font-weight:700;border:1px solid #dde3ec;border-radius:6px;padding:4px 4px;background:#fff;color:#64748b;outline:none;cursor:pointer;}
.dark .lpo-rd .mode-chip{background:#0f172a;border-color:#334155;color:#cbd5e1;}
.lpo-rd .icon-btn{width:28px;height:28px;border:1px solid #e6eaf1;border-radius:7px;background:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;}
.dark .lpo-rd .icon-btn{background:#0f172a;border-color:#334155;}
.lpo-rd .icon-btn-danger{border-color:#f3dada;} .dark .lpo-rd .icon-btn-danger{border-color:#7f1d1d;}
.lpo-rd .addrow-btn{width:100%;padding:13px;border:none;background:#fbfcff;color:#4f46e5;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:7px;}
.dark .lpo-rd .addrow-btn{background:#0f172a;color:#818cf8;}
`;

// Map a single fuel record + detected direction into the shared TruckFetchResult
// shape. Used both for the primary DO match and for each candidate in the
// ambiguity picker, so a picked candidate auto-fills exactly like a clean lookup.
const buildDoResult = (
  fuelRecord: FuelRecord,
  direction: 'going' | 'returning'
): TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' } => {
  const goingDestination = fuelRecord.originalGoingTo || fuelRecord.to || 'NIL';
  const doShown = direction === 'returning' ? fuelRecord.returnDo : fuelRecord.goingDo;
  return {
    fuelRecord,
    truckNo: fuelRecord.truckNo,
    direction,
    goingDo: fuelRecord.goingDo || 'NIL',
    returnDo: fuelRecord.returnDo || 'NIL',
    destination: fuelRecord.to || 'NIL',
    goingDestination,
    balance: fuelRecord.balance || 0,
    message: `Found: DO ${doShown || 'NIL'}, Balance: ${fuelRecord.balance ?? 0}L`,
    success: true,
  };
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
  // truckNo::lpoId -> { lpoId, newLiters }
  const [selectedLPOsToAmend, setSelectedLPOsToAmend] = useState<Map<string, { lpoId: string; newLiters: number }>>(new Map());
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
    isNilDo: boolean; // true when matched via truck+station only (NIL DO) — warn only, never block
  }>>(new Map());
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Grid keyboard navigation — col layout (desktop table only, mobile left as default):
  // 0=Truck  1=Mode  2=DO#  3=Direction  4=Liters  5=Rate  6=Dest
  const _lpoAddRowRef = useRef<() => void>(null!);
  const lpoNav = useGridNav(7, 6, () => _lpoAddRowRef.current());
  useEffect(() => { lpoNav.flushPendingFocus(); }, [(formData.entries || []).length]);

  // Inspect modal state - for viewing fuel record details without leaving the form
  const [inspectModal, setInspectModal] = useState<InspectModalState>({
    isOpen: false,
    truckNo: '',
    fuelRecord: null,
    fuelRecordId: undefined,
    direction: 'going',
    entryIndex: -1,
  });

  // Direction not supported warning modal
  const [directionWarningModal, setDirectionWarningModal] = useState<{
    open: boolean;
    stationName: string;
    blockedDirection: 'going' | 'returning';
  }>({ open: false, stationName: '', blockedDirection: 'going' });

  // Ambiguous-DO picker modal. Opens when a typed DO matches more than one truck
  // (dirty imported data). The user must pick the correct journey; we never
  // silently auto-fill in that case.
  const [doAmbiguityModal, setDoAmbiguityModal] = useState<{
    open: boolean;
    index: number;
    doNo: string;
    matches: (TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' })[];
  }>({ open: false, index: -1, doNo: '', matches: [] });

  // Multi-select state for bulk editing
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(new Set());
  const [bulkLiters, setBulkLiters] = useState('');
  const [bulkRate, setBulkRate] = useState('');

  // Forwarding mode state - tracks inline forwarding workflow
  const [isForwardingMode, setIsForwardingMode] = useState(false);
  const [forwardedFromInfo, setForwardedFromInfo] = useState<{
    lpoNo: string;
    station: string;
  } | null>(null);
  const [isCreatingAndForwarding, setIsCreatingAndForwarding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: journeyConfig } = useJourneyConfig();
  const autoDownloadLPOPdf = journeyConfig?.autoDownloadLPOPdf ?? true;

  const lpoCreateDeductOff = journeyConfig?.fuelAutomation?.lpoCreateDeduct === false;

  // Creation lock: only one user may use the new-LPO form at a time. Acquire a
  // global 'lpo_create' resource lock while the form is open (creating only),
  // and release it on close/unmount. The 5-minute TTL backs out abandoned locks.
  useEffect(() => {
    if (!isOpen || initialData) return;
    let cancelled = false;
    resourceLockAPI.acquire('lpo_create').catch((err: any) => {
      if (err?.response?.status === 423) {
        const holder = err.response?.data?.data?.editLock?.lockedByName || 'another user';
        toast.error(`The LPO form is currently being used by ${holder}. Please try again shortly.`);
        if (!cancelled) onClose();
      }
      // Other errors: fail open — don't block creation on a lock-service hiccup.
    });
    return () => {
      cancelled = true;
      resourceLockAPI.release('lpo_create').catch(() => { /* idempotent / not holder */ });
    };
    // onClose intentionally omitted — captured by closure; effect keys on open state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData]);

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
  const [cashCurrency, setCashCurrency] = useState<'TZS' | 'USD'>(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.cashCurrency ?? 'TZS';
    }
    return 'TZS';
  });
  const [cashRate, setCashRate] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.cashRate ?? 0;
    }
    return 0;
  });
  const [cashDefaultLiters, setCashDefaultLiters] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.cashDefaultLiters ?? 0;
    }
    return 0;
  });
  const [customCurrency, setCustomCurrency] = useState<'USD' | 'TZS'>(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customCurrency ?? 'USD';
    }
    return 'USD';
  });
  const [customRate, setCustomRate] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customRate ?? 0;
    }
    return 0;
  });
  const [customDefaultLiters, setCustomDefaultLiters] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customDefaultLiters ?? 0;
    }
    return 0;
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
  const [customCountry, setCustomCountry] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.customCountry ?? 'Zambia';
    }
    return 'Zambia';
  });
  const [noStationRate, setNoStationRate] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.noStationRate ?? 0;
    }
    return 0;
  });
  const [noStationDefaultLiters, setNoStationDefaultLiters] = useState(() => {
    if (!initialData) {
      const stored = loadFormFromStorage();
      return stored?.noStationDefaultLiters ?? 0;
    }
    return 0;
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

  // Tracks pending paste-triggered timeouts so they can be cancelled on unmount
  const pasteTimeoutsRef = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  // Map of entry index → debounce timer ID (300ms safety timer for truck fetch)
  const fetchDebounceTimers = React.useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // "Always-current" refs for config values used inside async timeout callbacks.
  // Assigning these in the render body (not in useEffect) keeps them in sync before
  // any pending setTimeout fires — avoids the stale-closure bug where the user changes
  // defaults after typing a truck number but within the 300ms debounce window.
  const cashDefaultLitersRef = React.useRef(cashDefaultLiters);
  const cashRateRef = React.useRef(cashRate);
  const customDefaultLitersRef = React.useRef(customDefaultLiters);
  const customRateRef = React.useRef(customRate);
  const noStationDefaultLitersRef = React.useRef(noStationDefaultLiters);
  const noStationRateRef = React.useRef(noStationRate);
  cashDefaultLitersRef.current = cashDefaultLiters;
  cashRateRef.current = cashRate;
  customDefaultLitersRef.current = customDefaultLiters;
  customRateRef.current = customRate;
  noStationDefaultLitersRef.current = noStationDefaultLiters;
  noStationRateRef.current = noStationRate;

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

  // Clean up all pending fetch timers and paste timeouts on unmount
  React.useEffect(() => {
    return () => {
      Object.values(fetchDebounceTimers.current).forEach(clearTimeout);
      pasteTimeoutsRef.current.forEach(clearTimeout);
      pasteTimeoutsRef.current = [];
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
    setSelectedLPOsToAmend(new Map());
    setTrucksWithoutLPOs(new Set());
    setDuplicateWarnings(new Map());
    setLockedEntryRates(new Map());
    setCashCurrency('TZS');
    setCashRate(0);
    setCashDefaultLiters(0);
    setCustomStationName('');
    setCustomCurrency('USD');
    setCustomRate(0);
    setCustomDefaultLiters(0);
    setCustomGoingEnabled(false);
    setCustomReturnEnabled(false);
    setCustomGoingCheckpoint('');
    setCustomReturnCheckpoint('');
    setNoStationRate(0);
    setNoStationDefaultLiters(0);
    setHasDraft(false);
    // Clear local storage if requested
    if (clearStorage) {
      clearFormStorage();
    }
  };

  // Apply a saved draft (from localStorage) to every piece of form state.
  // CRITICAL: the modal stays mounted (parent renders it unconditionally and we
  // only `return null` while closed), so the useState initializers that read the
  // draft run ONCE on first mount — not on reopen. We must therefore push the
  // stored values back into state explicitly here, otherwise reopening shows an
  // empty form even though a draft exists in localStorage.
  const applyStoredDraft = (stored: StoredFormData) => {
    setFormData(stored.formData);
    setEntryAutoFillData(stored.entryAutoFillData || {});
    setGoingEnabled(stored.goingEnabled ?? false);
    setReturningEnabled(stored.returningEnabled ?? false);
    setGoingCheckpoint(stored.goingCheckpoint ?? '');
    setReturningCheckpoint(stored.returningCheckpoint ?? '');
    setCashCurrency(stored.cashCurrency ?? 'TZS');
    setCashRate(stored.cashRate ?? 0);
    setCashDefaultLiters(stored.cashDefaultLiters ?? 0);
    setCustomStationName(stored.customStationName ?? '');
    setCustomCurrency(stored.customCurrency ?? 'USD');
    setCustomRate(stored.customRate ?? 0);
    setCustomDefaultLiters(stored.customDefaultLiters ?? 0);
    setCustomGoingEnabled(stored.customGoingEnabled ?? false);
    setCustomReturnEnabled(stored.customReturnEnabled ?? false);
    setCustomGoingCheckpoint(stored.customGoingCheckpoint ?? '');
    setCustomReturnCheckpoint(stored.customReturnCheckpoint ?? '');
    setCustomCountry(stored.customCountry ?? 'Zambia');
    setNoStationRate(stored.noStationRate ?? 0);
    setNoStationDefaultLiters(stored.noStationDefaultLiters ?? 0);
    setHasDraft(true);
  };

  // Load stations from database using React Query
  const queryClient = useQueryClient();
  const { data: fuelStations, isLoading: loadingStations } = useActiveFuelStations();
  // Memoize so the reference stays stable across renders (especially while the query
  // is loading and `fuelStations` is undefined). A fresh `[]` each render would make
  // every effect that depends on `availableStations` re-run, triggering an infinite
  // update loop in the effects below.
  const availableStations: FuelStationConfig[] = useMemo(() => fuelStations || [], [fuelStations]);

  // Real-time sync: invalidate React Query cache when stations change
  const invalidateStations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: fuelStationKeys.all });
    queryClient.invalidateQueries({ queryKey: fuelStationKeys.active });
  }, [queryClient]);
  useRealtimeSync('fuel_stations', invalidateStations);

  // Real-time sync for LPO entries and fuel records
  useRealtimeSync(['lpo_summaries', 'fuel_records'], invalidateStations);

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

    const updatedEntries = formData.entries.map((entry, _idx) => {
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

  // When customRate changes for CUSTOM station, push the new rate to all existing rows
  useEffect(() => {
    if (formData.station !== 'CUSTOM') return;
    if (!formData.entries || formData.entries.length === 0) return;
    if (!customRate) return;

    const needsUpdate = formData.entries.some(entry => entry.rate !== customRate);
    if (!needsUpdate) return;

    const updatedEntries = formData.entries.map(entry => {
      const liters = entry.liters || 0;
      return { ...entry, rate: customRate, amount: liters * customRate };
    });
    const total = updatedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRate]);

  // When noStationRate changes and no station is selected, push the new rate to all existing rows
  useEffect(() => {
    if (formData.station) return;
    if (!formData.entries || formData.entries.length === 0) return;
    if (!noStationRate) return;

    const needsUpdate = formData.entries.some(entry => entry.rate !== noStationRate);
    if (!needsUpdate) return;

    const updatedEntries = formData.entries.map(entry => {
      const liters = entry.liters || 0;
      return { ...entry, rate: noStationRate, amount: liters * noStationRate };
    });
    const total = updatedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noStationRate]);

  // When cashRate changes for CASH station, push the new rate to all existing rows
  useEffect(() => {
    if (formData.station !== 'CASH') return;
    if (!formData.entries || formData.entries.length === 0) return;
    if (!cashRate) return;

    const needsUpdate = formData.entries.some(entry => entry.rate !== cashRate);
    if (!needsUpdate) return;

    const updatedEntries = formData.entries.map(entry => {
      const liters = entry.liters || 0;
      return { ...entry, rate: cashRate, amount: liters * cashRate };
    });
    const total = updatedEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
    setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashRate]);

  // Check for existing draft on mount and when modal opens
  useEffect(() => {
    if (isOpen && !initialData) {
      const stored = loadFormFromStorage();
      if (stored && stored.formData.entries && stored.formData.entries.length > 0) {
        // Found a draft with entries - restore it into state. We can't rely on the
        // useState initializers here: the form stays mounted across open/close, so
        // they only ran once on first mount. Push the draft back in explicitly.
        applyStoredDraft(stored);
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
        cashCurrency,
        cashRate,
        cashDefaultLiters,
        customStationName,
        customCurrency,
        customRate,
        customDefaultLiters,
        customGoingEnabled,
        customReturnEnabled,
        customGoingCheckpoint,
        customReturnCheckpoint,
        customCountry,
        noStationRate,
        noStationDefaultLiters,
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
    cashCurrency,
    cashRate,
    cashDefaultLiters,
    customStationName,
    customCurrency,
    customRate,
    customDefaultLiters,
    customGoingEnabled,
    customReturnEnabled,
    customGoingCheckpoint,
    customReturnCheckpoint,
    customCountry,
    noStationRate,
    noStationDefaultLiters,
    initialData
  ]);

  // Closing the form (overlay click, X, or Cancel) intentionally KEEPS the draft
  // so the user can step away to check something elsewhere and come back to their
  // data. The draft is cleared only via "Discard Draft" or a successful submit.
  // (The open-effect resets to a clean form when there is no saved draft.)
  const handleCancel = () => {
    onClose();
  };

  // Handle discard draft
  const handleDiscardDraft = () => {
    resetForm();
    fetchNextLpoNumber();
  };

  // Fetch existing LPOs for trucks when CASH is selected and checkpoint(s) are chosen.
  // Debounced 600 ms + cancellation guard so bulk-paste (50 trucks × 250 ms stagger)
  // only fires one full scan after all doNos have settled instead of ~50 overlapping runs.
  useEffect(() => {
    const hasGoingCheckpoint = goingEnabled && goingCheckpoint;
    const hasReturningCheckpoint = returningEnabled && returningCheckpoint;

    if (!(formData.station === 'CASH' && (hasGoingCheckpoint || hasReturningCheckpoint) && formData.entries && formData.entries.length > 0)) {
      setExistingLPOsForTrucks(prev => (prev.size === 0 ? prev : new Map()));
      setTrucksWithoutLPOs(prev => (prev.size === 0 ? prev : new Set()));
      setSelectedLPOsToCancel(prev => (prev.size === 0 ? prev : new Map()));
      setSelectedLPOsToAmend(prev => (prev.size === 0 ? prev : new Map()));
      return;
    }

    let cancelled = false;

    const fetchExistingLPOs = async () => {
      setIsFetchingLPOs(true);
      const newMap = new Map<string, { lpos: LPOSummary[], direction: string, doNo: string }[]>();
      const trucksWithoutLPOsSet = new Set<string>();
      const newSelectedLPOs = new Map<string, Set<string>>();

      // Determine whether an LPO's station fills the same fuel record column as the
      // selected checkpoint. This uses the station's declared fuelRecordFieldGoing /
      // fuelRecordFieldReturning from the DB — no hardcoded name lists anywhere.
      // For stations not found in the DB (custom / ad-hoc names), the LPO is included
      // so the user can still see and manually decide to cancel it.
      const doesLpoMatchCheckpoint = (lpoStation: string, cp: CancellationPoint): boolean => {
        const checkpointFuelField = CANCELLATION_POINT_TO_FUEL_FIELD[cp];
        if (!checkpointFuelField) return false;
        const isReturn = cp.includes('RETURN') || cp.includes('RETURNING');
        const stationConfig = availableStations.find(
          s => s.stationName.toUpperCase() === lpoStation.toUpperCase().trim()
        );
        if (stationConfig) {
          const stationField = isReturn
            ? stationConfig.fuelRecordFieldReturning
            : stationConfig.fuelRecordFieldGoing;
          return stationField === checkpointFuelField;
        }
        // Station not in DB (custom/unlisted) — include it so the user can decide
        return true;
      };

      const entries = formData.entries ?? [];
      try {
        for (const entry of entries) {
          if (cancelled) break;
          if (entry.truckNo && entry.truckNo.length >= 4 && entry.doNo && entry.doNo !== 'NIL') {
            const truckLPOs: { lpos: LPOSummary[], direction: string, doNo: string }[] = [];

            // Check going direction if enabled
            if (hasGoingCheckpoint) {
              const goingLpos = await lpoDocumentsAPI.findAtCheckpoint(
                entry.truckNo,
                entry.doNo,
                undefined,
                goingCheckpoint
              );
              if (cancelled) break;
              const filteredGoingLpos = goingLpos.filter(
                lpo => doesLpoMatchCheckpoint(lpo.station, goingCheckpoint)
              );
              if (filteredGoingLpos.length > 0) {
                truckLPOs.push({ lpos: filteredGoingLpos, direction: 'Going', doNo: entry.doNo });
                if (!newSelectedLPOs.has(entry.truckNo)) {
                  newSelectedLPOs.set(entry.truckNo, new Set());
                }
              }
            }

            // Check returning direction if enabled
            if (hasReturningCheckpoint) {
              const returningLpos = await lpoDocumentsAPI.findAtCheckpoint(
                entry.truckNo,
                entry.doNo,
                undefined,
                returningCheckpoint
              );
              if (cancelled) break;
              const filteredReturningLpos = returningLpos.filter(
                lpo => doesLpoMatchCheckpoint(lpo.station, returningCheckpoint)
              );

              if (filteredReturningLpos.length > 0) {
                truckLPOs.push({ lpos: filteredReturningLpos, direction: 'Returning', doNo: entry.doNo });
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
        if (!cancelled) console.error('Error fetching existing LPOs:', error);
      } finally {
        if (!cancelled) {
          setExistingLPOsForTrucks(newMap);
          setTrucksWithoutLPOs(trucksWithoutLPOsSet);
          // Preserve existing selections for trucks that are still in the results.
          // Only initialise an empty set for trucks we haven't seen before.
          setSelectedLPOsToCancel(prev => {
            const merged = new Map<string, Set<string>>();
            for (const truckNo of newMap.keys()) {
              merged.set(truckNo, prev.get(truckNo) ?? new Set());
            }
            return merged;
          });
          setIsFetchingLPOs(false);
        }
      }
    };

    const timer = setTimeout(fetchExistingLPOs, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.station, goingEnabled, returningEnabled, goingCheckpoint, returningCheckpoint, formData.entries?.map(e => `${e?.truckNo || ''}-${e?.doNo || ''}`).join(','), availableStations]);

  // Check for duplicate allocations when station or entries change (for non-CASH stations)
  useEffect(() => {
    const checkDuplicates = async () => {
      // Skip for CASH station - duplicates are handled differently there
      if (!formData.station || formData.station.toUpperCase() === 'CASH' || !formData.entries || formData.entries.length === 0) {
        setDuplicateWarnings(new Map());
        return;
      }

      setIsCheckingDuplicates(true);
      const warnings = new Map<string, { lpoNo: string; date: string; liters: number; isDifferentAmount: boolean; newLiters: number; isNilDo: boolean }>();

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
                newLiters: entry.liters,
                isNilDo: result.isNilDo || false,
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

      // Re-derive each row's mode so saved DA/REF/NIL/NORM entries reopen in the right mode
      const derived: Record<number, EntryAutoFillData> = {};
      (initialData.entries || []).forEach((entry, idx) => {
        const doNoUpper = (entry.doNo || '').trim().toUpperCase();
        const entryType: EntryAutoFillData['entryType'] =
          entry.isDriverAccount ? 'da'
          : entry.isRefer ? 'ref'
          : (doNoUpper === 'NIL' || doNoUpper === '' || doNoUpper === 'N/A') ? 'nil'
          : 'regular';
        derived[idx] = {
          direction: (entry as { journeyDirection?: 'going' | 'returning' }).journeyDirection || 'going',
          loading: false,
          fetched: false,
          fuelRecord: null,
          entryType,
          referenceDoNo: entry.isDriverAccount ? entry.referenceDoNo : undefined,
        };
      });
      setEntryAutoFillData(derived);
    }
  }, [initialData]);

  const fetchNextLpoNumber = async () => {
    setIsLoadingLpoNumber(true);
    try {
      const nextLpoNo = await lpoDocumentsAPI.getNextLpoNumber();
      setFormData(prev => ({ ...prev, lpoNo: nextLpoNo }));
    } catch (error) {
      console.error('Error fetching next LPO number:', error);
    } finally {
      setIsLoadingLpoNumber(false);
    }
  };

  // When an LPO is created elsewhere (e.g. pick-up-at consumes a number), refresh
  // the previewed next number while composing a NEW LPO so it never shows a stale
  // / duplicate value. Skipped when editing an existing LPO (initialData present).
  useRealtimeSync('lpo_summaries', (event) => {
    if (event?.action === 'create' && isOpen && !initialData) {
      fetchNextLpoNumber();
    }
  }, 'lpo-detail-next-number');

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

      // Helper to check if a date is within a specific month.
      // Uses nextMonthStart instead of monthEnd (last-day midnight) to avoid UTC vs local
      // timezone mismatch: ISO date strings ("2026-06-30") parse as UTC midnight, but
      // new Date(y, m+1, 0) creates local midnight, causing last-day records to be excluded.
      const isInMonth = (dateStr: string, monthStart: Date): boolean => {
        const date = new Date(dateStr);
        const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
        return date >= monthStart && date < nextMonthStart;
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
   * Fetch journey data by DO number — sourced from the fuel record table
   * (the SAME source as the truck-number lookup), not the delivery-orders
   * collection. A DO *should* be unique to one journey (as either the going or
   * the returning DO), but imported data can put the same DO on two trucks. The
   * backend returns EVERY match plus an `ambiguous` flag; we pass those through
   * so the caller can make the user pick instead of silently using the primary.
   * Returns the same TruckFetchResult structure for consistency.
   */
  const fetchByDONumber = useCallback(async (doNumber: string): Promise<TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' }> => {
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
      const result = await fuelRecordsAPI.getByDoNumber(doNumber.trim().toUpperCase());

      if (!result || !result.fuelRecord) {
        return {
          fuelRecord: null,
          goingDo: 'NIL',
          returnDo: 'NIL',
          destination: 'NIL',
          goingDestination: 'NIL',
          balance: 0,
          message: `⚠️ No fuel record found for DO ${doNumber}`,
          success: false,
          warningType: 'not_found' as const
        };
      }

      const base = buildDoResult(result.fuelRecord, result.direction);
      return {
        ...base,
        ambiguous: result.ambiguous,
        matches: result.matches.map(m => buildDoResult(m.fuelRecord, m.direction)),
      };
    } catch (error) {
      console.error('Error fetching fuel record by DO:', error);
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
    _destination?: string,
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
    
    // Station not found in DB — CASH and CUSTOM have no defaults; user enters values manually
    return { liters: 0, rate: 0 };
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

      // Regular station change - update rates for existing entries.
      // In forwarding mode the entries were zeroed out, so always apply defaults.liters.
      // On a normal form, preserve any liters the user has already typed.
      // Pass preserved fuelRecord data so formula-based stations (e.g. INFINITY) can
      // evaluate the correct liters using totalLts / extra / balance from the record.
      const updatedEntries = formData.entries?.map((entry, idx) => {
        const afill = entryAutoFillData[idx];
        const direction = afill?.direction || 'going';
        const fr = afill?.fuelRecord;
        const defaults = getStationDefaults(
          value,
          direction,
          entry.dest,
          fr?.totalLts   ?? undefined,
          fr?.extra      ?? undefined,
          fr?.balance    ?? undefined,
        );
        const resolvedLiters = isForwardingMode ? defaults.liters : (entry.liters || defaults.liters);
        return {
          ...entry,
          rate: defaults.rate,
          liters: resolvedLiters,
          amount: resolvedLiters * defaults.rate
        };
      }) || [];
      
      const total = updatedEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
    }
  };

  const handleAddEntry = () => {
    const isCustom = formData.station === 'CUSTOM';
    const isCash = formData.station === 'CASH';
    const entryRate = isCustom ? customRate : isCash ? cashRate : (formData.station ? getStationDefaults(formData.station, 'going').rate : noStationRate);
    const entryLiters = isCustom ? customDefaultLiters : isCash ? cashDefaultLiters : (formData.station ? 0 : noStationDefaultLiters);
    const newEntry: LPODetail = {
      doNo: '',  // Start empty so user can type immediately
      truckNo: '',
      liters: entryLiters,
      rate: entryRate,
      amount: entryLiters * entryRate,
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
  _lpoAddRowRef.current = handleAddEntry;

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
        const isPasteCustom = prev.station === 'CUSTOM';
        const isPasteCash = prev.station === 'CASH';
        const pasteRate = isPasteCustom ? customRate : isPasteCash ? cashRate : (prev.station ? getStationDefaults(prev.station, 'going').rate : noStationRate);
        const pasteLiters = isPasteCustom ? customDefaultLiters : isPasteCash ? cashDefaultLiters : (prev.station ? 0 : noStationDefaultLiters);
        const newEntry: LPODetail = {
          doNo: '',  // Start empty
          truckNo: truckNo,
          liters: pasteLiters,
          rate: pasteRate,
          amount: pasteLiters * pasteRate,
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
    
    // Capture the source row's mode before updating state so the setTimeout can use it.
    const sourceMode = entryAutoFillData[index]?.entryType;

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

      // Initialize auto-fill data for all pasted entries, inheriting the source row's mode
      const inheritedEntryType = prev[index]?.entryType;
      for (let i = 0; i < formattedTrucks.length; i++) {
        newAutoFillData[index + i] = {
          direction: 'going',
          loading: false,
          fetched: false,
          fuelRecord: null,
          entryType: inheritedEntryType,
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
          // Pass sourceMode so handleTruckNoChange respects nil/ref even when its
          // closure still sees the pre-paste snapshot of entryAutoFillData.
          handleTruckNoChange(targetIndex, formattedTruckNo, sourceMode);

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

  // Handle multi-line paste for numeric fields (liters / rate).
  // Fills down into existing rows from the focused row — never creates new rows.
  const handleNumberFieldPaste = (
    index: number,
    field: 'liters' | 'rate',
    event: React.ClipboardEvent<HTMLInputElement>
  ) => {
    const pastedText = event.clipboardData.getData('text');
    const lines = pastedText
      .split(/[\n\r\t]+/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) return; // Single value — let default onChange handle it

    event.preventDefault();
    event.stopPropagation();

    // Accept numbers that may be comma-formatted (e.g. "1,500")
    const values = lines.map(l => parseFloat(l.replace(/,/g, '')) || 0);

    setFormData(prev => {
      const entries = [...(prev.entries || [])];

      values.forEach((value, i) => {
        const targetIndex = index + i;
        if (targetIndex >= entries.length || !entries[targetIndex]) return;

        const liters = field === 'liters' ? value : (entries[targetIndex].liters || 0);
        const rate   = field === 'rate'   ? value : (entries[targetIndex].rate   || 0);

        entries[targetIndex] = {
          ...entries[targetIndex],
          [field]: value,
          amount: liters * rate,
        };
      });

      const total = entries.reduce((sum, e) => sum + (e?.amount || 0), 0);
      return { ...prev, entries, total };
    });
  };

  // Handle multi-line paste for the DO number field.
  // Fills down into existing rows and triggers handleDONoChange for each, mirroring
  // the staggered fetch pattern used by handleTruckPaste.
  // Handle multi-line paste on the DO number field (Excel-style).
  // Mirrors handleTruckPaste exactly: creates a new row per DO, pushes existing rows
  // down, then stagger-fires handleDONoChange so each row auto-fetches its journey data.
  const handleDOPaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    if (isPastingRef.current) return;

    const pastedText = event.clipboardData.getData('text');
    const lines = pastedText
      .split(/[\n\r\t]+/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length <= 1) return; // Single value — let default onChange handle it

    event.preventDefault();
    event.stopPropagation();

    isPastingRef.current = true;

    const doNumbers = lines.map(l => l.toUpperCase());

    // Insert one new row per DO, pushing existing rows below the paste point down
    setFormData(prev => {
      const currentEntries = [...(prev.entries || [])];

      if (index > currentEntries.length) {
        isPastingRef.current = false;
        return prev;
      }

      const newEntriesArray: LPODetail[] = [];

      for (let i = 0; i < index; i++) {
        if (currentEntries[i]) newEntriesArray.push(currentEntries[i]);
      }

      doNumbers.forEach((doNo) => {
        const isPasteCustom = prev.station === 'CUSTOM';
        const isPasteCash   = prev.station === 'CASH';
        const pasteRate   = isPasteCustom ? customRate   : isPasteCash ? cashRate   : (prev.station ? getStationDefaults(prev.station, 'going').rate : noStationRate);
        const pasteLiters = isPasteCustom ? customDefaultLiters : isPasteCash ? cashDefaultLiters : (prev.station ? 0 : noStationDefaultLiters);
        newEntriesArray.push({
          doNo,
          truckNo: '',
          liters: pasteLiters,
          rate: pasteRate,
          amount: pasteLiters * pasteRate,
          dest: 'NIL',
        });
      });

      // Skip the original entry at paste index (replaced by the first pasted row)
      for (let i = index + 1; i < currentEntries.length; i++) {
        if (currentEntries[i]) newEntriesArray.push(currentEntries[i]);
      }

      return { ...prev, entries: newEntriesArray };
    });

    // Mirror the auto-fill data re-indexing used by handleTruckPaste
    setEntryAutoFillData(prev => {
      const newAutoFillData: Record<number, EntryAutoFillData> = {};

      Object.keys(prev).forEach(key => {
        const idx = parseInt(key);
        if (idx < index) newAutoFillData[idx] = prev[idx];
      });

      for (let i = 0; i < doNumbers.length; i++) {
        newAutoFillData[index + i] = {
          direction: 'going',
          loading: false,
          fetched: false,
          fuelRecord: null,
        };
      }

      Object.keys(prev).forEach(key => {
        const idx = parseInt(key);
        if (idx > index) {
          newAutoFillData[idx + doNumbers.length - 1] = prev[idx];
        }
      });

      return newAutoFillData;
    });

    // Stagger DO auto-fetch for each new row (same cadence as truck paste)
    const outerTimer = setTimeout(() => {
      doNumbers.forEach((doNo, i) => {
        const innerTimer = setTimeout(() => {
          handleDONoChange(index + i, doNo);

          if (i === doNumbers.length - 1) {
            const resetTimer = setTimeout(() => {
              isPastingRef.current = false;
            }, 300);
            pasteTimeoutsRef.current.push(resetTimer);
          }
        }, i * 250);

        pasteTimeoutsRef.current.push(innerTimer);
      });
    }, 200);

    pasteTimeoutsRef.current.push(outerTimer);
  };

  // Handle truck number change with auto-fetch
  const handleTruckNoChange = async (index: number, truckNo: string, modeOverride?: EntryMode) => {
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

    // Format-completion detection: only fetch when truck number matches T{digits} {2+ letters}
    const TRUCK_FORMAT_COMPLETE = /^T\d+ [A-Z]{2,}$/;

    if (TRUCK_FORMAT_COMPLETE.test(formattedTruckNo)) {
      // NIL/REF modes: never fetch — manual entry only, no lookup
      const entryMode = modeOverride || entryAutoFillData[index]?.entryType;
      if (entryMode === 'nil' || entryMode === 'ref') return;

      // Format is complete — clear any previous timer for this row
      if (fetchDebounceTimers.current[index]) {
        clearTimeout(fetchDebounceTimers.current[index]);
      }

      // Show loading indicator immediately
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { ...prev[index], loading: true, fetched: false }
      }));

      // 300ms safety timer (guards the final character gap, not typing speed)
      fetchDebounceTimers.current[index] = setTimeout(async () => {
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
        
        const isCustomStation = formData.station === 'CUSTOM';
        const isCashStation = formData.station === 'CASH';
        const defaults = isCustomStation
          ? { liters: customDefaultLitersRef.current, rate: customRateRef.current }
          : isCashStation
          ? { liters: cashDefaultLitersRef.current, rate: cashRateRef.current }
          : (formData.station
              ? getStationDefaults(
                  formData.station,
                  direction,
                  destinationForAllocation,
                  result.fuelRecord?.totalLts ?? undefined,
                  result.fuelRecord?.extra ?? undefined,
                  result.fuelRecord?.balance ?? undefined
                )
              : { liters: noStationDefaultLitersRef.current, rate: noStationRateRef.current });

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
              rate: prev.station === 'CUSTOM' ? customRate : prev.station === 'CASH' ? cashRate : (prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2),
              amount: 0,
              dest: 'NIL',
            };
          }

          // For DA entries: keep DO as DA, store real DO in referenceDoNo
          const isDA = entryAutoFillData[index]?.entryType === 'da';

          newEntries[index] = {
            ...newEntries[index],
            truckNo: formattedTruckNo,  // Use formatted truck number to maintain consistent format
            doNo: isDA ? 'DA' : doNumber,
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
            ...prev[index],
            direction, 
            loading: false, 
            fetched: result.success, 
            fuelRecord: result.fuelRecord,
            fuelRecordId: result.fuelRecord?.id,  // Store fuel record ID for inspect modal
            goingDestination: result.goingDestination,  // Store for later use when toggling direction
            returnDoMissing,  // Track if return DO is missing
            // For DA: store the real journey DO as referenceDoNo
            referenceDoNo: prev[index]?.entryType === 'da' ? doNumber : prev[index]?.referenceDoNo,
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

        delete fetchDebounceTimers.current[index];
      }, 300);
    } else if (formattedTruckNo.length >= 5) {
      // Format incomplete but long enough — clear any pending timer and reset loading
      if (fetchDebounceTimers.current[index]) {
        clearTimeout(fetchDebounceTimers.current[index]);
        delete fetchDebounceTimers.current[index];
      }
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { ...prev[index], loading: false, fetched: false }
      }));
    }
  };

  /**
   * Explicitly set the entry mode for a row via the per-row mode chip.
   *  - regular (NORM): fetch-by-DO, free DO entry for a truck in the fuel records
   *  - da: driver account — fetch-by-DO/truck, submits as NIL DO + referenceDoNo
   *  - ref: reefer/partner truck — no fetch, submits as REF
   *  - nil: truck with no DO / not in the fuel records — no fetch, no warning
   */
  const handleModeChange = (
    index: number,
    mode: 'regular' | 'da' | 'ref' | 'nil'
  ) => {
    // Cancel any in-flight fetch for this row before switching modes
    if (fetchDebounceTimers.current[index]) {
      clearTimeout(fetchDebounceTimers.current[index]);
      delete fetchDebounceTimers.current[index];
    }

    setEntryAutoFillData(prev => ({
      ...prev,
      [index]: {
        ...prev[index],
        direction: prev[index]?.direction || 'going',
        entryType: mode,
        loading: false,
        // REF/NIL never carry a fetched record or a "no record" warning
        ...(mode === 'ref' || mode === 'nil'
          ? { fetched: false, fuelRecord: null, fuelRecordId: undefined, warningType: null, warningMessage: undefined }
          : {}),
        // Only DA tracks a reference DO
        ...(mode === 'da' ? {} : { referenceDoNo: undefined }),
      },
    }));

    // When switching into a fetching mode, re-run the lookup for any DO already typed.
    if (mode === 'regular' || mode === 'da') {
      const currentDo = formData.entries?.[index]?.doNo;
      if (currentDo && currentDo !== 'NIL' && currentDo.trim().length >= 3) {
        handleDONoChange(index, currentDo, mode);
      }
    }
  };

  /**
   * Commit a resolved DO lookup into the row: fill truck/destination/liters and
   * record the auto-fill metadata. Shared by the normal single-match path and the
   * ambiguity picker (a picked candidate fills exactly like a clean lookup).
   */
  const applyDoFetchResult = (
    index: number,
    doNoUpper: string,
    result: TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' }
  ) => {
    // Direction is detected by the backend from which DO field matched
    // (goingDo → going, returnDo → returning). Fall back to a local match
    // against the record's returnDo if the backend didn't supply one.
    const direction: 'going' | 'returning' = result.direction
      ? result.direction
      : (result.fuelRecord && result.fuelRecord.returnDo === doNoUpper ? 'returning' : 'going');

    // Check if return DO is missing
    const returnDoMissing = !result.returnDo || result.returnDo === 'NIL' || result.returnDo === '';

    // Use correct destination based on direction
    const destinationForAllocation = direction === 'going'
      ? result.goingDestination
      : result.destination;

    const isCustom = formData.station === 'CUSTOM';
    const isCash = formData.station === 'CASH';
    const defaults = isCustom
      ? { liters: customDefaultLitersRef.current, rate: customRateRef.current }
      : isCash
      ? { liters: cashDefaultLitersRef.current, rate: cashRateRef.current }
      : (formData.station
          ? getStationDefaults(
              formData.station,
              direction,
              destinationForAllocation,
              result.fuelRecord?.totalLts ?? undefined,
              result.fuelRecord?.extra ?? undefined,
              result.fuelRecord?.balance ?? undefined
            )
          : { liters: noStationDefaultLitersRef.current, rate: noStationRateRef.current });

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
          doNo: '',
          truckNo: '',
          liters: 0,
          rate: prev.station ? getStationDefaults(prev.station, 'going').rate : 1.2,
          amount: 0,
          dest: 'NIL',
        };
      }

      newEntries[index] = {
        ...newEntries[index],
        truckNo: result.truckNo || '',
        doNo: doNoUpper,
        dest: destinationForAllocation,
        liters: defaults.liters,
        rate: defaults.rate,
        amount: defaults.liters * defaults.rate
      };

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
        fuelRecordId: result.fuelRecord?.id || result.fuelRecord?._id,
        goingDestination: result.goingDestination,
        returnDoMissing,
        // Preserve the explicitly-chosen mode (regular/da) across the fetch
        entryType: prev[index]?.entryType || 'regular',
        // DA tracks the typed/resolved DO as the reference journey DO
        referenceDoNo: prev[index]?.entryType === 'da' ? doNoUpper : prev[index]?.referenceDoNo,
        warningType: result.warningType || null,
        warningMessage: result.message,
        balanceInfo,
        formulaStatus: defaults.formulaStatus || null,
        formulaMessage: defaults.formulaMessage,
      }
    }));
  };

  // User picked the correct truck from the ambiguous-DO modal — commit it and close.
  const handlePickAmbiguousMatch = (
    match: TruckFetchResult & { truckNo?: string; direction?: 'going' | 'returning' }
  ) => {
    const { index, doNo } = doAmbiguityModal;
    if (index >= 0) applyDoFetchResult(index, doNo, match);
    setDoAmbiguityModal({ open: false, index: -1, doNo: '', matches: [] });
  };

  /**
   * Handle DO number change (for DO-first search)
   * Fetches journey by DO and auto-fills truck number
   */
  const handleDONoChange = async (
    index: number,
    doNo: string,
    modeOverride?: 'regular' | 'da' | 'ref' | 'nil'
  ) => {
    const doNoUpper = doNo.trim().toUpperCase();

    // Mode is chosen explicitly via the per-row mode chip (handleModeChange),
    // not detected from the typed text — so the DO box stays free in every mode.
    // modeOverride lets handleModeChange re-run a fetch with the new mode before
    // the entryType state update has flushed.
    const mode = modeOverride || entryAutoFillData[index]?.entryType || 'regular';

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

    // REF and NIL: never fetch. REF = reefer/partner truck; NIL = truck with no DO,
    // not in the fuel records — manual entry, no journey lookup and no warning.
    if (mode === 'ref' || mode === 'nil') {
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: {
          ...prev[index],
          direction: prev[index]?.direction || 'going',
          loading: false,
          fetched: false,
          fuelRecord: null,
          entryType: mode,
          warningType: null,
          warningMessage: undefined,
        }
      }));
      return;
    }

    // NORM (regular) and DA both fetch the journey by DO and auto-fill the truck.
    // The only difference is at submit time (DA → doNo NIL + referenceDoNo).
    // If DO number is valid, debounce the fetch — same pattern as truck number.
    // Without debouncing, every keystroke fires a concurrent request; the partial-DO
    // fetches ("003", "0036", etc.) resolve after the correct one and wipe the auto-fill.
    if (doNoUpper && doNoUpper !== 'NIL' && doNoUpper.length >= 3) {
      // Cancel any previous pending fetch for this row before starting a new one
      if (fetchDebounceTimers.current[index]) {
        clearTimeout(fetchDebounceTimers.current[index]);
      }

      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { ...prev[index], loading: true, fetched: false }
      }));

      fetchDebounceTimers.current[index] = setTimeout(async () => {
        const result = await fetchByDONumber(doNoUpper);

        // Ambiguous DO: the same number is on more than one truck (dirty imported
        // data). DON'T silently auto-fill — stop, flag the row, and make the user
        // pick the correct journey from a modal. Auto-fill happens only on pick.
        const ambiguousMatches = result.matches;
        if (result.ambiguous && ambiguousMatches && ambiguousMatches.length > 1) {
          setEntryAutoFillData(prev => ({
            ...prev,
            [index]: {
              ...prev[index],
              loading: false,
              fetched: false,
              fuelRecord: null,
              entryType: prev[index]?.entryType || 'regular',
              warningType: 'ambiguous_do',
              warningMessage: `⚠️ DO ${doNoUpper} matches ${ambiguousMatches.length} trucks — pick the correct one.`,
            }
          }));
          setDoAmbiguityModal({ open: true, index, doNo: doNoUpper, matches: ambiguousMatches });
          delete fetchDebounceTimers.current[index];
          return;
        }

        applyDoFetchResult(index, doNoUpper, result);

        delete fetchDebounceTimers.current[index];
      }, 300);
    } else {
      // Too short or cleared — cancel any pending timer
      if (fetchDebounceTimers.current[index]) {
        clearTimeout(fetchDebounceTimers.current[index]);
        delete fetchDebounceTimers.current[index];
      }
    }
  };

  // Toggle direction (going/returning) for an entry
  const toggleDirection = async (index: number) => {
    const currentDirection = entryAutoFillData[index]?.direction || 'going';
    const newDirection = currentDirection === 'going' ? 'returning' : 'going';

    // Guard: block toggle if the selected station doesn't service the new direction
    if (formData.station && formData.station !== 'CASH' && formData.station !== 'CUSTOM') {
      const stationConfig = availableStations.find(
        s => s.stationName.toUpperCase() === formData.station!.toUpperCase()
      );
      if (stationConfig) {
        const litersForNewDirection = newDirection === 'going'
          ? stationConfig.defaultLitersGoing
          : stationConfig.defaultLitersReturning;
        if (!litersForNewDirection || litersForNewDirection === 0) {
          setDirectionWarningModal({
            open: true,
            stationName: stationConfig.stationName,
            blockedDirection: newDirection,
          });
          return;
        }
      }
    }

    const fuelRecord = entryAutoFillData[index]?.fuelRecord;
    const storedGoingDestination = entryAutoFillData[index]?.goingDestination;

    // Update the DO number and liters based on new direction
    if (fuelRecord) {
      // Check the raw DB field directly — covers system records (null/undefined) and
      // imported records where the CSV importer stores '' for a blank Return Do column.
      const returnDoMissing = !fuelRecord.returnDo || (fuelRecord.returnDo as string).trim() === '' || fuelRecord.returnDo === 'NIL';

      // When toggling to returning with no return DO, leave the field blank so the
      // user immediately sees something is wrong rather than seeing the going DO.
      const doNumber = newDirection === 'going'
        ? fuelRecord.goingDo
        : (returnDoMissing ? '' : fuelRecord.returnDo as string);

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
        : { liters: noStationDefaultLiters, rate: noStationRate };

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

      // Update autofill data with new direction, balance info, and explicit returnDoMissing
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: {
          ...prev[index],
          direction: newDirection,
          returnDoMissing: newDirection === 'returning' ? returnDoMissing : prev[index]?.returnDoMissing,
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

  const applyBulkField = (field: 'liters' | 'rate', value: number) => {
    if (selectedEntries.size === 0 || value <= 0) return;
    setFormData(prev => {
      const entries = [...(prev.entries || [])];
      selectedEntries.forEach(idx => {
        if (!entries[idx]) return;
        entries[idx] = { ...entries[idx], [field]: value };
        entries[idx].amount = entries[idx].liters * entries[idx].rate;
      });
      const total = entries.reduce((sum, e) => sum + (e?.amount || 0), 0);
      return { ...prev, entries, total };
    });
  };

  const handleBulkToggleDirection = () => {
    Array.from(selectedEntries).forEach(idx => toggleDirection(idx));
  };

  const handleBulkDelete = () => {
    if (selectedEntries.size === 0) return;
    selectedEntries.forEach(index => {
      if (fetchDebounceTimers.current[index]) {
        clearTimeout(fetchDebounceTimers.current[index]);
        delete fetchDebounceTimers.current[index];
      }
    });
    const updatedEntries = (formData.entries || []).filter((_, i) => !selectedEntries.has(i));
    const total = updatedEntries.reduce((sum, e) => sum + (e?.amount || 0), 0);
    const newAutoFillData: Record<number, EntryAutoFillData> = {};
    let newIdx = 0;
    (formData.entries || []).forEach((_, oldIdx) => {
      if (!selectedEntries.has(oldIdx)) {
        if (entryAutoFillData[oldIdx]) newAutoFillData[newIdx] = entryAutoFillData[oldIdx];
        newIdx++;
      }
    });
    setEntryAutoFillData(newAutoFillData);
    setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
    setSelectedEntries(new Set());
  };

  const handleRemoveEntry = (index: number) => {
    // Clear any pending fetch timer for this row
    if (fetchDebounceTimers.current[index]) {
      clearTimeout(fetchDebounceTimers.current[index]);
      delete fetchDebounceTimers.current[index];
    }

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
    
    // Remap selected entries (shift indices down past the removed row)
    const newSelected = new Set<number>();
    selectedEntries.forEach(idx => {
      if (idx < index) newSelected.add(idx);
      else if (idx > index) newSelected.add(idx - 1);
    });
    setSelectedEntries(newSelected);

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
      toast.warn('Please add at least one entry');
      return;
    }

    // Validate required fields
    if (!formData.lpoNo || !formData.lpoNo.trim()) {
      toast.warn('LPO number is required');
      return;
    }
    if (!formData.date) {
      toast.warn('Date is required');
      return;
    }
    if (!formData.station || !formData.station.trim()) {
      toast.warn('Station is required');
      return;
    }
    if (!formData.orderOf || !formData.orderOf.trim()) {
      toast.warn('Order of is required');
      return;
    }

    // CASH station requires at least one direction with checkpoint selection
    if (formData.station === 'CASH') {
      if (!goingEnabled && !returningEnabled) {
        toast.warn('For CASH payments, you must enable at least one direction (Going or Returning).');
        return;
      }
      if (goingEnabled && !goingCheckpoint) {
        toast.warn('Going direction is enabled but no checkpoint is selected. Please select a checkpoint or disable Going direction.');
        return;
      }
      if (returningEnabled && !returningCheckpoint) {
        toast.warn('Returning direction is enabled but no checkpoint is selected. Please select a checkpoint or disable Returning direction.');
        return;
      }
    }

    // CUSTOM station validation
    if (formData.station === 'CUSTOM') {
      if (!customStationName || !customStationName.trim()) {
        toast.warn('For CUSTOM station, you must enter a station name.');
        return;
      }
      if (!customGoingEnabled && !customReturnEnabled) {
        toast.warn('For CUSTOM station, you must select at least one direction (Going or Return).');
        return;
      }
      if (customGoingEnabled && !customGoingCheckpoint) {
        toast.warn('For CUSTOM station Going direction, you must select which fuel record column to update.');
        return;
      }
      if (customReturnEnabled && !customReturnCheckpoint) {
        toast.warn('For CUSTOM station Return direction, you must select which fuel record column to update.');
        return;
      }
    }

    // Block submission if there are exact duplicate allocations (same liters at same station)
    // Different amounts are allowed (top-up/adjustment scenario)
    // NIL-DO matches are never blocked — they only warn in the Status column
    if (formData.station?.toUpperCase() !== 'CASH' && duplicateWarnings.size > 0) {
      // Filter to only get exact duplicates (same liters, non-NIL DO)
      const exactDuplicates = Array.from(duplicateWarnings.entries())
        .filter(([_, info]) => !info.isDifferentAmount && !info.isNilDo);
      
      if (exactDuplicates.length > 0) {
        const duplicateTrucks = exactDuplicates.map(([truckNo, info]) => 
          `${truckNo} (${info.liters}L in LPO #${info.lpoNo})`
        ).join('\n');
        toast.error(`Cannot create LPO: The following trucks already have the SAME fuel amount allocated at ${formData.station}: ${duplicateTrucks}. This looks like a duplicate entry. If you need to add extra fuel, please change the liters amount.`);
        return;
      }
    }

    // Validate each entry has required fields
    const invalidEntries = formData.entries.filter(e => e != null).filter(
      (entry) => !entry.truckNo || !entry.truckNo.trim()
    );
    if (invalidEntries.length > 0) {
      toast.warn('All entries must have a truck number');
      return;
    }
    
    // Check for duplicate truck numbers within the form
    const truckNumbers = formData.entries.filter(e => e != null).map(e => e.truckNo.toUpperCase());
    const duplicateTrucks = truckNumbers.filter((truck, index) => 
      truckNumbers.indexOf(truck) !== index
    );
    if (duplicateTrucks.length > 0) {
      const uniqueDuplicates = [...new Set(duplicateTrucks)];
      toast.error(`Cannot submit: Trucks entered multiple times: ${uniqueDuplicates.join(', ')}. Please remove the duplicate entries before submitting.`);
      return;
    }

    // Block submission if any entry is set to 'returning' but has no Return DO
    const trucksWithMissingReturnDo = formData.entries
      .filter(e => e != null)
      .map((entry, idx) => ({ entry, af: entryAutoFillData[idx] }))
      .filter(({ af }) => af && af.direction === 'returning' && af.returnDoMissing && af.fetched)
      .map(({ entry }) => entry.truckNo);
    if (trucksWithMissingReturnDo.length > 0) {
      toast.error(`Cannot submit: Trucks set to "Return" but missing a Return DO: ${trucksWithMissingReturnDo.join(', ')}. Switch them back to "Going" or wait until the Return DO is entered.`);
      return;
    }

    // Ensure all entries have required fields with proper defaults
    // For CASH mode, include both direction checkpoints (can have one or both)
    // For CUSTOM mode, include the custom station checkpoint mappings
    const validEntries = formData.entries.filter(e => e != null).map((entry, idx) => {
      const af = entryAutoFillData[idx];
      const isDA = af?.entryType === 'da';
      const isREF = af?.entryType === 'ref';
      const isNIL = af?.entryType === 'nil';
      return {
        ...entry,
        // NIL = truck with no DO / not in fuel records → store as NIL (backend classifies as nil-do)
        doNo: isDA || isNIL ? 'NIL' : isREF ? 'REF' : ((entry.doNo && entry.doNo.trim()) || 'NIL'),
        truckNo: entry.truckNo.trim(),
        dest: (entry.dest && entry.dest.trim()) || 'NIL',
        liters: Number(entry.liters) || 0,
        rate: Number(entry.rate) || 0,
        amount: (Number(entry.liters) || 0) * (Number(entry.rate) || 0),
        // Entry type flags
        isDriverAccount: isDA,
        isRefer: isREF,
        referenceDoNo: isDA ? (af?.referenceDoNo || undefined) : undefined,
        journeyDirection: af?.direction,
        // Include checkpoint(s) for CASH entries - can have going, returning, or both
        goingCheckpoint: formData.station === 'CASH' && goingEnabled && goingCheckpoint ? goingCheckpoint : undefined,
        returningCheckpoint: formData.station === 'CASH' && returningEnabled && returningCheckpoint ? returningCheckpoint : undefined,
        // Include custom station data for CUSTOM entries
        isCustomStation: formData.station === 'CUSTOM',
        customStationName: formData.station === 'CUSTOM' ? customStationName : undefined,
        customGoingCheckpoint: formData.station === 'CUSTOM' && customGoingEnabled ? customGoingCheckpoint : undefined,
        customReturnCheckpoint: formData.station === 'CUSTOM' && customReturnEnabled ? customReturnCheckpoint : undefined,
        customCountry: formData.station === 'CUSTOM' ? customCountry : undefined,
      };
    });

    const total = validEntries.reduce((sum, entry) => sum + entry.amount, 0);

    // Perform cancellation for CASH mode if any LPOs are selected
    if (formData.station === 'CASH' && selectedLPOsToCancel.size > 0) {
      // Check if any LPOs are actually selected
      const hasAnySelection = Array.from(selectedLPOsToCancel.values()).some(set => set.size > 0);
      
      if (hasAnySelection) {
        try {
          for (const [truckNo, selectedLPOIds] of selectedLPOsToCancel) {
            if (selectedLPOIds.size === 0) continue;

            const truckDirections = existingLPOsForTrucks.get(truckNo);
            if (!truckDirections) continue;

            for (const { lpos, direction, doNo } of truckDirections) {
              const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
              for (const lpo of lpos) {
                const lpoId = (lpo as any)._id?.toString() || lpo.id?.toString();
                if (lpoId && selectedLPOIds.has(lpoId)) {
                  await lpoDocumentsAPI.cancelTruck(
                    lpoId,
                    truckNo,
                    checkpoint as CancellationPoint,
                    `Cash mode payment - station was out of fuel (${direction}, DO: ${doNo})`
                  );
                }
              }
            }
          }
        } catch (error: any) {
          const msg = error?.response?.data?.message || error?.message || 'Unknown error';
          toast.error(`Failed to cancel existing LPO: ${msg}. Fix the issue and try again. The CASH LPO has NOT been saved.`);
          return; // Abort — do not save the CASH LPO with a partially-cancelled state
        }
      }
    }

    // Process amends for CASH mode — partially reduce existing LPO entries
    if (formData.station === 'CASH' && selectedLPOsToAmend.size > 0) {
      try {
        for (const [amendKey, { lpoId, newLiters }] of selectedLPOsToAmend) {
          const [truckNo] = amendKey.split('::');
          // Determine the checkpoint for this truck's direction
          const truckDirections = existingLPOsForTrucks.get(truckNo);
          if (!truckDirections) continue;
          for (const { lpos, direction, doNo } of truckDirections) {
            const lpoMatch = lpos.find((l) => {
              const id = (l as any)._id?.toString() || l.id?.toString();
              return id === lpoId;
            });
            if (!lpoMatch) continue;
            const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
            await lpoDocumentsAPI.amendTruck(
              lpoId,
              truckNo,
              newLiters,
              checkpoint as string,
              `Cash mode payment - truck received ${newLiters}L cash, reducing station allocation (${direction}, DO: ${doNo})`
            );
          }
        }
      } catch (error: any) {
        const msg = error?.response?.data?.message || error?.message || 'Unknown error';
        toast.error(`Failed to amend existing LPO: ${msg}. Fix the issue and try again. The CASH LPO has NOT been saved.`);
        return;
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
      customCountry: formData.station === 'CUSTOM' ? customCountry : undefined,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(submitData);
      // Reset in-memory state (not just storage) so a pending autosave debounce
      // can't re-save a draft for the LPO we just submitted. Changing formData's
      // ref also cancels any in-flight autosave timer via the effect cleanup.
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle forward button click for NEW LPOs - create and reload form with trucks
  const handleCreateAndForward = async () => {
    if (!formData.lpoNo || !formData.station || !formData.entries || formData.entries.length === 0) {
      toast.warn('Please ensure the LPO has a number, station, and at least one entry before forwarding');
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
        toast.warn('All entries must have a truck number');
        return;
      }

      // CASH-specific validation — mirrors handleSubmit
      if (formData.station === 'CASH') {
        if (!goingEnabled && !returningEnabled) {
          toast.warn('For CASH payments, you must enable at least one direction (Going or Returning).');
          return;
        }
        if (goingEnabled && !goingCheckpoint) {
          toast.warn('Going direction is enabled but no checkpoint is selected. Please select a checkpoint or disable Going direction.');
          return;
        }
        if (returningEnabled && !returningCheckpoint) {
          toast.warn('Returning direction is enabled but no checkpoint is selected. Please select a checkpoint or disable Returning direction.');
          return;
        }
      }

      // Submit the current LPO using the same format as handleSubmit
      const validEntries = formData.entries.filter(e => e != null).map((entry, idx) => {
        const af = entryAutoFillData[idx];
        const isDA = af?.entryType === 'da';
        const isREF = af?.entryType === 'ref';
        const isNIL = af?.entryType === 'nil';
        return {
          ...entry,
          // NIL = truck with no DO / not in fuel records → store as NIL (backend classifies as nil-do)
          doNo: isDA || isNIL ? 'NIL' : isREF ? 'REF' : ((entry.doNo && entry.doNo.trim()) || 'NIL'),
          truckNo: entry.truckNo.trim(),
          dest: (entry.dest && entry.dest.trim()) || 'NIL',
          liters: Number(entry.liters) || 0,
          rate: Number(entry.rate) || 0,
          amount: (Number(entry.liters) || 0) * (Number(entry.rate) || 0),
          isDriverAccount: isDA,
          isRefer: isREF,
          referenceDoNo: isDA ? (af?.referenceDoNo || undefined) : undefined,
          journeyDirection: af?.direction,
          goingCheckpoint: formData.station === 'CASH' && goingEnabled && goingCheckpoint ? goingCheckpoint : undefined,
          returningCheckpoint: formData.station === 'CASH' && returningEnabled && returningCheckpoint ? returningCheckpoint : undefined,
        };
      });

      const total = validEntries.reduce((sum, entry) => sum + entry.amount, 0);

      const lpoData: Partial<LPOSummary> = {
        lpoNo: formData.lpoNo,
        date: formData.date || new Date().toISOString().split('T')[0],
        station: formData.station,
        orderOf: formData.orderOf || 'TAHMEED',
        entries: validEntries,
        total,
      };

      // CASH cancellation — cancel selected existing station LPOs before saving
      if (formData.station === 'CASH' && selectedLPOsToCancel.size > 0) {
        const hasAnySelection = Array.from(selectedLPOsToCancel.values()).some(set => set.size > 0);
        if (hasAnySelection) {
          try {
            for (const [truckNo, selectedLPOIds] of selectedLPOsToCancel) {
              if (selectedLPOIds.size === 0) continue;
              const truckDirections = existingLPOsForTrucks.get(truckNo);
              if (!truckDirections) continue;
              for (const { lpos, direction, doNo } of truckDirections) {
                const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
                for (const lpo of lpos) {
                  const lpoId = (lpo as any)._id?.toString() || lpo.id?.toString();
                  if (lpoId && selectedLPOIds.has(lpoId)) {
                    await lpoDocumentsAPI.cancelTruck(
                      lpoId,
                      truckNo,
                      checkpoint as CancellationPoint,
                      `Cash mode payment - station was out of fuel (${direction}, DO: ${doNo})`
                    );
                  }
                }
              }
            }
          } catch (error: any) {
            const msg = error?.response?.data?.message || error?.message || 'Unknown error';
            toast.error(`Failed to cancel existing LPO: ${msg}. Fix the issue and try again. The CASH LPO has NOT been saved.`);
            return;
          }
        }
      }

      // CASH amendment — reduce existing station LPO entry liters before saving
      if (formData.station === 'CASH' && selectedLPOsToAmend.size > 0) {
        try {
          for (const [amendKey, { lpoId, newLiters }] of selectedLPOsToAmend) {
            const [truckNo] = amendKey.split('::');
            const truckDirections = existingLPOsForTrucks.get(truckNo);
            if (!truckDirections) continue;
            for (const { lpos, direction, doNo } of truckDirections) {
              const lpoMatch = lpos.find((l) => {
                const id = (l as any)._id?.toString() || l.id?.toString();
                return id === lpoId;
              });
              if (!lpoMatch) continue;
              const checkpoint = direction === 'Going' ? goingCheckpoint : returningCheckpoint;
              await lpoDocumentsAPI.amendTruck(
                lpoId,
                truckNo,
                newLiters,
                checkpoint as string,
                `Cash mode payment - truck received ${newLiters}L cash, reducing station allocation (${direction}, DO: ${doNo})`
              );
            }
          }
        } catch (error: any) {
          const msg = error?.response?.data?.message || error?.message || 'Unknown error';
          toast.error(`Failed to amend existing LPO: ${msg}. Fix the issue and try again. The CASH LPO has NOT been saved.`);
          return;
        }
      }

      const createdLpo = await lpoDocumentsAPI.create(lpoData);
      console.log('Source LPO created:', createdLpo);

      // Fetch the next LPO number immediately for the forwarded LPO
      const nextLpoNo = await lpoDocumentsAPI.getNextLpoNumber();

      // Keep the same trucks for forwarding. Zero liters/rate/amount so the next
      // station's defaults populate cleanly when the user selects a station.
      const forwardedEntries = formData.entries.map(entry => ({
        id: undefined,
        doNo: entry.doNo || 'NIL',
        truckNo: entry.truckNo,
        dest: entry.dest || 'NIL',
        liters: 0,
        rate: 0,
        amount: 0,
      }));

      // Reset form with the trucks pre-filled AND the next LPO number ready
      setFormData({
        id: undefined,
        lpoNo: nextLpoNo,
        date: new Date().toISOString().split('T')[0],
        station: '',
        orderOf: formData.orderOf || 'TAHMEED',
        entries: forwardedEntries,
        total: undefined,
      });

      // Carry over per-entry state that must survive the station change:
      // direction, fuel record (for Eye icon + toggleDirection), entry type (DA/REF/NIL),
      // journey navigation, and going-destination. Clear only the station-specific
      // formula/balance badges so they re-evaluate against the new station's config.
      setEntryAutoFillData(
        Object.fromEntries(
          forwardedEntries.map((_, idx) => {
            const prev = entryAutoFillData[idx];
            return [
              idx,
              {
                direction:            prev?.direction            ?? 'going',
                loading:              false,
                fetched:              prev?.fuelRecord != null,
                fuelRecord:           prev?.fuelRecord           ?? null,
                fuelRecordId:         prev?.fuelRecordId,
                goingDestination:     prev?.goingDestination,
                entryType:            prev?.entryType,
                referenceDoNo:        prev?.referenceDoNo,
                allJourneys:          prev?.allJourneys,
                selectedJourneyIndex: prev?.selectedJourneyIndex,
                selectedJourneyType:  prev?.selectedJourneyType,
                // Reset station-specific computed fields — they re-derive on station select
                balanceInfo:          undefined,
                formulaStatus:        null,
                formulaMessage:       undefined,
                returnDoMissing:      prev?.returnDoMissing,
                warningType:          null,
                warningMessage:       undefined,
              },
            ];
          })
        )
      );

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

      // Auto-download PDF for the created LPO (only if enabled in config)
      if (autoDownloadLPOPdf) {
        const pdfToastId = toast.loading(`Preparing PDF — LPO ${createdLpo.lpoNo}...`, {
          style: { background: '#0284c7', color: '#fff' },
        });
        try {
          await lpoDocumentsAPI.downloadPDF(createdLpo.id!);
          toast.update(pdfToastId, {
            render: `LPO #${createdLpo.lpoNo} created & forwarded to #${nextLpoNo} — PDF downloaded`,
            type: 'success',
            isLoading: false,
            autoClose: 4000,
            style: undefined,
          });
        } catch (pdfErr: any) {
          console.error('Error downloading PDF:', pdfErr);
          toast.update(pdfToastId, {
            render: `LPO #${createdLpo.lpoNo} created & forwarded to #${nextLpoNo}, but PDF download failed`,
            type: 'warning',
            isLoading: false,
            autoClose: 6000,
            style: undefined,
          });
        }
      } else {
        toast.success(`LPO #${createdLpo.lpoNo} created & forwarded to #${nextLpoNo}`, { autoClose: 4000 });
      }

    } catch (error: any) {
      console.error('Error during create and forward:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      toast.error(`Failed to create LPO: ${error.response?.data?.message || error.message || 'Unknown error'}`);
    } finally {
      setIsCreatingAndForwarding(false);
    }
  };

  // Handle forward LPO button click for EXISTING LPOs - opens full forward modal
  const handleOpenForwardModal = () => {
    if (!formData.lpoNo || !formData.station || !formData.entries || formData.entries.length === 0) {
      toast.warn('Please ensure the LPO has a number, station, and at least one entry before forwarding');
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
    toast.success(`Successfully forwarded to LPO #${forwardedLpo.lpoNo} at ${forwardedLpo.station}`);
  };

  if (!isOpen) return null;

  // Compute whether any entry has status info that needs the Status column
  const hasAnyIssue = (formData.entries || []).some((entry, idx) => {
    if (!entry) return false;
    const af = entryAutoFillData[idx] || { direction: 'going' as const, loading: false, fetched: false };
    const dupInfo = duplicateWarnings.get(entry?.truckNo || '');
    const hasDup = !!dupInfo && formData.station?.toUpperCase() !== 'CASH';
    return !!(
      (af as EntryAutoFillData).entryType === 'da' ||
      (af as EntryAutoFillData).entryType === 'ref' ||
      (af.warningType && !af.loading && (entry?.truckNo?.length || 0) >= 5) ||
      (af.warningType === 'ambiguous_do' && !af.loading) ||
      hasDup ||
      (af.fetched && af.allJourneys) ||
      (af.direction === 'returning' && af.returnDoMissing && af.fetched) ||
      (af.allJourneys && (
        (af.allJourneys.active && af.allJourneys.queued.length > 0) ||
        (!af.allJourneys.active && af.allJourneys.queued.length > 1)
      )) ||
      // Only open the Status column for a REDUCED Mbeya balance — standard 400L needs no annotation
      (af.balanceInfo && af.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY' && af.balanceInfo.suggestedLiters < af.balanceInfo.standardAllocation) ||
      (af.formulaStatus === 'missing_data' || af.formulaStatus === 'error')
    );
  });

  // Separate flag used to gate the submit button style — avoids re-computing inside JSX twice
  const hasReturnDoMissingBlock = (formData.entries || []).some((_, idx) => {
    const af = entryAutoFillData[idx];
    return !!(af && af.direction === 'returning' && af.returnDoMissing && af.fetched);
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4" onClick={handleCancel}>
      {/* ===== Scoped styles for the redesigned LPO form (CSP-safe: 'unsafe-inline' allowed).
           Theme-sensitive surfaces flip via `.dark` selectors so dark mode stays reactive. ===== */}
      <style>{LPO_RD_STYLES}</style>

      <div className="lpo-rd bg-white dark:bg-[#0b1220] rounded-none sm:rounded-[18px] shadow-xl max-w-[1300px] w-full h-full sm:h-auto max-h-screen sm:max-h-[92vh] overflow-hidden border border-[#eef1f6] dark:border-[#1e293b] flex flex-col transition-colors" onClick={(e) => e.stopPropagation()}>
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

        {/* Warn when fuel deduction on LPO create is disabled */}
        {lpoCreateDeductOff && (
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/60">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-[11.5px] text-amber-800 dark:text-amber-300 leading-none">
              <span className="font-semibold">Fuel deduction is off</span> — saving this LPO will not deduct fuel from truck balances.
            </p>
          </div>
        )}

        {/* ===== HEADER ===== */}
        <div className="flex items-center justify-between px-5 sm:px-[26px] py-4 sm:py-5 border-b border-[#eef1f6] dark:border-[#1e293b] bg-gradient-to-b from-[#fbfcfe] to-white dark:from-[#0f172a] dark:to-[#0b1220]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(155deg,#4f46e5,#6366f1)', boxShadow: '0 6px 14px -4px rgba(79,70,229,.55)' }}>
              <Fuel className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="m-0 text-[19px] font-bold text-[#0f1729] dark:text-gray-100 tracking-tight">
                  {initialData ? 'Edit LPO Document' : 'New LPO Document'}
                </h2>
                {hasDraft && !initialData && (
                  <span className="inline-flex items-center gap-1.5 px-[9px] py-[3px] rounded-full bg-[#eef0fe] dark:bg-indigo-900/40 text-[#4338ca] dark:text-indigo-300 text-[11px] font-bold">
                    <Save className="w-3 h-3" />Draft saved
                  </span>
                )}
              </div>
              <p className="m-0 mt-[3px] text-[12.5px] text-[#8a97a8] dark:text-gray-400 font-medium truncate">
                Local Purchase Order · Fuel allocation &amp; checkpoint tracking
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {hasDraft && !initialData && (
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border border-[#f0c9c9] dark:border-red-900/60 bg-white dark:bg-transparent text-[#c0392b] dark:text-red-400 text-[12.5px] font-semibold hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />Discard
              </button>
            )}
            <button
              type="button"
              onClick={handleCancel}
              className="w-[34px] h-[34px] rounded-[9px] border border-[#eef1f6] dark:border-[#1e293b] bg-white dark:bg-transparent text-[#64748b] dark:text-gray-400 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="lpo-scroll flex-1 overflow-y-auto p-5 sm:p-[26px]">

          {/* ===== 01 · ORDER DETAILS ===== */}
          <div className="panel mb-[22px] p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] font-bold tracking-[.08em] uppercase text-[#4f46e5] dark:text-indigo-400">01</span>
              <span className="text-[14px] font-bold text-[#0f1729] dark:text-gray-100">Order details</span>
              <div className="flex-1 h-px bg-[#eef1f6] dark:bg-[#1e293b]" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* LPO No */}
              <div>
                <label className="lbl">LPO No.</label>
                <div className="relative">
                  <input
                    type="text"
                    name="lpoNo"
                    value={formData.lpoNo}
                    onChange={handleHeaderChange}
                    required
                    readOnly
                    className="fld mono fld-ro"
                    style={{ letterSpacing: '.02em' }}
                  />
                  <span className="absolute right-3 top-[11px] text-[#94a3b8]">
                    {isLoadingLpoNumber ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Lock className="w-[15px] h-[15px]" />}
                  </span>
                </div>
                <p className="m-0 mt-1.5 text-[11px] text-[#a3aebd] font-medium">Auto-generated</p>
              </div>

              {/* Date */}
              <div>
                <label className="lbl">Date</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleHeaderChange}
                  required
                  className="fld"
                />
              </div>

              {/* Station */}
              <div>
                <label className="lbl">Station</label>
                <div className="relative" ref={stationDropdownRef}>
                  <button
                    type="button"
                    onClick={() => !loadingStations && setShowStationDropdown(!showStationDropdown)}
                    disabled={loadingStations}
                    className="fld flex items-center justify-between text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ color: formData.station ? undefined : '#94a3b8' }}
                  >
                    <span className="flex-1 inline-flex items-center gap-2 min-w-0 overflow-hidden mr-1">
                      <MapPin className="w-[15px] h-[15px] text-[#4f46e5] shrink-0" />
                      <span className="truncate">{loadingStations ? 'Loading stations...' : (formData.station || 'Select station')}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 text-[#94a3b8] transition-transform ${showStationDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showStationDropdown && !loadingStations && (
                    <div className="menu absolute z-40 left-0 right-0 top-[46px] p-1.5 max-h-[280px] overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange({ target: { name: 'station', value: '' } } as any);
                          setShowStationDropdown(false);
                        }}
                        className={`menu-item w-full flex items-center justify-between gap-2.5 px-[11px] py-2 rounded-lg text-left text-[13px] font-semibold ${!formData.station ? 'text-[#4f46e5] dark:text-indigo-400' : 'text-[#0f1729] dark:text-gray-100'}`}
                      >
                        <span>Select station</span>
                        {!formData.station && <Check className="w-4 h-4" />}
                      </button>
                      {availableStations.map(station => {
                        const cur = station.currency ?? (station.defaultRate < 10 ? 'USD' : 'TZS');
                        const active = formData.station === station.stationName;
                        return (
                          <button
                            key={station._id}
                            type="button"
                            onClick={() => {
                              handleHeaderChange({ target: { name: 'station', value: station.stationName } } as any);
                              setShowStationDropdown(false);
                            }}
                            className="menu-item w-full flex items-center justify-between gap-2.5 px-[11px] py-2 rounded-lg text-left"
                          >
                            <span className="flex flex-col gap-0.5 min-w-0">
                              <span className={`text-[13px] font-semibold truncate ${active ? 'text-[#4f46e5] dark:text-indigo-400' : 'text-[#0f1729] dark:text-gray-100'}`}>{station.stationName}</span>
                              <span className="text-[11px] text-[#9aa6b6] font-medium truncate">
                                Going {station.defaultLitersGoing}L · Return {station.defaultLitersReturning}L · @{station.defaultRate}/L
                              </span>
                            </span>
                            {active
                              ? <Check className="w-4 h-4 text-[#4f46e5] dark:text-indigo-400 shrink-0" />
                              : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#f1f4f9] dark:bg-[#1e293b] text-[#64748b] dark:text-gray-300 shrink-0">{cur}</span>}
                          </button>
                        );
                      })}
                      <div className="h-px bg-[#eef1f6] dark:bg-[#1e293b] my-1.5 mx-1" />
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange({ target: { name: 'station', value: 'CASH' } } as any);
                          setShowStationDropdown(false);
                        }}
                        className="menu-item w-full flex items-center gap-2.5 px-[11px] py-2 rounded-lg text-left text-[13px] font-bold text-[#c2410c]"
                      >
                        <Banknote className="w-4 h-4" />CASH purchase
                        {formData.station === 'CASH' && <Check className="w-4 h-4 ml-auto" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleHeaderChange({ target: { name: 'station', value: 'CUSTOM' } } as any);
                          setShowStationDropdown(false);
                        }}
                        className="menu-item w-full flex items-center gap-2.5 px-[11px] py-2 rounded-lg text-left text-[13px] font-bold text-[#6d28d9] dark:text-violet-400"
                      >
                        <PlusCircle className="w-4 h-4" />CUSTOM station
                        {formData.station === 'CUSTOM' && <Check className="w-4 h-4 ml-auto" />}
                      </button>
                    </div>
                  )}
                  {formData.station && (() => {
                    const station = availableStations.find(s => s.stationName === formData.station);
                    if (station) {
                      const currency = station.currency ?? (station.defaultRate < 10 ? 'USD' : 'TZS');
                      return (
                        <p className="m-0 mt-1.5 text-[11px] text-[#16a34a] dark:text-green-400 font-semibold flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          Going {station.defaultLitersGoing}L · Return {station.defaultLitersReturning}L @ {station.defaultRate}/L ({currency})
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Order Of */}
              <div>
                <label className="lbl">Order of</label>
                <input
                  type="text"
                  name="orderOf"
                  value={formData.orderOf}
                  onChange={handleHeaderChange}
                  required
                  className="fld"
                />
              </div>
            </div>
          </div>

          {/* Cash Cancellation Point - Only shown when CASH is selected */}
          {formData.station === 'CASH' && (
            <div className="mb-[22px] p-[18px] rounded-[14px] border border-orange-200 dark:border-orange-900/50 bg-gradient-to-b from-orange-50/70 to-white dark:from-orange-900/10 dark:to-transparent">
              <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0 bg-orange-200/70 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                    <Ban className="w-4 h-4" />
                  </span>
                  <div>
                    <div className="text-[13.5px] font-bold text-orange-800 dark:text-orange-200">Cash purchase checkpoint <span className="text-[11px] font-semibold text-orange-500">(required)</span></div>
                    <div className="text-[11.5px] font-medium text-orange-600 dark:text-orange-400">Select where cash fuel was bought. Existing LPOs at these checkpoints are cancelled or amended.</div>
                  </div>
                </div>

                {/* All controls on one row: Going | Returning | Rate | Default Liters — all same height */}
                <div className="flex flex-wrap gap-3 mb-4 items-end">

                  {/* Going Direction */}
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">Going Direction</label>
                    <div ref={goingCheckpointRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!goingEnabled) {
                            setGoingEnabled(true);
                            setShowGoingCheckpointDropdown(true);
                          } else {
                            setShowGoingCheckpointDropdown(!showGoingCheckpointDropdown);
                          }
                        }}
                        className={`w-full px-3 py-2 border rounded-md text-sm text-left flex items-center justify-between transition-colors ${
                          goingEnabled
                            ? goingCheckpoint
                              ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-gray-900 dark:text-gray-100'
                              : 'border-red-400 dark:border-red-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={goingEnabled}
                            onChange={(e) => {
                              e.stopPropagation();
                              setGoingEnabled(e.target.checked);
                              if (!e.target.checked) { setGoingCheckpoint(''); setShowGoingCheckpointDropdown(false); }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 shrink-0 text-orange-600 border-gray-300 rounded"
                          />
                          <span className="truncate text-xs">
                            {goingEnabled
                              ? (goingCheckpoint ? getCancellationPointDisplayName(goingCheckpoint) : 'Select checkpoint...')
                              : 'Going (disabled)'}
                          </span>
                        </span>
                        {goingEnabled && <ChevronDown className={`w-4 h-4 shrink-0 ml-1 transition-transform ${showGoingCheckpointDropdown ? 'rotate-180' : ''}`} />}
                      </button>
                      {showGoingCheckpointDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {getAvailableCancellationPoints('CASH').going.map((point) => (
                            <button
                              key={point}
                              type="button"
                              onClick={() => { setGoingCheckpoint(point as CancellationPoint); setShowGoingCheckpointDropdown(false); }}
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
                    </div>
                    {goingEnabled && !goingCheckpoint && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">⚠ Select checkpoint</p>
                    )}
                  </div>

                  {/* Returning Direction */}
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">Returning Direction</label>
                    <div ref={returningCheckpointRef} className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (!returningEnabled) {
                            setReturningEnabled(true);
                            setShowReturningCheckpointDropdown(true);
                          } else {
                            setShowReturningCheckpointDropdown(!showReturningCheckpointDropdown);
                          }
                        }}
                        className={`w-full px-3 py-2 border rounded-md text-sm text-left flex items-center justify-between transition-colors ${
                          returningEnabled
                            ? returningCheckpoint
                              ? 'border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-gray-900 dark:text-gray-100'
                              : 'border-red-400 dark:border-red-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={returningEnabled}
                            onChange={(e) => {
                              e.stopPropagation();
                              setReturningEnabled(e.target.checked);
                              if (!e.target.checked) { setReturningCheckpoint(''); setShowReturningCheckpointDropdown(false); }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 shrink-0 text-orange-600 border-gray-300 rounded"
                          />
                          <span className="truncate text-xs">
                            {returningEnabled
                              ? (returningCheckpoint ? getCancellationPointDisplayName(returningCheckpoint) : 'Select checkpoint...')
                              : 'Returning (disabled)'}
                          </span>
                        </span>
                        {returningEnabled && <ChevronDown className={`w-4 h-4 shrink-0 ml-1 transition-transform ${showReturningCheckpointDropdown ? 'rotate-180' : ''}`} />}
                      </button>
                      {showReturningCheckpointDropdown && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {getAvailableCancellationPoints('CASH').returning.map((point) => (
                            <button
                              key={point}
                              type="button"
                              onClick={() => { setReturningCheckpoint(point as CancellationPoint); setShowReturningCheckpointDropdown(false); }}
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
                    </div>
                    {returningEnabled && !returningCheckpoint && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">⚠ Select checkpoint</p>
                    )}
                  </div>

                  {/* Rate with TZS/USD toggle */}
                  <div className="w-40 shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-orange-800 dark:text-orange-200">
                        Rate ({cashCurrency})
                      </label>
                      <div className="flex rounded overflow-hidden border border-orange-300 dark:border-orange-600 text-xs">
                        <button
                          type="button"
                          onClick={() => setCashCurrency('TZS')}
                          className={`px-2 py-0.5 font-medium transition-colors ${cashCurrency === 'TZS' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20'}`}
                        >TZS</button>
                        <button
                          type="button"
                          onClick={() => setCashCurrency('USD')}
                          className={`px-2 py-0.5 font-medium transition-colors ${cashCurrency === 'USD' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20'}`}
                        >USD</button>
                      </div>
                    </div>
                    <input
                      type="number"
                      value={cashRate || ''}
                      onChange={(e) => setCashRate(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  {/* Default Liters */}
                  <div className="w-36 shrink-0">
                    <label className="block text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">Default Liters</label>
                    <input
                      type="number"
                      value={cashDefaultLiters || ''}
                      onChange={(e) => setCashDefaultLiters(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      step="1"
                      min="0"
                      className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
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
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md space-y-2">
                    <p className="text-[11px] text-red-600 dark:text-red-400 mb-1">
                      For each existing LPO: <strong>Cancel</strong> fully reverts the allocation (truck won't collect from station). <strong>Amend</strong> reduces it to a new amount (truck still collects the reduced quantity).
                    </p>
                    {Array.from(existingLPOsForTrucks.entries()).map(([truckNo, directionLPOs]) => {
                      const selectedForTruck = selectedLPOsToCancel.get(truckNo) || new Set();
                      return (
                        <div key={truckNo}>
                          <p className="text-xs font-semibold text-red-800 dark:text-red-300 mb-1">
                            {truckNo}
                          </p>
                          <div className="space-y-2 pl-2">
                            {directionLPOs.flatMap(({ lpos }) =>
                              lpos.map((lpo) => {
                                const lpoId = (lpo as any)._id?.toString() || lpo.id?.toString() || '';
                                const liters = lpo.entries?.find((e: any) => e.truckNo === truckNo && !e.isCancelled)?.liters ?? 0;
                                const amendKey = `${truckNo}::${lpoId}`;
                                const amendEntry = selectedLPOsToAmend.get(amendKey);
                                const isAmending = !!amendEntry;
                                const isCancelling = selectedForTruck.has(lpoId);
                                return (
                                  <div key={lpoId} className="rounded border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800/50 px-2 py-1.5 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-red-700 dark:text-red-300">
                                        LPO #{lpo.lpoNo} ({lpo.station}, {lpo.date}) — <strong>{liters}L</strong>
                                      </span>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {/* Cancel toggle */}
                                        <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                                          <input
                                            type="checkbox"
                                            checked={isCancelling}
                                            disabled={isAmending}
                                            onChange={(e) => {
                                              const newSelected = new Map(selectedLPOsToCancel);
                                              const newSet = new Set(newSelected.get(truckNo));
                                              if (e.target.checked) newSet.add(lpoId);
                                              else newSet.delete(lpoId);
                                              newSelected.set(truckNo, newSet);
                                              setSelectedLPOsToCancel(newSelected);
                                            }}
                                            className="rounded border-red-300 text-red-600 focus:ring-red-500 disabled:opacity-40"
                                          />
                                          <span className={`${isCancelling ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>Cancel</span>
                                        </label>
                                        {/* Amend toggle */}
                                        <button
                                          type="button"
                                          disabled={isCancelling}
                                          onClick={() => {
                                            const newAmend = new Map(selectedLPOsToAmend);
                                            if (isAmending) {
                                              newAmend.delete(amendKey);
                                            } else {
                                              newAmend.set(amendKey, { lpoId, newLiters: liters > 0 ? liters - 1 : 0 });
                                            }
                                            setSelectedLPOsToAmend(newAmend);
                                          }}
                                          className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:opacity-40 ${
                                            isAmending
                                              ? 'border-amber-400 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold'
                                              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-400 hover:text-amber-600'
                                          }`}
                                        >
                                          Amend
                                        </button>
                                      </div>
                                    </div>
                                    {/* Amend input row */}
                                    {isAmending && (
                                      <div className="flex items-center gap-2 pt-1">
                                        <span className="text-[11px] text-amber-700 dark:text-amber-400">New allocation:</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={liters - 1}
                                          value={amendEntry!.newLiters}
                                          onChange={(e) => {
                                            const val = Number(e.target.value);
                                            const newAmend = new Map(selectedLPOsToAmend);
                                            newAmend.set(amendKey, { lpoId, newLiters: val });
                                            setSelectedLPOsToAmend(newAmend);
                                          }}
                                          className="w-24 rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-gray-900 px-2 py-0.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        />
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400">L (was {liters}L, reducing by {liters - (amendEntry!.newLiters ?? 0)}L)</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
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
            <div className="mb-[22px] p-4 rounded-xl border border-purple-200/80 dark:border-purple-800/60 bg-white dark:bg-gray-800/40 shadow-sm">
              <p className="text-xs font-semibold text-purple-800 dark:text-purple-300 mb-3">
                Custom station — unlisted / ad-hoc
              </p>

              <div className="overflow-x-auto">
                <div className="flex items-end gap-2 min-w-[920px] pb-0.5">
                  {/* Station name */}
                  <div className="flex-[2] min-w-[150px]">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400 mb-1">
                      Station name *
                    </label>
                    <input
                      type="text"
                      value={customStationName}
                      onChange={(e) => setCustomStationName(e.target.value)}
                      placeholder="e.g. Lake Near Kapiri"
                      required
                      className="w-full h-9 px-2.5 text-sm border border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Going */}
                  <div className="w-[148px] shrink-0">
                    <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 mb-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customGoingEnabled}
                        onChange={(e) => {
                          setCustomGoingEnabled(e.target.checked);
                          if (!e.target.checked) setCustomGoingCheckpoint('');
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      Going
                    </label>
                    <select
                      value={customGoingCheckpoint}
                      disabled={!customGoingEnabled}
                      onChange={(e) => setCustomGoingCheckpoint(e.target.value)}
                      className={`w-full h-9 px-2 text-xs border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed ${
                        customGoingEnabled && !customGoingCheckpoint
                          ? 'border-red-300 dark:border-red-600'
                          : 'border-green-200 dark:border-green-700'
                      }`}
                    >
                      <option value="">Checkpoint…</option>
                      {FUEL_RECORD_COLUMNS.going.map((col) => (
                        <option key={col.field} value={col.field}>{col.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Return */}
                  <div className="w-[148px] shrink-0">
                    <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customReturnEnabled}
                        onChange={(e) => {
                          setCustomReturnEnabled(e.target.checked);
                          if (!e.target.checked) setCustomReturnCheckpoint('');
                        }}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Return
                    </label>
                    <select
                      value={customReturnCheckpoint}
                      disabled={!customReturnEnabled}
                      onChange={(e) => setCustomReturnCheckpoint(e.target.value)}
                      className={`w-full h-9 px-2 text-xs border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed ${
                        customReturnEnabled && !customReturnCheckpoint
                          ? 'border-red-300 dark:border-red-600'
                          : 'border-blue-200 dark:border-blue-700'
                      }`}
                    >
                      <option value="">Checkpoint…</option>
                      {FUEL_RECORD_COLUMNS.return.map((col) => (
                        <option key={col.field} value={col.field}>{col.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Country */}
                  <div className="w-[108px] shrink-0">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400 mb-1">
                      Country
                    </label>
                    <select
                      value={customCountry}
                      onChange={(e) => setCustomCountry(e.target.value)}
                      className="w-full h-9 px-2 text-sm border border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="Zambia">Zambia</option>
                      <option value="Tanzania">Tanzania</option>
                    </select>
                  </div>

                  {/* Rate */}
                  <div className="w-[88px] shrink-0">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400">
                        Rate
                      </label>
                      <div className="flex rounded overflow-hidden border border-purple-200 dark:border-purple-700 text-[9px] leading-none">
                        <button
                          type="button"
                          onClick={() => setCustomCurrency('USD')}
                          className={`px-1 py-0.5 font-bold ${customCurrency === 'USD' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-700 text-purple-600'}`}
                        >
                          $
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomCurrency('TZS')}
                          className={`px-1 py-0.5 font-bold ${customCurrency === 'TZS' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-700 text-purple-600'}`}
                        >
                          TSh
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      value={customRate || ''}
                      onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      step="0.01"
                      min="0"
                      className="w-full h-9 px-2 text-sm border border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  {/* Default liters */}
                  <div className="w-[72px] shrink-0">
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-purple-700 dark:text-purple-400 mb-1">
                      Liters
                    </label>
                    <input
                      type="number"
                      value={customDefaultLiters || ''}
                      onChange={(e) => setCustomDefaultLiters(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      step="1"
                      min="0"
                      className="w-full h-9 px-2 text-sm border border-purple-200 dark:border-purple-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Inline validation */}
              {(!customStationName || (!customGoingEnabled && !customReturnEnabled) ||
                (customGoingEnabled && !customGoingCheckpoint) ||
                (customReturnEnabled && !customReturnCheckpoint)) && (
                <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                  {!customStationName && 'Station name required. '}
                  {customStationName && !customGoingEnabled && !customReturnEnabled && 'Enable Going or Return. '}
                  {customGoingEnabled && !customGoingCheckpoint && 'Select Going checkpoint. '}
                  {customReturnEnabled && !customReturnCheckpoint && 'Select Return checkpoint.'}
                </p>
              )}
            </div>
          )}


          {/* ===== 02 · FUEL SUPPLY DETAILS ===== */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3.5 flex-wrap">
              <span className="text-[11px] font-bold tracking-[.08em] uppercase text-[#4f46e5] dark:text-indigo-400">02</span>
              <span className="text-[14px] font-bold text-[#0f1729] dark:text-gray-100">Fuel supply details</span>
              {(() => { const n = (formData.entries?.filter(e => e != null).length || 0); return (
                <span className="text-[12px] text-[#9aa6b6] font-medium">{n} {n === 1 ? 'truck' : 'trucks'}</span>
              ); })()}
              {isCheckingDuplicates && (
                <span className="text-[12px] text-[#9aa6b6] inline-flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />Checking duplicates…
                </span>
              )}
              <div className="flex-1 h-px bg-[#eef1f6] dark:bg-[#1e293b] min-w-[20px]" />
              <span className="text-[11.5px] text-[#9aa6b6] font-medium hidden md:inline-flex items-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5" />Paste a column to fill multiple rows
              </span>
            </div>

            {/* Bulk action bar — visible when 1+ entries are selected */}
            {selectedEntries.size > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 mb-3 px-3.5 py-2.5 rounded-[11px] bg-[#eef0fe] dark:bg-indigo-900/20 border border-[#d9dcfb] dark:border-indigo-800">
                <span className="text-[12px] font-bold text-[#4338ca] dark:text-indigo-300 inline-flex items-center gap-1.5">
                  <CheckCheck className="w-4 h-4" />{selectedEntries.size} selected
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-[#5b62d6] dark:text-indigo-300 font-semibold">Liters</span>
                  <input
                    type="number"
                    value={bulkLiters}
                    onChange={e => setBulkLiters(e.target.value)}
                    placeholder="0"
                    className="mini-input mono w-16"
                  />
                  <button
                    type="button"
                    onClick={() => { applyBulkField('liters', parseFloat(bulkLiters) || 0); setBulkLiters(''); }}
                    disabled={!bulkLiters || parseFloat(bulkLiters) <= 0}
                    className="h-[30px] px-2.5 rounded-[7px] bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-40 text-white text-[11.5px] font-bold"
                  >
                    Apply
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] text-[#5b62d6] dark:text-indigo-300 font-semibold">Rate</span>
                  <input
                    type="number"
                    value={bulkRate}
                    onChange={e => setBulkRate(e.target.value)}
                    placeholder="0"
                    step="0.01"
                    className="mini-input mono w-16"
                  />
                  <button
                    type="button"
                    onClick={() => { applyBulkField('rate', parseFloat(bulkRate) || 0); setBulkRate(''); }}
                    disabled={!bulkRate || parseFloat(bulkRate) <= 0}
                    className="h-[30px] px-2.5 rounded-[7px] bg-[#4f46e5] hover:bg-[#4338ca] disabled:opacity-40 text-white text-[11.5px] font-bold"
                  >
                    Apply
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleBulkToggleDirection}
                  className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[7px] bg-[#dbe4ff] dark:bg-blue-900/40 text-[#1d4ed8] dark:text-blue-300 hover:bg-[#cdd9fb] dark:hover:bg-blue-800/50 text-[11.5px] font-bold"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />Toggle direction
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-[7px] bg-[#fde2e2] dark:bg-red-900/40 text-[#b91c1c] dark:text-red-300 hover:bg-[#fbd0d0] dark:hover:bg-red-800/50 text-[11.5px] font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedEntries(new Set())}
                  className="ml-auto text-[11.5px] text-[#6b73c9] dark:text-indigo-300 font-semibold hover:underline"
                >
                  Clear
                </button>
              </div>
            )}

            {/* Mobile Card View (< md) */}
            <div className="md:hidden space-y-1.5">
              {(formData.entries || []).filter(entry => entry != null).map((entry, index) => {
                const autoFill = entryAutoFillData[index] || { direction: 'going', loading: false, fetched: false };
                const duplicateInfo = duplicateWarnings.get(entry?.truckNo || '');
                const hasDuplicate = !!duplicateInfo && formData.station?.toUpperCase() !== 'CASH';
                const isExactDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount && !duplicateInfo?.isNilDo;
                const isDifferentAmount = hasDuplicate && !!duplicateInfo?.isDifferentAmount;
                const isNilDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount && !!duplicateInfo?.isNilDo;
                const hasNoRecordWarning = (autoFill.warningType && !autoFill.loading && (entry?.truckNo?.length || 0) >= 5 && autoFill.entryType !== 'ref')
                  || (autoFill.warningType === 'ambiguous_do' && !autoFill.loading);
                const mobileReturnDoMissing = autoFill.direction === 'returning' && autoFill.returnDoMissing && autoFill.fetched;
                return (
                  <div key={index} className={`border rounded-lg p-2 transition-colors ${
                    autoFill.entryType === 'ref' ? 'border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/10'
                    : autoFill.entryType === 'da' ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10'
                    : mobileReturnDoMissing ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                    : autoFill.fetched && !hasNoRecordWarning && !isExactDuplicate && !isDifferentAmount ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10'
                    : hasNoRecordWarning ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/10'
                    : isExactDuplicate ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                    : isDifferentAmount ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800'
                  }`}>
                    {/* Checkbox + row number */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <input
                        type="checkbox"
                        checked={selectedEntries.has(index)}
                        onChange={e => {
                          const next = new Set(selectedEntries);
                          if (e.target.checked) next.add(index); else next.delete(index);
                          setSelectedEntries(next);
                        }}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600"
                      />
                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">#{index + 1}</span>
                    </div>

                    {/* Truck | Mode | DO | Dir — same 4-col grid as liters row */}
                    <div className="grid grid-cols-4 gap-1 mb-1.5">
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Truck</label>
                        <div className="relative">
                          <input type="text" value={entry?.truckNo || ''} onChange={(e) => handleTruckNoChange(index, e.target.value)} onPaste={(e) => handleTruckPaste(index, e)}
                            placeholder="Truck" title="Paste multiple trucks (one per line) to auto-fill multiple rows"
                            className={`w-full pr-3 px-1 py-px border rounded text-[9px] focus:ring-1 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                              isExactDuplicate ? 'border-red-500 dark:border-red-400' : isDifferentAmount ? 'border-blue-500 dark:border-blue-400' : isNilDuplicate ? 'border-amber-400 dark:border-amber-500' : hasNoRecordWarning ? 'border-amber-500 dark:border-amber-400' : 'border-gray-300 dark:border-gray-600'
                            }`} />
                          {autoFill.loading && <Loader2 className="absolute right-0.5 top-0.5 w-2.5 h-2.5 text-primary-500 animate-spin" />}
                          {autoFill.fetched && !autoFill.loading && !hasDuplicate && <CheckCircle className="absolute right-0.5 top-0.5 w-2.5 h-2.5 text-green-500" />}
                          {hasNoRecordWarning && !autoFill.loading && <AlertTriangle className="absolute right-0.5 top-0.5 w-2.5 h-2.5 text-amber-500" />}
                          {isExactDuplicate && <AlertTriangle className="absolute right-0.5 top-0.5 w-2.5 h-2.5 text-red-500" />}
                          {isDifferentAmount && <CheckCircle className="absolute right-0.5 top-0.5 w-2.5 h-2.5 text-blue-500" />}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Mode</label>
                        <select
                          value={autoFill.entryType || 'regular'}
                          onChange={(e) => handleModeChange(index, e.target.value as EntryMode)}
                          title="Entry mode"
                          className={`w-full px-0.5 py-px border rounded text-[9px] font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${modeBorderClass(autoFill.entryType)}`}
                        >
                          {ENTRY_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">DO#</label>
                        <input type="text" value={entry?.doNo || ''} onChange={(e) => handleDONoChange(index, e.target.value)}
                          onBlur={(e) => { if (!e.target.value.trim()) handleEntryChange(index, 'doNo', 'NIL'); }}
                          onPaste={(e) => handleDOPaste(index, e)}
                          placeholder="DO#" title="Enter DO number — paste multiple (one per line) to fill down"
                          className={`w-full px-1 py-px border rounded text-[9px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${modeBorderClass(autoFill.entryType)}`} />
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Dir</label>
                        {autoFill.entryType !== 'ref' ? (
                          <button type="button" onClick={() => toggleDirection(index)}
                            className={`w-full inline-flex items-center justify-center py-px rounded text-[9px] font-medium ${
                              autoFill.direction === 'going'
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                            }`}>
                            {autoFill.direction === 'going' ? <ArrowRight className="w-2.5 h-2.5" /> : <ArrowLeft className="w-2.5 h-2.5" />}
                          </button>
                        ) : (
                          <span className="w-full inline-flex items-center justify-center py-px rounded text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">REF</span>
                        )}
                      </div>
                    </div>

                    {/* Warnings (only show when needed) */}
                    {(hasNoRecordWarning || isExactDuplicate || isDifferentAmount || mobileReturnDoMissing) && (
                      <div className="mb-1.5 text-[10px] leading-tight flex flex-col gap-0.5">
                        {mobileReturnDoMissing && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 w-fit" title="No Return DO found in the fuel record — cannot submit">
                            ⛔ No Return DO
                          </span>
                        )}
                        {hasNoRecordWarning && (autoFill.warningMessage?.includes('DUPLICATE')
                          ? <span className="text-red-600 dark:text-red-400 font-semibold">⚠️ Duplicate — use different truck</span>
                          : <span className="text-amber-600 dark:text-amber-400">
                              {autoFill.warningType === 'not_found' && '⚠️ No record — manual entry allowed'}
                              {autoFill.warningType === 'journey_completed' && '⚠️ Journey complete (0L)'}
                              {autoFill.warningType === 'no_active_record' && '⚠️ No active journey'}
                              {autoFill.warningType === 'ambiguous_do' && '⚠️ DO on multiple trucks — pick one'}
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
                            Active
                          </button>
                        )}
                        {autoFill.allJourneys.queued.map((qJ, qIdx) => (
                          <button key={qIdx} type="button" onClick={() => handleJourneyNavigation(index, 'queued', qIdx)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${autoFill.selectedJourneyType === 'queued' && autoFill.selectedJourneyIndex === qIdx ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'}`}>
                            Q{qJ.queueOrder || qIdx + 1}
                          </button>
                        ))}
                        {autoFill.fetched && (
                          <span className={`text-[10px] ${(autoFill.fuelRecord as any)?.isLocked ? 'text-amber-600 dark:text-amber-400' : autoFill.selectedJourneyType === 'queued' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                            {(autoFill.fuelRecord as any)?.isLocked ? 'Locked' : autoFill.selectedJourneyType === 'queued' ? 'Queued' : 'Active'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Liters + Rate + Amount + Dest in one compact row */}
                    <div className="grid grid-cols-4 gap-1">
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Ltrs</label>
                        <input type="number" value={entry?.liters || 0}
                          onChange={(e) => handleEntryChange(index, 'liters', parseFloat(e.target.value) || 0)}
                          onPaste={(e) => handleNumberFieldPaste(index, 'liters', e)}
                          title="Paste a column of numbers to fill down"
                          className="w-full px-1 py-px border border-gray-300 dark:border-gray-600 rounded text-[9px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Rate</label>
                        <input type="number" value={entry?.rate || 0} step="0.01"
                          onChange={(e) => handleEntryChange(index, 'rate', parseFloat(e.target.value) || 0)}
                          onPaste={(e) => handleNumberFieldPaste(index, 'rate', e)}
                          title="Paste a column of numbers to fill down"
                          className="w-full px-1 py-px border border-gray-300 dark:border-gray-600 rounded text-[9px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Amt</label>
                        <input type="number" value={(entry?.amount || 0).toFixed(2)} readOnly
                          className="w-full px-1 py-px border border-gray-300 dark:border-gray-600 rounded text-[9px] bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-gray-100" />
                      </div>
                      <div>
                        <label className="block text-[9px] text-gray-400 dark:text-gray-500 mb-0.5">Dest</label>
                        <input type="text" value={entry?.dest || 'NIL'} onChange={(e) => handleEntryChange(index, 'dest', e.target.value)} placeholder="NIL"
                          className="w-full px-1 py-px border border-gray-300 dark:border-gray-600 rounded text-[9px] focus:ring-1 focus:ring-primary-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
                      </div>
                    </div>
                    {/* Balance hint — only shown when Mbeya return is reduced below standard */}
                    {autoFill.balanceInfo && autoFill.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY' && autoFill.balanceInfo.suggestedLiters < autoFill.balanceInfo.standardAllocation && (
                      <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                        <Fuel className="w-3 h-3 inline mr-0.5" />
                        {`${autoFill.balanceInfo.suggestedLiters}L (reduced — balance too low for full ${autoFill.balanceInfo.standardAllocation}L)`}
                      </div>
                    )}

                    {/* Card actions */}
                    <div className="flex items-center gap-2 pt-1.5 mt-1.5 border-t border-gray-200 dark:border-gray-600">
                      <button
                        type="button"
                        onClick={() => autoFill.fuelRecord && handleInspectRecord(index)}
                        disabled={!autoFill.fuelRecord}
                        title={autoFill.fuelRecord ? 'Inspect fuel record' : 'No fuel record linked'}
                        className={`flex-1 px-3 py-1.5 text-[11px] font-medium rounded-lg inline-flex items-center justify-center gap-1 transition-colors ${
                          autoFill.fuelRecord
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                            : 'text-blue-400 dark:text-blue-700 bg-blue-50/50 dark:bg-blue-900/10 opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveEntry(index)}
                        title="Remove entry"
                        className="flex-1 px-3 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg inline-flex items-center justify-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={handleAddEntry}
                className="w-full py-3 text-xs text-primary-600 dark:text-primary-400 border border-dashed border-primary-300 dark:border-primary-600 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add new entry
              </button>
            </div>

            {/* Desktop Table View (md+) */}
            <div className="hidden md:block">
             <div className="rounded-[13px] border border-[#eaedf3] dark:border-[#1e293b] overflow-hidden">
              <div className="lpo-scroll overflow-x-auto">
              <table className="lpo-table">
                <thead>
                  <tr>
                    <th className="lpo-th" style={{ width: '38px', paddingLeft: '14px' }}>
                      <input
                        type="checkbox"
                        checked={(formData.entries?.filter(e => e != null).length || 0) > 0 && selectedEntries.size === (formData.entries?.filter(e => e != null).length || 0)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedEntries(new Set((formData.entries || []).map((_, i) => i)));
                          } else {
                            setSelectedEntries(new Set());
                          }
                        }}
                        className="w-[15px] h-[15px] cursor-pointer accent-[#4f46e5]"
                        title="Select all"
                      />
                    </th>
                    <th className="lpo-th">Truck</th>
                    <th className="lpo-th">Mode</th>
                    <th className="lpo-th">DO number</th>
                    <th className="lpo-th">Direction</th>
                    <th className="lpo-th" style={{ textAlign: 'right' }}>Liters</th>
                    <th className="lpo-th" style={{ textAlign: 'right' }}>Rate</th>
                    <th className="lpo-th" style={{ textAlign: 'right' }}>Amount</th>
                    <th className="lpo-th">Dest.</th>
                    {hasAnyIssue && (
                      <th className="lpo-th">Status</th>
                    )}
                    <th className="lpo-th" style={{ width: '74px', textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {(formData.entries || []).filter(entry => entry != null).map((entry, index) => {
                      const autoFill = entryAutoFillData[index] || { direction: 'going', loading: false, fetched: false };
                      const duplicateInfo = duplicateWarnings.get(entry?.truckNo || '');
                      const hasDuplicate = !!duplicateInfo && formData.station?.toUpperCase() !== 'CASH';
                      const isExactDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount && !duplicateInfo?.isNilDo;
                      const isDifferentAmount = hasDuplicate && !!duplicateInfo?.isDifferentAmount;
                      const isNilDuplicate = hasDuplicate && !duplicateInfo?.isDifferentAmount && !!duplicateInfo?.isNilDo;
                      const hasNoRecordWarning = (autoFill.warningType && !autoFill.loading && (entry?.truckNo?.length || 0) >= 5 && (autoFill as EntryAutoFillData).entryType !== 'ref')
                        || (autoFill.warningType === 'ambiguous_do' && !autoFill.loading);
                      return (
                        <tr key={index} className={`lpo-row ${
                          (autoFill as EntryAutoFillData).entryType === 'ref' ? 'row-orange'
                          : (autoFill as EntryAutoFillData).entryType === 'da' ? 'row-blue'
                          : isExactDuplicate ? 'row-red'
                          : isDifferentAmount ? 'row-blue'
                          : hasNoRecordWarning ? 'row-amber'
                          : autoFill.fetched ? 'row-green'
                          : ''
                        }`}>
                          <td style={{ paddingLeft: '14px', borderLeft: `3px solid ${
                            (autoFill as EntryAutoFillData).entryType === 'ref' ? '#f97316'
                            : (autoFill as EntryAutoFillData).entryType === 'da' ? '#3b82f6'
                            : isExactDuplicate ? '#ef4444'
                            : isDifferentAmount ? '#3b82f6'
                            : hasNoRecordWarning ? '#f59e0b'
                            : autoFill.fetched ? '#22c55e'
                            : 'transparent'}` }}>
                            <input
                              type="checkbox"
                              checked={selectedEntries.has(index)}
                              onChange={e => {
                                const next = new Set(selectedEntries);
                                if (e.target.checked) next.add(index); else next.delete(index);
                                setSelectedEntries(next);
                              }}
                              className="w-[15px] h-[15px] cursor-pointer accent-[#4f46e5]"
                            />
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={entry?.truckNo || ''}
                                onChange={(e) => handleTruckNoChange(index, e.target.value)}
                                onPaste={(e) => handleTruckPaste(index, e)}
                                onKeyDown={lpoNav.handleKeyDown(index, 0, (formData.entries || []).length)}
                                ref={lpoNav.cellRef(index, 0)}
                                placeholder="T762 DWK"
                                title="Paste multiple trucks (one per line) to auto-fill multiple rows"
                                className="cell-input mono"
                                style={{ width: '104px', ...(isExactDuplicate ? { borderColor: '#ef4444' } : isDifferentAmount ? { borderColor: '#3b82f6' } : isNilDuplicate ? { borderColor: '#f59e0b' } : hasNoRecordWarning ? { borderColor: '#f59e0b' } : {}) }}
                              />
                              {autoFill.loading && (
                                <Loader2 className="w-4 h-4 text-primary-500 animate-spin flex-shrink-0" />
                              )}
                              {autoFill.fetched && !autoFill.loading && !hasDuplicate && !isNilDuplicate && (
                                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                              )}
                              {isNilDuplicate && !autoFill.loading && (
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
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

                          {/* Mode cell — NORM/DA/REF/NIL */}
                          <td>
                            <select
                              value={autoFill.entryType || 'regular'}
                              onChange={(e) => handleModeChange(index, e.target.value as EntryMode)}
                              onKeyDown={lpoNav.handleKeyDown(index, 1, (formData.entries || []).length)}
                              ref={lpoNav.cellRef(index, 1)}
                              title={ENTRY_MODE_OPTIONS.find(o => o.value === (autoFill.entryType || 'regular'))?.title}
                              className="mode-chip"
                              style={autoFill.entryType === 'da' ? { borderColor: '#93c5fd', color: '#1d4ed8' } : autoFill.entryType === 'ref' ? { borderColor: '#f8c89a', color: '#c2410c' } : autoFill.entryType === 'nil' ? { borderColor: '#d8b4fe', color: '#7c3aed' } : {}}
                            >
                              {ENTRY_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </td>

                          {/* DO Number Input Cell - for DO-first search */}
                          <td>
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
                                onPaste={(e) => handleDOPaste(index, e)}
                                onKeyDown={lpoNav.handleKeyDown(index, 2, (formData.entries || []).length)}
                                ref={lpoNav.cellRef(index, 2)}
                                placeholder="0001/26"
                                title="Enter DO number — paste multiple (one per line) to fill down"
                                className="cell-input mono"
                                style={{ width: '88px', ...(autoFill.entryType === 'da' ? { borderColor: '#93c5fd' } : autoFill.entryType === 'ref' ? { borderColor: '#f8c89a' } : autoFill.entryType === 'nil' ? { borderColor: '#d8b4fe' } : {}) }}
                              />
                              {autoFill.loading && (
                                <Loader2 className="absolute right-1 top-1.5 w-4 h-4 text-primary-500 animate-spin" />
                              )}
                              {autoFill.entryType === 'da' && autoFill.referenceDoNo && (
                                <span className="absolute -bottom-4 left-0 text-[9px] text-gray-500 dark:text-gray-400 truncate max-w-[90px] mono" title={`Ref DO: ${autoFill.referenceDoNo}`}>
                                  →{autoFill.referenceDoNo}
                                </span>
                              )}
                            </div>
                          </td>

                          <td>
                            {autoFill.entryType === 'ref' ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300">
                                REF
                              </span>
                            ) : autoFill.entryType === 'da' ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleDirection(index)}
                                  onKeyDown={lpoNav.handleKeyDown(index, 3, (formData.entries || []).length)}
                                  ref={lpoNav.cellRef(index, 3)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 ${
                                    autoFill.direction === 'going'
                                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50'
                                      : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/50'
                                  }`}
                                  title="Click or Space to toggle direction"
                                >
                                  {autoFill.direction === 'going' ? (
                                    <>Going <ArrowRight className="w-3.5 h-3.5" /></>
                                  ) : (
                                    <><ArrowLeft className="w-3.5 h-3.5" /> Return</>
                                  )}
                                </button>
                                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">DA</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleDirection(index)}
                                onKeyDown={lpoNav.handleKeyDown(index, 3, (formData.entries || []).length)}
                                ref={lpoNav.cellRef(index, 3)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-400 ${
                                  autoFill.direction === 'going'
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50'
                                    : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-800/50'
                                }`}
                                title="Click or Space to toggle direction"
                              >
                                {autoFill.direction === 'going' ? (
                                  <>Going <ArrowRight className="w-3.5 h-3.5" /></>
                                ) : (
                                  <><ArrowLeft className="w-3.5 h-3.5" /> Return</>
                                )}
                              </button>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              value={entry?.liters || 0}
                              onChange={(e) => handleEntryChange(index, 'liters', parseFloat(e.target.value) || 0)}
                              onPaste={(e) => handleNumberFieldPaste(index, 'liters', e)}
                              onKeyDown={lpoNav.handleKeyDown(index, 4, (formData.entries || []).length)}
                              ref={lpoNav.cellRef(index, 4)}
                              title="Paste a column of numbers to fill down"
                              className="cell-input mono"
                              style={{ width: '62px', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              value={entry?.rate || 0}
                              onChange={(e) => handleEntryChange(index, 'rate', parseFloat(e.target.value) || 0)}
                              onPaste={(e) => handleNumberFieldPaste(index, 'rate', e)}
                              onKeyDown={lpoNav.handleKeyDown(index, 5, (formData.entries || []).length)}
                              ref={lpoNav.cellRef(index, 5)}
                              title="Paste a column of numbers to fill down"
                              step="0.01"
                              className="cell-input mono"
                              style={{ width: '62px', textAlign: 'right' }}
                            />
                          </td>
                          <td className="amount-cell" style={{ textAlign: 'right' }}>
                            {(entry?.amount || 0).toFixed(2)}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={entry?.dest || 'NIL'}
                              onChange={(e) => handleEntryChange(index, 'dest', e.target.value)}
                              onKeyDown={lpoNav.handleKeyDown(index, 6, (formData.entries || []).length)}
                              ref={lpoNav.cellRef(index, 6)}
                              placeholder="NIL"
                              className="cell-input"
                              style={{ width: '72px' }}
                            />
                          </td>
                          {/* Status column — warnings, journey info, navigation */}
                          {hasAnyIssue && (
                            <td className="px-3 py-3 max-w-[180px]">
                              <div className="flex flex-col gap-1 text-xs">
                                {/* DA / REF entry type badge */}
                                {autoFill.entryType === 'da' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 w-fit">
                                    Driver Account
                                    {autoFill.referenceDoNo && <span className="ml-1 font-normal text-blue-500 dark:text-blue-400">({autoFill.referenceDoNo})</span>}
                                  </span>
                                )}
                                {autoFill.entryType === 'ref' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 w-fit">
                                    Reefer
                                  </span>
                                )}
                                {autoFill.entryType === 'nil' && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 w-fit">
                                    No DO (not in fuel records)
                                  </span>
                                )}
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
                                        {autoFill.warningType === 'ambiguous_do' && '⚠️ DO on multiple trucks — pick one'}
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
                                {isNilDuplicate && duplicateInfo && (
                                  <div className="text-amber-600 dark:text-amber-400" title={`NIL DO — seen at this station in LPO ${duplicateInfo.lpoNo} (${duplicateInfo.liters}L). Submission allowed.`}>
                                    ⚠ NIL seen in LPO #{duplicateInfo.lpoNo}
                                  </div>
                                )}
                                {/* Journey selection indicator */}
                                {autoFill.fetched && autoFill.allJourneys && (
                                  <div className="text-[10px] text-gray-600 dark:text-gray-400">
                                    {autoFill.selectedJourneyType === 'active' && autoFill.allJourneys.active && (
                                      <span className={`font-medium ${(autoFill.fuelRecord as any)?.isLocked ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                                        {(autoFill.fuelRecord as any)?.isLocked ? 'Locked (Manual entry)' : 'Active Journey'}
                                      </span>
                                    )}
                                    {autoFill.selectedJourneyType === 'queued' && autoFill.allJourneys.queued[autoFill.selectedJourneyIndex || 0] && (
                                      <span className="text-blue-600 dark:text-blue-400 font-medium">
                                        ⏳ Queued #{autoFill.allJourneys.queued[autoFill.selectedJourneyIndex || 0]?.queueOrder || (autoFill.selectedJourneyIndex || 0) + 1}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {/* No Return DO warning — blocks submission */}
                                {autoFill.direction === 'returning' && autoFill.returnDoMissing && autoFill.fetched && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 w-fit" title="No Return DO found in the fuel record — cannot submit. Switch back to Going or wait until the Return DO is entered.">
                                    ⛔ No Return DO
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
                                      Active
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
                                {/* Balance info hint (Infinity return) — only shown when allocation is reduced below standard */}
                                {autoFill.balanceInfo && autoFill.direction === 'returning' && formData.station?.toUpperCase() === 'INFINITY' && autoFill.balanceInfo.suggestedLiters < autoFill.balanceInfo.standardAllocation && (
                                  <div className="text-amber-600 dark:text-amber-400" title={autoFill.balanceInfo.reason}>
                                    <Fuel className="w-3 h-3 inline mr-1" />
                                    {`${autoFill.balanceInfo.suggestedLiters}L (reduced — balance too low for full ${autoFill.balanceInfo.standardAllocation}L)`}
                                  </div>
                                )}
                              </div>
                            </td>
                          )}
                          <td style={{ textAlign: 'right' }}>
                            <span className="inline-flex gap-1 justify-end">
                              {/* Inspect button - Quick view fuel record */}
                              {autoFill.fuelRecord && (
                                <button
                                  type="button"
                                  onClick={() => handleInspectRecord(index)}
                                  className="icon-btn text-[#2563eb] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                  title="Inspect fuel record (view consumption & balance)"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              {/* Delete entry button */}
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(index)}
                                className="icon-btn icon-btn-danger text-[#dc2626] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                title="Remove entry"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  <tr style={{ borderTop: '1px dashed #c9cdf6' }}>
                    <td colSpan={hasAnyIssue ? 11 : 10} style={{ padding: 0 }}>
                      <button type="button" onClick={handleAddEntry} className="addrow-btn">
                        <Plus className="w-4 h-4" />
                        Add new entry
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              </div>
             </div>
            </div>
          </div>

          {/* ===== TOTAL + ACTIONS ===== */}
          <div className="flex items-center justify-between gap-4 p-4 sm:px-5 rounded-[14px] border border-[#eef1f6] dark:border-[#1e293b] bg-gradient-to-b from-[#fbfcfe] to-[#f7f9fc] dark:from-[#0f172a] dark:to-[#0b1220] flex-wrap">
            <div className="flex items-center gap-5 sm:gap-[22px]">
              <div>
                <div className="text-[10.5px] font-bold tracking-[.07em] uppercase text-[#94a3b8]">Total amount</div>
                <div className="mono text-[26px] sm:text-[28px] font-extrabold text-[#0f1729] dark:text-gray-100 leading-[1.1] tracking-tight mt-0.5">
                  {(() => {
                    const stationUpper = (formData.station || '').toUpperCase();
                    const stationConfig = availableStations.find(s => s.stationName.toUpperCase() === stationUpper);
                    const currency = formData.station === 'CASH' ? cashCurrency
                      : formData.station === 'CUSTOM' ? customCurrency
                      : (stationConfig?.currency ?? 'TZS');
                    const total = formData.total || 0;
                    return currency === 'USD'
                      ? `$ ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `TZS ${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  })()}
                </div>
              </div>
              <div className="w-px h-[38px] bg-[#e6eaf1] dark:bg-[#1e293b]" />
              <div>
                <div className="text-[10.5px] font-bold tracking-[.07em] uppercase text-[#94a3b8]">Total liters</div>
                <div className="mono text-[20px] font-bold text-[#475569] dark:text-gray-300 mt-1">
                  {(formData.entries || []).filter(e => e != null).reduce((sum, e) => sum + (e.liters || 0), 0).toLocaleString('en-US')} L
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleCancel}
                className="h-[42px] px-[18px] rounded-[11px] border border-[#e3e8ef] dark:border-[#334155] bg-white dark:bg-transparent text-[#475569] dark:text-gray-200 text-[13.5px] font-bold hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>

              {/* Forward LPO Button - Show for EXISTING saved LPOs */}
              {initialData && initialData.id && formData.entries && formData.entries.filter(e => !e.isCancelled).length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenForwardModal}
                  className="inline-flex items-center gap-1.5 h-[42px] px-[18px] rounded-[11px] border border-[#bbf0cf] dark:border-green-800 bg-[#f0fdf4] dark:bg-green-900/20 text-[#15803d] dark:text-green-300 text-[13.5px] font-bold hover:bg-green-100 dark:hover:bg-green-900/40"
                  title="Forward this LPO to another station"
                >
                  <GitFork className="w-4 h-4 flex-shrink-0" />
                  <span className="whitespace-nowrap">Forward LPO</span>
                </button>
              )}

              {/* Create & Forward Button - Show for NEW LPOs with entries */}
              {!initialData && formData.entries && formData.entries.length > 0 && formData.station && formData.lpoNo && !isForwardingMode && (
                <button
                  type="button"
                  onClick={handleCreateAndForward}
                  disabled={isCreatingAndForwarding}
                  className="inline-flex items-center gap-1.5 h-[42px] px-[18px] rounded-[11px] border border-[#bbf0cf] dark:border-green-800 bg-[#f0fdf4] dark:bg-green-900/20 text-[#15803d] dark:text-green-300 text-[13.5px] font-bold hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Create this LPO and forward trucks to another station"
                >
                  {isCreatingAndForwarding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      <span className="whitespace-nowrap">Creating...</span>
                    </>
                  ) : (
                    <>
                      <GitFork className="w-4 h-4 flex-shrink-0" />
                      <span className="whitespace-nowrap">Create &amp; Forward</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !formData.entries || formData.entries.length === 0 ||
                  hasReturnDoMissingBlock
                }
                style={
                  hasReturnDoMissingBlock
                    ? { background: '#94a3b8', cursor: 'not-allowed' }
                    : { background: 'linear-gradient(155deg,#4f46e5,#6366f1)', boxShadow: '0 8px 18px -6px rgba(79,70,229,.6)' }
                }
                className="inline-flex items-center gap-2 h-[42px] px-[22px] rounded-[11px] border-0 text-white text-[13.5px] font-bold disabled:cursor-not-allowed whitespace-nowrap"
                title={hasReturnDoMissingBlock ? 'Cannot submit: one or more trucks set to Return have no Return DO in the fuel records. Switch them back to Going or wait until the Return DO is entered.' : undefined}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                {isSubmitting ? (initialData ? 'Updating…' : 'Creating…') : `${initialData ? 'Update' : 'Create'} LPO Document`}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Direction not supported warning modal — stopPropagation prevents bubbling to the form's backdrop onClick */}
      <div onClick={e => e.stopPropagation()}>
        <ConfirmModal
          open={directionWarningModal.open}
          title="Direction Not Available"
          message={`Station "${directionWarningModal.stationName}" does not fill ${directionWarningModal.blockedDirection === 'going' ? 'Going' : 'Returning'} direction. Please keep the current direction or choose a different station.`}
          variant="warning"
          confirmLabel="Got it"
          cancelLabel="Dismiss"
          onConfirm={() => setDirectionWarningModal(prev => ({ ...prev, open: false }))}
          onCancel={() => setDirectionWarningModal(prev => ({ ...prev, open: false }))}
        />
      </div>

      {/* Ambiguous-DO picker — the typed DO matches more than one truck (dirty
          imported data). The user MUST pick; closing without picking leaves the
          row flagged and un-filled rather than guessing a truck. */}
      {doAmbiguityModal.open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            e.stopPropagation();
            setDoAmbiguityModal({ open: false, index: -1, doNo: '', matches: [] });
          }}
        >
          <div
            className="lpo-rd w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5 border-b border-gray-100 dark:border-gray-800">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  DO {doAmbiguityModal.doNo} is on {doAmbiguityModal.matches.length} trucks
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  This DO number appears on more than one journey (likely a data-import
                  mistake). Pick the truck you mean — nothing is filled in until you do.
                </p>
              </div>
            </div>

            <div className="p-3 max-h-[55vh] overflow-y-auto lpo-scroll space-y-2">
              {doAmbiguityModal.matches.map((m, i) => (
                <button
                  key={`${m.fuelRecord?.id || m.fuelRecord?._id || i}`}
                  type="button"
                  onClick={() => handlePickAmbiguousMatch(m)}
                  className="w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-colors p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-gray-900 dark:text-gray-100 mono">
                      {formatTruckNumber(m.truckNo || m.fuelRecord?.truckNo || '—')}
                    </span>
                    <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-md ${
                      m.direction === 'returning'
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    }`}>
                      {m.direction === 'returning' ? 'Returning' : 'Going'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <span>Date: <span className="text-gray-700 dark:text-gray-300">{m.fuelRecord?.date || '—'}</span></span>
                    <span>Dest: <span className="text-gray-700 dark:text-gray-300">{(m.direction === 'going' ? m.goingDestination : m.destination) || '—'}</span></span>
                    <span>Balance: <span className="text-gray-700 dark:text-gray-300 mono">{m.balance ?? 0}L</span></span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                    Going DO {m.goingDo} · Return DO {m.returnDo}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setDoAmbiguityModal({ open: false, index: -1, doNo: '', matches: [] })}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
