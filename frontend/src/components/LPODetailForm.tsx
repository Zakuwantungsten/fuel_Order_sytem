import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Loader2, CheckCircle, ArrowLeft, ArrowRight, AlertTriangle, Ban } from 'lucide-react';
import { LPOSummary, LPODetail, FuelRecord, CancellationPoint } from '../types';
import { lpoDocumentsAPI, fuelRecordsAPI } from '../services/api';
import { formatTruckNumber } from '../utils/dataCleanup';
import { 
  getAvailableCancellationPoints, 
  getCancellationPointDisplayName,
  ZAMBIA_RETURNING_PARTS
} from '../services/cancellationService';

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
}

interface EntryAutoFillData {
  direction: 'going' | 'returning';
  loading: boolean;
  fetched: boolean;
  fuelRecord: FuelRecord | null;
  goingDestination?: string;  // Store original going destination for proper fuel allocation
  returnDoMissing?: boolean;  // Track if return DO is not yet inputted
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

const LPODetailForm: React.FC<LPODetailFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<LPOSummary>>({
    lpoNo: '',
    date: new Date().toISOString().split('T')[0],
    station: '',
    orderOf: 'TAHMEED',
    entries: [],
    total: 0,
  });

  // Track auto-fill data for each entry
  const [entryAutoFillData, setEntryAutoFillData] = useState<Record<number, EntryAutoFillData>>({});
  const [isLoadingLpoNumber, setIsLoadingLpoNumber] = useState(false);

  // Cash cancellation state
  const [cancellationDirection, setCancellationDirection] = useState<'going' | 'returning'>('going');
  const [cancellationPoint, setCancellationPoint] = useState<CancellationPoint | ''>('');
  const [existingLPOsForTrucks, setExistingLPOsForTrucks] = useState<Map<string, LPOSummary[]>>(new Map());
  const [isFetchingLPOs, setIsFetchingLPOs] = useState(false);

  // Cash currency conversion state
  const [cashConversion, setCashConversion] = useState<CashConversion>({
    localRate: 0,
    conversionRate: 1,
    currency: 'ZMW',
    calculatedRate: 0,
  });

  // Forwarding state - tracks when trucks are auto-loaded from previous station
  const [selectedSourceLpo, setSelectedSourceLpo] = useState<LPOSummary | null>(null);
  const [isLoadingForward, setIsLoadingForward] = useState(false);
  const [forwardDefaultLiters, setForwardDefaultLiters] = useState<number>(0);
  const [forwardRate, setForwardRate] = useState<number>(0);

  // Calculate TZS rate when cash conversion values change
  useEffect(() => {
    if (formData.station === 'CASH' && cashConversion.localRate > 0 && cashConversion.conversionRate > 0) {
      // If currency is ZMW, convert to TZS: localRate * conversionRate
      // Example: 26 ZMW/liter * 116 (TZS per ZMW) = 3016 TZS/liter
      const calculatedRate = cashConversion.localRate * cashConversion.conversionRate;
      setCashConversion(prev => ({ ...prev, calculatedRate }));
      
      // Update all entries with the calculated rate
      const updatedEntries = formData.entries?.map(entry => ({
        ...entry,
        rate: calculatedRate,
        amount: entry.liters * calculatedRate
      })) || [];
      
      const total = updatedEntries.reduce((sum, entry) => sum + entry.amount, 0);
      setFormData(prev => ({ ...prev, entries: updatedEntries, total }));
    }
  }, [cashConversion.localRate, cashConversion.conversionRate, formData.station]);

