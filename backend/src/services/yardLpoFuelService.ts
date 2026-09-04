/**
 * Shared yard-fuel helpers used by legacy Tanga/Dar LPO controllers and
 * LPOSummary-backed yard stations (Tanga Yard / Dar Yard).
 */
import { FuelRecord } from '../models';
import { emitDataChange } from './websocket';
import { sanitizeRegexInput, normalizeTruckNo } from '../utils';
import type { YardFuelField } from '../utils/yardStations';
import { checkAndPromoteStartedJourney } from './journeyService';

export function recalcYardBalance(fr: any): number {
  const total = (fr.totalLts ?? 0) + (fr.extra ?? 0);
  const used =
    (fr.mmsaYard ?? 0) +
    (fr.tangaYard ?? 0) +
    (fr.darYard ?? 0) +
    (fr.tangaGoing ?? 0) +
    (fr.darGoing ?? 0) +
    (fr.moroGoing ?? 0) +
    (fr.mbeyaGoing ?? 0) +
    (fr.tdmGoing ?? 0) +
    (fr.zambiaGoing ?? 0) +
    (fr.congoFuel ?? 0) +
    (fr.zambiaReturn ?? 0) +
    (fr.tundumaReturn ?? 0) +
    (fr.mbeyaReturn ?? 0) +
    (fr.moroReturn ?? 0) +
    (fr.darReturn ?? 0) +
    (fr.tangaReturn ?? 0);
  return total - used;
}

/** Liters written to the yard column; defaults to billed `liters`. */
export function dispenseAmount(entry: any): number {
  return entry.dispenseLiters != null ? entry.dispenseLiters : entry.liters;
}

export async function findLinkedFuelRecord(
  doNo: string,
  truckNo: string,
  afterDate?: Date
): Promise<any | null> {
  const safeTruck = sanitizeRegexInput(truckNo);
  const safeDo = sanitizeRegexInput(doNo);
  const query: any = {
    truckNo: { $regex: new RegExp(`^${safeTruck}$`, 'i') },
    $or: [
      { goingDo: { $regex: new RegExp(`^${safeDo}$`, 'i') } },
      { returnDo: { $regex: new RegExp(`^${safeDo}$`, 'i') } },
    ],
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (afterDate) query.date = { $gte: afterDate.toISOString().split('T')[0] };
  const records = await FuelRecord.find(query).sort({ date: -1 });
  return records.length ? records[0] : null;
}

export async function findFuelRecordsByTruck(truckNo: string, afterDate?: Date): Promise<any[]> {
  const normalized = normalizeTruckNo(truckNo);
  if (!normalized) return [];
  const m = normalized.match(/^(T?\d+)([A-Z]+)$/);
  const pattern = m ? `^${m[1]}[\\s-]*${m[2]}$` : `^${normalized}$`;
  const query: any = {
    truckNo: { $regex: new RegExp(pattern, 'i') },
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (afterDate) query.date = { $gte: afterDate.toISOString().split('T')[0] };
  return FuelRecord.find(query).sort({ date: -1 }).limit(50);
}

export async function applyYardFieldDelta(
  fuelRecord: any,
  field: YardFuelField,
  deltaLiters: number,
  username = 'yard-system'
): Promise<void> {
  fuelRecord[field] = Math.max(0, (fuelRecord[field] ?? 0) + deltaLiters);
  fuelRecord.balance = recalcYardBalance(fuelRecord);
  await fuelRecord.save();
  emitDataChange('fuel_records', 'update', fuelRecord.toObject());
  // Filling a queued journey's yard column starts that trip — complete the prior active.
  if (deltaLiters > 0) {
    await checkAndPromoteStartedJourney(fuelRecord, username);
  }
}

/**
 * Reconcile a yard LPO amend onto the fuel record.
 *
 * Uses how much of `oldDispense` is actually present on the yard column — if the
 * initial link never wrote (column empty), we ADD `newDispense` instead of
 * applying `newDispense - oldDispense` (which would stay at 0 after Math.max).
 */
export async function applyAmendYardDispense(
  fuelRecord: any,
  field: YardFuelField,
  oldDispense: number,
  newDispense: number,
): Promise<number> {
  const current = Number(fuelRecord[field] ?? 0) || 0;
  const old = Math.max(0, Number(oldDispense) || 0);
  const next = Math.max(0, Number(newDispense) || 0);
  const previouslyApplied = Math.min(old, current);
  const delta = next - previouslyApplied;
  if (Math.abs(delta) < 0.001) return 0;
  await applyYardFieldDelta(fuelRecord, field, delta);
  return delta;
}

/** Clear linkage and reverse dispensed liters from the yard column. Row stays active. */
export async function unlinkYardEntryFuel(
  entry: any,
  field: YardFuelField,
  username = 'yard-system'
): Promise<{ reversedLiters: number; oldFuelRecordId: string }> {
  const oldFuelRecordId = String(entry.linkedFuelRecordId || '');
  if (!oldFuelRecordId) {
    throw new Error('Entry is not linked');
  }
  const reversedLiters = dispenseAmount(entry);
  const fr = await FuelRecord.findById(oldFuelRecordId);
  if (fr && reversedLiters > 0) {
    await applyYardFieldDelta(fr, field, -reversedLiters, username);
  }
  entry.linkedFuelRecordId = '';
  return { reversedLiters, oldFuelRecordId };
}

/**
 * Linked DO/truck change: reverse dispense on the old fuel record, then add it on a
 * matching new journey (or leave the row unlinked if none is found).
 */
export async function moveYardEntryLink(
  entry: any,
  field: YardFuelField,
  newDoNo: string,
  newTruckNo: string,
  username = 'yard-system'
): Promise<{
  status: 'moved' | 'unlinked' | 'same';
  dispenseLiters: number;
  oldFuelRecordId: string;
  newFuelRecordId?: string;
}> {
  const oldFuelRecordId = String(entry.linkedFuelRecordId || '');
  if (!oldFuelRecordId) {
    throw new Error('Entry is not linked');
  }

  const doNo = String(newDoNo || '').trim();
  const truckNo = String(newTruckNo || '').trim();
  if (!truckNo) {
    throw new Error('Truck number is required');
  }

  const dispense = dispenseAmount(entry);
  const oldFr = await FuelRecord.findById(oldFuelRecordId);
  if (oldFr && dispense > 0) {
    await applyYardFieldDelta(oldFr, field, -dispense, username);
  }

  entry.doNo = doNo;
  entry.truckNo = truckNo;

  const doUp = doNo.toUpperCase();
  const isSpecial = !doNo || doUp === 'NIL' || doUp === 'N/A' || doUp === 'PENDING';
  if (isSpecial) {
    entry.linkedFuelRecordId = '';
    return { status: 'unlinked', dispenseLiters: dispense, oldFuelRecordId };
  }

  const newFr = await findLinkedFuelRecord(doNo, truckNo);
  if (!newFr) {
    entry.linkedFuelRecordId = '';
    return { status: 'unlinked', dispenseLiters: dispense, oldFuelRecordId };
  }

  const newId = String(newFr._id);
  if (dispense > 0) {
    await applyYardFieldDelta(newFr, field, dispense, username);
  }
  entry.linkedFuelRecordId = newId;
  if (newFr.to) entry.dest = newFr.to;

  return {
    status: newId === oldFuelRecordId ? 'same' : 'moved',
    dispenseLiters: dispense,
    oldFuelRecordId,
    newFuelRecordId: newId,
  };
}
