/**
 * Virtual LPO stations for yard fuel (stored on LPOSummary.station).
 * Mirrors backend/src/utils/yardStations.ts — not FuelStationConfig rows,
 * the form/list treat them like CASH/CUSTOM.
 */

export const YARD_STATION = {
  TANGA: 'Tanga Yard',
  DAR: 'Dar Yard',
} as const;

export type YardStationName = (typeof YARD_STATION)[keyof typeof YARD_STATION];

const TANGA_ALIASES = new Set(['tanga yard', 'tangayard', 'tanga']);
const DAR_ALIASES = new Set(['dar yard', 'daryard', 'dar']);

export function normalizeStationName(station: string | null | undefined): string {
  return (station || '').trim();
}

export function isTangaYardStation(station: string | null | undefined): boolean {
  const n = normalizeStationName(station).toLowerCase();
  return TANGA_ALIASES.has(n) || n === YARD_STATION.TANGA.toLowerCase();
}

export function isDarYardStation(station: string | null | undefined): boolean {
  const n = normalizeStationName(station).toLowerCase();
  return DAR_ALIASES.has(n) || n === YARD_STATION.DAR.toLowerCase();
}

export function isYardStation(station: string | null | undefined): boolean {
  return isTangaYardStation(station) || isDarYardStation(station);
}

export function canonicalYardStation(station: string | null | undefined): YardStationName | null {
  if (isTangaYardStation(station)) return YARD_STATION.TANGA;
  if (isDarYardStation(station)) return YARD_STATION.DAR;
  return null;
}

/** Default orderOf for yard LPOs created without a supplier field. */
export const YARD_DEFAULT_ORDER_OF = 'TAHMEED';
