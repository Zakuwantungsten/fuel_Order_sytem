/**
 * Fuel Record Calculator (server-side)
 *
 * Pure, dependency-free port of the fuel-record matching + building logic that
 * previously lived in the frontend (useRoutes.ts, useTruckBatches.ts,
 * fuelRecordService.ts, fuelConfigService.ts).
 *
 * Used by the bulk delivery-order endpoint so an entire batch can be processed
 * in a single request instead of dozens of client round-trips. Behaviour mirrors
 * the original client functions exactly so results are unchanged.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shapes (kept loose on purpose — these mirror lean Mongo documents / config)
// ─────────────────────────────────────────────────────────────────────────────
export interface RouteLike {
  destination: string;
  destinationAliases?: string[];
  defaultTotalLiters: number;
  isActive?: boolean;
  origin?: string;
  routeType?: 'IMPORT' | 'EXPORT';
}

export interface TruckBatchEntry {
  truckSuffix: string;
  destinationRules?: Array<{ destination: string; extraLiters: number }>;
}

/** truckBatches map: { "100": [{truckSuffix,...}], "80": [...] } */
export type TruckBatchesMap = Record<string, TruckBatchEntry[] | unknown>;

/** batch-level destination rules map: { "100": [{destination, extraLiters}], ... } */
export type BatchDestinationRulesMap = Record<string, Array<{ destination: string; extraLiters: number }> | unknown>;

export interface DeliveryOrderLike {
  date: string;
  truckNo: string;
  doNumber: string;
  destination: string;
  loadingPoint?: string;
  importOrExport: 'IMPORT' | 'EXPORT';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Extract "November 2025" from a date string. Falls back to current month. */
export function extractMonthFromDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    const now = new Date();
    return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  }
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Determine journey start location from the DO loading point. */
export function determineJourneyStart(loadingPoint?: string): 'TANGA' | 'DAR' {
  return (loadingPoint || '').toLowerCase().includes('tanga') ? 'TANGA' : 'DAR';
}

/**
 * Origin equality for route matching.
 * Exact match, or either string contains the other (e.g. "TANGA TANGA" ↔ "TANGA").
 */
