import { ClientSession } from 'mongoose';
import {
  DeliveryOrder,
  FuelRecord,
  LPOSummary,
  DarLPODocument,
  TangaLPODocument,
  PendingDoHistory,
} from '../models';
import { RouteConfig } from '../models/RouteConfig';
import { isPendingGoingDo, isPendingReturnDo } from '../utils/pendingDoNumber';
import {
  buildExportReturnUnlinkUpdate,
  matchExportRouteLiters,
  recalculateBalanceFromTotal,
  resolveStoredOutboundLiters,
} from '../utils/fuelRecordCalculator';
import { snapshotFuelRecord } from '../utils/fuelRecordAudit';
import logger from '../utils/logger';

/**
 * Undo a pending-DO promotion when the real DO that absorbed the placeholder is
 * switched to the other direction:
 *  - IMPORT DO that replaced PG#### → journey goes back to pending going PG####
 *  - EXPORT DO that replaced PR#### → return leg goes back to pending return PR####
 * Dispensed checkpoint liters and the journey's queue position are kept. Must run
 * inside the caller's transaction so it rolls back with the DO update.
 */

const TBA = 'TBA';
const RETURN_FUEL_FIELDS = [
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
];

export interface PendingRevivalResult {
  revived: true;
  kind: 'going' | 'return';
  pendingDo: string;
  realDoNumber: string;
  fuelRecordId: string;
  lpoRefsReverted: number;
  fuelAudit: { resourceId: string; previous: Record<string, any>; next: Record<string, any> };
}

export type PendingRevivalOutcome = PendingRevivalResult | { revived: false; reason?: string };

interface RevivalDO {
  _id?: unknown;
  doNumber: string;
  doType?: string;
  importOrExport?: string;
  loadingPoint?: string;
  destination?: string;
}

/** Point LPO / Dar / Tanga lines back from the real DO to the pending placeholder. */
async function revertPendingDoReferences(
  realDo: string,
  pendingDo: string,
  session: ClientSession
): Promise<number> {
  const update = {
    $set: { 'entries.$[e].doNo': pendingDo },
    $unset: { 'entries.$[e].previousPendingDo': '' },
  };
  const options = { session, arrayFilters: [{ 'e.doNo': realDo, 'e.previousPendingDo': pendingDo }] };
  const filter = { isDeleted: false, 'entries.doNo': realDo, 'entries.previousPendingDo': pendingDo };
  const results = await Promise.all([
    LPOSummary.updateMany(filter, update, options),
    DarLPODocument.updateMany(filter, update, options),
    TangaLPODocument.updateMany(filter, update, options),
  ]);
  return results.reduce((sum, r) => sum + (r.modifiedCount || 0), 0);
}

async function reopenPendingHistory(
  kind: 'going' | 'return',
  pendingDo: string,
  fuelRecordId: unknown,
  session: ClientSession
): Promise<void> {
  await PendingDoHistory.updateOne(
    { kind, pendingDo, fuelRecordId, status: 'assigned' },
    { $set: { status: 'pending', realDoNumber: null, deliveryOrderId: null, promotedAt: null, promotedBy: null } },
    { session }
  );
}

async function clearDeliveryOrderPromotion(order: RevivalDO, session: ClientSession): Promise<void> {
  if (!order._id) return;
  await DeliveryOrder.updateOne(
    { _id: order._id },
    { $unset: { promotedFromPendingDo: 1, promotedFromPendingAt: 1, pendingAssignedAt: 1 } },
    { session, strict: false }
  );
}

async function pendingNumberInUse(
  field: 'goingDo' | 'returnDo',
  pendingDo: string,
  excludeId: unknown,
  session: ClientSession
): Promise<boolean> {
  const exists = await FuelRecord.exists({
    [field]: pendingDo,
    _id: { $ne: excludeId },
    isDeleted: false,
    isCancelled: { $ne: true },
  }).session(session);
  return !!exists;
}

