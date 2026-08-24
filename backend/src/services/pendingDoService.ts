import { ClientSession } from 'mongoose';
import {
  Counter,
  DeliveryOrder,
  FuelRecord,
  LPOSummary,
  DarLPODocument,
  TangaLPODocument,
  PendingDoHistory,
} from '../models';
import {
  formatPendingDoNumber,
  isPendingGoingDo,
  isPendingReturnDo,
  pendingDoCounterKey,
  PendingDoKind,
  returnDoOpenFilter,
  pickBestPendingReturnTarget,
} from '../utils/pendingDoNumber';
import logger from '../utils/logger';
import { AuditService } from '../utils/auditService';
import { buildFuzzyRegex, formatTruckNumber, isTruckNoMatch } from '../utils';
import type { DeliveryOrderLike } from '../utils/fuelRecordCalculator';
import { buildImportFuelRecord, buildReturnUpdate } from '../utils/fuelRecordCalculator';
import { afterJourneyCancelled } from './journeyService';

const TBA = 'TBA';

export type PendingDoDisplayStatus =
  | 'active'
  | 'active_do_pending'
  | 'active_return_do_pending'
  | 'active_both_do_pending'
  | 'queued'
  | 'completed'
  | 'completed_do_pending'
  | 'completed_return_do_pending'
  | 'completed_both_do_pending'
  | 'cancelled'
  | 'assigned';

export interface PendingPromotionContext {
  username?: string;
  userId?: string;
  deliveryOrderId?: string;
  ipAddress?: string;
}

/** Pending follow-up lists include completed journeys (imported going legs often land as completed). */
const PENDING_LIST_JOURNEY_STATUSES = ['active', 'queued', 'completed'] as const;

function pendingFuelRecordBaseFilter(): Record<string, unknown> {
  return {
    isDeleted: false,
    isCancelled: { $ne: true },
    journeyStatus: { $in: [...PENDING_LIST_JOURNEY_STATUSES] },
  };
}

export function derivePendingDoDisplayStatus(record: {
  journeyStatus?: string;
  isPendingGoing?: boolean;
  isPendingReturn?: boolean;
  goingDo?: string;
  returnDo?: string;
}): PendingDoDisplayStatus {
  const status = record.journeyStatus || 'active';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'queued') return 'queued';

  const pendingGoing = record.isPendingGoing === true || isPendingGoingDo(record.goingDo);
  const pendingReturn = record.isPendingReturn === true || isPendingReturnDo(record.returnDo);

  if (status === 'completed') {
    if (pendingGoing && pendingReturn) return 'completed_both_do_pending';
    if (pendingGoing) return 'completed_do_pending';
    if (pendingReturn) return 'completed_return_do_pending';
    return 'completed';
  }

  if (pendingGoing && pendingReturn) return 'active_both_do_pending';
  if (pendingGoing) return 'active_do_pending';
  if (pendingReturn) return 'active_return_do_pending';
  return 'active';
}

/**
 * Atomically allocate the next PG#### / PR#### for the current calendar year.
 * Counter key includes the year so the sequence resets on Jan 1.
 */
export async function allocateNextPendingDoNumber(
  kind: PendingDoKind,
  session?: ClientSession
): Promise<string> {
  const year = new Date().getFullYear();
  const key = pendingDoCounterKey(kind, year);
  const counterQuery = Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  if (session) counterQuery.session(session);
  const counter = await counterQuery;
  let next = counter?.seq ?? 1;

  // Uniqueness guard against year-rollover leftovers still holding PG0001/PR0001
  const field = kind === 'going' ? 'goingDo' : 'returnDo';
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = formatPendingDoNumber(kind, next);
    const existsQuery = FuelRecord.exists({
      [field]: candidate,
      isDeleted: false,
      isCancelled: { $ne: true },
    });
    if (session) existsQuery.session(session);
    const exists = await existsQuery;
    if (!exists) return candidate;
    next += 1;
    const bumpQuery = Counter.findOneAndUpdate(
      { _id: key },
      { $set: { seq: next } },
      { new: true }
    );
    if (session) bumpQuery.session(session);
    await bumpQuery;
  }

  throw new Error(`Unable to allocate unique pending ${kind} DO number`);
}

export interface CreatePendingGoingInput {
  truckNo: string;
  date?: string;
  username: string;
  session?: ClientSession;
}

/**
 * Create a temporary fuel record with pending going DO (PG####).
 * from/to/start = TBA. Journey is active unless the truck already has an active journey (then queued).
 */