export function originsMatch(a?: string, b?: string): boolean {
  const na = (a || '').toUpperCase().trim();
  const nb = (b || '').toUpperCase().trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function destinationMatchesRoute(route: RouteLike, normalizedDest: string): 'exact' | 'alias' | null {
  if (route.destination.toUpperCase().trim() === normalizedDest) return 'exact';
  if (route.destinationAliases?.some((alias) => alias.toUpperCase().trim() === normalizedDest)) {
    return 'alias';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT (going) total-liters matching
// Requires origin + destination (or origin + destination alias). No dest-only,
// partial, or fuzzy fallback — unmatched routes leave liters unset/locked.
// ─────────────────────────────────────────────────────────────────────────────
export function matchRouteLiters(
  routes: RouteLike[] | undefined,
  origin: string,
  destination: string
): { liters: number; matched: boolean; matchType?: string; routeName?: string } {
  if (!routes || routes.length === 0) return { liters: 0, matched: false };

  const normalizedOrig = (origin || '').toUpperCase().trim();
  const normalizedDest = (destination || '').toUpperCase().trim();
  if (!normalizedOrig || !normalizedDest) return { liters: 0, matched: false };

  const match = routes.find((route) => {
    if (route.isActive === false) return false;
    if (route.routeType && route.routeType !== 'IMPORT') return false;
    if (!originsMatch(route.origin, normalizedOrig)) return false;
    return destinationMatchesRoute(route, normalizedDest) !== null;
  });

  if (!match) return { liters: 0, matched: false };

  const matchType = destinationMatchesRoute(match, normalizedDest) || 'exact';
  return {
    liters: match.defaultTotalLiters,
    matched: true,
    matchType,
    routeName: `${match.origin || normalizedOrig} → ${match.destination}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extra fuel matching — ports getExtraFuelFromBatches()
// Dynamic batch search by truck suffix + optional destination overrides.
// ─────────────────────────────────────────────────────────────────────────────
export function matchExtraFuel(
  truckNo: string,
  batches: TruckBatchesMap | undefined,
  destination?: string,
  batchDestinationRules?: BatchDestinationRulesMap
): { extraFuel: number; matched: boolean; batchName?: string; truckSuffix: string; destinationOverride?: boolean } {
  if (!batches) return { extraFuel: 0, matched: false, truckSuffix: '' };

  const truckSuffix = (truckNo || '').toLowerCase().split(' ').pop() || '';
  if (!truckSuffix) return { extraFuel: 0, matched: false, truckSuffix: '' };

  for (const [extraLitersStr, trucks] of Object.entries(batches)) {
    if (!Array.isArray(trucks)) continue;

    const truck = (trucks as TruckBatchEntry[]).find((t) => t.truckSuffix === truckSuffix);
    if (truck) {
      if (destination) {
        const normalizedDest = destination.toLowerCase().trim();

        // 1. Truck-level destination rules (highest priority)
        if (truck.destinationRules && truck.destinationRules.length > 0) {
          const matchingRule = truck.destinationRules.find((rule) => {
            const ruleDestination = rule.destination.toLowerCase().trim();
            return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
          });
          if (matchingRule) {
            return {
              extraFuel: matchingRule.extraLiters,
              matched: true,
              batchName: `batch_${extraLitersStr}`,
              truckSuffix,
              destinationOverride: true,
            };
          }
        }

        // 2. Batch-level destination rules (middle priority)
        if (batchDestinationRules) {
          const batchRules = batchDestinationRules[extraLitersStr];
          if (Array.isArray(batchRules) && batchRules.length > 0) {
            const matchingBatchRule = batchRules.find((rule) => {
              const ruleDestination = rule.destination.toLowerCase().trim();
              return normalizedDest.includes(ruleDestination) || ruleDestination.includes(normalizedDest);
            });
            if (matchingBatchRule) {
              return {
                extraFuel: matchingBatchRule.extraLiters,
                matched: true,
                batchName: `batch_${extraLitersStr}`,
                truckSuffix,
                destinationOverride: true,
              };
            }
          }
        }
      }

      // 3. Batch default (lowest priority)
      return { extraFuel: parseInt(extraLitersStr, 10), matched: true, batchName: `batch_${extraLitersStr}`, truckSuffix };
    }
  }

  return { extraFuel: 0, matched: false, truckSuffix };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a going-journey (IMPORT) fuel record — ports createFuelRecordFromDO()
// Checkpoints start at 0; record is locked when route or batch config is missing.
// ─────────────────────────────────────────────────────────────────────────────
export interface BuiltFuelRecord {
  fuelRecord: Record<string, any>;
  isLocked: boolean;
  missingFields: Array<'totalLiters' | 'extraFuel'>;
}

export function buildImportFuelRecord(
  deliveryOrder: DeliveryOrderLike,
  totalLiters: number | null,
  extraFuel: number | null
): BuiltFuelRecord {
  const missingTotalLiters = totalLiters === null;
  const missingExtraFuel = extraFuel === null;
  const isLocked = missingTotalLiters || missingExtraFuel;

  const missingFields: Array<'totalLiters' | 'extraFuel'> = [];
  if (missingTotalLiters) missingFields.push('totalLiters');
  if (missingExtraFuel) missingFields.push('extraFuel');

  const start = determineJourneyStart(deliveryOrder.loadingPoint);
  const month = extractMonthFromDate(deliveryOrder.date);

  const fuelRecord: Record<string, any> = {
    date: deliveryOrder.date,
    month,
    truckNo: deliveryOrder.truckNo,
    goingDo: deliveryOrder.doNumber,
    start,
    from: start,
    to: deliveryOrder.destination,
    totalLts: totalLiters,
    extra: extraFuel,
    isLocked,
    pendingConfigReason: isLocked
      ? (missingFields.length === 2 ? 'both' : missingFields[0] === 'totalLiters' ? 'missing_total_liters' : 'missing_extra_fuel')
      : null,
    // All checkpoint fields start at 0 — filled when fuel orders (LPOs) are made
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
    balance: totalLiters !== null && extraFuel !== null ? totalLiters + extraFuel : 0,
  };

  return { fuelRecord, isLocked, missingFields };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT (return) route matching
// Requires origin + destination (or origin + destination alias). No dest-only,
// partial, fuzzy, or default-liters fallback.
// ─────────────────────────────────────────────────────────────────────────────
export function matchExportRouteLiters(
  routes: RouteLike[] | undefined,
  origin: string,
  destination: string
): { liters: number; matched: boolean; matchType: 'exact' | 'alias' | 'none'; matchedRoute?: string } {
  const dbRoutes = (routes || []).filter((r) => r.routeType === 'EXPORT');
  const orig = (origin || '').toUpperCase().trim();
  const dest = (destination || '').toUpperCase().trim();

  if (!orig || !dest) return { liters: 0, matched: false, matchType: 'none' };

  const match = dbRoutes.find((route) => {
    if (route.isActive === false) return false;
    if (!originsMatch(route.origin, orig)) return false;
    return destinationMatchesRoute(route, dest) !== null;
  });

  if (!match) return { liters: 0, matched: false, matchType: 'none' };

  const matchType = destinationMatchesRoute(match, dest) || 'exact';
  return {
    liters: match.defaultTotalLiters,
    matched: true,
    matchType,
    matchedRoute: `${match.origin} → ${match.destination}`,
  };
}

/**
 * Build the update for an existing going record when a return (EXPORT) DO arrives.
 * Ports updateFuelRecordWithReturnDO(): preserves original going from/to, sets the
 * current from/to to the return leg, and adds the export route liters to totals.
 */
export function buildReturnUpdate(
  existingRecord: Record<string, any>,
  returnDeliveryOrder: DeliveryOrderLike,
  exportRouteLiters: number
): { update: Record<string, any>; info: Record<string, any> } {
  const originalGoingFrom = existingRecord.originalGoingFrom || existingRecord.from;
  const originalGoingTo = existingRecord.originalGoingTo || existingRecord.to;

  const returnLoadingPoint = returnDeliveryOrder.loadingPoint || '';
  const finalDestination = returnDeliveryOrder.destination || '';

  const originalTotalLiters = existingRecord.totalLts || 0;
  const additionalFuelNeeded = exportRouteLiters;
  const newTotalLiters = originalTotalLiters + additionalFuelNeeded;

  const update: Record<string, any> = {
    returnDo: returnDeliveryOrder.doNumber,
    originalGoingFrom,
    originalGoingTo,
    from: returnLoadingPoint,
    to: finalDestination,
    totalLts: newTotalLiters,
  };

  if (additionalFuelNeeded > 0) {
    update.balance = (existingRecord.balance || 0) + additionalFuelNeeded;
  }

  const info = {
    originalTotalLiters,
    exportRouteLiters,
    totalAdditionalFuel: additionalFuelNeeded,
    newTotalLiters,
    returnLoadingPoint,
    finalDestination,
  };

  return { update, info };
}