async function revivePendingGoing(order: RevivalDO, session: ClientSession): Promise<PendingRevivalOutcome> {
  const record: any = await FuelRecord.findOne({
    goingDo: order.doNumber,
    isDeleted: false,
    isCancelled: { $ne: true },
  }).session(session);
  if (!record) return { revived: false };

  const pendingDo = String(record.previousPendingGoingDo || '');
  if (!isPendingGoingDo(pendingDo)) return { revived: false };

  if (record.returnDo && !isPendingReturnDo(record.returnDo) && !record.isPendingReturn) {
    return { revived: false, reason: `journey already has return DO ${record.returnDo}` };
  }
  if (await pendingNumberInUse('goingDo', pendingDo, record._id, session)) {
    return { revived: false, reason: `${pendingDo} is already used by another journey` };
  }

  const previous = snapshotFuelRecord(record);
  const set: Record<string, any> = {
    goingDo: pendingDo,
    isPendingGoing: true,
    pendingGoingAt: record.previousPendingGoingAt || record.createdAt || new Date(),
    start: TBA,
    from: TBA,
    to: TBA,
    totalLts: null,
    extra: null,
    balance: 0,
    isLocked: true,
    pendingConfigReason: 'both',
  };
  if (record.isPendingReturn || isPendingReturnDo(record.returnDo)) {
    set.originalGoingFrom = TBA;
    set.originalGoingTo = TBA;
  }
  await FuelRecord.updateOne(
    { _id: record._id },
    {
      $set: set,
      $unset: { previousPendingGoingDo: 1, previousPendingGoingAt: 1, previousPendingGoingPromotedAt: 1 },
    },
    { session }
  );

  const lpoRefsReverted = await revertPendingDoReferences(order.doNumber, pendingDo, session);
  await reopenPendingHistory('going', pendingDo, record._id, session);
  await clearDeliveryOrderPromotion(order, session);

  const after = await FuelRecord.findById(record._id).session(session);
  logger.info(
    `Revived pending going ${pendingDo} on fuel record ${record._id} (DO ${order.doNumber} switched away from IMPORT); LPO refs reverted: ${lpoRefsReverted}`
  );
  return {
    revived: true,
    kind: 'going',
    pendingDo,
    realDoNumber: order.doNumber,
    fuelRecordId: String(record._id),
    lpoRefsReverted,
    fuelAudit: { resourceId: String(record._id), previous, next: snapshotFuelRecord(after) },
  };
}

async function revivePendingReturn(order: RevivalDO, session: ClientSession): Promise<PendingRevivalOutcome> {
  const record: any = await FuelRecord.findOne({
    returnDo: order.doNumber,
    isDeleted: false,
    isCancelled: { $ne: true },
  }).session(session);
  if (!record) return { revived: false };

  const pendingDo = String(record.previousPendingReturnDo || '');
  if (!isPendingReturnDo(pendingDo)) return { revived: false };

  if (await pendingNumberInUse('returnDo', pendingDo, record._id, session)) {
    return { revived: false, reason: `${pendingDo} is already used by another journey` };
  }

  let exportRouteLiters = resolveStoredOutboundLiters(record);
  if (typeof record.outboundLiters !== 'number') {
    const routes = await RouteConfig.find({ isActive: true }).session(session).lean();
    const match = matchExportRouteLiters(routes as any, order.loadingPoint || '', order.destination || '');
    if (match.matched) exportRouteLiters = match.liters;
  }

  const previous = snapshotFuelRecord(record);
  const { update } = buildExportReturnUnlinkUpdate(record.toObject(), { exportRouteLiters });
  // Liters dispensed on the return while it was pending belong to the pending leg — keep them.
  for (const field of RETURN_FUEL_FIELDS) delete update[field];
  const set: Record<string, any> = {
    ...update,
    returnDo: pendingDo,
    isPendingReturn: true,
    pendingReturnAt: record.previousPendingReturnAt || new Date(),
    from: TBA,
    to: TBA,
    originalGoingFrom: record.originalGoingFrom || update.from,
    originalGoingTo: record.originalGoingTo || update.to,
  };
  set.balance = recalculateBalanceFromTotal(set.totalLts, record.extra, { ...record.toObject(), ...set });

  await FuelRecord.updateOne(
    { _id: record._id },
    {
      $set: set,
      $unset: { previousPendingReturnDo: 1, previousPendingReturnAt: 1, previousPendingReturnPromotedAt: 1 },
    },
    { session }
  );

  const lpoRefsReverted = await revertPendingDoReferences(order.doNumber, pendingDo, session);
  await reopenPendingHistory('return', pendingDo, record._id, session);
  await clearDeliveryOrderPromotion(order, session);

  const after = await FuelRecord.findById(record._id).session(session);
  logger.info(
    `Revived pending return ${pendingDo} on fuel record ${record._id} (DO ${order.doNumber} switched away from EXPORT); LPO refs reverted: ${lpoRefsReverted}`
  );
  return {
    revived: true,
    kind: 'return',
    pendingDo,
    realDoNumber: order.doNumber,
    fuelRecordId: String(record._id),
    lpoRefsReverted,
    fuelAudit: { resourceId: String(record._id), previous, next: snapshotFuelRecord(after) },
  };
}

/**
 * Called for a DO whose direction is being switched (before the new direction's
 * fuel step). Returns revived:false when the DO's journey did not come from a
 * pending placeholder (or can't be safely restored) — the caller then applies the
 * normal cancel/unlink.
 */
export async function revivePendingOnDirectionFlip(
  originalDO: RevivalDO,
  session: ClientSession
): Promise<PendingRevivalOutcome> {
  if (String(originalDO.doType || '').toUpperCase() === 'SDO') return { revived: false };
  const from = String(originalDO.importOrExport || '').toUpperCase();
  if (from === 'IMPORT') return revivePendingGoing(originalDO, session);
  if (from === 'EXPORT') return revivePendingReturn(originalDO, session);
  return { revived: false };
}
