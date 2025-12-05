import { DeliveryOrder, FuelRecord } from '../types';
import FuelConfigService from './fuelConfigService';

/**
 * Fuel Record Service
 * Handles all automatic fuel record calculations and LPO generation
 */

interface FuelAllocation {
  tangaYard?: number;
  darYard?: number;
  darGoing?: number;
  moroGoing?: number;
  mbeyaGoing?: number;
  tdmGoing?: number;
  zambiaGoing?: number;
  congoFuel?: number;
  zambiaReturn?: number;
  tundumaReturn?: number;
  mbeyaReturn?: number;
  moroReturn?: number;
  darReturn?: number;
  tangaReturn?: number;
}

interface LPOToGenerate {
  station: string;
  truckNo: string;
  doNo: string;
  liters: number;
  destination: string;
  checkpoint: string;
}

/**
 * Determine extra fuel allocation based on truck batch
 */
export function calculateExtraFuel(truckNo: string): number {
  const result = FuelConfigService.getExtraFuel(truckNo);
  return result.extraFuel;
}

/**
 * Extract month name with year from date string (e.g., "2025-11-29" -> "November 2025")
 */
export function extractMonthFromDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
  } catch (error) {
    // Fallback to current month
    const now = new Date();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  }
}

/**
 * Determine journey start location from DO data
 */
export function determineJourneyStart(deliveryOrder: DeliveryOrder): 'TANGA' | 'DAR' {
  // Analyze loading point or start location
  const loadingPoint = deliveryOrder.loadingPoint?.toLowerCase() || '';
  
  if (loadingPoint.includes('tanga')) {
    return 'TANGA';
  }
  
  // Default to DAR for most cases
  return 'DAR';
}

/**
 * Determine if truck is going to Mombasa based on destination
 */
export function isDestinationMombasa(destination: string): boolean {
  return destination?.toLowerCase().includes('mombasa') || false;
}

/**
 * Calculate fuel allocations for a going journey (IMPORT)
 */
export function calculateGoingFuelAllocations(
  deliveryOrder: DeliveryOrder,
  extra: number,
  totalLiters: number,
  loadingPoint: 'DAR_YARD' | 'KISARAWE' | 'DAR_STATION'
): FuelAllocation {
  const config = FuelConfigService.loadConfig();
  const allocations: FuelAllocation = {};
  const destination = deliveryOrder.destination?.toUpperCase() || '';
  const start = determineJourneyStart(deliveryOrder);
  
  // Step 1: Handle start location
  if (start === 'TANGA') {
    allocations.tangaYard = config.standardAllocations.tangaYardToDar;
  }
  
  // Step 2: Handle Dar loading
  if (loadingPoint === 'DAR_YARD') {
    allocations.darYard = config.standardAllocations.darYardStandard;
  } else if (loadingPoint === 'KISARAWE') {
    allocations.darYard = config.standardAllocations.darYardKisarawe;
  } else if (loadingPoint === 'DAR_STATION') {
    // Fuel purchased at station in Dar (not yard)
    // This will need an LPO
    allocations.darGoing = totalLiters; // Custom amount given
  }
  
  // Step 3: Calculate Mbeya Going
  if (loadingPoint === 'DAR_STATION') {
    // Subtract 550 from what was given, then add 450
    const remaining = totalLiters - 550;
    allocations.mbeyaGoing = remaining + config.standardAllocations.mbeyaGoing;
  } else {
    // If got fuel at yard (550 or 580), just give 450 at Mbeya
    allocations.mbeyaGoing = config.standardAllocations.mbeyaGoing;
  }
  
  // Step 4: Calculate Zambia Going (or Congo for special destinations)
  const totalFuelSoFar = totalLiters + extra;
  
  // Check for special destinations
  if (destination.includes('LUSAKA')) {
    allocations.zambiaGoing = config.specialDestinations.lusaka;
  } else if (destination.includes('LUBUMBASHI') || destination.includes('LUBUMBASH')) {
    allocations.zambiaGoing = config.specialDestinations.lubumbashi;
  } else {
    // Standard calculation: (totalLiters + extra) - 900
    allocations.zambiaGoing = totalFuelSoFar - 900;
  }
  
  return allocations;
}

/**
 * Calculate fuel allocations for a return journey (EXPORT)
 */
