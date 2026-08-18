import { fuelRecordsAPI } from './api';
import type { YardFuelTimeLimitConfig } from './api';
import type { FuelRecord } from '../types';

export type YardKey = 'darYard' | 'tangaYard';

/** Max fuel-record candidates surfaced for yard LPO form fetch / link. */
export const YARD_FETCH_CANDIDATE_CAP = 3;

/**
 * Day-window helper for yard fuel sheet auto-link / legacy callers.
 * Truck journey lookup in LPO Detail / dedicated yard forms no longer uses this.
 */
export function computeYardAfterDate(
  cfg: YardFuelTimeLimitConfig | null | undefined,
  yard: YardKey
): string | undefined {
  if (!cfg?.enabled) return undefined;
  const yardCfg = cfg.perYard?.[yard];
  if (!yardCfg?.enabled || yardCfg.timeLimitDays == null) return undefined;
  const d = new Date();
  d.setDate(d.getDate() - Number(yardCfg.timeLimitDays));
  return d.toISOString().split('T')[0];
}

export function yardAlreadyDispensed(record: FuelRecord, yard: YardKey): number {
  return yard === 'darYard' ? (record.darYard || 0) : (record.tangaYard || 0);
}

export function recordDoDest(record: FuelRecord): { doNo: string; dest: string } {
  return {
    doNo: record.goingDo || '',
    dest: record.originalGoingTo || record.to || '',
  };
}

export function fuelRecordIdOf(record: FuelRecord): string {
  return String(record._id ?? record.id ?? '');
}

/**
 * Resolve a fuel record by DO number for yard LPO forms (DO-first entry).
 * Mirrors LPODetailForm's getByDoNumber path; ambiguous matches are returned
 * for the caller to open a choice modal rather than silent-picking.
 */
export async function fetchYardRecordByDo(doNumber: string): Promise<{
  fuelRecord: FuelRecord | null;
  matches: FuelRecord[];
  ambiguous: boolean;
}> {
  const doUp = (doNumber || '').trim().toUpperCase();
  if (!doUp || doUp === 'NIL' || doUp === 'N/A' || doUp.length < 3) {
    return { fuelRecord: null, matches: [], ambiguous: false };
  }

  const result = await fuelRecordsAPI.getByDoNumber(doUp);
  if (!result?.fuelRecord) {
    return { fuelRecord: null, matches: [], ambiguous: false };
  }

  const matches = (result.matches || [])
    .map((m) => m.fuelRecord)
    .filter(Boolean) as FuelRecord[];

  return {
    fuelRecord: result.fuelRecord,
    matches: matches.length > 0 ? matches : [result.fuelRecord],
    ambiguous: !!result.ambiguous && matches.length > 1,
  };
}

export function journeysFromYardCandidates(candidates: FuelRecord[]): {
  active: FuelRecord | null;
  queued: FuelRecord[];
} {
  const queued = candidates.filter((c) => c.journeyStatus === 'queued');
  const active = candidates.find((c) => c.journeyStatus === 'active') || null;
  return { active, queued };
}

/**
 * Queue-first, then active, then remaining — same priority as LPO Detail yard.
 */
export function sortYardJourneyCandidates(records: FuelRecord[]): FuelRecord[] {
  return [...records].sort((a, b) => {
    const rank = (r: FuelRecord) =>
      r.journeyStatus === 'queued' ? 0 : r.journeyStatus === 'active' ? 1 : 2;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return (Number((a as any).queueOrder) || 0) - (Number((b as any).queueOrder) || 0);
    return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
  });
}

/**
 * Truck-only fuel-record candidates for dedicated Dar/Tanga yard forms.
 * No calendar day window — prefer active/queued journeys (same gate as LPO Detail yard).
 * Queued first (by queueOrder), then active, newest first within a rank. Capped at YARD_FETCH_CANDIDATE_CAP.
 */
export async function fetchYardTruckCandidates(
  truckNo: string,
  _yard: YardKey
): Promise<{ candidates: FuelRecord[]; dateFrom?: string; windowDays?: number }> {
  const trimmed = truckNo.trim();
  if (trimmed.length < 3) return { candidates: [] };

  let active: FuelRecord[] = [];
  try {
    const { data } = await fuelRecordsAPI.getForLpoTruckLookup(trimmed, { mode: 'yard' });
    active = (data || []).filter((r) => !r.isCancelled);
  } catch {
    const response = await fuelRecordsAPI.getAll({
      truckNo: trimmed,
      excludeCancelled: 'true',
      limit: 50,
    });
    active = (response.data || []).filter((r) => !r.isCancelled);
  }

  const preferred = active.filter(
    (r) =>
      r.journeyStatus === 'active' ||
      r.journeyStatus === 'queued' ||
      !!(r as any).isLocked ||
      !!(r as any).isPendingGoing
  );
  const pool = preferred.length > 0 ? preferred : active;

  return {
    candidates: sortYardJourneyCandidates(pool).slice(0, YARD_FETCH_CANDIDATE_CAP),
  };
}
