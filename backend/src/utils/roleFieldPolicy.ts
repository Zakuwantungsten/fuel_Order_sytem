/**
 * Role-based field access control for update operations.
 * Strips fields the caller's role is not allowed to write.
 */

// Roles that inherit the full admin-level field set
const ADMIN_EQUIVALENT = new Set([
  'super_admin', 'admin', 'manager', 'super_manager', 'boss', 'supervisor',
]);

// ── Fuel Record ──────────────────────────────────────────────
const FUEL_RECORD_FIELDS: Record<string, string[]> = {
  admin: [
    'totalLts', 'extra', 'balance', 'isLocked', 'pendingConfigReason',
    'truckNo', 'goingDo', 'returnDo', 'date', 'month', 'from', 'to',
    'mmsaYard', 'tangaYard', 'darYard',
    'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
    'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
    'journeyStatus', 'queueOrder', 'start', 'lpoNo', 'routeFrom', 'routeTo',
  ],
  fuel_order_maker: [
    'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
    'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
    'extra', 'journeyStatus', 'start',
  ],
  clerk: [
    'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
    'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
    'extra',
  ],
  dar_yard: ['darYard'],
  tanga_yard: ['tangaYard'],
  msa_yard: ['mmsaYard'],
  mmsa_yard: ['mmsaYard'],
  officer: [
    'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
    'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
  ],
  accountant: [
    'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
    'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
    'extra',
  ],
};

// ── LPO Entry ────────────────────────────────────────────────
const LPO_ENTRY_FIELDS: Record<string, string[]> = {
  admin: [
    'sn', 'date', 'lpoNo', 'dieselAt', 'doSdo', 'truckNo',
    'ltrs', 'pricePerLtr', 'destinations', 'paymentMode', 'currency',
    'isDriverAccount', 'referenceDo', 'isCancelled',
  ],
  fuel_order_maker: [
    'sn', 'date', 'dieselAt', 'doSdo', 'truckNo',
    'ltrs', 'pricePerLtr', 'destinations', 'paymentMode', 'currency',
    'isDriverAccount', 'referenceDo',
  ],
};

// ── Delivery Order ───────────────────────────────────────────
const DELIVERY_ORDER_FIELDS: Record<string, string[]> = {
  admin: [
    'truckNo', 'trailerNo', 'loadingPoint', 'destination',
    'tonnages', 'ratePerTon', 'driverName', 'clientName', 'containerNo',
    'editReason', 'status',
  ],
  fuel_order_maker: [
    'truckNo', 'trailerNo', 'loadingPoint', 'destination',
    'tonnages', 'driverName', 'clientName', 'containerNo', 'editReason',
  ],
  clerk: [
    'truckNo', 'trailerNo', 'loadingPoint', 'destination',
    'tonnages', 'driverName', 'clientName', 'containerNo', 'editReason',
  ],
};

function resolveRole(role: string): string {
  return ADMIN_EQUIVALENT.has(role) ? 'admin' : role;
}

function filterByPolicy(
  updates: Record<string, any>,
  role: string,
  policy: Record<string, string[]>,
): Record<string, any> {
  const effectiveRole = resolveRole(role);
  const allowed = policy[effectiveRole] ?? policy['admin'];
  if (!allowed) return updates; // no policy defined → allow all (safety fallback)

  const filtered: Record<string, any> = {};
  for (const field of allowed) {
    if (updates[field] !== undefined) {
      filtered[field] = updates[field];
    }
  }
  return filtered;
}

export function filterFuelRecordFields(updates: Record<string, any>, role: string) {
  return filterByPolicy(updates, role, FUEL_RECORD_FIELDS);
}

export function filterLPOEntryFields(updates: Record<string, any>, role: string) {
  return filterByPolicy(updates, role, LPO_ENTRY_FIELDS);
}

export function filterDeliveryOrderFields(updates: Record<string, any>, role: string) {
  return filterByPolicy(updates, role, DELIVERY_ORDER_FIELDS);
}
