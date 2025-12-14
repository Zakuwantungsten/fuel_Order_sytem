import { DeliveryOrder, FuelRecord, LPOEntry } from '../types';
import { deliveryOrdersAPI, fuelRecordsAPI } from './api';
import FuelConfigService from './fuelConfigService';

/**
 * LPO Auto-Fetch Service
 * Automatically determines the correct DO (going/returning) based on truck number
 * and station, then provides default fuel amounts and rates
 */

export interface DOSelectionResult {
  doNumber: string;
  doType: 'going' | 'returning';
  deliveryOrder: DeliveryOrder;
  fuelRecord?: FuelRecord;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface StationFuelDefaults {
  station: string;
  goingFuel?: number;
  returningFuel?: number;
  rate: number;
  checkpoint: string;
}

// Station to checkpoint mapping
const STATION_CHECKPOINT_MAP: Record<string, { checkpoint: string; direction: 'going' | 'returning' | 'both' }> = {
  'LAKE CHILABOMBWE': { checkpoint: 'zambiaGoing', direction: 'both' },
  'LAKE NDOLA': { checkpoint: 'zambiaReturn', direction: 'returning' },
  'LAKE KAPIRI': { checkpoint: 'zambiaReturn', direction: 'returning' },
  'CASH': { checkpoint: 'zambiaGoing', direction: 'both' },
  'TCC': { checkpoint: 'zambiaGoing', direction: 'both' },
  'ZHANFEI': { checkpoint: 'zambiaGoing', direction: 'both' },
  'KAMOA': { checkpoint: 'zambiaGoing', direction: 'both' },
  'COMIKA': { checkpoint: 'zambiaGoing', direction: 'both' },
  'MBEYA_STATION': { checkpoint: 'mbeyaGoing', direction: 'going' },
  'TUNDUMA_STATION': { checkpoint: 'tundumaReturn', direction: 'returning' },
};

/**
 * Get station fuel defaults based on station name and DO type
 */
export function getStationFuelDefaults(station: string, doType: 'going' | 'returning'): StationFuelDefaults | null {
  const config = FuelConfigService.loadConfig();
  
  // Zambia Going stations (used by both going and returning, but different amounts)
  if (['LAKE CHILABOMBWE', 'CASH', 'TCC', 'ZHANFEI', 'KAMOA', 'COMIKA'].includes(station)) {
    if (doType === 'going') {
      return {
        station,
        goingFuel: 260, // Default for standard going truck
        rate: config.defaultFuelPrice,
        checkpoint: 'zambiaGoing'
      };
    } else {
      return {
        station,
        returningFuel: 0, // Returning trucks don't typically fill at these stations
        rate: config.defaultFuelPrice,
        checkpoint: 'zambiaReturn'
      };
    }
  }
  
  // Zambia Return specific stations
  if (station === 'LAKE NDOLA') {
    return {
      station,
      returningFuel: config.zambiaReturnStations.lakeNdola.liters,
      rate: config.defaultFuelPrice,
      checkpoint: 'zambiaReturn'
    };
  }
  
  if (station === 'LAKE KAPIRI') {
    return {
      station,
      returningFuel: config.zambiaReturnStations.lakeKapiri.liters,
      rate: config.defaultFuelPrice,
      checkpoint: 'zambiaReturn'
    };
  }
  
  // Mbeya Going
  if (station === 'MBEYA_STATION') {
    return {
      station,
      goingFuel: config.standardAllocations.mbeyaGoing,
      rate: config.defaultFuelPrice,
      checkpoint: 'mbeyaGoing'
    };
  }
  
  // Tunduma Return
  if (station === 'TUNDUMA_STATION') {
    return {
      station,
      returningFuel: config.standardAllocations.tundumaReturn,
      rate: config.defaultFuelPrice,
      checkpoint: 'tundumaReturn'
    };
  }
  
  return null;
}

/**
 * Check if truck has already taken fuel at Zambia Going checkpoint
 * Only considers active (non-cancelled) fuel records
 */
async function hasTakenZambiaGoingFuel(truckNo: string, doNumber: string): Promise<boolean> {
  try {
    const response = await fuelRecordsAPI.getAll({ truckNo, limit: 10000 });
    const fuelRecords = response.data;
    
    // Filter out cancelled fuel records
    const activeFuelRecords = fuelRecords.filter((r: FuelRecord) => !r.isCancelled);
    
    // Find fuel record for this DO (only from active records)
    const record = activeFuelRecords.find(
      (r: FuelRecord) => r.goingDo === doNumber || r.returnDo === doNumber
    );
    
    if (!record) return false;
    
    // Check if zambiaGoing field has a value (negative number in records)
    return record.zambiaGoing !== undefined && record.zambiaGoing !== 0;
  } catch (error) {
    console.error('Error checking Zambia Going fuel:', error);
    return false;
  }
}

/**
 * Determine if a station is below or at/after Zambia Going
 */
function isStationBelowZambiaGoing(station: string): boolean {
  const belowStations = ['MBEYA_STATION', 'TUNDUMA_STATION', 'DAR_STATION'];
  return belowStations.includes(station);
}

/**
 * Find the correct DO for a truck at a specific station
 */
export async function findCorrectDOForTruck(
  truckNo: string,
  station: string
): Promise<DOSelectionResult | null> {
  try {
    // Calculate date limit: 4 months ago (120 days) for DO and fuel record searches
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setDate(fourMonthsAgo.getDate() - 120);
    const dateLimit = fourMonthsAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Fetch DOs for this truck from last 4 months only
    const doResponse = await deliveryOrdersAPI.getAll({ truckNo, dateFrom: dateLimit, limit: 10000 });
    const allDOs = doResponse.data;
    
    if (!allDOs || allDOs.length === 0) {
      return null;
    }
    
    // Get fuel records for this truck from last 4 months only
    const response = await fuelRecordsAPI.getAll({ truckNo, dateFrom: dateLimit, limit: 10000 });
    const fuelRecords = response.data;
    
    // Filter out cancelled DOs - only work with active DOs
    const activeDOs = allDOs.filter((do_: DeliveryOrder) => !do_.isCancelled);
    
    // Filter out cancelled fuel records - ignore cancelled records as if they don't exist
    const activeFuelRecords = fuelRecords.filter((r: FuelRecord) => !r.isCancelled);
    
    if (activeDOs.length === 0) {
      return null;
    }
    
    // Separate going (IMPORT) and returning (EXPORT) DOs from active DOs only
    const goingDOs = activeDOs.filter((do_: DeliveryOrder) => do_.importOrExport === 'IMPORT');
    const returningDOs = activeDOs.filter((do_: DeliveryOrder) => do_.importOrExport === 'EXPORT');
    
    // Get station info
    const stationInfo = STATION_CHECKPOINT_MAP[station];
    
    if (!stationInfo) {
      // Unknown station, default to going DO
      if (goingDOs.length > 0) {
        return {
          doNumber: goingDOs[0].doNumber,
          doType: 'going',
          deliveryOrder: goingDOs[0],
          confidence: 'low',
          reason: 'Unknown station, defaulting to going DO'
        };
      }
      return null;
    }
    
    // Check what direction(s) this station serves
    const { direction } = stationInfo;
    
    // LOGIC: Determine which DO to use based on fuel records
    
    // 1. If station is ONLY for returning trucks
    if (direction === 'returning') {
      if (returningDOs.length > 0) {
        const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.returnDo === returningDOs[0].doNumber);
        return {
          doNumber: returningDOs[0].doNumber,
          doType: 'returning',
          deliveryOrder: returningDOs[0],
          fuelRecord,
          confidence: 'high',
          reason: `${station} is a returning-only station`
        };
      }
      return null;
    }
    
    // 2. If station is ONLY for going trucks
    if (direction === 'going') {
      if (goingDOs.length > 0) {
        const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.goingDo === goingDOs[0].doNumber);
        return {
          doNumber: goingDOs[0].doNumber,
          doType: 'going',
          deliveryOrder: goingDOs[0],
          fuelRecord,
          confidence: 'high',
          reason: `${station} is a going-only station`
        };
      }
      return null;
    }
    
