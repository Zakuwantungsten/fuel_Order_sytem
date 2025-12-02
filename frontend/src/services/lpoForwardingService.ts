/**
 * LPO Forwarding Service
 * 
 * Handles the forwarding of LPOs from one station to another along common routes.
 * This is used when trucks refuel at multiple stations on the same journey.
 * 
 * Common Routes:
 * 1. Zambia Returning: Ndola (50L) → Kapiri (350L)
 * 2. Tunduma Returning: Lake Tunduma (100L) → Infinity/Mbeya (400L)
 */

import { LPOSummary, LPODetail } from '../types';

// Forwarding route configuration
export interface ForwardingRoute {
  id: string;
  name: string;
  description: string;
  fromStation: string;
  toStation: string;
  defaultLiters: number;
  rate: number;
  currency: 'USD' | 'TZS';
}

// Predefined forwarding routes
export const FORWARDING_ROUTES: ForwardingRoute[] = [
  {
    id: 'zambia-return-ndola-to-kapiri',
    name: 'Zambia Returning (Ndola → Kapiri)',
    description: 'Forward trucks from Ndola (50L) to Kapiri (350L)',
    fromStation: 'LAKE NDOLA',
    toStation: 'LAKE KAPIRI',
    defaultLiters: 350,
    rate: 1.2,
    currency: 'USD',
  },
  {
    id: 'tunduma-return-to-mbeya',
    name: 'Tunduma Returning (Lake Tunduma → Infinity)',
    description: 'Forward trucks from Lake Tunduma (100L) to Infinity/Mbeya (400L)',
    fromStation: 'LAKE TUNDUMA',
    toStation: 'INFINITY',
    defaultLiters: 400,
    rate: 2757,
    currency: 'TZS',
  },
];

// Get available forwarding routes for a source station
export function getAvailableForwardingRoutes(sourceStation: string): ForwardingRoute[] {
  const stationUpper = sourceStation.toUpperCase().trim();
  return FORWARDING_ROUTES.filter(route => route.fromStation === stationUpper);
}

// Check if an LPO can be forwarded (has at least one active, non-cancelled entry)
export function canForwardLPO(lpo: LPOSummary): boolean {
  if (!lpo.entries || lpo.entries.length === 0) return false;
  
  // Check if there are any active (non-cancelled) entries
  const activeEntries = lpo.entries.filter(entry => !entry.isCancelled);
  if (activeEntries.length === 0) return false;
  
  // Check if there's a valid forwarding route from this station
  const routes = getAvailableForwardingRoutes(lpo.station);
  return routes.length > 0;
}

// Get the recommended forwarding route for an LPO
export function getRecommendedRoute(lpo: LPOSummary): ForwardingRoute | null {
  const routes = getAvailableForwardingRoutes(lpo.station);
  return routes.length > 0 ? routes[0] : null;
}

// Prepare forwarded LPO data
export interface ForwardLPOData {
  sourceId: string | number;
  targetStation: string;
  defaultLiters: number;
  rate: number;
  date?: string;
  orderOf?: string;
  // Option to include all entries or filter
  includeOnlyActive?: boolean;
}

// Create forwarded entries from source entries
export function createForwardedEntries(
  sourceEntries: LPODetail[],
  defaultLiters: number,
  rate: number,
  includeOnlyActive: boolean = true
): LPODetail[] {
  const entriesToForward = includeOnlyActive 
    ? sourceEntries.filter(entry => !entry.isCancelled)
    : sourceEntries;

  return entriesToForward.map(entry => ({
    doNo: entry.doNo,
    truckNo: entry.truckNo,
    liters: defaultLiters,
    rate: rate,
    amount: defaultLiters * rate,
    dest: entry.dest,
    // Reset cancellation/amendment fields for new LPO
    isCancelled: false,
    isDriverAccount: false,
    originalLiters: undefined,
    amendedAt: undefined,
  }));
}

// Validate forwarding request
export function validateForwardingRequest(
  sourceLpo: LPOSummary,
  targetStation: string,
  defaultLiters: number
): { valid: boolean; error?: string } {
  // Check source LPO has entries
  if (!sourceLpo.entries || sourceLpo.entries.length === 0) {
    return { valid: false, error: 'Source LPO has no entries to forward' };
  }

  // Check there are active entries
  const activeEntries = sourceLpo.entries.filter(entry => !entry.isCancelled);
  if (activeEntries.length === 0) {
    return { valid: false, error: 'Source LPO has no active (non-cancelled) entries to forward' };
  }

  // Check target station is different from source
  if (sourceLpo.station.toUpperCase() === targetStation.toUpperCase()) {
    return { valid: false, error: 'Target station cannot be the same as source station' };
  }

  // Check default liters is valid
  if (defaultLiters <= 0) {
    return { valid: false, error: 'Default liters must be greater than 0' };
  }

  return { valid: true };
}

// Format forwarding summary for confirmation
export function formatForwardingSummary(
  sourceLpo: LPOSummary,
  targetStation: string,
  defaultLiters: number,
  rate: number
): string {
  const activeEntries = sourceLpo.entries.filter(entry => !entry.isCancelled);
  const totalAmount = activeEntries.length * defaultLiters * rate;

  return `
Forward LPO ${sourceLpo.lpoNo} Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
From: ${sourceLpo.station}
To: ${targetStation}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trucks to Forward: ${activeEntries.length}
Default Liters: ${defaultLiters}L per truck
Rate: ${rate}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimated Total: ${totalAmount.toLocaleString()}
`.trim();
}

// Get station display info for forwarding UI
export function getStationDisplayInfo(station: string): { 
  name: string; 
  rate: number; 
  currency: 'USD' | 'TZS';
  commonLiters: number[];
} {
  const stationUpper = station.toUpperCase().trim();
  
  const stationInfo: Record<string, { rate: number; currency: 'USD' | 'TZS'; commonLiters: number[] }> = {
    'LAKE NDOLA': { rate: 1.2, currency: 'USD', commonLiters: [50] },
    'LAKE KAPIRI': { rate: 1.2, currency: 'USD', commonLiters: [350] },
    'LAKE CHILABOMBWE': { rate: 1.2, currency: 'USD', commonLiters: [260] },
    'LAKE KITWE': { rate: 1.2, currency: 'USD', commonLiters: [260] },
    'LAKE KABANGWA': { rate: 1.2, currency: 'USD', commonLiters: [260] },
    'LAKE CHINGOLA': { rate: 1.2, currency: 'USD', commonLiters: [260] },
    'LAKE TUNDUMA': { rate: 2875, currency: 'TZS', commonLiters: [100] },
    'INFINITY': { rate: 2757, currency: 'TZS', commonLiters: [400, 450] },
    'GBP MOROGORO': { rate: 2710, currency: 'TZS', commonLiters: [100] },
    'GBP KANGE': { rate: 2730, currency: 'TZS', commonLiters: [70] },
  };

  const info = stationInfo[stationUpper] || { rate: 1.2, currency: 'USD', commonLiters: [100] };
  
  return {
    name: stationUpper,
    ...info
  };
}

// All target stations that can receive forwarded LPOs
export const FORWARD_TARGET_STATIONS = [
  'LAKE KAPIRI',
  'LAKE NDOLA',
  'LAKE CHILABOMBWE',
  'LAKE KITWE',
  'LAKE KABANGWA',
  'LAKE CHINGOLA',
  'INFINITY',
  'LAKE TUNDUMA',
  'GBP MOROGORO',
  'GBP KANGE',
];