export function calculateReturnFuelAllocations(
  deliveryOrder: DeliveryOrder
): FuelAllocation {
  const config = FuelConfigService.loadConfig();
  const allocations: FuelAllocation = {};
  const destination = deliveryOrder.destination?.toUpperCase() || '';
  
  // Step 1: Zambia Return - 400 liters total (split between 2 stations)
  // Note: This will generate 2 separate LPOs
  allocations.zambiaReturn = config.zambiaReturnStations.total;
  
  // Step 2: Tunduma Return
  allocations.tundumaReturn = config.standardAllocations.tundumaReturn;
  
  // Step 3: Mbeya Return
  allocations.mbeyaReturn = config.standardAllocations.mbeyaReturn;
  
  // Step 4: Check if destination is Mombasa
  if (isDestinationMombasa(destination)) {
    allocations.moroReturn = config.standardAllocations.moroReturnToMombasa;
    allocations.tangaReturn = config.standardAllocations.tangaReturnToMombasa;
  }
  
  // Step 5: Handle any Dar Return scenarios (if applicable)
  // This can be filled in based on specific conditions
  
  return allocations;
}

/**
 * Calculate total balance
 */
export function calculateBalance(
  totalLiters: number,
  extra: number,
  allocations: FuelAllocation
): number {
  const totalFuel = totalLiters + (extra || 0);
  
  const totalAllocations = Math.abs(
    (allocations.tangaYard || 0) +
    (allocations.darYard || 0) +
    (allocations.darGoing || 0) +
    (allocations.moroGoing || 0) +
    (allocations.mbeyaGoing || 0) +
    (allocations.tdmGoing || 0) +
    (allocations.zambiaGoing || 0) +
    (allocations.congoFuel || 0) +
    (allocations.zambiaReturn || 0) +
    (allocations.tundumaReturn || 0) +
    (allocations.mbeyaReturn || 0) +
    (allocations.moroReturn || 0) +
    (allocations.darReturn || 0) +
    (allocations.tangaReturn || 0)
  );
  
  // In the CSV, allocations are negative, so balance = total - allocations
  return totalFuel - totalAllocations;
}

/**
 * Determine which LPOs need to be generated for fuel allocations
 * Company fuel from yards does NOT generate LPOs
 */
export function determineLPOsToGenerate(
  deliveryOrder: DeliveryOrder,
  allocations: FuelAllocation,
  isReturnJourney: boolean
): LPOToGenerate[] {
  const lpos: LPOToGenerate[] = [];
  const truckNo = deliveryOrder.truckNo;
  const doNo = deliveryOrder.doNumber;
  const destination = deliveryOrder.destination || '';
  
  // Dar Going - fuel purchased at station (not yard)
  if (allocations.darGoing && allocations.darGoing > 0) {
    lpos.push({
      station: 'DAR_STATION', // Will need to be specified
      truckNo,
      doNo,
      liters: allocations.darGoing,
      destination,
      checkpoint: 'Dar Going'
    });
  }
  
  // Return journey LPOs
  if (isReturnJourney) {
    const config = FuelConfigService.loadConfig();
    
    // Zambia Return - 2 separate LPOs
    if (allocations.zambiaReturn && allocations.zambiaReturn > 0) {
      lpos.push({
        station: config.zambiaReturnStations.lakeNdola.name,
        truckNo,
        doNo,
        liters: config.zambiaReturnStations.lakeNdola.liters,
        destination,
        checkpoint: 'Zambia Return'
      });
      
      lpos.push({
        station: config.zambiaReturnStations.lakeKapiri.name,
        truckNo,
        doNo,
        liters: config.zambiaReturnStations.lakeKapiri.liters,
        destination,
        checkpoint: 'Zambia Return'
      });
    }
    
    // Tunduma Return
    if (allocations.tundumaReturn && allocations.tundumaReturn > 0) {
      lpos.push({
        station: 'TUNDUMA_STATION', // Station name needed
        truckNo,
        doNo,
        liters: allocations.tundumaReturn,
        destination,
        checkpoint: 'Tunduma Return'
      });
    }
    
    // Mbeya Return
    if (allocations.mbeyaReturn && allocations.mbeyaReturn > 0) {
      lpos.push({
        station: 'MBEYA_STATION', // Station name needed
        truckNo,
        doNo,
        liters: allocations.mbeyaReturn,
        destination,
        checkpoint: 'Mbeya Return'
      });
    }
    
    // Moro Return (for Mombasa destinations)
    if (allocations.moroReturn && allocations.moroReturn > 0) {
      lpos.push({
        station: 'MORO_STATION', // Station name needed
        truckNo,
        doNo,
        liters: allocations.moroReturn,
        destination,
        checkpoint: 'Moro Return'
      });
    }
    
    // Tanga Return (for Mombasa destinations)
    if (allocations.tangaReturn && allocations.tangaReturn > 0) {
      lpos.push({
        station: 'TANGA_STATION', // Station name needed
        truckNo,
        doNo,
        liters: allocations.tangaReturn,
        destination,
        checkpoint: 'Tanga Return'
      });
    }
    
    // Dar Return (if applicable)
    if (allocations.darReturn && allocations.darReturn > 0) {
      lpos.push({
        station: 'DAR_STATION', // Station name needed
        truckNo,
        doNo,
        liters: allocations.darReturn,
        destination,
        checkpoint: 'Dar Return'
      });
    }
  }
  
  return lpos;
}