    // 3. Station serves BOTH going and returning trucks (e.g., Zambia Going stations)
    // Need to determine based on fuel records
    
    // Check if truck has both going and returning DOs
    if (goingDOs.length > 0 && returningDOs.length > 0) {
      const goingDO = goingDOs[0];
      const returningDO = returningDOs[0];
      
      // Check if truck has already taken fuel at Zambia Going on the going DO
      const hasTakenGoingFuel = await hasTakenZambiaGoingFuel(truckNo, goingDO.doNumber);
      
      // If truck is below Zambia Going stations (e.g., at Mbeya or Tunduma)
      if (isStationBelowZambiaGoing(station)) {
        // Use going DO
        const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.goingDo === goingDO.doNumber);
        return {
          doNumber: goingDO.doNumber,
          doType: 'going',
          deliveryOrder: goingDO,
          fuelRecord,
          confidence: 'high',
          reason: `Station is below Zambia Going, so using going DO`
        };
      }
      
      // If at Zambia Going stations
      if (hasTakenGoingFuel) {
        // Truck already took fuel on going journey, so this is return
        const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.returnDo === returningDO.doNumber);
        return {
          doNumber: returningDO.doNumber,
          doType: 'returning',
          deliveryOrder: returningDO,
          fuelRecord,
          confidence: 'high',
          reason: `Truck already took fuel at ${station} on going journey, so this is returning`
        };
      } else {
        // Truck hasn't taken fuel yet, so this is going
        const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.goingDo === goingDO.doNumber);
        return {
          doNumber: goingDO.doNumber,
          doType: 'going',
          deliveryOrder: goingDO,
          fuelRecord,
          confidence: 'high',
          reason: `Truck hasn't taken fuel at ${station} yet, so this is going`
        };
      }
    }
    
    // Only has going DO
    if (goingDOs.length > 0) {
      const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.goingDo === goingDOs[0].doNumber);
      return {
        doNumber: goingDOs[0].doNumber,
        doType: 'going',
        deliveryOrder: goingDOs[0],
        fuelRecord,
        confidence: 'medium',
        reason: 'Only going DO available for this truck'
      };
    }
    
    // Only has returning DO
    if (returningDOs.length > 0) {
      const fuelRecord = activeFuelRecords.find((r: FuelRecord) => r.returnDo === returningDOs[0].doNumber);
      return {
        doNumber: returningDOs[0].doNumber,
        doType: 'returning',
        deliveryOrder: returningDOs[0],
        fuelRecord,
        confidence: 'medium',
        reason: 'Only returning DO available for this truck'
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error finding correct DO:', error);
    return null;
  }
}

