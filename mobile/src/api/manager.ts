import { apiClient } from './client';
import { AuthUser } from '../types';

/**
 * Manager / Super Manager data API — reads the flat LPO entry view backed by
 * the LPOSummary collection (GET /lpo-documents/entries). Uses SERVER-SIDE
 * pagination + station filtering + search so the phone never downloads the
 * whole dataset (the old limit=10000 approach was the cause of slow loads).
 *
 * The endpoint is indexed on station+date, so passing `station` is fast.
 */

// All valid fuel stations (excluding CASH).
export const ALL_STATIONS = [
  'INFINITY',
  'LAKE CHILABOMBWE',
  'LAKE NDOLA',
  'LAKE KAPIRI',
  'LAKE KITWE',
  'LAKE KABANGWA',
  'LAKE CHINGOLA',
  'LAKE TUNDUMA',
  'GBP MOROGORO',
  'GBP KANGE',
  'GPB KANGE',
];

// Stations a super_manager does NOT see by default (overridable via config — Step C).
export const EXCLUDED_STATIONS_SUPER = [
  'LAKE TUNDUMA',
  'GBP MOROGORO',
  'GBP KANGE',
  'GPB KANGE',
  'INFINITY',
];

// Station → currency (USD for Zambian LAKE stations, TZS for Tanzania/Infinity/GBP).
// Used as a fallback when the live station config isn't available.
export const STATION_CURRENCY: Record<string, 'USD' | 'TZS'> = {
  'LAKE CHILABOMBWE': 'USD',
  'LAKE NDOLA': 'USD',
  'LAKE KAPIRI': 'USD',
  'LAKE KITWE': 'USD',
  'LAKE KABANGWA': 'USD',
  'LAKE CHINGOLA': 'USD',
  'LAKE TUNDUMA': 'TZS',
  'INFINITY': 'TZS',
  'GBP MOROGORO': 'TZS',
  'GBP KANGE': 'TZS',
  'GPB KANGE': 'TZS',
};

/** Resolve a station's currency: live config first, then the static fallback. */
export function currencyForStation(station: string, configMap?: Record<string, string>): string {
  const key = (station || '').toUpperCase().trim();
  return (configMap && configMap[key]) || STATION_CURRENCY[key] || 'USD';
}

/** Currency code → display symbol. */
export function currencySymbol(cur: string): string {
  const c = (cur || '').toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'TZS') return 'TSh';
  return c || '';
}

const STATION_MAPPING: Record<string, string> = {
  infinity: 'INFINITY',
  chilabombwe: 'LAKE CHILABOMBWE',
  ndola: 'LAKE NDOLA',
  kapiri: 'LAKE KAPIRI',
  kitwe: 'LAKE KITWE',
  kabangwa: 'LAKE KABANGWA',
  chingola: 'LAKE CHINGOLA',
  tunduma: 'LAKE TUNDUMA',
  morogoro: 'GBP MOROGORO',
  kange: 'GBP KANGE',
};

export interface LpoEntry {
  id: string;
  date: string;
  createdAt?: string;
  lpoNo: string;
  station: string;
  doNo: string;
  truckNo: string;
  liters: number;
  rate: number;
  amount: number;
  destination: string;
  currency: string;
  isCancelled: boolean;
  isDriverAccount: boolean;
  isRefer: boolean;
  amendedAt?: string | null;
  originalLiters?: number | null;
}

export interface LpoPage {
  entries: LpoEntry[];
  page: number;
  totalPages: number;
  total: number;
}

export function isSuperManager(user: AuthUser | null): boolean {
  return user?.role === 'super_manager';
}

/** Resolve the station a station-manager is scoped to (null for super_manager). */
export function resolveUserStation(user: AuthUser | null): string | null {
  if (!user || isSuperManager(user)) return null;
  if (user.station) return user.station.toUpperCase();
  const key = (user.username || '')
    .toLowerCase()
    .replace('manager_', '')
    .replace('mgr_', '');
  return STATION_MAPPING[key] || null;
}

/**
 * Stations available to pick in the filter for this user.
 * For super_manager: the admin-configured list (Journey Config) if set,
 * otherwise the default (all stations minus the hard-excluded set).
 */
