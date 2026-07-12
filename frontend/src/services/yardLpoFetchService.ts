import { configAPI, fuelRecordsAPI } from './api';
import type { YardFuelTimeLimitConfig } from './api';
import type { FuelRecord } from '../types';

export type YardKey = 'darYard' | 'tangaYard';

/** Max fuel-record candidates surfaced for yard LPO form fetch / link. */
export const YARD_FETCH_CANDIDATE_CAP = 3;

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
 * Truck-only fuel-record candidates within the Journey Config yard time window
 * (same policy as sheet auto-link). Newest first, capped at 3.
 */
export async function fetchYardTruckCandidates(
  truckNo: string,
  yard: YardKey
): Promise<{ candidates: FuelRecord[]; dateFrom?: string; windowDays?: number }> {
  const trimmed = truckNo.trim();
  if (trimmed.length < 3) return { candidates: [] };

  const cfg = await configAPI.getYardFuelTimeLimit().catch(() => null as YardFuelTimeLimitConfig | null);
  const dateFrom = computeYardAfterDate(cfg, yard);
  const yardCfg = cfg?.perYard?.[yard];
  const windowDays =
    cfg?.enabled && yardCfg?.enabled && yardCfg.timeLimitDays != null
      ? Number(yardCfg.timeLimitDays)
      : undefined;

  const response = await fuelRecordsAPI.getAll({
    truckNo: trimmed,
    ...(dateFrom ? { dateFrom } : {}),
    excludeCancelled: 'true',
    limit: 50,
  });

  const active = (response.data || []).filter(r => !r.isCancelled);

  const sorted = [...active].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    candidates: sorted.slice(0, YARD_FETCH_CANDIDATE_CAP),
    dateFrom,
    windowDays,
  };
}