  // Fetch existing LPOs for trucks when CASH is selected and cancellation point is chosen
  useEffect(() => {
    const fetchExistingLPOs = async () => {
      if (formData.station === 'CASH' && cancellationPoint && formData.entries && formData.entries.length > 0) {
        setIsFetchingLPOs(true);
        const newMap = new Map<string, LPOSummary[]>();
        
        try {
          for (const entry of formData.entries) {
            if (entry.truckNo && entry.truckNo.length >= 4) {
              const lpos = await lpoDocumentsAPI.findAtCheckpoint(entry.truckNo);
              if (lpos.length > 0) {
                newMap.set(entry.truckNo, lpos);
              }
            }
          }
          setExistingLPOsForTrucks(newMap);
        } catch (error) {
          console.error('Error fetching existing LPOs:', error);
        } finally {
          setIsFetchingLPOs(false);
        }
      } else {
        setExistingLPOsForTrucks(new Map());
      }
    };

    fetchExistingLPOs();
  }, [formData.station, cancellationPoint, formData.entries?.map(e => e.truckNo).join(',')]);

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      // Fetch the next LPO number
      fetchNextLpoNumber();
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
      
      if (!fuelRecords || fuelRecords.length === 0) {
        return {
          fuelRecord: null,
          goingDo: 'NIL',
          returnDo: 'NIL',
          destination: 'NIL',
          goingDestination: 'NIL',
          balance: 0,
          message: 'No fuel record found for this truck - truck number may be invalid',
          success: false
        };
      }

      // Get current date and calculate month boundaries
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

      // Helper to check if a date is within a specific month
      const isInMonth = (dateStr: string, monthStart: Date): boolean => {
        const date = new Date(dateStr);
        const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
        return date >= monthStart && date <= monthEnd;
      };

