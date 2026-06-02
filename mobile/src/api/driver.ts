import { apiClient } from './client';

/**
 * Driver data API — mirrors what the web DriverPortal consumes.
 * All endpoints are GET (no CSRF needed for mobile Bearer auth).
 */

export type JourneyPhase = 'none' | 'going' | 'returning' | 'completed';

export interface DeliveryOrderLite {
  _id?: string;
  doNumber?: string;
  destination?: string;
  loadingPoint?: string;
  offloadingPoint?: string;
  importOrExport?: 'IMPORT' | 'EXPORT' | string;
  date?: string;
}

export interface CurrentJourney {
  goingDO: DeliveryOrderLite | null;
  returningDO: DeliveryOrderLite | null;
  journeyDONumbers: string[];
  allDeliveryOrders: DeliveryOrderLite[];
  journeyPhase: JourneyPhase;
}

export interface FuelRecordLite {
  _id: string;
  liters?: number;
  fuelStation?: string;
  date?: string;
  doNo?: string;
}

/** Raw LPO entry as returned by /lpo-documents/driver-entries/:truck */
export interface RawDriverLpoEntry {
  _id?: string;
  id?: string;
  date?: string;
  lpoNo?: string;
  station?: string;
  doSdo?: string;
  truckNo?: string;
  ltrs?: number;
  pricePerLtr?: number;
  amount?: number;
  destinations?: string;
  referenceDo?: string;
  isCancelled?: boolean;
  cancellationPoint?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  amendedAt?: string;
  originalLiters?: number;
  isDriverAccount?: boolean;
}

/** Normalised LPO entry the driver UI renders. */
export interface DriverLpoEntry {
  id: string;
  date?: string;
  lpoNo?: string;
  station: string;
  doNo: string;
  liters: number;
  rate: number;
  amount: number;
  destination: string;
  isCancelled: boolean;
  cancellationPoint?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  amendedAt?: string;
  originalLiters?: number;
  isDriverAccount: boolean;
}

function isNil(v: string | undefined): boolean {
  const s = (v ?? '').toString().trim().toUpperCase();
  return s === '' || s === 'NIL' || s === 'N/A';
}

export async function getCurrentJourney(truck: string): Promise<CurrentJourney> {
  const res = await apiClient.get(
    `/delivery-orders/truck/${encodeURIComponent(truck)}/current-journey`
  );
  const d = res.data?.data ?? {};
  return {
    goingDO: d.goingDO ?? null,
    returningDO: d.returningDO ?? null,
    journeyDONumbers: d.journeyDONumbers ?? [],
    allDeliveryOrders: d.allDeliveryOrders ?? [],
    journeyPhase: (d.journeyPhase ?? 'none') as JourneyPhase,
  };
}

export async function getFuelRecords(truck: string): Promise<FuelRecordLite[]> {
  const res = await apiClient.get(`/fuel-records`, {
    params: { truckNo: truck, limit: 100 },
  });
  return res.data?.data?.items ?? [];
}

export async function getDriverLpoEntries(truck: string): Promise<DriverLpoEntry[]> {
  const res = await apiClient.get(
    `/lpo-documents/driver-entries/${encodeURIComponent(truck)}`,
    { params: { limit: 10000 } }
  );
  const raw: RawDriverLpoEntry[] = res.data?.data ?? [];

  const entries = raw.map((e): DriverLpoEntry => {
    const nilDO = isNil(e.doSdo);
    const nilDest = isNil(e.destinations);
    return {
      id: (e._id || e.id || e.lpoNo || Math.random().toString(36)).toString(),
      date: e.date,
      lpoNo: e.lpoNo,
      station: e.station || 'N/A',
      doNo: nilDO ? 'NIL' : (e.doSdo || 'N/A'),
      liters: e.ltrs || 0,
      rate: e.pricePerLtr || 0,
      amount: e.amount || 0,
      destination: nilDest ? 'NIL' : (e.destinations || 'N/A'),
      isCancelled: !!e.isCancelled,
      cancellationPoint: e.cancellationPoint,
      cancellationReason: e.cancellationReason,
      cancelledAt: e.cancelledAt,
      amendedAt: e.amendedAt,
      originalLiters: e.originalLiters,
      isDriverAccount: !!e.isDriverAccount || nilDO,
    };
  });

  // Newest first.
  entries.sort(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  );
  return entries;
}

export interface DriverDashboard {
  journey: CurrentJourney;
  fuelRecords: FuelRecordLite[];
  lpoEntries: DriverLpoEntry[];
  totals: { total: number; used: number; remaining: number };
}

/** Fetch everything the driver home needs in one call (parallel). */
export async function getDriverDashboard(truck: string): Promise<DriverDashboard> {
  const [journey, fuelRecords, lpoEntries] = await Promise.all([
    getCurrentJourney(truck),
    getFuelRecords(truck),
    getDriverLpoEntries(truck),
  ]);

  const total = lpoEntries.reduce((s, e) => s + (e.liters || 0), 0);
  const used = lpoEntries
    .filter((e) => !e.isCancelled)
    .reduce((s, e) => s + (e.liters || 0), 0);

  return {
    journey,
    fuelRecords,
    lpoEntries,
    totals: { total, used, remaining: total - used },
  };
}
