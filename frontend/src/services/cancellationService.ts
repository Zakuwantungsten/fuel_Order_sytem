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
  'INFINITY_GOING', // Infinity/Mbeya area (Going)
  'TDM_GOING',      // TDM/Tunduma checkpoint (Going)
  'ZAMBIA_GOING',   // Zambia entry (Going) - Lake Chilabombwe
];

// Returning direction checkpoints
export const RETURNING_CHECKPOINTS: CancellationPoint[] = [
  'ZAMBIA_NDOLA',   // Zambia - Ndola part (50L)
  'ZAMBIA_KAPIRI',  // Zambia - Kapiri part (350L)
  'TDM_RETURN',     // TDM/Tunduma (Returning)
  'MBEYA_RETURN',   // Mbeya (Returning)
  'MORO_RETURN',    // Morogoro (Returning)
  'DAR_RETURN',     // Dar es Salaam (Returning)
  'TANGA_RETURN',   // Tanga (Returning - alternative route)
];

// Zambia returning has two parts
export const ZAMBIA_RETURNING_PARTS = {
  ndola: { name: 'LAKE NDOLA', liters: 50, point: 'ZAMBIA_NDOLA' as CancellationPoint },
  kapiri: { name: 'LAKE KAPIRI', liters: 350, point: 'ZAMBIA_KAPIRI' as CancellationPoint }
};

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
  'LAKE NDOLA': 'ZAMBIA_NDOLA',
  'LAKE KAPIRI': 'ZAMBIA_KAPIRI',
  'TDM RETURN': 'TDM_RETURN',
  'MBEYA RETURN': 'MBEYA_RETURN',
  'MORO RETURN': 'MORO_RETURN',
  'DAR RETURN': 'DAR_RETURN',
  'TANGA RETURN': 'TANGA_RETURN'
  // Note: TCC, ZHANFEI, KAMOA, COMIKA are DESTINATIONS, not checkpoints
};

// Get cancellation point display name
export const getCancellationPointDisplayName = (point: CancellationPoint): string => {
  const displayNames: Record<CancellationPoint, string> = {
    'DAR_GOING': 'Dar Going',
    'MORO_GOING': 'Moro Going',
    'MBEYA_GOING': 'Mbeya Going',
    'INFINITY_GOING': 'Infinity (Mbeya)',
    'TDM_GOING': 'TDM/Tunduma Going',
    'ZAMBIA_GOING': 'Zambia Going (Lake Chilabombwe)',
    'ZAMBIA_NDOLA': 'Zambia Returning (Ndola - 50L)',
    'ZAMBIA_KAPIRI': 'Zambia Returning (Kapiri - 350L)',
    'TDM_RETURN': 'TDM/Tunduma Return',
    'MBEYA_RETURN': 'Mbeya Return',
    'MORO_RETURN': 'Moro Return',
    'DAR_RETURN': 'Dar Return',
    'TANGA_RETURN': 'Tanga Return'
  };
  return displayNames[point] || point;
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
    reason: reason || 'Station out of fuel - bought cash from other station',
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
    reportText = `LPO ${lpo.lpoNo} is fully cancelled - all trucks got cash mode payment.`;
  } else if (cancelledEntries.length > 0) {
    const cancelledTrucksList = cancelledEntries
      .map(e => e.truckNo)
      .join(', ');
    reportText = `In LPO ${lpo.lpoNo}: Trucks ${cancelledTrucksList} are cancelled (cash mode payment).`;
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
  getCancellationPointDisplayName,
  getAvailableCancellationPoints,
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
