/**
 * Cancellation Service
 * Handles cash mode cancellations, driver's account entries, and LPO cancellation tracking
 */

import { 
  CancellationPoint, 
  CancellationInfo, 
  CancellationReport,
  LPODetail,
  LPOSummary,
  DriverAccountEntry
} from '../types';

// Stations by journey direction (for LPO creation)
// These are actual stations where fuel is dispensed
export const GOING_STATIONS = [
  'LAKE CHILABOMBWE',  // Going station in Zambia
];

export const RETURNING_STATIONS = [
  'LAKE NDOLA',   // Returning - first part (50L)
  'LAKE KAPIRI',  // Returning - second part (350L)
];

// Zambia Returning Split Configuration
// Lake Ndola (50L) + Lake Kapiri (350L) = 400L total for Zambia Return
export const ZAMBIA_RETURNING_PARTS = {
  ndola: {
    station: 'LAKE NDOLA',
    liters: 50,
    order: 1, // First station in the sequence
  },
  kapiri: {
    station: 'LAKE KAPIRI',
    liters: 350,
    order: 2, // Second station in the sequence
  },
  total: 400,
};

// Destinations (where trucks are going) - NOT cancellation points
export const DESTINATIONS = [
  'TCC',       // Destination in Zambia
  'ZHANFEI',   // Destination in Zambia
  'KAMOA',     // Destination in Zambia
  'COMIKA',    // Destination in Zambia
  'DAR',       // Dar es Salaam
  'MSA',       // Mombasa
  'Kpm',       // Kapiri Mposhi
  'Likasi',    // Likasi
  'Kolwezi',   // Kolwezi
];

// Cancellation checkpoints - places along the route where trucks can cancel fuel orders
// Going direction checkpoints
export const GOING_CHECKPOINTS: CancellationPoint[] = [
  'DAR_GOING',      // Dar es Salaam checkpoint (Going)
  'MORO_GOING',     // Morogoro checkpoint (Going)
  'MBEYA_GOING',    // Mbeya checkpoint (Going)
  'TDM_GOING',      // TDM/Tunduma checkpoint (Going)
  'ZAMBIA_GOING',   // Zambia entry (Going) - Lake Chilabombwe
  'CONGO_GOING',    // Congo (Going)
];

// Returning direction checkpoints
export const RETURNING_CHECKPOINTS: CancellationPoint[] = [
  'ZAMBIA_RETURNING', // Zambia returning (combined)
  'TDM_RETURN',       // TDM/Tunduma (Returning)
  'MBEYA_RETURN',     // Mbeya (Returning)
  'MORO_RETURN',      // Morogoro (Returning)
  'DAR_RETURN',       // Dar es Salaam (Returning)
  'TANGA_RETURN',     // Tanga (Returning - alternative route)
  'CONGO_RETURNING',  // Congo (Returning)
];

// Map station names to cancellation points
// Used when a station is selected to determine which checkpoint the cancellation applies to
export const STATION_TO_CANCELLATION_POINT: Record<string, CancellationPoint> = {
  // Going stations/checkpoints
  'DAR GOING': 'DAR_GOING',
  'MORO GOING': 'MORO_GOING',
  'MBEYA GOING': 'MBEYA_GOING',
  'INFINITY': 'INFINITY_GOING',
  'TDM GOING': 'TDM_GOING',
  'ZAMBIA GOING': 'ZAMBIA_GOING',
  'LAKE CHILABOMBWE': 'ZAMBIA_GOING',
  // Returning stations/checkpoints
  'LAKE NDOLA': 'ZAMBIA_RETURNING',
  'LAKE KAPIRI': 'ZAMBIA_RETURNING',
  'TDM RETURN': 'TDM_RETURN',
  'MBEYA RETURN': 'MBEYA_RETURN',
  'MORO RETURN': 'MORO_RETURN',
  'DAR RETURN': 'DAR_RETURN',
  'TANGA RETURN': 'TANGA_RETURN'
  // Note: TCC, ZHANFEI, KAMOA, COMIKA are DESTINATIONS, not checkpoints
};

/**
 * Map cancellation points to fuel record fields
 * This is used to update the correct column in the fuel record when CASH is used
 * The fuel record tracks fuel consumption at each checkpoint along the route
 */
