/**
 * Yard-station journey lookup for LPODetailForm.
 * Uses unbounded active/queued lookup (mode=yard) — no calendar date window.
 * Selection priority is Queued-first, then Active — because yard dispense is
 * what starts/completes a journey and promotes the next queued.
 */
import { fuelRecordsAPI } from '../services/api';
import type { FuelRecord } from '../types';
import { fuelRecordIdOf } from '../services/yardLpoFetchService';
import type { YardKey } from '../services/yardLpoFetchService';

export type YardJourneyWarning = 'not_found' | 'no_active_record' | 'journey_completed' | null;

export interface YardJourneyLookupResult {
  success: boolean;
  warningType: YardJourneyWarning;
  message: string;
  active: FuelRecord | null;
  queued: FuelRecord[];
  /** Default selection after fetch (queue-first). */
  selectedType: 'active' | 'queued' | null;
  selectedIndex: number; // -1 active, 0+ queued index
  selected: FuelRecord | null;
}

function isJourneyComplete(record: FuelRecord): boolean {
  if ((record as any).isLocked) return false;
  if (record.journeyStatus === 'completed') return true;
  if (record.journeyStatus === 'active' || record.journeyStatus === 'queued') return false;
  return false;
}

function isActiveRecord(r: FuelRecord): boolean {
  if (r.journeyStatus === 'active') return true;
  if (r.journeyStatus === 'queued' || r.journeyStatus === 'completed') return false;
  return !isJourneyComplete(r);
}

function isQueuedRecord(r: FuelRecord): boolean {
  return r.journeyStatus === 'queued';
}

/**
 * Look up journeys for a truck and apply yard priority:
 * 1. If any queued → default Q1 (lowest queueOrder)
 * 2. Else if active → default active
 * 3. Else not_found / no_active_record / journey_completed
 */
export async function fetchYardJourneysForTruck(truckNo: string): Promise<YardJourneyLookupResult> {
  const trimmed = (truckNo || '').trim();
  if (trimmed.length < 3) {
    return {
      success: false,
      warningType: 'not_found',
      message: 'Enter a valid truck number',
      active: null,
      queued: [],
      selectedType: null,
      selectedIndex: -1,
      selected: null,
    };
  }

  // Yard mode: no month/date window — only active / queued / locked pending
  const { data: fuelRecords } = await fuelRecordsAPI.getForLpoTruckLookup(trimmed, { mode: 'yard' });
  const records = (fuelRecords || []).filter((r: FuelRecord) => !r.isCancelled);

  if (records.length === 0) {
    return {
      success: false,
      warningType: 'not_found',
      message: 'No active or queued fuel record found — create a pending going DO or enter manually.',
      active: null,
      queued: [],
      selectedType: null,
      selectedIndex: -1,
      selected: null,
    };
  }

  const sorted = [...records].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  const active: FuelRecord | null =
    sorted.find((r) => r.journeyStatus === 'active') ||
    sorted.find((r) => isActiveRecord(r)) ||
    null;

  const queued = records
    .filter((r) => isQueuedRecord(r))
    .sort((a: any, b: any) => (a.queueOrder || 0) - (b.queueOrder || 0));

  if (!active && queued.length === 0) {
    const mostRecent = sorted[0];
    if (mostRecent && isJourneyComplete(mostRecent)) {
      return {
        success: false,
        warningType: 'journey_completed',
        message: `Journey completed (last: ${mostRecent.goingDo}). Create a pending going DO for a new journey.`,
        active: null,
        queued: [],
        selectedType: null,
        selectedIndex: -1,
        selected: null,
      };
    }
    return {
      success: false,
      warningType: 'no_active_record',
      message: 'No active or queued journey for this truck. Create a pending going DO.',
      active: null,
      queued: [],
      selectedType: null,
      selectedIndex: -1,
      selected: null,
    };
  }

  // Yard priority: Queued first, then Active
  if (queued.length > 0) {
    return {
      success: true,
      warningType: null,
      message: `Queued Q${queued[0].queueOrder || 1}: ${queued[0].goingDo}${active ? ` | Active: ${active.goingDo}` : ''}`,
      active,
      queued,
      selectedType: 'queued',
      selectedIndex: 0,
      selected: queued[0],
    };
  }

  return {
    success: true,
    warningType: null,
    message: `Active journey: ${active!.goingDo}`,
    active,
    queued: [],
    selectedType: 'active',
    selectedIndex: -1,
    selected: active,
  };
}

export function yardColumnLiters(record: FuelRecord | null | undefined, yard: YardKey): number {
  if (!record) return 0;
  return yard === 'darYard' ? (record.darYard ?? 0) : (record.tangaYard ?? 0);
}

export function applyJourneyToEntryFields(record: FuelRecord): { doNo: string; dest: string } {
  const doNo = (record.goingDo || record.returnDo || '').trim() || 'NIL';
  const dest = (record.originalGoingTo || record.to || '').trim() || '-';
  return { doNo, dest };
}

/**
 * Look up a fuel record by DO number (any journey status).
 * Does NOT apply queue-first priority — the matched DO's record is used as-is.
 * No pending-DO path: missing DO → not_found only.
 */
export async function fetchYardJourneyByDo(
  doNumber: string,
  preferredTruckNo?: string
): Promise<YardJourneyLookupResult & { truckNo?: string; ambiguous?: boolean }> {
  const doUp = (doNumber || '').trim().toUpperCase();
  if (!doUp || doUp === 'NIL' || doUp === 'N/A' || doUp.length < 3) {
    return {
      success: false,
      warningType: 'not_found',
      message: 'Enter a valid DO number',
      active: null,
      queued: [],
      selectedType: null,
      selectedIndex: -1,
      selected: null,
    };
  }

  const result = await fuelRecordsAPI.getByDoNumber(doUp);
  if (!result?.fuelRecord) {
    return {
      success: false,
      warningType: 'not_found',
      message: `No fuel record found for DO ${doUp}`,
      active: null,
      queued: [],
      selectedType: null,
      selectedIndex: -1,
      selected: null,
    };
  }

  // If ambiguous and a truck is already on the row, prefer a match on that truck.
  let chosen = result.fuelRecord;
  if (result.ambiguous && result.matches?.length > 1 && preferredTruckNo) {
    const pref = preferredTruckNo.trim().toUpperCase().replace(/[\s-]/g, '');
    const match = result.matches.find((m) => {
      const t = (m.fuelRecord.truckNo || '').toUpperCase().replace(/[\s-]/g, '');
      return t === pref;
    });
    if (match) chosen = match.fuelRecord;
  }

  const status = chosen.journeyStatus;
  const isQueued = status === 'queued';

  return {
    success: true,
    warningType: null,
    message: `Matched DO ${doUp} (${status || 'unknown'})`,
    active: isQueued ? null : chosen,
    queued: isQueued ? [chosen] : [],
    selectedType: isQueued ? 'queued' : 'active',
    selectedIndex: isQueued ? 0 : -1,
    selected: chosen,
    truckNo: chosen.truckNo,
    ambiguous: !!result.ambiguous,
  };
}

export { fuelRecordIdOf };