export async function createPendingGoingFuelRecord(
  input: CreatePendingGoingInput
): Promise<{ fuelRecord: any; pendingDo: string }> {
  // Canonical storage form ("T123 ABC"); lookup is fuzzy so legacy "T123ABC" still counts as active.
  const truckNo = formatTruckNumber(input.truckNo) || input.truckNo.trim().toUpperCase();
  const session = input.session;
  const fuzzyTruck = buildFuzzyRegex(truckNo) || `^${truckNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;

  const activeQuery = FuelRecord.findOne({
    truckNo: { $regex: fuzzyTruck, $options: 'i' },
    journeyStatus: 'active',
    isDeleted: false,
    isCancelled: { $ne: true },
  });
  if (session) activeQuery.session(session);
  const active = await activeQuery;

  if (active && (active.isPendingGoing || isPendingGoingDo(active.goingDo))) {
    throw Object.assign(new Error(`Truck ${truckNo} already has a pending going DO (${active.goingDo})`), {
      statusCode: 400,
    });
  }

  const pendingDo = await allocateNextPendingDoNumber('going', session);
  const date = input.date || new Date().toISOString().slice(0, 10);
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const now = new Date();
  if (
    !dateParts ||
    Number(dateParts[1]) !== now.getFullYear() ||
    Number(dateParts[2]) !== now.getMonth() + 1
  ) {
    throw Object.assign(
      new Error('Pending going DO can only be created for the current calendar month'),
      { statusCode: 400 }
    );
  }
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = `${monthNames[Number(dateParts[2]) - 1]} ${dateParts[1]}`;

  const payload: Record<string, any> = {
    date,
    month,
    truckNo,
    goingDo: pendingDo,
    start: TBA,
    from: TBA,
    to: TBA,
    totalLts: null,
    extra: null,
    balance: 0,
    isLocked: true,
    pendingConfigReason: 'both',
    isPendingGoing: true,
    isPendingReturn: false,
    pendingGoingAt: new Date(),
    tangaYard: 0,
    darYard: 0,
    mmsaYard: 0,
    tangaGoing: 0,
    darGoing: 0,
    moroGoing: 0,
    mbeyaGoing: 0,
    tdmGoing: 0,
    zambiaGoing: 0,
    congoFuel: 0,
    zambiaReturn: 0,
    tundumaReturn: 0,
    mbeyaReturn: 0,
    moroReturn: 0,
    darReturn: 0,
    tangaReturn: 0,
  };

  if (active) {
    const queuedCountQuery = FuelRecord.countDocuments({
      truckNo: { $regex: fuzzyTruck, $options: 'i' },
      journeyStatus: 'queued',
      isDeleted: false,
      isCancelled: { $ne: true },
    });
    if (session) queuedCountQuery.session(session);
    const queuedCount = await queuedCountQuery;
    payload.journeyStatus = 'queued';
    payload.queueOrder = queuedCount + 1;
    payload.previousJourneyId = active._id.toString();
  } else {
    payload.journeyStatus = 'active';
    payload.activatedAt = new Date();
  }

  const created = session
    ? (await FuelRecord.create([payload], { session }))[0]
    : await FuelRecord.create(payload);

  const historyPayload = {
    kind: 'going' as const,
    pendingDo,
    truckNo,
    fuelRecordId: created._id,
    status: 'pending' as const,
    pendingAt: payload.pendingGoingAt,
    createdBy: input.username,
  };
  if (session) {
    await PendingDoHistory.create([historyPayload], { session });
  } else {
    await PendingDoHistory.create(historyPayload);
  }

  logger.info(
    `Pending going DO ${pendingDo} created for truck ${truckNo} by ${input.username} (status=${payload.journeyStatus})`
  );

  return { fuelRecord: created, pendingDo };
}

export interface CreatePendingReturnInput {
  truckNo: string;
  fuelRecordId?: string;
  /** Optional YYYY-MM — prefer a fuel record in this month when resolving by truck */
  month?: string;
  username: string;
  session?: ClientSession;
}

/**
 * Attach a pending return DO (PR####) to an existing going fuel record that has no real return DO.
 */
export async function createPendingReturnDo(
  input: CreatePendingReturnInput
): Promise<{ fuelRecord: any; pendingDo: string }> {
  const truckNo = input.truckNo.trim().toUpperCase();
  const session = input.session;

  let record: any = null;

  if (input.fuelRecordId) {
    const byIdQuery = FuelRecord.findOne({
      _id: input.fuelRecordId,
      isDeleted: false,
      isCancelled: { $ne: true },
    });
    if (session) byIdQuery.session(session);
    record = await byIdQuery;
  } else {
    const baseFilter: Record<string, unknown> = {
      truckNo,
      isDeleted: false,
      isCancelled: { $ne: true },
      $and: [returnDoOpenFilter()],
    };

    if (input.month && /^\d{4}-\d{2}$/.test(input.month)) {
      const monthQuery = FuelRecord.find({
        ...baseFilter,
        date: { $regex: `^${input.month}` },
      }).lean();
      if (session) monthQuery.session(session);
      const candidates = await monthQuery;
      const best = pickBestPendingReturnTarget(candidates);
      if (best) {
        const reload = FuelRecord.findById(best._id);
        if (session) reload.session(session);
        record = await reload;
      }
    } else {
      // Prefer active open-return; fall back to earliest queued open-return
      const activeQuery = FuelRecord.findOne({
        ...baseFilter,
        journeyStatus: 'active',
      }).sort({ date: 1 });
      if (session) activeQuery.session(session);
      record = await activeQuery;

      if (!record) {
        const queuedQuery = FuelRecord.find({
          ...baseFilter,
          journeyStatus: 'queued',
        }).lean();
        if (session) queuedQuery.session(session);
        const queued = await queuedQuery;
        const bestQueued = pickBestPendingReturnTarget(queued);
        if (bestQueued) {
          const reload = FuelRecord.findById(bestQueued._id);
          if (session) reload.session(session);
          record = await reload;
        }
      }
    }
  }

  if (!record) {
    throw Object.assign(
      new Error(
        input.month
          ? `No fuel record found for truck ${truckNo} in ${input.month} that can receive a pending return DO`
          : `No active or queued going fuel record found for truck ${truckNo} that can receive a pending return DO`
      ),
      { statusCode: 404 }
    );
  }

  if (record.returnDo && !isPendingReturnDo(record.returnDo) && !record.isPendingReturn) {
    throw Object.assign(
      new Error(`Truck ${truckNo} already has return DO ${record.returnDo}`),
      { statusCode: 400 }
    );
  }

  if (record.isPendingReturn || isPendingReturnDo(record.returnDo)) {
    throw Object.assign(
      new Error(`Truck ${truckNo} already has pending return DO ${record.returnDo}`),
      { statusCode: 400 }
    );
  }

  // Pending return: keep going route in originalGoingFrom/To (for Fuel Record details),
  // and set live from/to to TBA/TBA so the return leg shows as placeholder until real EXPORT.
  const pendingDo = await allocateNextPendingDoNumber('return', session);
  if (!record.originalGoingFrom) {
    record.originalGoingFrom = record.from || TBA;
  }
  if (!record.originalGoingTo) {
    record.originalGoingTo = record.to || TBA;
  }
  record.returnDo = pendingDo;
  record.isPendingReturn = true;
  record.pendingReturnAt = new Date();
  record.from = TBA;
  record.to = TBA;
  await record.save({ session: session || undefined });

  const historyPayload = {
    kind: 'return' as const,
    pendingDo,
    truckNo,
    fuelRecordId: record._id,
    status: 'pending' as const,
    pendingAt: record.pendingReturnAt,
    createdBy: input.username,
  };
  if (session) {
    await PendingDoHistory.create([historyPayload], { session });
  } else {
    await PendingDoHistory.create(historyPayload);
  }

  logger.info(
    `Pending return DO ${pendingDo} attached to fuel record ${record._id} (truck ${truckNo}, status=${record.journeyStatus}) by ${input.username}`
  );

  return { fuelRecord: record, pendingDo };
}

/**
 * Update a pending fuel-record journey (truck / date / route TBA fields).
 * Used when editing a pending DO row from DO Management.
 */
export async function updatePendingDoFuelRecord(input: {
  fuelRecordId: string;
  username: string;
  truckNo?: string;
  date?: string;
  from?: string;
  to?: string;
  start?: string;
  trailerNo?: string; // accepted for UI symmetry; not stored on fuel record
}): Promise<{ fuelRecord: any }> {
  const record = await FuelRecord.findOne({
    _id: input.fuelRecordId,
    isDeleted: false,
    isCancelled: { $ne: true },
  });

  if (!record) {
    throw Object.assign(new Error('Pending fuel record not found'), { statusCode: 404 });
  }

  const isPending =
    record.isPendingGoing ||
    record.isPendingReturn ||
    isPendingGoingDo(record.goingDo) ||
    isPendingReturnDo(record.returnDo);

  if (!isPending) {
    throw Object.assign(new Error('Fuel record is not a pending DO journey'), { statusCode: 400 });
  }

  if (input.truckNo) {
    const newTruck = input.truckNo.trim().toUpperCase();
    if (newTruck && newTruck !== record.truckNo) {
      // Avoid clashing with another active journey on the target truck
      const clash = await FuelRecord.findOne({
        truckNo: newTruck,
        _id: { $ne: record._id },
        journeyStatus: 'active',
        isDeleted: false,
        isCancelled: { $ne: true },
      });
      if (clash && record.journeyStatus === 'active') {
        // Re-queue this pending journey behind the other truck's active trip
        const queuedCount = await FuelRecord.countDocuments({
          truckNo: newTruck,
          journeyStatus: 'queued',
          isDeleted: false,
          isCancelled: { $ne: true },
        });
        record.journeyStatus = 'queued';
        record.queueOrder = queuedCount + 1;
        record.previousJourneyId = clash._id.toString();
        record.activatedAt = undefined;
      }
      record.truckNo = newTruck;
    }
  }

  if (input.date) {
    record.date = input.date;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const d = new Date(input.date);
    if (!Number.isNaN(d.getTime())) {
      record.month = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    }
  }

  if (input.start !== undefined) record.start = input.start || TBA;
  if (input.from !== undefined) record.from = input.from || TBA;
  if (input.to !== undefined) record.to = input.to || TBA;

  await record.save();

  logger.info(
    `Pending DO fuel record ${record._id} updated by ${input.username} (truck=${record.truckNo}, going=${record.goingDo}, return=${record.returnDo || ''})`
  );

  return { fuelRecord: record };
}

/**
 * Replace pending going DO with a real IMPORT DO number and real from/to/start.
 * Prefer updating the pending record over inserting a duplicate journey.
 */
export async function promotePendingGoingToImport(
  order: DeliveryOrderLike & { truckNo: string; doNumber: string; _id?: any; id?: string },
  totalLiters: number | null,
  extraFuel: number | null,
  session?: ClientSession,
  ctx?: PendingPromotionContext
): Promise<{ promoted: boolean; fuelRecordId?: string; previousPendingDo?: string }> {
  const truckNo = order.truckNo;
  const pendingQuery = FuelRecord.findOne({
    truckNo,
    isDeleted: false,
    isCancelled: { $ne: true },
    journeyStatus: { $in: ['active', 'queued'] },
    $or: [{ isPendingGoing: true }, { goingDo: { $regex: /^PG\d{1,4}$/i } }],
  }).sort({ journeyStatus: 1, date: -1 }); // prefer active (a < q)
  if (session) pendingQuery.session(session);
  const pending = await pendingQuery;

  if (!pending) {
    return { promoted: false };
  }

  const previousPendingDo = pending.goingDo;
  const pendingAssignedAt = pending.pendingGoingAt || pending.createdAt || new Date();
  const promotedAt = new Date();
  const built = buildImportFuelRecord(order, totalLiters, extraFuel);
  const rec = built.fuelRecord;
  const deliveryOrderId = String(ctx?.deliveryOrderId || order._id || order.id || '');

  // Preserve dispensed checkpoint liters and journey queue fields
  const update: Record<string, any> = {
    goingDo: order.doNumber,
    date: order.date || pending.date,
    month: rec.month || pending.month,
    start: rec.start,
    from: rec.from,
    to: rec.to,
    totalLts: rec.totalLts,
    extra: rec.extra,
    isLocked: rec.isLocked,
    pendingConfigReason: rec.pendingConfigReason,
    isPendingGoing: false,
    previousPendingGoingDo: previousPendingDo,
    previousPendingGoingAt: pendingAssignedAt,
    previousPendingGoingPromotedAt: promotedAt,
    balance: recalculateBalancePreservingCheckpoints(pending, rec.totalLts, rec.extra),
  };

  await FuelRecord.updateOne({ _id: pending._id }, { $set: update }, session ? { session } : {});

  await replacePendingDoReferences({
    previousDo: previousPendingDo,
    newDo: order.doNumber,
    newDest: order.destination || rec.to,
    truckNo,
    session,
  });

  await markPendingDoAssigned({
    kind: 'going',
    pendingDo: previousPendingDo,
    fuelRecordId: String(pending._id),
    truckNo,
    realDoNumber: order.doNumber,
    deliveryOrderId: deliveryOrderId || undefined,
    pendingAt: pendingAssignedAt,
    promotedAt,
    promotedBy: ctx?.username,
    session,
  });

  if (deliveryOrderId) {
    await DeliveryOrder.updateOne(
      { _id: deliveryOrderId },
      {
        $set: {
          promotedFromPendingDo: previousPendingDo,
          promotedFromPendingAt: promotedAt,
          pendingAssignedAt: pendingAssignedAt,
        },
      },
      session ? { session } : {}
    );
  }

  await writePromotionAudits({
    kind: 'going',
    previousPendingDo,
    realDoNumber: order.doNumber,
    truckNo,
    fuelRecordId: String(pending._id),
    deliveryOrderId: deliveryOrderId || undefined,
    pendingAssignedAt,
    promotedAt,
    username: ctx?.username || 'system',
    userId: ctx?.userId,
    ipAddress: ctx?.ipAddress,
  });

  logger.info(
    `Promoted pending going ${previousPendingDo} → ${order.doNumber} on fuel record ${pending._id}`
  );

  return {
    promoted: true,
    fuelRecordId: String(pending._id),
    previousPendingDo,
  };
}

/**
 * Replace pending (or empty) return with a real EXPORT DO via buildReturnUpdate,
 * then clear pending-return flags and rewrite LPO/Dar/Tanga references.
 */
export async function promotePendingReturnToExport(
  existingRecord: Record<string, any>,
  returnDeliveryOrder: DeliveryOrderLike & { doNumber: string; truckNo?: string; _id?: any; id?: string },
  exportRouteLiters: number,
  session?: ClientSession,
  ctx?: PendingPromotionContext
): Promise<{ update: Record<string, any>; info: Record<string, any>; previousPendingDo?: string }> {
  const previousPendingDo =
    isPendingReturnDo(existingRecord.returnDo) || existingRecord.isPendingReturn
      ? existingRecord.returnDo
      : undefined;

  const { update, info } = buildReturnUpdate(existingRecord, returnDeliveryOrder, exportRouteLiters);
  update.isPendingReturn = false;

  const promotedAt = new Date();
  const pendingAssignedAt =
    existingRecord.pendingReturnAt || existingRecord.updatedAt || existingRecord.createdAt || promotedAt;
  const deliveryOrderId = String(
    ctx?.deliveryOrderId || returnDeliveryOrder._id || returnDeliveryOrder.id || ''
  );
  const truckNo = returnDeliveryOrder.truckNo || existingRecord.truckNo;

  if (previousPendingDo) {
    update.previousPendingReturnDo = previousPendingDo;
    update.previousPendingReturnAt = pendingAssignedAt;
    update.previousPendingReturnPromotedAt = promotedAt;

    await replacePendingDoReferences({
      previousDo: previousPendingDo,
      newDo: returnDeliveryOrder.doNumber,
      newDest: returnDeliveryOrder.destination || update.to,
      truckNo,
      session,
    });

    await markPendingDoAssigned({
      kind: 'return',
      pendingDo: previousPendingDo,
      fuelRecordId: String(existingRecord._id),
      truckNo,
      realDoNumber: returnDeliveryOrder.doNumber,
      deliveryOrderId: deliveryOrderId || undefined,
      pendingAt: pendingAssignedAt,
      promotedAt,
      promotedBy: ctx?.username,
      session,
    });

    if (deliveryOrderId) {
      await DeliveryOrder.updateOne(
        { _id: deliveryOrderId },
        {
          $set: {
            promotedFromPendingDo: previousPendingDo,
            promotedFromPendingAt: promotedAt,
            pendingAssignedAt: pendingAssignedAt,
          },
        },
        session ? { session } : {}
      );
    }

    await writePromotionAudits({
      kind: 'return',
      previousPendingDo,
      realDoNumber: returnDeliveryOrder.doNumber,
      truckNo,
      fuelRecordId: String(existingRecord._id),
      deliveryOrderId: deliveryOrderId || undefined,
      pendingAssignedAt,
      promotedAt,
      username: ctx?.username || 'system',
      userId: ctx?.userId,
      ipAddress: ctx?.ipAddress,
    });
  }

  return { update, info, previousPendingDo };
}

async function markPendingDoAssigned(opts: {
  kind: 'going' | 'return';
  pendingDo: string;
  fuelRecordId: string;
  truckNo: string;
  realDoNumber: string;
  deliveryOrderId?: string;
  pendingAt: Date;
  promotedAt: Date;
  promotedBy?: string;
  session?: ClientSession;
}): Promise<void> {
  const filter = {
    pendingDo: opts.pendingDo,
    fuelRecordId: opts.fuelRecordId,
    kind: opts.kind,
    status: 'pending',
  };
  const setFields: Record<string, any> = {
    status: 'assigned',
    realDoNumber: opts.realDoNumber,
    promotedAt: opts.promotedAt,
    promotedBy: opts.promotedBy || null,
    truckNo: opts.truckNo,
    pendingAt: opts.pendingAt,
  };
  if (opts.deliveryOrderId) setFields.deliveryOrderId = opts.deliveryOrderId;

  const updateQuery = PendingDoHistory.findOneAndUpdate(
    filter,
    { $set: setFields },
    { new: true }
  );
  if (opts.session) updateQuery.session(opts.session);
  const updated = await updateQuery;

  if (!updated) {
    const createPayload = {
      kind: opts.kind,
      pendingDo: opts.pendingDo,
      truckNo: opts.truckNo,
      fuelRecordId: opts.fuelRecordId,
      deliveryOrderId: opts.deliveryOrderId || null,
      realDoNumber: opts.realDoNumber,
      status: 'assigned' as const,
      pendingAt: opts.pendingAt,
      promotedAt: opts.promotedAt,
      promotedBy: opts.promotedBy || null,
    };
    if (opts.session) {
      await PendingDoHistory.create([createPayload], { session: opts.session });
    } else {
      await PendingDoHistory.create(createPayload);
    }
  }
}

async function writePromotionAudits(opts: {
  kind: 'going' | 'return';
  previousPendingDo: string;
  realDoNumber: string;
  truckNo: string;
  fuelRecordId: string;
  deliveryOrderId?: string;
  pendingAssignedAt: Date;
  promotedAt: Date;
  username: string;
  userId?: string;
  ipAddress?: string;
  /** auto = DO create promote; manual_merge = user linked pending ↔ real DO */
  mode?: 'auto' | 'manual_merge';
  sourceFuelRecordId?: string;
}): Promise<void> {
  const kindLabel = opts.kind === 'going' ? 'going' : 'return';
  const pendingAtStr = new Date(opts.pendingAssignedAt).toLocaleString();
  const isMerge = opts.mode === 'manual_merge';
  const details = isMerge
    ? `Merged pending ${kindLabel} ID ${opts.previousPendingDo} (assigned ${pendingAtStr}) ` +
      `with real DO ${opts.realDoNumber} for truck ${opts.truckNo}` +
      (opts.sourceFuelRecordId ? ` (source fuel record ${opts.sourceFuelRecordId}).` : '.') +
      ` Pending liters/orders kept; PG/PR references updated on LPOs and yards.`
    : `Before real ${opts.kind === 'going' ? 'IMPORT' : 'EXPORT'} DO ${opts.realDoNumber} was created, ` +
      `truck ${opts.truckNo} had pending ${kindLabel} ID ${opts.previousPendingDo} at ${pendingAtStr}. ` +
      `Promoted to ${opts.realDoNumber}.`;

  const previousValue = {
    pendingDo: opts.previousPendingDo,
    truckNo: opts.truckNo,
    kind: opts.kind,
    pendingAt: opts.pendingAssignedAt,
    ...(opts.sourceFuelRecordId ? { sourceFuelRecordId: opts.sourceFuelRecordId } : {}),
  };
  const newValue = {
    realDo: opts.realDoNumber,
    truckNo: opts.truckNo,
    kind: opts.kind,
    promotedAt: opts.promotedAt,
    ...(isMerge ? { merge: true } : {}),
  };

  const tags = isMerge
    ? ['pending_do', 'merge', 'promotion', opts.kind]
    : ['pending_do', 'promotion', opts.kind];

  await AuditService.log({
    userId: opts.userId,
    username: opts.username,
    action: 'UPDATE',
    resourceType: 'FuelRecord',
    resourceId: opts.fuelRecordId,
    previousValue,
    newValue,
    details,
    ipAddress: opts.ipAddress,
    severity: 'medium',
    tags,
  });

  if (opts.deliveryOrderId) {
    await AuditService.log({
      userId: opts.userId,
      username: opts.username,
      action: 'UPDATE',
      resourceType: 'DeliveryOrder',
      resourceId: opts.deliveryOrderId,
      previousValue,
      newValue,
      details,
      ipAddress: opts.ipAddress,
      severity: 'medium',
      tags,
    });
  }

  if (isMerge && opts.sourceFuelRecordId && opts.sourceFuelRecordId !== opts.fuelRecordId) {
    await AuditService.log({
      userId: opts.userId,
      username: opts.username,
      action: 'UPDATE',
      resourceType: 'FuelRecord',
      resourceId: opts.sourceFuelRecordId,
      previousValue: {
        goingDo: opts.realDoNumber,
        truckNo: opts.truckNo,
        role: 'merge_source',
      },
      newValue: {
        mergedIntoFuelRecordId: opts.fuelRecordId,
        pendingDo: opts.previousPendingDo,
        realDo: opts.realDoNumber,
        cancelled: true,
      },
      details:
        `Absorbed into pending merge: source DO ${opts.realDoNumber} merged into fuel record ` +
        `${opts.fuelRecordId} (was pending ${opts.previousPendingDo}) for truck ${opts.truckNo}.`,
      ipAddress: opts.ipAddress,
      severity: 'medium',
      tags: ['pending_do', 'merge', 'merge_source', opts.kind],
    });
  }
}

function recalculateBalancePreservingCheckpoints(
  existing: Record<string, any>,
  totalLts: number | null,
  extra: number | null
): number {
  if (totalLts === null || totalLts === undefined) return 0;
  const fields = [
    'mmsaYard', 'tangaYard', 'darYard', 'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing',
    'tdmGoing', 'zambiaGoing', 'congoFuel', 'zambiaReturn', 'tundumaReturn',
    'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
  ];
  const used = fields.reduce((sum, f) => sum + Math.abs(existing[f] || 0), 0);
  return totalLts + (extra || 0) - used;
}

/**
 * Manual merge: keep the pending fuel row (liters / LPO / yard amounts already on it),
 * copy real DO + route/totals from a same-truck source fuel record, rewrite PG refs
 * everywhere, cancel/absorb the source duplicate, and write merge audits.
 */
export async function mergePendingGoingWithSourceFuelRecord(input: {
  pendingFuelRecordId: string;
  sourceFuelRecordId: string;
  username: string;
  userId?: string;
  ipAddress?: string;
  session?: ClientSession;
  /** Amend-to-other-truck: source may still be on the old plate while pending is on the new one. */
  allowTruckMismatch?: boolean;
}): Promise<{
  fuelRecord: any;
  previousPendingDo: string;
  realDoNumber: string;
  cancelledSourceId: string | null;
  refsUpdated: { lpo: number; dar: number; tanga: number };
}> {
  const session = input.session;

  const pendingQuery = FuelRecord.findOne({
    _id: input.pendingFuelRecordId,
    isDeleted: false,
    isCancelled: { $ne: true },
  });
  if (session) pendingQuery.session(session);
  const pending = await pendingQuery;
  if (!pending) {
    throw Object.assign(new Error('Pending fuel record not found'), { statusCode: 404 });
  }

  const pendingDo = String(pending.goingDo || '');
  if (!(pending.isPendingGoing || isPendingGoingDo(pendingDo))) {
    throw Object.assign(
      new Error(`Fuel record ${input.pendingFuelRecordId} is not a pending going DO`),
      { statusCode: 400 }
    );
  }

  const sourceQuery = FuelRecord.findOne({
    _id: input.sourceFuelRecordId,
    isDeleted: false,
    isCancelled: { $ne: true },
  });
  if (session) sourceQuery.session(session);
  const source = await sourceQuery;
  if (!source) {
    throw Object.assign(new Error('Source fuel record not found'), { statusCode: 404 });
  }

  if (String(pending._id) === String(source._id)) {
    throw Object.assign(new Error('Pending and source fuel records must be different'), {
      statusCode: 400,
    });
  }

  const trucksMatch = isTruckNoMatch(String(pending.truckNo || ''), String(source.truckNo || ''));
  if (!trucksMatch && !input.allowTruckMismatch) {
    throw Object.assign(
      new Error(
        `Truck mismatch: pending is ${pending.truckNo}, source is ${source.truckNo}`
      ),
      { statusCode: 400 }
    );
  }

  const sourceWasActive = source.journeyStatus === 'active';
  const sourceWasQueued = source.journeyStatus === 'queued';
  const sourceTruckNo = String(source.truckNo || '');

  const realDoNumber = String(source.goingDo || '').trim().toUpperCase();
  if (!realDoNumber || isPendingGoingDo(realDoNumber)) {
    throw Object.assign(
      new Error('Source fuel record must have a real (non-pending) going DO'),
      { statusCode: 400 }
    );
  }

  const pendingAssignedAt = pending.pendingGoingAt || pending.createdAt || new Date();
  const promotedAt = new Date();
  const truckNo = formatTruckNumber(pending.truckNo) || pending.truckNo;

  const totalLts =
    source.totalLts != null && source.totalLts !== undefined ? source.totalLts : pending.totalLts;
  const extra = source.extra != null && source.extra !== undefined ? source.extra : pending.extra;
  const hasTotals = totalLts != null && totalLts !== undefined;

  // If source was the active journey and pending was queued, pending takes over as active
  let nextJourneyStatus = pending.journeyStatus || 'active';
  let clearQueueOrder = false;
  if (source.journeyStatus === 'active' && pending.journeyStatus === 'queued') {
    nextJourneyStatus = 'active';
    clearQueueOrder = true;
  } else if (!pending.journeyStatus || pending.journeyStatus === 'cancelled') {
    nextJourneyStatus = 'active';
  }

  const update: Record<string, any> = {
    goingDo: realDoNumber,
    date: source.date || pending.date,
    month: source.month || pending.month,
    start: source.start && source.start !== TBA ? source.start : pending.start,
    from: source.from && source.from !== TBA ? source.from : pending.from,
    to: source.to && source.to !== TBA ? source.to : pending.to,
    totalLts: hasTotals ? totalLts : pending.totalLts,
    extra: extra ?? pending.extra,
    isLocked: hasTotals ? false : true,
    pendingConfigReason: hasTotals ? null : pending.pendingConfigReason || 'both',
    isPendingGoing: false,
    previousPendingGoingDo: pendingDo,
    previousPendingGoingAt: pendingAssignedAt,
    previousPendingGoingPromotedAt: promotedAt,
    balance: hasTotals
      ? recalculateBalancePreservingCheckpoints(pending.toObject?.() || pending, totalLts, extra ?? 0)
      : pending.balance,
    journeyStatus: nextJourneyStatus,
    truckNo,
  };
  if (nextJourneyStatus === 'active' && !pending.activatedAt) {
    update.activatedAt = promotedAt;
  }

  const mongoUpdate: Record<string, any> = { $set: update };
  if (clearQueueOrder) {
    mongoUpdate.$unset = { queueOrder: 1 };
  }

  await FuelRecord.updateOne({ _id: pending._id }, mongoUpdate, session ? { session } : {});

  const refsUpdated = await replacePendingDoReferences({
    previousDo: pendingDo,
    newDo: realDoNumber,
    newDest: String(update.to || source.to || ''),
    truckNo: String(pending.truckNo || truckNo),
    session,
  });

  // Also rewrite refs that used formatted truck on entries
  if (truckNo && truckNo !== pending.truckNo) {
    const extraRefs = await replacePendingDoReferences({
      previousDo: pendingDo,
      newDo: realDoNumber,
      newDest: String(update.to || source.to || ''),
      truckNo,
      session,
    });
    refsUpdated.lpo += extraRefs.lpo;
    refsUpdated.dar += extraRefs.dar;
    refsUpdated.tanga += extraRefs.tanga;
  }

  let deliveryOrderId: string | undefined;
  const doDoc = await DeliveryOrder.findOne({
    doNumber: realDoNumber,
    isDeleted: false,
  })
    .select('_id')
    .lean();
  if (doDoc) {
    deliveryOrderId = String(doDoc._id);
    await DeliveryOrder.updateOne(
      { _id: doDoc._id },
      {
        $set: {
          promotedFromPendingDo: pendingDo,
          promotedFromPendingAt: promotedAt,
          pendingAssignedAt: pendingAssignedAt,
        },
      },
      session ? { session } : {}
    );
  }

  await markPendingDoAssigned({
    kind: 'going',
    pendingDo,
    fuelRecordId: String(pending._id),
    truckNo: String(pending.truckNo || truckNo),
    realDoNumber,
    deliveryOrderId,
    pendingAt: pendingAssignedAt,
    promotedAt,
    promotedBy: input.username,
    session,
  });

  // Absorb source duplicate without advancing queue (pending already owns the journey)
  source.isCancelled = true;
  source.cancelledAt = promotedAt;
  source.cancelledBy = input.username;
  (source as any).cancellationReason = `Merged into pending fuel record ${pending._id} (${pendingDo} → ${realDoNumber})`;
  source.journeyStatus = 'cancelled';
  source.queueOrder = undefined;
  if (session) {
    await source.save({ session });
  } else {
    await source.save();
  }

  // Cross-truck amend-merge: source lived on the old plate — advance that truck's queue.
  if (input.allowTruckMismatch && !trucksMatch && (sourceWasActive || sourceWasQueued)) {
    try {
      await afterJourneyCancelled(String(source._id), input.username, {
        session,
        wasActive: sourceWasActive,
        wasQueued: sourceWasQueued,
      });
    } catch (queueErr: any) {
      logger.warn(
        `Queue advance after cross-truck merge failed for source ${source._id}: ${queueErr?.message || queueErr}`
      );
    }
  }

  await writePromotionAudits({
    kind: 'going',
    previousPendingDo: pendingDo,
    realDoNumber,
    truckNo: String(pending.truckNo || truckNo),
    fuelRecordId: String(pending._id),
    deliveryOrderId,
    pendingAssignedAt,
    promotedAt,
    username: input.username,
    userId: input.userId,
    ipAddress: input.ipAddress,
    mode: 'manual_merge',
    sourceFuelRecordId: String(source._id),
  });

  const refreshed = session
    ? await FuelRecord.findById(pending._id).session(session)
    : await FuelRecord.findById(pending._id);

  logger.info(
    `Manual merge: pending ${pendingDo} → ${realDoNumber} on ${pending._id}; absorbed source ${source._id}`
  );

  return {
    fuelRecord: refreshed,
    previousPendingDo: pendingDo,
    realDoNumber,
    cancelledSourceId: String(source._id),
    refsUpdated,
  };
}

/**
 * Rewrite doNo + dest on standard LPO entries, Dar LPO entries, and Tanga LPO entries
 * that still reference the pending DO for this truck.
 * Keeps previousPendingDo on the entry for summary export strikethrough.
 */
export async function replacePendingDoReferences(opts: {
  previousDo: string;
  newDo: string;
  newDest: string;
  truckNo: string;
  session?: ClientSession;
}): Promise<{ lpo: number; dar: number; tanga: number }> {
  const { previousDo, newDo, newDest, truckNo, session } = opts;
  if (!previousDo || previousDo === newDo) {
    return { lpo: 0, dar: 0, tanga: 0 };
  }

  const truck = truckNo.trim();
  const sessionOpt = session ? { session } : {};
  const entrySet = {
    'entries.$[e].doNo': newDo,
    'entries.$[e].dest': newDest,
    'entries.$[e].previousPendingDo': previousDo,
  };
  const arrayFilters = [{ 'e.doNo': previousDo, 'e.truckNo': truck }];

  const lpoResult = await LPOSummary.updateMany(
    {
      isDeleted: false,
      'entries.doNo': previousDo,
      'entries.truckNo': truck,
    },
    { $set: entrySet },
    { ...sessionOpt, arrayFilters }
  );

  const darResult = await DarLPODocument.updateMany(
    {
      isDeleted: false,
      'entries.doNo': previousDo,
      'entries.truckNo': truck,
    },
    { $set: entrySet },
    { ...sessionOpt, arrayFilters }
  );

  const tangaResult = await TangaLPODocument.updateMany(
    {
      isDeleted: false,
      'entries.doNo': previousDo,
      'entries.truckNo': truck,
    },
    { $set: entrySet },
    { ...sessionOpt, arrayFilters }
  );

  const counts = {
    lpo: lpoResult.modifiedCount || 0,
    dar: darResult.modifiedCount || 0,
    tanga: tangaResult.modifiedCount || 0,
  };

  if (counts.lpo + counts.dar + counts.tanga > 0) {
    logger.info(
      `Replaced pending DO ${previousDo} → ${newDo} in LPO refs (lpo=${counts.lpo}, dar=${counts.dar}, tanga=${counts.tanga})`
    );
  }

  return counts;
}

export async function countPendingDos(): Promise<{
  total: number;
  goingPending: number;
  returnPending: number;
  assigned: number;
}> {
  const base = pendingFuelRecordBaseFilter();

  const [goingPending, returnPending, assigned] = await Promise.all([
    FuelRecord.countDocuments({
      ...base,
      $or: [{ isPendingGoing: true }, { goingDo: { $regex: /^PG\d{1,4}$/i } }],
    }),
    FuelRecord.countDocuments({
      ...base,
      $or: [{ isPendingReturn: true }, { returnDo: { $regex: /^PR\d{1,4}$/i } }],
    }),
    PendingDoHistory.countDocuments({ status: 'assigned' }),
  ]);

  // A record can be counted in both; total = unique records with any pending
  // (Assigned history is separate and not included in All/total.)
  const total = await FuelRecord.countDocuments({
    ...base,
    $or: [
      { isPendingGoing: true },
      { isPendingReturn: true },
      { goingDo: { $regex: /^PG\d{1,4}$/i } },
      { returnDo: { $regex: /^PR\d{1,4}$/i } },
    ],
  });

  return { total, goingPending, returnPending, assigned };
}

export async function listPendingDos(opts?: {
  kind?: 'going' | 'return' | 'all' | 'assigned';
  limit?: number;
}): Promise<any[]> {
  const kind = opts?.kind || 'all';
  const limit = opts?.limit ?? 100;

  if (kind === 'assigned') {
    const rows = await PendingDoHistory.find({ status: 'assigned' })
      .sort({ promotedAt: -1 })
      .limit(limit)
      .lean();
    return rows.map((r: any) => ({
      id: String(r._id),
      _id: r._id,
      fuelRecordId: String(r.fuelRecordId),
      deliveryOrderId: r.deliveryOrderId ? String(r.deliveryOrderId) : null,
      truckNo: r.truckNo,
      kind: r.kind,
      pendingDo: r.pendingDo,
      goingDo: r.kind === 'going' ? r.pendingDo : r.realDoNumber || '—',
      returnDo: r.kind === 'return' ? r.pendingDo : r.realDoNumber || '—',
      realDoNumber: r.realDoNumber,
      pendingAt: r.pendingAt,
      promotedAt: r.promotedAt,
      createdBy: r.createdBy,
      promotedBy: r.promotedBy,
      from: '—',
      to: '—',
      journeyStatus: 'assigned',
      displayStatus: 'assigned' as PendingDoDisplayStatus,
    }));
  }

  const base: Record<string, any> = { ...pendingFuelRecordBaseFilter() };

  if (kind === 'going') {
    base.$or = [{ isPendingGoing: true }, { goingDo: { $regex: /^PG\d{1,4}$/i } }];
  } else if (kind === 'return') {
    base.$or = [{ isPendingReturn: true }, { returnDo: { $regex: /^PR\d{1,4}$/i } }];
  } else {
    base.$or = [
      { isPendingGoing: true },
      { isPendingReturn: true },
      { goingDo: { $regex: /^PG\d{1,4}$/i } },
      { returnDo: { $regex: /^PR\d{1,4}$/i } },
    ];
  }

  const rows = await FuelRecord.find(base).sort({ updatedAt: -1 }).limit(limit).lean();
  return rows.map((r: any) => ({
    ...r,
    id: String(r._id),
    displayStatus: derivePendingDoDisplayStatus(r),
  }));
}

/**
 * Map pending fuel-record journeys into DeliveryOrder-shaped rows for DO Management list/search.
 * A single fuel record can yield two rows (pending going + pending return).
 */
export function mapPendingFuelRecordsToDoListItems(
  records: any[],
  opts?: { kind?: 'going' | 'return' | 'all' }
): any[] {
  const kind = opts?.kind || 'all';
  const items: any[] = [];

  for (const r of records) {
    const pendingGoing = r.isPendingGoing === true || isPendingGoingDo(r.goingDo);
    const pendingReturn = r.isPendingReturn === true || isPendingReturnDo(r.returnDo);
    const fuelRecordId = String(r._id || r.id);
    const base = {
      sn: 0,
      date: r.date,
      doType: 'DO',
      clientName: 'PENDING',
      truckNo: r.truckNo,
      trailerNo: 'TBA',
      loadingPoint: r.from || 'TBA',
      destination: r.to || 'TBA',
      haulier: 'TBA',
      tonnages: 0,
      ratePerTon: 0,
      status: 'active',
      isCancelled: false,
      isPendingDo: true,
      fuelRecordId,
      journeyStatus: r.journeyStatus,
      isDeleted: false,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };

    if (pendingGoing && (kind === 'all' || kind === 'going')) {
      items.push({
        ...base,
        _id: `pending-going-${fuelRecordId}`,
        id: `pending-going-${fuelRecordId}`,
        doNumber: r.goingDo,
        importOrExport: 'IMPORT',
        pendingKind: 'going',
        loadingPoint: r.start || r.from || 'TBA',
        destination: r.to || 'TBA',
      });
    }

    if (pendingReturn && (kind === 'all' || kind === 'return')) {
      items.push({
        ...base,
        _id: `pending-return-${fuelRecordId}`,
        id: `pending-return-${fuelRecordId}`,
        doNumber: r.returnDo,
        importOrExport: 'EXPORT',
        pendingKind: 'return',
        loadingPoint: r.from || 'TBA',
        destination: r.to || 'TBA',
      });
    }
  }

  return items;
}

/**
 * Load pending DO list items for DO Management, with optional month/search filters.
 */
export async function fetchPendingDoListItems(opts: {
  kind?: 'going' | 'return' | 'all';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  truckNo?: string;
  limit?: number;
}): Promise<any[]> {
  const kind = opts.kind || 'all';
  const query: Record<string, any> = { ...pendingFuelRecordBaseFilter() };

  if (kind === 'going') {
    query.$or = [{ isPendingGoing: true }, { goingDo: { $regex: /^PG\d{1,4}$/i } }];
  } else if (kind === 'return') {
    query.$or = [{ isPendingReturn: true }, { returnDo: { $regex: /^PR\d{1,4}$/i } }];
  } else {
    query.$or = [
      { isPendingGoing: true },
      { isPendingReturn: true },
      { goingDo: { $regex: /^PG\d{1,4}$/i } },
      { returnDo: { $regex: /^PR\d{1,4}$/i } },
    ];
  }

  // Active/queued: match journey date. Completed imports often keep an old going date —
  // also match updatedAt so a PR#### created today appears in the current-month DO list.
  if (opts.dateFrom || opts.dateTo) {
    const dateRange: Record<string, string> = {};
    if (opts.dateFrom) dateRange.$gte = opts.dateFrom;
    if (opts.dateTo) dateRange.$lte = opts.dateTo;

    const updatedRange: Record<string, Date> = {};
    if (opts.dateFrom) updatedRange.$gte = new Date(`${opts.dateFrom}T00:00:00.000Z`);
    if (opts.dateTo) updatedRange.$lte = new Date(`${opts.dateTo}T23:59:59.999Z`);

    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { date: dateRange },
          { journeyStatus: 'completed', updatedAt: updatedRange },
        ],
      },
    ];
  }

  if (opts.truckNo) {
    query.truckNo = { $regex: opts.truckNo, $options: 'i' };
  }

  if (opts.search) {
    const s = opts.search.trim();
    if (s) {
      const rx = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$and = [
        ...(query.$and || []),
        { $or: query.$or },
        {
          $or: [
            { goingDo: { $regex: rx, $options: 'i' } },
            { returnDo: { $regex: rx, $options: 'i' } },
            { truckNo: { $regex: rx, $options: 'i' } },
            { from: { $regex: rx, $options: 'i' } },
            { to: { $regex: rx, $options: 'i' } },
          ],
        },
      ];
      delete query.$or;
    }
  }

  const rows = await FuelRecord.find(query)
    .sort({ date: -1, updatedAt: -1 })
    .limit(opts.limit ?? 500)
    .lean();

  return mapPendingFuelRecordsToDoListItems(rows, { kind });
}

/**
 * Find the latest pending going (PG) or return (PR) fuel record for a truck.
 * Used by DO Management merge-to-pending (not the Fuel Record picker merge).
 */
export async function findPendingFuelRecordForTruck(
  truckNo: string,
  kind: PendingDoKind,
  session?: ClientSession
): Promise<any | null> {
  const formatted = formatTruckNumber(truckNo) || String(truckNo || '').trim().toUpperCase();
  if (!formatted) return null;
  const fuzzyTruck =
    buildFuzzyRegex(formatted) || `^${formatted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
  const pendingOr =
    kind === 'going'
      ? [{ isPendingGoing: true }, { goingDo: { $regex: /^PG\d{1,4}$/i } }]
      : [{ isPendingReturn: true }, { returnDo: { $regex: /^PR\d{1,4}$/i } }];

  const query = FuelRecord.findOne({
    truckNo: { $regex: fuzzyTruck, $options: 'i' },
    isDeleted: false,
    isCancelled: { $ne: true },
    journeyStatus: { $in: [...PENDING_LIST_JOURNEY_STATUSES] },
    $or: pendingOr,
  }).sort({ journeyStatus: 1, updatedAt: -1 });
  if (session) query.session(session);
  return query;
}