export const CANCELLATION_POINT_TO_FUEL_FIELD: Record<CancellationPoint, string> = {
  // Going direction checkpoints
  'DAR_GOING': 'darGoing',
  'MORO_GOING': 'moroGoing',
  'MBEYA_GOING': 'mbeyaGoing',
  'TDM_GOING': 'tdmGoing',
  'ZAMBIA_GOING': 'zambiaGoing',
  'CONGO_GOING': 'congoFuel',        // Congo (Going) maps to congoFuel column
  // Returning direction checkpoints
  'ZAMBIA_RETURNING': 'zambiaReturn', // Zambia returning (combined)
  'TDM_RETURN': 'tundumaReturn',
  'MBEYA_RETURN': 'mbeyaReturn',
  'MORO_RETURN': 'moroReturn',
  'DAR_RETURN': 'darReturn',
  'TANGA_RETURN': 'tangaReturn',
  'CONGO_RETURNING': 'congoFuel',    // Congo (Returning) also maps to congoFuel column
  // Custom station checkpoints (dynamically mapped to selected fuel record field)
  'CUSTOM_GOING': 'darGoing',     // Default, but actual field is determined by customGoingCheckpoint
  'CUSTOM_RETURN': 'darReturn',   // Default, but actual field is determined by customReturnCheckpoint
};

/**
 * Available fuel record columns for custom station mapping
 * These are the checkpoint columns where custom station fuel can be recorded
 */
export const FUEL_RECORD_COLUMNS = {
  going: [
    { field: 'darGoing', label: 'Dar Going' },
    { field: 'moroGoing', label: 'Moro Going' },
    { field: 'mbeyaGoing', label: 'Mbeya Going' },
    { field: 'tdmGoing', label: 'TDM/Tunduma Going' },
    { field: 'zambiaGoing', label: 'Zambia Going' },
    { field: 'congoFuel', label: 'Congo' },
  ],
  return: [
    { field: 'zambiaReturn', label: 'Zambia Return' },
    { field: 'tundumaReturn', label: 'Tunduma Return' },
    { field: 'mbeyaReturn', label: 'Mbeya Return' },
    { field: 'moroReturn', label: 'Moro Return' },
    { field: 'darReturn', label: 'Dar Return' },
    { field: 'tangaReturn', label: 'Tanga Return' },
    { field: 'congoFuel', label: 'Congo' },
  ],
};

/**
 * Get the fuel record field for a given cancellation point
 * @param cancellationPoint The checkpoint where fuel was purchased via cash
 * @returns The corresponding fuel record field name
 */
export const getFuelRecordFieldFromCancellationPoint = (cancellationPoint: CancellationPoint): string => {
  return CANCELLATION_POINT_TO_FUEL_FIELD[cancellationPoint] || 'darGoing';
};

// Get cancellation point display name
export const getCancellationPointDisplayName = (point: CancellationPoint): string => {
  const displayNames: Record<CancellationPoint, string> = {
    'DAR_GOING': 'Dar Going',
    'MORO_GOING': 'Moro Going',
    'MBEYA_GOING': 'Mbeya Going',
    'TDM_GOING': 'TDM/Tunduma Going',
    'ZAMBIA_GOING': 'Zambia Going',
    'CONGO_GOING': 'Congo',
    'ZAMBIA_RETURNING': 'Zambia Returning',
    'TDM_RETURN': 'TDM/Tunduma Return',
    'MBEYA_RETURN': 'Mbeya Return',
    'MORO_RETURN': 'Moro Return',
    'DAR_RETURN': 'Dar Return',
    'TANGA_RETURN': 'Tanga Return',
    'CONGO_RETURNING': 'Congo',
    'CUSTOM_GOING': 'Custom Station (Going)',
    'CUSTOM_RETURN': 'Custom Station (Return)'
  };
  return displayNames[point] || point;
};

/**
 * Auto-detect cancellation point based on station and direction
 * This eliminates the need for user to manually select the checkpoint
 * @param station - The LPO station (e.g., 'CASH', 'LAKE CHILABOMBWE', etc.)
 * @param direction - The direction of the journey ('going' or 'returning')
 * @returns The appropriate cancellation point
 */
export const getAutoCancellationPoint = (station: string, direction: 'going' | 'returning'): CancellationPoint => {
  const stationUpper = station.toUpperCase().trim();
  
  // Direct mapping for specific stations
  const stationMapping = STATION_TO_CANCELLATION_POINT[stationUpper];
  if (stationMapping) {
    return stationMapping;
  }
  
  // For CASH station, determine based on direction
  if (stationUpper === 'CASH') {
    // Default cancellation points for CASH based on direction
    return direction === 'going' ? 'ZAMBIA_GOING' : 'ZAMBIA_RETURNING';
  }
  
  // For stations containing "LAKE" (Zambian stations)
  if (stationUpper.includes('LAKE')) {
    if (stationUpper.includes('CHILABOMBWE')) return 'ZAMBIA_GOING';
    if (stationUpper.includes('NDOLA')) return 'ZAMBIA_RETURNING';
    if (stationUpper.includes('KAPIRI')) return 'ZAMBIA_RETURNING';
    if (stationUpper.includes('TUNDUMA')) return direction === 'going' ? 'TDM_GOING' : 'TDM_RETURN';
    // Default for other LAKE stations based on direction
    return direction === 'going' ? 'ZAMBIA_GOING' : 'ZAMBIA_RETURNING';
  }
  
  // For INFINITY (Mbeya area)
  if (stationUpper.includes('INFINITY')) {
    return direction === 'going' ? 'MBEYA_GOING' : 'MBEYA_RETURN';
  }
  
  // For GBP/GPB stations
  if (stationUpper.includes('GBP') || stationUpper.includes('GPB')) {
    if (stationUpper.includes('MOROGORO') || stationUpper.includes('MORO')) {
      return direction === 'going' ? 'MORO_GOING' : 'MORO_RETURN';
    }
    if (stationUpper.includes('KANGE') || stationUpper.includes('TANGA')) {
      return 'TANGA_RETURN';
    }
  }
  
  // Default fallback based on direction
  return direction === 'going' ? 'DAR_GOING' : 'DAR_RETURN';
};

