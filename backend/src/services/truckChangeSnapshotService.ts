import mongoose, { ClientSession } from 'mongoose';
import { FuelRecord, DeliveryOrder } from '../models';
import { ApiError } from '../middleware/errorHandler';
import {
  FUEL_CHECKPOINT_FIELDS,
  sumFuelCheckpoints,
  recalculateBalanceFromTotal,
} from '../utils/fuelRecordCalculator';
import { formatTruckNumber, logger } from '../utils';
import { reassignJourneyOnTruckChange } from './journeyService';

export type CheckpointDecision = 'maintain' | 'reset';
export type TruckChangeSnapshotSource = 'do_amend' | 'fuel_record_edit';

export type CheckpointValues = Record<(typeof FUEL_CHECKPOINT_FIELDS)[number], number>;

export interface TruckChangeSnapshotPreview {
  fuelRecordId: string;
  oldTruckNo: string;
  newTruckNo: string;
  doNumber: string;
  totalAllocated: number;
  checkpoints: Partial<CheckpointValues>;
  balance: number;
  totalLts: number | null;
  extra: number | null;
}

export function captureCheckpointValues(record: Record<string, any>): CheckpointValues {
  const out = {} as CheckpointValues;
  for (const field of FUEL_CHECKPOINT_FIELDS) {
    out[field] = Number(record[field] || 0);
  }
  return out;
}

export function nonZeroCheckpoints(record: Record<string, any>): Partial<CheckpointValues> {
  const out: Partial<CheckpointValues> = {};
  for (const field of FUEL_CHECKPOINT_FIELDS) {
    const v = Number(record[field] || 0);
    if (v !== 0) out[field] = v;
  }
  return out;
}

export async function findLinkedFuelRecordForDo(
  deliveryOrder: { doType?: string; importOrExport?: string; doNumber?: string },
  session?: ClientSession | null
) {
  if (String(deliveryOrder.doType || '').toUpperCase() === 'SDO') return null;
  const doNumber = String(deliveryOrder.doNumber || '').trim();
  if (!doNumber) return null;

  const dir = String(deliveryOrder.importOrExport || '').toUpperCase();
  const filter =
    dir === 'IMPORT'
      ? { goingDo: doNumber, isDeleted: false }
      : dir === 'EXPORT'
        ? { returnDo: doNumber, isDeleted: false }
        : null;
  if (!filter) return null;

  return FuelRecord.findOne(filter).session(session || null);
}

export async function buildCheckpointDecisionPreview(
  deliveryOrder: {
    doType?: string;
    importOrExport?: string;
    doNumber?: string;
    truckNo?: string;
  },
  newTruckNoRaw: string,
  session?: ClientSession | null
): Promise<TruckChangeSnapshotPreview | null> {
  const fuel = await findLinkedFuelRecordForDo(deliveryOrder, session);
  if (!fuel) return null;

  const totalAllocated = sumFuelCheckpoints(fuel);
  if (totalAllocated <= 0) return null;

  return {
    fuelRecordId: fuel._id.toString(),
    oldTruckNo: formatTruckNumber(String(fuel.truckNo || deliveryOrder.truckNo || '')),
    newTruckNo: formatTruckNumber(String(newTruckNoRaw || '')),
    doNumber: String(deliveryOrder.doNumber || ''),
    totalAllocated,
    checkpoints: nonZeroCheckpoints(fuel),
    balance: Number(fuel.balance || 0),
    totalLts: fuel.totalLts == null ? null : Number(fuel.totalLts),
    extra: fuel.extra == null ? null : Number(fuel.extra),
  };
}

/**
 * After a truck reassignment, persist a truck-change snapshot and optionally
 * reset checkpoint liters that belonged to the former truck.
 */