/**
 * Main function to create a fuel record from a delivery order
 * Note: Checkpoint fields remain at 0 until actual fuel orders (LPOs) are created
 * @param deliveryOrder - The delivery order to create fuel record from
 * @param loadingPoint - Loading point (reserved for future use when implementing yard fuel tracking)
 * @param totalLiters - Total liters allocated based on destination
 */
export function createFuelRecordFromDO(
  deliveryOrder: DeliveryOrder,
  _loadingPoint: 'DAR_YARD' | 'KISARAWE' | 'DAR_STATION' = 'DAR_YARD',
  totalLiters: number | null = null, // Allow null for unlisted routes
  extraFuel: number | null = null // Allow null for unlisted trucks
): { fuelRecord: Partial<FuelRecord>; lposToGenerate: LPOToGenerate[]; isLocked: boolean; missingFields: string[] } {
  const isImport = deliveryOrder.importOrExport === 'IMPORT';
  
  // Determine if configuration is missing
  const missingTotalLiters = totalLiters === null;
  const missingExtraFuel = extraFuel === null;
  const isLocked = missingTotalLiters || missingExtraFuel;
  const missingFields: string[] = [];
  
  if (missingTotalLiters) missingFields.push('totalLiters');
  if (missingExtraFuel) missingFields.push('extraFuel');
  
  // Calculate extra fuel if provided, otherwise null
  const extra = extraFuel !== null ? extraFuel : null;
  const start = determineJourneyStart(deliveryOrder);
  
  // Note: _loadingPoint parameter preserved for future yard fuel tracking implementation
  
  if (isImport) {
    // Going journey - create new fuel record with EMPTY checkpoints
    // Checkpoints will be filled when LPOs are actually created and fulfilled
    const month = extractMonthFromDate(deliveryOrder.date);
    
    const fuelRecord: Partial<FuelRecord> = {
      date: deliveryOrder.date,
      month: month,
      truckNo: deliveryOrder.truckNo,
      goingDo: deliveryOrder.doNumber,
      start: start,
      from: start,
      to: deliveryOrder.destination,
      totalLts: totalLiters, // Can be null if route not configured
      extra: extra, // Can be null if truck not configured
      isLocked: isLocked,
      pendingConfigReason: isLocked 
        ? (missingFields.length === 2 ? 'both' : missingFields[0] === 'totalLiters' ? 'missing_total_liters' : 'missing_extra_fuel')
        : null,
      // ALL checkpoint fields start at 0 - they get filled when fuel orders are made
      tangaYard: 0,
      darYard: 0,
      darGoing: 0,
      moroGoing: 0,
      mbeyaGoing: 0,
      tdmGoing: 0,
      zambiaGoing: 0,
      congoFuel: 0,
      zambiaReturn: 0,
      tundumaReturn: 0,
      mbeyaReturn: 0,
      moroReturn: 0,
      darReturn: 0,
      tangaReturn: 0,
      balance: totalLiters !== null && extra !== null ? totalLiters + extra : 0, // Balance is 0 if missing config
    };
    
    // Don't generate any LPOs automatically - they will be created manually as needed
    const lposToGenerate: LPOToGenerate[] = [];
    
    return { fuelRecord, lposToGenerate, isLocked, missingFields };
  } else {
    // Return journey - will update existing record
    // This is handled separately in updateFuelRecordWithReturnDO
    return { fuelRecord: {}, lposToGenerate: [], isLocked: false, missingFields: [] };
  }
}