/**
 * Get stations that correspond to a specific cancellation point
 * Used to filter LPOs when showing which ones to cancel
 * @param cancellationPoint - The checkpoint (e.g., 'ZAMBIA_GOING')
 * @returns Array of station names that map to this checkpoint
 */
export const getStationsForCancellationPoint = (cancellationPoint: CancellationPoint): string[] => {
  // Reverse mapping: checkpoint -> stations
  const checkpointToStations: Record<CancellationPoint, string[]> = {
    'DAR_GOING': ['DAR GOING'],
    'MORO_GOING': ['MORO GOING', 'GBP MOROGORO'],
    'MBEYA_GOING': ['MBEYA GOING', 'INFINITY'],
    'TDM_GOING': ['TDM GOING', 'LAKE TUNDUMA'],
    'ZAMBIA_GOING': ['ZAMBIA GOING', 'LAKE CHILABOMBWE'],
    'CONGO_GOING': ['CONGO'],
    'ZAMBIA_RETURNING': ['ZAMBIA RETURN', 'LAKE NDOLA', 'LAKE KAPIRI'],
    'TDM_RETURN': ['TDM RETURN', 'LAKE TUNDUMA'],
    'MBEYA_RETURN': ['MBEYA RETURN', 'INFINITY'],
    'MORO_RETURN': ['MORO RETURN', 'GBP MOROGORO'],
    'DAR_RETURN': ['DAR RETURN'],
    'TANGA_RETURN': ['TANGA RETURN', 'GBP KANGE'],
    'CONGO_RETURNING': ['CONGO'],
    'CUSTOM_GOING': [],  // Custom stations don't have predefined names
    'CUSTOM_RETURN': [],
  };
  
  return checkpointToStations[cancellationPoint] || [];
};

// Get available cancellation points (checkpoints) based on journey direction
export const getAvailableCancellationPoints = (_paymentMode: 'CASH' | 'DRIVER_ACCOUNT'): {
  going: CancellationPoint[];
  returning: CancellationPoint[];
} => {
  return {
    going: GOING_CHECKPOINTS,
    returning: RETURNING_CHECKPOINTS
  };
};

/**
 * Create cancellation info for a truck entry
 */
export const createCancellationInfo = (
  cancellationPoint: CancellationPoint,
  cancellationStation: string,
  cancelledBy: string,
  originalLpoNo?: string,
  cashLpoNo?: string,
  reason?: string
): CancellationInfo => {
  return {
    isCancelled: true,
    cancellationPoint,
    cancellationStation,
    cancelledAt: new Date().toISOString(),
    cancelledBy,
    reason: reason || 'Entry cancelled - fuel allocation reverted',
    originalLpoNo,
    cashLpoNo
  };
};

/**
 * Generate cancellation report for an LPO
 */
export const generateCancellationReport = (lpo: LPOSummary): CancellationReport => {
  const cancelledEntries = lpo.entries.filter(e => e.isCancelled);
  const activeEntries = lpo.entries.filter(e => !e.isCancelled);
  
  const isFullyCancelled = activeEntries.length === 0 && cancelledEntries.length > 0;
  
  // Generate report text
  let reportText = '';
  
  if (isFullyCancelled) {
    reportText = `LPO ${lpo.lpoNo} is fully cancelled - all ${cancelledEntries.length} entries have been reverted.`;
  } else if (cancelledEntries.length > 0) {
    const cancelledTrucksList = cancelledEntries
      .map(e => e.truckNo)
      .join(', ');
    reportText = `In LPO ${lpo.lpoNo}: Trucks ${cancelledTrucksList} cancelled (${cancelledEntries.length} of ${lpo.entries.length} entries).`;
  } else {
    reportText = `LPO ${lpo.lpoNo} has no cancelled entries.`;
  }
  
  return {
    lpoNo: lpo.lpoNo,
    date: lpo.date,
    station: lpo.station,
    isFullyCancelled,
    cancelledTrucks: cancelledEntries.map(e => ({
      truckNo: e.truckNo,
      doNo: e.doNo,
      cancellationPoint: e.cancellationPoint || 'ZAMBIA_GOING',
      liters: e.liters
    })),
    activeTrucks: activeEntries.map(e => ({
      truckNo: e.truckNo,
      doNo: e.doNo,
      liters: e.liters
    })),
    reportText
  };
};