      // Sort records by date descending (most recent first)
      const sortedRecords = [...fuelRecords].sort((a: FuelRecord, b: FuelRecord) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Search for active fuel record: current month → previous month → two months ago
      let activeRecord: FuelRecord | null = null;
      let searchMonth = 'current';

      // First, try to find a record with balance > 0 in current month
      activeRecord = sortedRecords.find((r: FuelRecord) => 
        isInMonth(r.date, currentMonth) && r.balance > 0
      ) || null;

      if (!activeRecord) {
        // Try previous month
        searchMonth = 'previous';
        activeRecord = sortedRecords.find((r: FuelRecord) => 
          isInMonth(r.date, previousMonth) && r.balance > 0
        ) || null;
      }

      if (!activeRecord) {
        // Try two months ago
        searchMonth = 'two months ago';
        activeRecord = sortedRecords.find((r: FuelRecord) => 
          isInMonth(r.date, twoMonthsAgo) && r.balance > 0
        ) || null;
      }

      // If still no active record with balance > 0, check if we have any record at all
      if (!activeRecord) {
        // Get the most recent record regardless of month
        const mostRecent = sortedRecords[0];
        
        if (mostRecent && mostRecent.balance === 0) {
          // Journey completed - truck has returned and used all fuel
          const goingDest = mostRecent.originalGoingTo || mostRecent.to || 'NIL';
          return {
            fuelRecord: mostRecent,
            goingDo: mostRecent.goingDo || 'NIL',
            returnDo: mostRecent.returnDo || 'NIL',
            destination: mostRecent.to || 'NIL',
            goingDestination: goingDest,
            balance: 0,
            message: `⚠️ Journey completed - Balance is 0. Last trip: ${mostRecent.goingDo} (${mostRecent.from} → ${mostRecent.to})`,
            success: false  // Mark as not successful since no fuel allocation is needed
          };
        }

        // No active record found
        return {
          fuelRecord: null,
          goingDo: 'NIL',
          returnDo: 'NIL',
          destination: 'NIL',
          goingDestination: 'NIL',  // Added: original going destination
          balance: 0,
          message: 'No active fuel record found for this truck in the last 3 months',
          success: false
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
  // When creating LPO at LAKE KAPIRI, auto-fetch trucks from the last LAKE NDOLA LPO
  const FORWARD_STATION_MAP: Record<string, { 
    sourceStation: string; 
    defaultLiters: number; 
    rate: number;
    description: string;
  }> = {
    'LAKE KAPIRI': { 
      sourceStation: 'LAKE NDOLA', 
      defaultLiters: 350, 
      rate: 1.2,
      description: 'Zambia Return: Ndola (50L) + Kapiri (350L) = 400L total'
    },
  };

  // Fuel allocation reference:
  // GOING: Dar Yard (550/580), Dar Going (variable), Mbeya Going (450), Zambia Going (calculated)
  // RETURNING: Zambia Return (400 = Ndola 50 + Kapiri 350), Tunduma Return (100), 
  //            Mbeya Return (400), Moro Return (100), Tanga Return (70), Dar Return (variable)

  // Fetch the last LPO from a source station to forward trucks
  const fetchLastLPOFromStation = async (sourceStation: string): Promise<LPOSummary | null> => {
    try {
      // Get LPOs filtered by station, sorted by date/lpoNo descending
      const lpos = await lpoDocumentsAPI.getAll({ 
        station: sourceStation, 
        limit: 10,
        sortBy: 'lpoNo',
        sortOrder: 'desc'
      });
      
      // Find the most recent LPO with active entries
      const validLpo = lpos.find((lpo: LPOSummary) => {
        const hasActiveEntries = lpo.entries.some(e => !e.isCancelled);
        return hasActiveEntries;
      });
      
      return validLpo || null;
    } catch (error) {
      console.error('Error fetching last LPO from station:', error);
      return null;
    }
  };

  // Auto-forward trucks when selecting a target station (LAKE KAPIRI or INFINITY)
  const autoForwardFromPreviousStation = async (targetStation: string) => {
    const forwardConfig = FORWARD_STATION_MAP[targetStation.toUpperCase()];
    if (!forwardConfig) return;

    setIsLoadingForward(true);
    try {
      const sourceLpo = await fetchLastLPOFromStation(forwardConfig.sourceStation);
      
      if (sourceLpo) {
        const activeEntries = sourceLpo.entries.filter(e => !e.isCancelled);
        
        // Create forwarded entries with correct liters and rate
        const forwardedEntries: LPODetail[] = activeEntries.map(entry => ({
          doNo: entry.doNo,
          truckNo: entry.truckNo,
          liters: forwardConfig.defaultLiters,
          rate: forwardConfig.rate,
          amount: forwardConfig.defaultLiters * forwardConfig.rate,
          dest: entry.dest,
          isCancelled: false,
          isDriverAccount: false,
        }));

        const total = forwardedEntries.reduce((sum, e) => sum + e.amount, 0);

        setFormData(prev => ({
          ...prev,
          station: targetStation,
          orderOf: sourceLpo.orderOf || prev.orderOf,
          entries: forwardedEntries,
          total,
        }));

        setSelectedSourceLpo(sourceLpo);
        setForwardDefaultLiters(forwardConfig.defaultLiters);
        setForwardRate(forwardConfig.rate);

        // Set all entries as returning direction
        const autoFillData: Record<number, EntryAutoFillData> = {};
        forwardedEntries.forEach((_, idx) => {
          autoFillData[idx] = { direction: 'returning', loading: false, fetched: true, fuelRecord: null };
        });
        setEntryAutoFillData(autoFillData);
      }
    } catch (error) {
      console.error('Error auto-forwarding:', error);
    } finally {
      setIsLoadingForward(false);
    }
  };

  // Reset forwarding state
  const resetForwarding = () => {
    setSelectedSourceLpo(null);
    setForwardDefaultLiters(0);
    setForwardRate(0);
    setEntryAutoFillData({});
    setFormData(prev => ({
      ...prev,
      station: '',
      entries: [],
      total: 0,
    }));
  };

  const handleHeaderChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // If station changes to a forwarding target (LAKE KAPIRI or INFINITY), auto-fetch trucks
    if (name === 'station' && value) {
      const stationUpper = value.toUpperCase();
      
      // Check if this is a forwarding target station
      if (FORWARD_STATION_MAP[stationUpper]) {
        // Auto-forward from the source station
        await autoForwardFromPreviousStation(value);
      } else {
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
        
        // Clear any previous forwarding state
        setSelectedSourceLpo(null);
      }
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
      
      setFormData(prev => ({ ...prev, entries: newEntries, total }));
      setEntryAutoFillData(prev => ({
        ...prev,
        [index]: { 
          direction, 
          loading: false, 
          fetched: result.success, 
          fuelRecord: result.fuelRecord,
          goingDestination: result.goingDestination,  // Store for later use when toggling direction
          returnDoMissing  // Track if return DO is missing
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

    setEntryAutoFillData(prev => ({
      ...prev,
      [index]: { ...prev[index], direction: newDirection }
    }));

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

      const newEntries = [...(formData.entries || [])];
      newEntries[index] = {
        ...newEntries[index],
        doNo: doNumber,
        dest: destinationForAllocation,  // Update destination based on direction
        liters: defaults.liters,
        amount: defaults.liters * defaults.rate
      };

      const total = newEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
      setFormData(prev => ({ ...prev, entries: newEntries, total }));
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

    // Validate each entry has required fields
    const invalidEntries = formData.entries.filter(
      (entry) => !entry.truckNo || !entry.truckNo.trim()
    );
    if (invalidEntries.length > 0) {
      alert('All entries must have a truck number');
      return;
    }

    // Ensure all entries have required fields with proper defaults
    const validEntries = formData.entries.map(entry => ({
      ...entry,
      doNo: (entry.doNo && entry.doNo.trim()) || 'NIL',
      truckNo: entry.truckNo.trim(),
      dest: (entry.dest && entry.dest.trim()) || 'NIL',
      liters: Number(entry.liters) || 0,
      rate: Number(entry.rate) || 0,
      amount: (Number(entry.liters) || 0) * (Number(entry.rate) || 0)
    }));

    const total = validEntries.reduce((sum, entry) => sum + entry.amount, 0);

    // Perform auto-cancellation for CASH mode if cancellation point is selected
    if (formData.station === 'CASH' && cancellationPoint && existingLPOsForTrucks.size > 0) {
      try {
        // Cancel trucks in existing LPOs
        for (const [truckNo, lpos] of existingLPOsForTrucks) {
          for (const lpo of lpos) {
            await lpoDocumentsAPI.cancelTruck(
              lpo.id as string,
              truckNo,
              cancellationPoint,
              'Cash mode payment - station was out of fuel'
            );
          }
        }
        console.log('Auto-cancellation completed');
      } catch (error) {
        console.error('Error during auto-cancellation:', error);
        // Continue with LPO creation even if cancellation fails
      }
    }

    onSubmit({
      ...formData,
      entries: validEntries,
      total
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto transition-colors">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {initialData ? 'Edit LPO Document' : 'New LPO Document'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Auto-Forward Notice - Shows when trucks are loaded from previous station (Zambia Return) */}
          {!initialData && selectedSourceLpo && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                  <div>
                    <h3 className="font-medium text-green-800 dark:text-green-200">
                      Trucks Forwarded from LPO #{selectedSourceLpo.lpoNo} ({selectedSourceLpo.station})
                    </h3>
                    <p className="text-sm text-green-600 dark:text-green-300">
                      {formData.entries?.length} trucks loaded @ {forwardDefaultLiters}L each @ {forwardRate}/L
                    </p>
                    <p className="text-xs text-green-500 dark:text-green-400 mt-1">
                      Zambia Return: Same trucks from Ndola (50L) now at Kapiri (350L) = 400L total
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetForwarding}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Loading indicator when fetching trucks */}
          {!initialData && isLoadingForward && (
            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-700">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                <div>
                  <h3 className="font-medium text-indigo-800 dark:text-indigo-200">
                    Loading trucks from previous station...
                  </h3>
                  <p className="text-sm text-indigo-600 dark:text-indigo-300">
                    Fetching active entries to forward
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
              <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
                <div className="flex items-center space-x-2 mb-3">
                  <Ban className="w-5 h-5 text-orange-600" />
                  <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200">Cancellation Point</h4>
                </div>
                <p className="text-xs text-orange-700 dark:text-orange-300 mb-3">
                  Select a cancellation checkpoint to automatically cancel trucks in any existing LPOs at that station.
                </p>
                
                {/* Direction Toggle */}
                <div className="flex space-x-4 mb-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cancelDirection"
                      value="going"
                      checked={cancellationDirection === 'going'}
                      onChange={() => {
                        setCancellationDirection('going');
                        setCancellationPoint('');
                      }}
                      className="w-4 h-4 text-orange-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Going</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cancelDirection"
                      value="returning"
                      checked={cancellationDirection === 'returning'}
                      onChange={() => {
                        setCancellationDirection('returning');
                        setCancellationPoint('');
                      }}
                      className="w-4 h-4 text-orange-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Returning</span>
                  </label>
                </div>

                {/* Cancellation Point Dropdown */}
                <select
                  value={cancellationPoint}
                  onChange={(e) => setCancellationPoint(e.target.value as CancellationPoint)}
                  className="w-full px-3 py-2 border border-orange-300 dark:border-orange-600 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select cancellation point (optional)...</option>
                  {getAvailableCancellationPoints('CASH')[cancellationDirection].map((point) => (
                    <option key={point} value={point}>
                      {getCancellationPointDisplayName(point)}
                    </option>
                  ))}
                </select>

                {/* Zambia Returning Note */}
                {cancellationDirection === 'returning' && (
                  <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                    Note: Zambia returning has two parts - Ndola ({ZAMBIA_RETURNING_PARTS.ndola.liters}L) and Kapiri ({ZAMBIA_RETURNING_PARTS.kapiri.liters}L).
                  </p>
                )}

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
                          {Array.from(existingLPOsForTrucks.entries()).map(([truckNo, lpos]) => (
                            <li key={truckNo} className="text-xs text-red-700 dark:text-red-300">
                              <span className="font-medium">{truckNo}</span>: {lpos.map(l => `LPO #${l.lpoNo}`).join(', ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {!isFetchingLPOs && existingLPOsForTrucks.size === 0 && cancellationPoint && formData.entries && formData.entries.length > 0 && (
                  <div className="mt-3 flex items-center space-x-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    <span>No existing LPOs found for these trucks to cancel</span>
                  </div>
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
                      return (
                        <tr key={index} className={autoFill.fetched ? 'bg-green-50 dark:bg-green-900/20' : 'dark:bg-gray-800'}>
                          <td className="px-3 py-3">
                            <div className="relative">
                              <input
                                type="text"
                                value={entry.truckNo}
                                onChange={(e) => handleTruckNoChange(index, e.target.value)}
                                placeholder="T762 DWK"
                                className="w-28 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                              />
                              {autoFill.loading && (
                                <Loader2 className="absolute right-1 top-1.5 w-4 h-4 text-primary-500 animate-spin" />
                              )}
                              {autoFill.fetched && !autoFill.loading && (
                                <CheckCircle className="absolute right-1 top-1.5 w-4 h-4 text-green-500" />
                              )}
                            </div>
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
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry.liters}
                              onChange={(e) => handleEntryChange(index, 'liters', parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry.rate}
                              onChange={(e) => handleEntryChange(index, 'rate', parseFloat(e.target.value) || 0)}
                              step="0.01"
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="number"
                              value={entry.amount.toFixed(2)}
                              readOnly
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={entry.dest}
                              onChange={(e) => handleEntryChange(index, 'dest', e.target.value)}
                              placeholder="NIL"
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => handleRemoveEntry(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
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
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.entries || formData.entries.length === 0}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {initialData ? 'Update' : 'Create'} LPO Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LPODetailForm;