/**
 * Update existing fuel record with return DO information
 * IMPORTANT: Stores original going journey from/to before changing them for return
 * NOTE: Return checkpoint fields (zambiaReturn, tundumaReturn, mbeyaReturn, etc.) 
 *       remain at 0 until LPOs are actually created - same as going journey logic
 * 
 * FUEL DIFFERENCE CALCULATION LOGIC:
 * - Calculates if additional fuel is needed for return journey based on loading point
 * - Example: Original allocation 2300L, but return from point that requires 2400L total
 * - Difference: 2400 - 2300 = 100L additional fuel needed
 * - Adds extra fuel based on special loading points (Kamoa +40L, NMI +20L, Kalongwe +60L)
 * - Adds extra fuel if final destination is Moshi/Msa (+170L)
 */
export function updateFuelRecordWithReturnDO(
  existingRecord: FuelRecord,
  returnDeliveryOrder: DeliveryOrder
): { updatedRecord: Partial<FuelRecord>; lposToGenerate: LPOToGenerate[]; additionalFuelInfo?: any } {
  // IMPORTANT: Store the original going journey from/to BEFORE we change them
  // This is critical for LPO creation when the truck is still going
  // The originalGoingFrom and originalGoingTo preserve the original going journey details
  const originalGoingFrom = existingRecord.originalGoingFrom || existingRecord.from;
  const originalGoingTo = existingRecord.originalGoingTo || existingRecord.to;
  
  // Get the return journey loading point (where truck will load cargo)
  // This is the destination from the EXPORT DO
  const returnLoadingPoint = returnDeliveryOrder.destination || '';
  
  // Get the final destination (where truck returns to offload)
  // This is typically the start location
  const finalDestination = existingRecord.start || 'DAR';
  
  // Calculate required total liters for return journey with match information
  // Based on the loading point (from) to the final destination
  const destinationMatch = FuelConfigService.getTotalLitersByDestination(returnLoadingPoint);
  const requiredTotalLiters = destinationMatch.liters;
  
  // Log if destination was not found or fuzzy matched
  if (!destinationMatch.matched) {
    console.warn(`⚠️ Return loading point "${returnLoadingPoint}" not in configured routes. Using default ${requiredTotalLiters}L`);
    if (destinationMatch.suggestions && destinationMatch.suggestions.length > 0) {
      console.log('  Suggestions:', destinationMatch.suggestions.map(s => `${s.route} (${s.liters}L)`).join(', '));
    }
  } else if (destinationMatch.matchType === 'fuzzy') {
    console.log(`🔍 Fuzzy matched "${returnLoadingPoint}" → "${destinationMatch.matchedRoute}" (${requiredTotalLiters}L)`);
  }
  
  // Get original total liters allocated for going journey
  const originalTotalLiters = existingRecord.totalLts || 0;
  
  // Calculate fuel difference
  let fuelDifference = requiredTotalLiters - originalTotalLiters;
  
  // Only add difference if positive (need more fuel)
  let additionalFuelNeeded = fuelDifference > 0 ? fuelDifference : 0;
  
  // Add extra fuel based on special loading points (with fuzzy matching)
  const loadingPointExtra = FuelConfigService.getLoadingPointExtraFuel(returnLoadingPoint);
  additionalFuelNeeded += loadingPointExtra;
  
  // Add extra fuel if final destination is Moshi/Msa (with fuzzy matching)
  const destinationExtra = FuelConfigService.getDestinationExtraFuel(finalDestination);
  additionalFuelNeeded += destinationExtra;
  
  // Calculate new total liters and extra fuel
  const newTotalLiters = originalTotalLiters + additionalFuelNeeded;
  
  // Log the calculation for tracking
  const additionalFuelInfo = {
    originalTotalLiters,
    requiredTotalLiters,
    fuelDifference: fuelDifference > 0 ? fuelDifference : 0,
    loadingPointExtra,
    destinationExtra,
    totalAdditionalFuel: additionalFuelNeeded,
    newTotalLiters,
    returnLoadingPoint,
    finalDestination,
  };
  
  console.log('🔄 Return Journey Fuel Calculation:', additionalFuelInfo);
  
  // Update the from and to fields based on return journey
  // NOTE: Return checkpoint fields remain at their current values (0 or whatever was set by LPOs)
  // They will be updated when LPOs are created, NOT automatically when return DO is created
  const updatedRecord: Partial<FuelRecord> = {
    ...existingRecord,
    returnDo: returnDeliveryOrder.doNumber,
    // Store original going journey locations if not already stored
    originalGoingFrom: originalGoingFrom,
    originalGoingTo: originalGoingTo,
    // Now update from/to for the current journey state (returning)
    from: returnLoadingPoint, // Return journey: load from this point (EXPORT destination)
    to: finalDestination, // Back to start location (final offloading point)
    // Update total liters if additional fuel is needed
    totalLts: newTotalLiters,
    // DO NOT pre-fill return checkpoint fields - they get filled when LPOs are created
    // zambiaReturn, tundumaReturn, mbeyaReturn, etc. remain unchanged (0 or existing value)
  };
  
  // Update balance if additional fuel was added
  if (additionalFuelNeeded > 0) {
    updatedRecord.balance = (existingRecord.balance || 0) + additionalFuelNeeded;
  }
  
  // Don't generate any LPOs automatically - they will be created manually as needed
  const lposToGenerate: LPOToGenerate[] = [];
  
  return { updatedRecord, lposToGenerate, additionalFuelInfo };
}