/**
 * Generate detailed cancellation statement for copying
 */
export const generateCancellationStatement = (reports: CancellationReport[]): string => {
  const statements: string[] = [];
  
  const fullyCancelledLpos = reports.filter(r => r.isFullyCancelled);
  const partiallyCancelledLpos = reports.filter(r => !r.isFullyCancelled && r.cancelledTrucks.length > 0);
  
  // Fully cancelled LPOs
  if (fullyCancelledLpos.length > 0) {
    const lpoNumbers = fullyCancelledLpos.map(r => r.lpoNo).join(', ');
    statements.push(`Fully Cancelled LPOs: ${lpoNumbers}`);
  }
  
  // Partially cancelled LPOs
  partiallyCancelledLpos.forEach(report => {
    const truckList = report.cancelledTrucks
      .map(t => `${t.truckNo} at ${getCancellationPointDisplayName(t.cancellationPoint)}`)
      .join('; ');
    statements.push(`LPO ${report.lpoNo}: Cancelled trucks - ${truckList}`);
  });
  
  return statements.join('\n');
};

/**
 * Check if a truck entry should display NIL for DO and destination
 * (for driver's account entries or certain cash scenarios)
 */
export const shouldShowNilValues = (entry: LPODetail): boolean => {
  return entry.isDriverAccount === true;
};

/**
 * Format entry for display - handles NIL values
 */
export const formatEntryForDisplay = (entry: LPODetail): {
  doNo: string;
  dest: string;
  displayClass: string;
} => {
  if (entry.isCancelled) {
    return {
      doNo: 'CANCELLED',
      dest: entry.dest,
      displayClass: 'text-red-600 line-through'
    };
  }
  
  if (entry.isDriverAccount) {
    return {
      doNo: 'NIL',
      dest: 'NIL',
      displayClass: 'text-orange-600'
    };
  }
  
  return {
    doNo: entry.doNo,
    dest: entry.dest,
    displayClass: ''
  };
};

/**
 * Create driver's account entry
 */
export const createDriverAccountEntry = (
  truckNo: string,
  doNo: string,  // Reference DO (won't be displayed)
  liters: number,
  rate: number,
  station: string,
  lpoNo: string,
  createdBy: string,
  driverName?: string,
  notes?: string
): DriverAccountEntry => {
  return {
    date: new Date().toISOString().split('T')[0],
    truckNo,
    driverName,
    doNo,
    liters,
    rate,
    amount: liters * rate,
    station,
    lpoNo,
    createdBy,
    createdAt: new Date().toISOString(),
    notes
  };
};

/**
 * Local storage key for cancellation reports history
 */
const CANCELLATION_HISTORY_KEY = 'fuel_order_cancellation_history';

/**
 * Save cancellation report to history
 */
export const saveCancellationToHistory = (report: CancellationReport): void => {
  try {
    const history = getCancellationHistory();
    history.unshift({
      ...report,
      savedAt: new Date().toISOString()
    });
    // Keep only last 100 reports
    const trimmedHistory = history.slice(0, 100);
    localStorage.setItem(CANCELLATION_HISTORY_KEY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Error saving cancellation to history:', error);
  }
};

/**
 * Get cancellation history
 */
export const getCancellationHistory = (): (CancellationReport & { savedAt: string })[] => {
  try {
    const stored = localStorage.getItem(CANCELLATION_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading cancellation history:', error);
    return [];
  }
};

/**
 * Clear cancellation history
 */
export const clearCancellationHistory = (): void => {
  localStorage.removeItem(CANCELLATION_HISTORY_KEY);
};

export default {
  GOING_STATIONS,
  RETURNING_STATIONS,
  ZAMBIA_RETURNING_PARTS,
  STATION_TO_CANCELLATION_POINT,
  CANCELLATION_POINT_TO_FUEL_FIELD,
  FUEL_RECORD_COLUMNS,
  getCancellationPointDisplayName,
  getAvailableCancellationPoints,
  getFuelRecordFieldFromCancellationPoint,
  getAutoCancellationPoint,
  getStationsForCancellationPoint,
  createCancellationInfo,
  generateCancellationReport,
  generateCancellationStatement,
  shouldShowNilValues,
  formatEntryForDisplay,
  createDriverAccountEntry,
  saveCancellationToHistory,
  getCancellationHistory,
  clearCancellationHistory
};