export function availableStations(user: AuthUser | null, configured?: string[]): string[] {
  if (isSuperManager(user)) {
    if (configured && configured.length > 0) {
      return configured.map((s) => s.toUpperCase().trim());
    }
    return ALL_STATIONS.filter((s) => !EXCLUDED_STATIONS_SUPER.includes(s));
  }
  const s = resolveUserStation(user);
  return s ? [s] : [];
}

function normalizeEntry(e: any): LpoEntry {
  const ltrs = e.ltrs || 0;
  const rate = e.pricePerLtr || 0;
  return {
    id: (e.id || e._id || e.lpoNo || Math.random().toString(36)).toString(),
    date: e.date || '',
    createdAt: e.createdAt,
    lpoNo: e.lpoNo || 'N/A',
    station: (e.dieselAt || 'N/A').toString(),
    doNo: e.doSdo || 'N/A',
    truckNo: e.truckNo || 'N/A',
    liters: ltrs,
    rate,
    amount: ltrs * rate,
    destination: e.destinations || 'N/A',
    currency: e.currency || 'USD',
    isCancelled: !!e.isCancelled,
    isDriverAccount: !!e.isDriverAccount,
    isRefer: !!e.isRefer,
    amendedAt: e.amendedAt ?? null,
    originalLiters: e.originalLtrs ?? null,
  };
}

export type LpoSortKey =
  | 'newest'
  | 'oldest'
  | 'liters_desc'
  | 'liters_asc'
  | 'lpo_desc'
  | 'lpo_asc';

export const SORT_OPTIONS: { key: LpoSortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'liters_desc', label: 'Most L' },
  { key: 'liters_asc', label: 'Least L' },
  { key: 'lpo_asc', label: 'LPO ↑' },
  { key: 'lpo_desc', label: 'LPO ↓' },
];

export interface LpoQueryOpts {
  page?: number;
  limit?: number;
  search?: string;
  sort?: LpoSortKey;
  /** Specific station to filter by (super_manager station picker). */
  station?: string;
  /** Super_manager's allowed station list (used when no specific station is picked). */
  allowedStations?: string[];
}

/**
 * Fetch one page of LPO entries, scoped server-side to the manager's station.
 *
 * - station_manager / manager → station is forced to their own station.
 * - super_manager → uses the picked `station` if provided; otherwise all
 *   stations (excluded ones are dropped client-side for now; Step C makes the
 *   allowed-station list server-side).
 */
export async function getManagerLpoPage(
  user: AuthUser | null,
  opts: LpoQueryOpts = {}
): Promise<LpoPage> {
  const { page = 1, limit = 30, search } = opts;
  const superMgr = isSuperManager(user);
  const specificStation = opts.station && opts.station !== 'all' ? opts.station : null;
  const usingAllowedList = superMgr && !specificStation && !!opts.allowedStations?.length;

  const params: Record<string, any> = { page, limit };
  if (search && search.trim()) params.search = search.trim();
  if (opts.sort) params.sort = opts.sort;

  // Server-side station scoping.
  if (superMgr) {
    if (specificStation) {
      params.station = specificStation;
    } else if (usingAllowedList) {
      // Restrict to the configured allowed stations (server-side $in).
      params.stations = opts.allowedStations!.join(',');
    }
  } else {
    const forcedStation = resolveUserStation(user); // non-null only for station managers
    if (forcedStation) params.station = forcedStation;
  }

  const res = await apiClient.get('/lpo-documents/entries', { params });
  const payload = res.data?.data ?? {};
  const rawList: any[] = Array.isArray(payload) ? payload : payload.data ?? [];
  const pagination = payload.pagination ?? {};

  const entries = rawList.map(normalizeEntry).filter((e) => {
    const station = e.station.toUpperCase().trim();
    if (station === 'CASH') return false;
    // Fallback: super_manager with no specific station AND no configured list →
    // drop the default-excluded stations client-side.
    if (superMgr && !specificStation && !usingAllowedList && EXCLUDED_STATIONS_SUPER.includes(station)) {
      return false;
    }
    return true;
  });

  return {
    entries,
    page: pagination.page ?? page,
    totalPages: pagination.totalPages ?? 1,
    total: pagination.total ?? entries.length,
  };
}