/**
 * Get auto-fill data for LPO form
 */
export async function getAutoFillDataForLPO(
  truckNo: string,
  station: string
): Promise<{
  doNumber: string;
  doType: 'going' | 'returning';
  liters: number;
  rate: number;
  destination: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  allowCustom: boolean;
} | null> {
  try {
    // Find the correct DO
    const doResult = await findCorrectDOForTruck(truckNo, station);
    
    if (!doResult) {
      return null;
    }
    
    // Get station fuel defaults
    const defaults = getStationFuelDefaults(station, doResult.doType);
    
    if (!defaults) {
      return null;
    }
    
    // Determine fuel amount
    let liters = 0;
    if (doResult.doType === 'going' && defaults.goingFuel) {
      liters = defaults.goingFuel;
    } else if (doResult.doType === 'returning' && defaults.returningFuel) {
      liters = defaults.returningFuel;
    }
    
    // For Zambia Going stations, calculate based on fuel record if available
    if (doResult.fuelRecord && doResult.doType === 'going' && station !== 'LAKE NDOLA' && station !== 'LAKE KAPIRI') {
      const totalLiters = doResult.fuelRecord.totalLts || 0;
      const extra = doResult.fuelRecord.extra || 0;
      const totalFuel = totalLiters + extra;
      
      // Standard calculation: (totalLiters + extra) - 900
      const calculatedFuel = totalFuel - 900;
      
      // Check for special destinations
      const destination = doResult.deliveryOrder.destination?.toUpperCase() || '';
      if (destination.includes('LUSAKA')) {
        liters = 60;
      } else if (destination.includes('LUBUMBASHI') || destination.includes('LUBUMBASH')) {
        liters = 260;
      } else if (calculatedFuel > 0) {
        liters = calculatedFuel;
      }
    }
    
    return {
      doNumber: doResult.doNumber,
      doType: doResult.doType,
      liters,
      rate: defaults.rate,
      destination: doResult.deliveryOrder.destination || '',
      confidence: doResult.confidence,
      reason: doResult.reason,
      allowCustom: true // Always allow user to override
    };
  } catch (error) {
    console.error('Error getting auto-fill data:', error);
    return null;
  }
}

/**
 * Deduct fuel from fuel record when LPO is created
 */
export async function deductFuelFromRecord(
  lpoEntry: Partial<LPOEntry>,
  doNumber: string,
  station: string,
  liters: number
): Promise<FuelRecord | null> {
  try {
    // Calculate date limit: 4 months ago (120 days)
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setDate(fourMonthsAgo.getDate() - 120);
    const dateLimit = fourMonthsAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Find the fuel record for this DO from last 4 months only
    const response = await fuelRecordsAPI.getAll({ 
      truckNo: lpoEntry.truckNo,
      dateFrom: dateLimit,
      limit: 10000
    });
    const fuelRecords = response.data;
    
    // Filter out cancelled fuel records - only work with active records
    const activeFuelRecords = fuelRecords.filter((r: FuelRecord) => !r.isCancelled);
    
    const record = activeFuelRecords.find(
      (r: FuelRecord) => r.goingDo === doNumber || r.returnDo === doNumber
    );
    
    if (!record) {
      console.warn('No active fuel record found for DO:', doNumber);
      return null;
    }
    
    // Get the checkpoint field to update
    const stationInfo = STATION_CHECKPOINT_MAP[station];
    if (!stationInfo) {
      console.warn('Unknown station:', station);
      return null;
    }
    
    const checkpoint = stationInfo.checkpoint;
    
    // Update the fuel record
    const updatedRecord: Partial<FuelRecord> = {
      ...record,
      [checkpoint]: -liters // Fuel allocations are stored as negative values
    };
    
    // Save the updated record
    if (record.id) {
      await fuelRecordsAPI.update(record.id, updatedRecord);
      return updatedRecord as FuelRecord;
    }
    
    return null;
  } catch (error) {
    console.error('Error deducting fuel from record:', error);
    return null;
  }
}

export default {
  findCorrectDOForTruck,
  getStationFuelDefaults,
  getAutoFillDataForLPO,
  deductFuelFromRecord
};