export async function applyTruckChangeCheckpointDecision(
  fuelRecordId: string,
  options: {
    session?: ClientSession;
    username: string;
    decision: CheckpointDecision;
    oldTruckNo: string;
    newTruckNo: string;
    source: TruckChangeSnapshotSource;
    doNumber?: string;
    deliveryOrderId?: string;
    placement?: string;
  }
): Promise<{ snapshotId: string; changes: string[]; checkpointsReset: boolean }> {
  const opts = options.session ? { session: options.session } : {};
  const record = await FuelRecord.findById(fuelRecordId).session(options.session || null);
  if (!record || record.isDeleted) {
    throw new ApiError(404, 'Fuel record not found for truck-change checkpoint decision');
  }

  const checkpointsBefore = captureCheckpointValues(record);
  const balanceBefore = Number(record.balance || 0);
  const totalLtsBefore = record.totalLts == null ? null : Number(record.totalLts);
  const extraBefore = record.extra == null ? null : Number(record.extra);

  const snapshotDoc: any = {
    _id: new mongoose.Types.ObjectId(),
    changedAt: new Date(),
    changedBy: options.username,
    source: options.source,
    deliveryOrderId: options.deliveryOrderId || undefined,
    doNumber: options.doNumber || undefined,
    oldTruckNo: formatTruckNumber(options.oldTruckNo),
    newTruckNo: formatTruckNumber(options.newTruckNo),
    decision: options.decision,
    checkpointsBefore,
    balanceBefore,
    totalLtsBefore,
    extraBefore,
    journeyBefore: {
      journeyStatus: record.journeyStatus,
      queueOrder: record.queueOrder,
      previousJourneyId: record.previousJourneyId,
      activatedAt: record.activatedAt,
    },
    placement: options.placement || undefined,
  };

  const $set: Record<string, any> = {
    hasTruckChange: true,
    lastTruckChangeAt: snapshotDoc.changedAt,
  };
  const changes: string[] = [];

  if (options.decision === 'reset') {
    for (const field of FUEL_CHECKPOINT_FIELDS) {
      $set[field] = 0;
    }
    const balance = recalculateBalanceFromTotal(record.totalLts, record.extra, {
      ...checkpointsBefore,
      ...Object.fromEntries(FUEL_CHECKPOINT_FIELDS.map((f) => [f, 0])),
    });
    $set.balance = balance;
    changes.push(
      `Checkpoints reset for new truck (was ${sumFuelCheckpoints(checkpointsBefore)}L allocated)`
    );
    changes.push(`Balance recalculated: ${balance}L`);
  } else {
    const allocated = sumFuelCheckpoints(checkpointsBefore);
    if (allocated > 0) {
      changes.push(`Checkpoints maintained on new truck (${allocated}L allocated)`);
    } else {
      changes.push('Truck change snapshot recorded (no checkpoint allocation)');
    }
  }

  await FuelRecord.findByIdAndUpdate(
    fuelRecordId,
    {
      $set,
      $push: { truckChangeSnapshots: snapshotDoc },
    },
    opts
  );

  logger.info(
    `Truck-change snapshot ${snapshotDoc._id} on fuel ${fuelRecordId}: ` +
      `${snapshotDoc.oldTruckNo} → ${snapshotDoc.newTruckNo} (${options.decision}) by ${options.username}`
  );

  return {
    snapshotId: snapshotDoc._id.toString(),
    changes,
    checkpointsReset: options.decision === 'reset',
  };
}

/**
 * Undo the latest (or specified) truck-change snapshot: move journey back and
 * restore checkpoints if they were reset by that amend.
 */
