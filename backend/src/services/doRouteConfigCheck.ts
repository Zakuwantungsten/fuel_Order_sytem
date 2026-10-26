import { RouteConfig } from '../models/RouteConfig';
import { matchRouteLiters, matchExportRouteLiters, type RouteLike } from '../utils/fuelRecordCalculator';

/**
 * Read-only check of whether the route a DO will have after an edit exists in the
 * route configuration, using the same matchers the save path uses:
 *  - IMPORT: an unmatched going route leaves the fuel record with no total liters,
 *    locked, and raises the usual "New Configuration Needed" notification.
 *  - EXPORT: an unmatched outbound route adds no outbound liters to the journey
 *    (an existing outbound amount is rolled back).
 * SDOs have no fuel journey and are never flagged.
 */

const ROUTE_FIELDS = ['loadingPoint', 'destination', 'importOrExport'] as const;

export interface RouteCheckOrder {
  doNumber: string;
  doType?: string;
  importOrExport?: string;
  loadingPoint?: string;
  destination?: string;
}

export type RouteCheckChanges = Partial<Record<(typeof ROUTE_FIELDS)[number], string>>;

export interface RouteConfigIssue {
  doNumber: string;
  direction: 'IMPORT' | 'EXPORT';
  loadingPoint: string;
  destination: string;
  effect: 'fuel_record_locked' | 'no_outbound_liters';
}

function needsRouteCheck(order: RouteCheckOrder, changes: RouteCheckChanges): boolean {
  if ((order.doType || 'DO') !== 'DO') return false;
  return ROUTE_FIELDS.some((f) => changes[f] !== undefined);
}

export function findUnconfiguredRoute(
  order: RouteCheckOrder,
  changes: RouteCheckChanges,
  routes: RouteLike[]
): RouteConfigIssue | null {
  if (!needsRouteCheck(order, changes)) return null;

  const direction: 'IMPORT' | 'EXPORT' =
    String(changes.importOrExport ?? order.importOrExport ?? 'IMPORT').toUpperCase() === 'EXPORT'
      ? 'EXPORT'
      : 'IMPORT';
  const loadingPoint = String(changes.loadingPoint ?? order.loadingPoint ?? '').trim().toUpperCase();
  const destination = String(changes.destination ?? order.destination ?? '').trim().toUpperCase();

  const match =
    direction === 'IMPORT'
      ? matchRouteLiters(routes, loadingPoint, destination)
      : matchExportRouteLiters(routes, loadingPoint, destination);
  if (match.matched) return null;

  return {
    doNumber: order.doNumber,
    direction,
    loadingPoint,
    destination,
    effect: direction === 'IMPORT' ? 'fuel_record_locked' : 'no_outbound_liters',
  };
}

/** Issues keyed by DO number. Routes are only loaded when some DO needs checking. */
export async function inspectRouteConfig(
  entries: Array<{ order: RouteCheckOrder; changes: RouteCheckChanges }>
): Promise<Map<string, RouteConfigIssue>> {
  const issues = new Map<string, RouteConfigIssue>();
  const toCheck = entries.filter(({ order, changes }) => needsRouteCheck(order, changes));
  if (toCheck.length === 0) return issues;

  const routes = (await RouteConfig.find({ isActive: true }).lean()) as unknown as RouteLike[];
  for (const { order, changes } of toCheck) {
    const issue = findUnconfiguredRoute(order, changes, routes);
    if (issue) issues.set(order.doNumber, issue);
  }
  return issues;
}
