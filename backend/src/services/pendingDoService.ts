import { ClientSession } from 'mongoose';
import { Counter, FuelRecord, LPOSummary, DarLPODocument, TangaLPODocument } from '../models';
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
import type { DeliveryOrderLike } from '../utils/fuelRecordCalculator';
import { buildImportFuelRecord, buildReturnUpdate } from '../utils/fuelRecordCalculator';

const TBA = 'TBA';

export type PendingDoDisplayStatus =
  | 'active'
  | 'active_do_pending'
  | 'active_return_do_pending'
  | 'active_both_do_pending'
  | 'queued'
  | 'completed'
  | 'cancelled';

export function derivePendingDoDisplayStatus(record: {
  journeyStatus?: string;
  isPendingGoing?: boolean;
  isPendingReturn?: boolean;
  goingDo?: string;
  returnDo?: string;
}): PendingDoDisplayStatus {
  const status = record.journeyStatus || 'active';
  if (status === 'queued') return 'queued';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';

  const pendingGoing = record.isPendingGoing === true || isPendingGoingDo(record.goingDo);
  const pendingReturn = record.isPendingReturn === true || isPendingReturnDo(record.returnDo);

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
  const truckNo = input.truckNo.trim().toUpperCase();
  const session = input.session;

  const activeQuery = FuelRecord.findOne({
    truckNo,
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
      truckNo,
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
  record.from = TBA;
  record.to = TBA;
  await record.save({ session: session || undefined });

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
  order: DeliveryOrderLike & { truckNo: string; doNumber: string },
  totalLiters: number | null,
  extraFuel: number | null,
  session?: ClientSession
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
  const built = buildImportFuelRecord(order, totalLiters, extraFuel);
  const rec = built.fuelRecord;

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
  returnDeliveryOrder: DeliveryOrderLike & { doNumber: string; truckNo?: string },
  exportRouteLiters: number,
  session?: ClientSession
): Promise<{ update: Record<string, any>; info: Record<string, any>; previousPendingDo?: string }> {
  const previousPendingDo =
    isPendingReturnDo(existingRecord.returnDo) || existingRecord.isPendingReturn
      ? existingRecord.returnDo
      : undefined;

  const { update, info } = buildReturnUpdate(existingRecord, returnDeliveryOrder, exportRouteLiters);
  update.isPendingReturn = false;

  if (previousPendingDo) {
    await replacePendingDoReferences({
      previousDo: previousPendingDo,
      newDo: returnDeliveryOrder.doNumber,
      newDest: returnDeliveryOrder.destination || update.to,
      truckNo: returnDeliveryOrder.truckNo || existingRecord.truckNo,
      session,
    });
  }

  return { update, info, previousPendingDo };
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
 * Rewrite doNo + dest on standard LPO entries, Dar LPO entries, and Tanga LPO entries
 * that still reference the pending DO for this truck.
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

  const lpoResult = await LPOSummary.updateMany(
    {
      isDeleted: false,
      'entries.doNo': previousDo,
      'entries.truckNo': truck,
    },
    {
      $set: {
        'entries.$[e].doNo': newDo,
        'entries.$[e].dest': newDest,
      },
    },
    {
      ...sessionOpt,
      arrayFilters: [{ 'e.doNo': previousDo, 'e.truckNo': truck }],
    }
  );

  const darResult = await DarLPODocument.updateMany(
    {
      isDeleted: false,
      'entries.doNo': previousDo,
      'entries.truckNo': truck,
    },
    {
      $set: {
        'entries.$[e].doNo': newDo,
        'entries.$[e].dest': newDest,
      },
    },
    {
      ...sessionOpt,
      arrayFilters: [{ 'e.doNo': previousDo, 'e.truckNo': truck }],
    }
  );

  const tangaResult = await TangaLPODocument.updateMany(
    {
      isDeleted: false,
      'entries.doNo': previousDo,
      'entries.truckNo': truck,
    },
    {
      $set: {
        'entries.$[e].doNo': newDo,
        'entries.$[e].dest': newDest,
      },
    },
    {
      ...sessionOpt,
      arrayFilters: [{ 'e.doNo': previousDo, 'e.truckNo': truck }],
    }
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
}> {
  const base = { isDeleted: false, isCancelled: { $ne: true }, journeyStatus: { $in: ['active', 'queued'] } };

  const [goingPending, returnPending] = await Promise.all([
    FuelRecord.countDocuments({
      ...base,
      $or: [{ isPendingGoing: true }, { goingDo: { $regex: /^PG\d{1,4}$/i } }],
    }),
    FuelRecord.countDocuments({
      ...base,
      $or: [{ isPendingReturn: true }, { returnDo: { $regex: /^PR\d{1,4}$/i } }],
    }),
  ]);

  // A record can be counted in both; total = unique records with any pending
  const total = await FuelRecord.countDocuments({
    ...base,
    $or: [
      { isPendingGoing: true },
      { isPendingReturn: true },
      { goingDo: { $regex: /^PG\d{1,4}$/i } },
      { returnDo: { $regex: /^PR\d{1,4}$/i } },
    ],
  });

  return { total, goingPending, returnPending };
}

export async function listPendingDos(opts?: {
  kind?: 'going' | 'return' | 'all';
  limit?: number;
}): Promise<any[]> {
  const kind = opts?.kind || 'all';
  const limit = opts?.limit ?? 100;
  const base: Record<string, any> = {
    isDeleted: false,
    isCancelled: { $ne: true },
    journeyStatus: { $in: ['active', 'queued'] },
  };

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
  const query: Record<string, any> = {
    isDeleted: false,
    isCancelled: { $ne: true },
    journeyStatus: { $in: ['active', 'queued'] },
  };

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

  if (opts.dateFrom || opts.dateTo) {
    query.date = {};
    if (opts.dateFrom) query.date.$gte = opts.dateFrom;
    if (opts.dateTo) query.date.$lte = opts.dateTo;
  }

  if (opts.truckNo) {
    query.truckNo = { $regex: opts.truckNo, $options: 'i' };
  }

  if (opts.search) {
    const s = opts.search.trim();
    if (s) {
      const rx = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$and = [
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