/**
 * Get the actual going destination for a fuel record
 * Uses originalGoingTo if available (when EXPORT DO has changed the from/to),
 * otherwise uses the current 'to' field
 */
export function getGoingDestination(fuelRecord: FuelRecord): string {
  return fuelRecord.originalGoingTo || fuelRecord.to;
}

/**
 * Get the actual going origin for a fuel record
 * Uses originalGoingFrom if available (when EXPORT DO has changed the from/to),
 * otherwise uses the current 'from' field
 */
export function getGoingOrigin(fuelRecord: FuelRecord): string {
  return fuelRecord.originalGoingFrom || fuelRecord.from;
}

/**
 * Check if a journey is complete based on return checkpoints
 * - For non-MSA destinations: mbeyaReturn must be filled (not 0)
 * - For MSA destinations: tangaReturn must be filled (not 0)
 * - balance === 0 is also required
 * - Negative balance is acceptable (not journey complete)
 */
export function isJourneyComplete(fuelRecord: FuelRecord): boolean {
  // Balance must be exactly 0 for journey to be complete
  // Negative balance is acceptable and means journey is still active
  if (fuelRecord.balance !== 0) {
    return false;
  }
  
  const destination = (fuelRecord.originalGoingTo || fuelRecord.to || '').toUpperCase();
  const isMSADestination = destination.includes('MSA') || destination.includes('MOMBASA');
  
  if (isMSADestination) {
    // For MSA destinations, check if tangaReturn is filled
    return (fuelRecord as any).tangaReturn !== 0 && (fuelRecord as any).tangaReturn !== undefined;
  } else {
    // For non-MSA destinations, check if mbeyaReturn is filled
    return (fuelRecord as any).mbeyaReturn !== 0 && (fuelRecord as any).mbeyaReturn !== undefined;
  }
}

/**
 * Determine if a truck is currently on its going journey or returning
 * Uses mbeyaReturn/tangaReturn checkpoints to determine if truck has returned
 * Note: returnDo is NOT used as trucks can return without a return order
 */
export function isTruckGoingJourney(fuelRecord: FuelRecord): boolean {
  const destination = (fuelRecord.originalGoingTo || fuelRecord.to || '').toUpperCase();
  const isMSADestination = destination.includes('MSA') || destination.includes('MOMBASA');
  
  if (isMSADestination) {
    // For MSA destinations, check tangaReturn - if filled, truck is returning or returned
    return !(fuelRecord as any).tangaReturn || (fuelRecord as any).tangaReturn === 0;
  } else {
    // For non-MSA destinations, check mbeyaReturn - if filled, truck is returning or returned
    return !(fuelRecord as any).mbeyaReturn || (fuelRecord as any).mbeyaReturn === 0;
  }
}

/**
 * Find existing fuel record for a truck that needs a return DO update
 */
export function findMatchingGoingRecord(
  truckNo: string,
  allRecords: FuelRecord[]
): FuelRecord | null {
  // Find the most recent record for this truck that doesn't have a return DO yet
  const matchingRecords = allRecords
    .filter(record => record.truckNo === truckNo && !record.returnDo)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return matchingRecords[0] || null;
}

export default {
  calculateExtraFuel,
  extractMonthFromDate,
  determineJourneyStart,
  calculateGoingFuelAllocations,
  calculateReturnFuelAllocations,
  calculateBalance,
  determineLPOsToGenerate,
  createFuelRecordFromDO,
  updateFuelRecordWithReturnDO,
  findMatchingGoingRecord,
  getGoingDestination,
  getGoingOrigin,
  isTruckGoingJourney,
  isJourneyComplete,
};
