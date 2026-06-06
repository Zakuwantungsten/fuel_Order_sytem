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

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT (going) total-liters matching — ports getTotalLitersFromRoutes()
// Destination-only matching: exact → alias → partial. No routeType filtering,
// matching the original client behaviour exactly.
// ─────────────────────────────────────────────────────────────────────────────
export function matchRouteLiters(
  routes: RouteLike[] | undefined,
  destination: string
): { liters: number; matched: boolean; matchType?: string; routeName?: string } {
  if (!routes || routes.length === 0) return { liters: 0, matched: false };

  const normalizedDest = (destination || '').toUpperCase().trim();

  // Exact destination match
  const exactMatch = routes.find(
    (route) => route.isActive && route.destination.toUpperCase() === normalizedDest
  );
  if (exactMatch) {
    return { liters: exactMatch.defaultTotalLiters, matched: true, matchType: 'exact', routeName: exactMatch.destination };
  }

  // Alias match
  for (const route of routes) {
    if (route.isActive && route.destinationAliases) {
      const aliasMatch = route.destinationAliases.find(
        (alias) => alias.toUpperCase() === normalizedDest
      );
      if (aliasMatch) {
        return { liters: route.defaultTotalLiters, matched: true, matchType: 'alias', routeName: route.destination };
      }
    }
  }

  // Partial match (either contains the other)
  const partialMatch = routes.find(
    (route) =>
      route.isActive &&
      (route.destination.toUpperCase().includes(normalizedDest) ||
        normalizedDest.includes(route.destination.toUpperCase()))
  );
  if (partialMatch) {
    return { liters: partialMatch.defaultTotalLiters, matched: true, matchType: 'partial', routeName: partialMatch.destination };
  }

  return { liters: 0, matched: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extra fuel matching — ports getExtraFuelFromBatches()
// Dynamic batch search by truck suffix + optional destination overrides.
// ─────────────────────────────────────────────────────────────────────────────
export function matchExtraFuel(
  truckNo: string,
  batches: TruckBatchesMap | undefined,
  destination?: string
): { extraFuel: number; matched: boolean; batchName?: string; truckSuffix: string; destinationOverride?: boolean } {
  if (!batches) return { extraFuel: 0, matched: false, truckSuffix: '' };

  const truckSuffix = (truckNo || '').toLowerCase().split(' ').pop() || '';
  if (!truckSuffix) return { extraFuel: 0, matched: false, truckSuffix: '' };

  for (const [extraLitersStr, trucks] of Object.entries(batches)) {
    if (!Array.isArray(trucks)) continue;

    const truck = (trucks as TruckBatchEntry[]).find((t) => t.truckSuffix === truckSuffix);
    if (truck) {
      // Destination override rules take precedence over the batch default
      if (destination && truck.destinationRules && truck.destinationRules.length > 0) {
        const normalizedDest = destination.toLowerCase().trim();
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
// EXPORT (return) route matching — ports getTotalLitersByRoute(...,'EXPORT')
// Origin+destination matching with exact → dest-only → partial → fuzzy → default.
// ─────────────────────────────────────────────────────────────────────────────
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[len1][len2];
}

function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  return 1 - levenshteinDistance(str1, str2) / maxLength;
}

export function matchExportRouteLiters(
  routes: RouteLike[] | undefined,
  origin: string,
  destination: string
): { liters: number; matched: boolean; matchType: 'exact' | 'partial' | 'fuzzy' | 'default'; matchedRoute?: string } {
  const dbRoutes = (routes || []).filter((r) => r.routeType === 'EXPORT');
  const orig = (origin || '').toUpperCase().trim();
  const dest = (destination || '').toUpperCase().trim();

  if (!dest) return { liters: 0, matched: false, matchType: 'default' };

  // 1. Exact: origin AND destination
  if (orig) {
    const exactMatch = dbRoutes.find(
      (route) =>
        route.isActive &&
        route.origin?.toUpperCase().trim() === orig &&
        (route.destination.toUpperCase().trim() === dest ||
          route.destinationAliases?.some((alias) => alias.toUpperCase().trim() === dest))
    );
    if (exactMatch) {
      return { liters: exactMatch.defaultTotalLiters, matched: true, matchType: 'exact', matchedRoute: `${exactMatch.origin} → ${exactMatch.destination}` };
    }
  }

  // 2. Destination-only
  const destMatch = dbRoutes.find(
    (route) =>
      route.isActive &&
      (route.destination.toUpperCase().trim() === dest ||
        route.destinationAliases?.some((alias) => alias.toUpperCase().trim() === dest))
  );
  if (destMatch) {
    return { liters: destMatch.defaultTotalLiters, matched: true, matchType: orig ? 'partial' : 'exact', matchedRoute: destMatch.destination };
  }

  // 3. Partial: destination contains route name
  const partialMatch = dbRoutes.find(
    (route) => route.isActive && dest.includes(route.destination.toUpperCase().trim())
  );
  if (partialMatch) {
    return { liters: partialMatch.defaultTotalLiters, matched: true, matchType: 'partial', matchedRoute: partialMatch.destination };
  }

  // 4. Fuzzy (>= 0.6 similarity)
  const suggestions: Array<{ route: string; liters: number; similarity: number }> = [];
  for (const route of dbRoutes) {
    if (!route.isActive) continue;
    const similarity = calculateSimilarity(dest, route.destination.toUpperCase());
    if (similarity >= 0.6) {
      suggestions.push({ route: route.destination, liters: route.defaultTotalLiters, similarity });
    }
  }
  suggestions.sort((a, b) => b.similarity - a.similarity);
  if (suggestions.length > 0) {
    return { liters: suggestions[0].liters, matched: true, matchType: 'fuzzy', matchedRoute: suggestions[0].route };
  }

  // 5. Default fallback
  return { liters: 0, matched: false, matchType: 'default' };
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