export async function undoTruckChangeSnapshot(
  fuelRecordId: string,
  username: string,
  options?: { snapshotId?: string; session?: ClientSession }
): Promise<{
  fuelRecord: any;
  snapshotId: string;
  deliveryOrderId?: string;
  doNumber?: string;
  previousTruckNo: string;
  restoredTruckNo: string;
  decision?: 'maintain' | 'reset';
  affectedIds: string[];
}> {
  const session = options?.session;
  const ownSession = !session;
  const localSession = session || (await mongoose.startSession());
  let result: {
    fuelRecord: any;
    snapshotId: string;
    deliveryOrderId?: string;
    doNumber?: string;
    previousTruckNo: string;
    restoredTruckNo: string;
    decision?: 'maintain' | 'reset';
    affectedIds: string[];
  } | null = null;

  try {
    const run = async (s: ClientSession) => {
      const record = await FuelRecord.findById(fuelRecordId).session(s);
      if (!record || record.isDeleted) {
        throw new ApiError(404, 'Fuel record not found');
      }

      const snapshots = Array.isArray(record.truckChangeSnapshots)
        ? [...record.truckChangeSnapshots]
        : [];
      if (snapshots.length === 0) {
        throw new ApiError(404, 'No truck-change snapshots on this fuel record');
      }

      let snap: any;
      if (options?.snapshotId) {
        snap = snapshots.find((x: any) => String(x._id) === String(options.snapshotId));
        if (!snap) throw new ApiError(404, 'Truck-change snapshot not found');
      } else {
        snap = [...snapshots].reverse().find((x: any) => !x.undoneAt);
        if (!snap) throw new ApiError(409, 'No active truck-change snapshot to undo');
      }

      if (snap.undoneAt) {
        throw new ApiError(409, 'This truck-change snapshot was already undone');
      }

      // Only allow undoing the latest active snapshot to avoid stacked conflicts.
      const latestActive = [...snapshots].reverse().find((x: any) => !x.undoneAt);
      if (latestActive && String(latestActive._id) !== String(snap._id)) {
        throw new ApiError(
          409,
          'Only the most recent truck-change snapshot can be undone. Undo newer changes first.'
        );
      }

      const expectedNew = formatTruckNumber(String(snap.newTruckNo || ''));
      const currentTruck = formatTruckNumber(String(record.truckNo || ''));
      if (expectedNew && currentTruck !== expectedNew) {
        throw new ApiError(
          409,
          `Cannot undo — fuel record truck is now ${currentTruck}, expected ${expectedNew} from the snapshot`
        );
      }

      const restoreTruck = formatTruckNumber(String(snap.oldTruckNo || ''));
      if (!restoreTruck) {
        throw new ApiError(422, 'Snapshot is missing the previous truck number');
      }

      const reassign = await reassignJourneyOnTruckChange(
        fuelRecordId,
        restoreTruck,
        username,
        { session: s }
      );

      const refreshed = await FuelRecord.findById(fuelRecordId).session(s);
      if (!refreshed) throw new ApiError(404, 'Fuel record not found after truck restore');

      if (snap.decision === 'reset' && snap.checkpointsBefore) {
        for (const field of FUEL_CHECKPOINT_FIELDS) {
          (refreshed as any)[field] = Number(snap.checkpointsBefore[field] || 0);
        }
        refreshed.balance = recalculateBalanceFromTotal(
          refreshed.totalLts,
          refreshed.extra,
          refreshed
        );
      }

      if (!Array.isArray(refreshed.truckChangeSnapshots)) {
        refreshed.truckChangeSnapshots = [];
      }
      const snapList = refreshed.truckChangeSnapshots;
      const snapIndex = snapList.findIndex(
        (x: any) => String(x._id) === String(snap._id)
      );
      if (snapIndex >= 0) {
        snapList[snapIndex].undoneAt = new Date();
        snapList[snapIndex].undoneBy = username;
      }

      const stillActive = snapList.some(
        (x: any) => !x.undoneAt && String(x._id) !== String(snap._id)
      );
      refreshed.hasTruckChange = stillActive;
      if (!stillActive) {
        refreshed.lastTruckChangeAt = undefined;
      }

      await refreshed.save({ session: s });

      let deliveryOrderId = snap.deliveryOrderId ? String(snap.deliveryOrderId) : undefined;
      let doNumber = snap.doNumber ? String(snap.doNumber) : undefined;
      if (snap.source === 'do_amend' && (deliveryOrderId || snap.doNumber)) {
        const doFilter = deliveryOrderId
          ? { _id: deliveryOrderId, isDeleted: false }
          : { doNumber: snap.doNumber, isDeleted: false };
        const deliveryOrder = await DeliveryOrder.findOne(doFilter).session(s);
        if (deliveryOrder) {
          deliveryOrderId = deliveryOrder._id.toString();
          doNumber = String(deliveryOrder.doNumber || doNumber || '');
          const prevTruck = deliveryOrder.truckNo;
          deliveryOrder.truckNo = restoreTruck;
          deliveryOrder.lastEditedAt = new Date();
          deliveryOrder.lastEditedBy = username;
          deliveryOrder.editHistory = deliveryOrder.editHistory || [];
          deliveryOrder.editHistory.push({
            editedAt: new Date(),
            editedBy: username,
            changes: [
              { field: 'truckNo', oldValue: prevTruck, newValue: restoreTruck },
            ],
            reason: `Undo truck-change snapshot ${snap._id}`,
          } as any);

          const otherFuelWithSnap = await FuelRecord.exists({
            _id: { $ne: fuelRecordId },
            isDeleted: false,
            'truckChangeSnapshots.deliveryOrderId': deliveryOrderId,
            'truckChangeSnapshots.undoneAt': { $exists: false },
          }).session(s);
          // Clear DO flag when this DO has no remaining active truck-change snapshots.
          const doStillHasActive = snapList.some(
            (x: any) =>
              !x.undoneAt &&
              String(x._id) !== String(snap._id) &&
              (String(x.deliveryOrderId || '') === deliveryOrderId ||
                String(x.doNumber || '') === String(deliveryOrder.doNumber))
          );
          if (!doStillHasActive && !otherFuelWithSnap) {
            deliveryOrder.hasTruckChangeAmendment = false;
          }

          await deliveryOrder.save({ session: s });
        }
      }

      result = {
        fuelRecord: refreshed,
        snapshotId: String(snap._id),
        deliveryOrderId,
        doNumber,
        previousTruckNo: currentTruck,
        restoredTruckNo: restoreTruck,
        decision: snap.decision === 'reset' ? 'reset' : 'maintain',
        affectedIds: Array.from(
          new Set([fuelRecordId, ...(reassign.affectedIds || [])])
        ),
      };

      logger.info(
        `Undid truck-change snapshot ${snap._id} on fuel ${fuelRecordId}: ` +
          `${currentTruck} → ${restoreTruck} by ${username}`
      );
    };

    if (ownSession) {
      await localSession.withTransaction(async () => run(localSession));
    } else {
      await run(localSession);
    }
  } finally {
    if (ownSession) await localSession.endSession();
  }

  if (!result) throw new ApiError(500, 'Failed to undo truck-change snapshot');
  return result;
}
