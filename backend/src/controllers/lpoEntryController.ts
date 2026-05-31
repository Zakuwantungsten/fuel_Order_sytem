import { Response } from 'express';
import mongoose from 'mongoose';
import { LPOSummary, Counter } from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, calculateSkip, createPaginatedResponse, logger, sanitizeRegexInput } from '../utils';
import { AuditService } from '../utils/auditService';
import { emitDataChange } from '../services/websocket';

const LOCK_TTL_MS = 5 * 60 * 1000;

// ─── Field mapping helpers ────────────────────────────────────────────────────

/** Format YYYY-MM-DD → "D-MMM" (e.g. "1-May") */
function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00.000Z');
    const day = d.getUTCDate();
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${day}-${month}`;
  } catch {
    return dateStr;
  }
}

/**
 * Aggregation stages that derive the flat LPOEntry-shaped fields from
 * LPOSummary embedded entries.  Call after $unwind: '$entries'.
 */
const DERIVE_STAGE = {
  $addFields: {
    doSdoDisplay: {
      $cond: {
        if: { $eq: ['$entries.isCancelled', true] },
        then: 'CANCELLED',
        else: {
          $cond: {
            if: { $eq: ['$entries.isRefer', true] },
            then: 'REF',
            else: {
              $cond: {
                if: { $eq: ['$entries.isDriverAccount', true] },
                then: 'DA(NIL)',
                else: { $ifNull: ['$entries.doNo', 'PENDING'] },
              },
            },
          },
        },
      },
    },
    destinationsDisplay: {
      $cond: {
        if: { $eq: ['$entries.isCancelled', true] },
        then: 'CANCELLED',
        else: { $ifNull: ['$entries.dest', 'PENDING'] },
      },
    },
    paymentModeValue: {
      $switch: {
        branches: [
          { case: { $eq: ['$entries.isRefer', true] }, then: 'REFER' },
          { case: { $eq: ['$entries.isDriverAccount', true] }, then: 'DRIVER_ACCOUNT' },
          {
            case: {
              $or: [
                { $eq: ['$station', 'CASH'] },
                { $gt: [{ $strLenCP: { $ifNull: ['$entries.cancellationPoint', ''] } }, 0] },
                { $gt: [{ $strLenCP: { $ifNull: ['$entries.goingCheckpoint', ''] } }, 0] },
              ],
            },
            then: 'CASH',
          },
        ],
        default: 'STATION',
      },
    },
  },
};

/** $project that maps LPOSummary fields to the LPOEntry response shape */
const ENTRY_PROJECTION = {
  _id: 0,
  id: '$entries._id',
  lpoId: '$_id',
  lpoNo: 1,
  date: 1,
  dieselAt: '$station',
  doSdo: '$doSdoDisplay',
  truckNo: '$entries.truckNo',
  ltrs: '$entries.liters',
  pricePerLtr: '$entries.rate',
  destinations: '$destinationsDisplay',
  currency: 1,
  isCancelled: { $ifNull: ['$entries.isCancelled', false] },
  cancelledAt: '$entries.cancelledAt',
  isDriverAccount: { $ifNull: ['$entries.isDriverAccount', false] },
  isRefer: { $ifNull: ['$entries.isRefer', false] },
  paymentMode: '$paymentModeValue',
  originalLtrs: '$entries.originalLiters',
  amendedAt: '$entries.amendedAt',
  referenceDo: { $ifNull: ['$entries.referenceDoNo', '$entries.referenceDo'] },
  createdAt: 1,
  updatedAt: 1,
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /lpo-entries
 * Aggregates LPOSummary.entries into the flat LPOEntry-shaped list.
 */
export const getAllLPOEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit } = getPaginationParams(req.query);
    const { dateFrom, dateTo, lpoNo, truckNo, station, search, status, isRefer, isDriverAccount } = req.query;

    // ── Document-level (pre-unwind) match ─────────────────────────────────
    const docMatch: any = { isDeleted: false };

    if (lpoNo && !search) {
      const s = sanitizeRegexInput(lpoNo as string);
      if (s) docMatch.lpoNo = { $regex: `^${s}`, $options: 'i' };
    }
    if (station && !search) {
      const s = sanitizeRegexInput(station as string);
      if (s) docMatch.station = { $regex: `^${s}`, $options: 'i' };
    }
    // LPOSummary.date is YYYY-MM-DD — string comparison works correctly
    if (dateFrom || dateTo) {
      docMatch.date = {};
      if (dateFrom) {
        // dateFrom comes as full ISO string or date string — take just the date part
        docMatch.date.$gte = (dateFrom as string).substring(0, 10);
      }
      if (dateTo) {
        docMatch.date.$lte = (dateTo as string).substring(0, 10);
      }
    }

    // ── Entry-level (post-unwind) match ───────────────────────────────────
    const entryMatch: any = {};

    if (status === 'active') {
      entryMatch.$or = [{ 'entries.isCancelled': false }, { 'entries.isCancelled': { $exists: false } }];
    } else if (status === 'cancelled') {
      entryMatch['entries.isCancelled'] = true;
    }
    if (isRefer === 'true') entryMatch['entries.isRefer'] = true;
    if (isDriverAccount === 'true') entryMatch['entries.isDriverAccount'] = true;
    if (req.user?.role === 'driver') entryMatch['entries.truckNo'] = req.user.username;

    if (truckNo && !search) {
      const s = sanitizeRegexInput(truckNo as string);
      if (s) entryMatch['entries.truckNo'] = { $regex: `^${s}`, $options: 'i' };
    }

    const skip = calculateSkip(page, limit);

    // ── Aggregation pipeline ───────────────────────────────────────────────
    const pipeline: any[] = [
      { $match: docMatch },
      { $unwind: { path: '$entries', includeArrayIndex: 'entryIdx' } },
    ];

    if (Object.keys(entryMatch).length > 0) {
      pipeline.push({ $match: entryMatch });
    }

    pipeline.push(DERIVE_STAGE);

    // Search across multiple fields (post-derive so doSdoDisplay is available)
    if (search) {
      const s = sanitizeRegexInput(search as string);
      if (s) {
        pipeline.push({
          $match: {
            $or: [
              { lpoNo: { $regex: `^${s}`, $options: 'i' } },
              { 'entries.truckNo': { $regex: `^${s}`, $options: 'i' } },
              { station: { $regex: `^${s}`, $options: 'i' } },
              { doSdoDisplay: { $regex: `^${s}`, $options: 'i' } },
            ],
          },
        });
      }
    }

    pipeline.push({ $sort: { date: -1, lpoNo: -1, entryIdx: 1 } });

    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }, { $project: ENTRY_PROJECTION }],
        total: [{ $count: 'count' }],
      },
    });

    const [result] = await LPOSummary.aggregate(pipeline);
    const rawData: any[] = result?.data ?? [];
    const total: number = result?.total?.[0]?.count ?? 0;

    // Inject sn as page-relative row number
    const data = rawData.map((entry, idx) => ({ sn: skip + idx + 1, ...entry }));

    res.status(200).json({
      success: true,
      message: 'LPO entries retrieved successfully',
      data: createPaginatedResponse(data, page, limit, total),
    });
  } catch (error: any) {
    throw error;
  }
};

/**
 * GET /lpo-entries/available-filters
 * Returns distinct year-month periods and stations from LPOSummary.
 */
export const getAvailableFilters = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const baseMatch: any = { isDeleted: false };
    if (req.user?.role === 'driver') {
      // Restrict to LPOs that contain this driver's truck
      baseMatch['entries.truckNo'] = req.user.username;
    }

    // Periods: group by year+month from the YYYY-MM-DD date field
    const periodResults = await LPOSummary.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            year: { $toInt: { $substr: ['$date', 0, 4] } },
            month: { $toInt: { $substr: ['$date', 5, 2] } },
          },
        },
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
    ]);

    const seen = new Map<string, { year: number; month: number }>();
    for (const r of periodResults) {
      if (r._id.year && r._id.month) {
        const key = `${r._id.year}-${r._id.month}`;
        seen.set(key, { year: r._id.year, month: r._id.month });
      }
    }

    // Always include current month
    const now = new Date();
    const curKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    if (!seen.has(curKey)) seen.set(curKey, { year: now.getFullYear(), month: now.getMonth() + 1 });

    const periods = Array.from(seen.values()).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );

    // Stations: apply optional date range
    const { dateFrom, dateTo } = req.query;
    const stationsMatch: any = { ...baseMatch, station: { $nin: [null, ''] } };
    if (dateFrom || dateTo) {
      stationsMatch.date = {};
      if (dateFrom) stationsMatch.date.$gte = (dateFrom as string).substring(0, 10);
      if (dateTo) stationsMatch.date.$lte = (dateTo as string).substring(0, 10);
    }
    const rawStations = await LPOSummary.distinct('station', stationsMatch) as string[];
    const stations = rawStations
      .filter(s => s && s.trim())
      .map(s => s.trim().toUpperCase())
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();

    res.json({ periods, stations });
  } catch (error) {
    logger.error('Error fetching LPO available filters:', error);
    throw new ApiError(500, 'Failed to fetch available filters');
  }
};

/**
 * GET /lpo-entries/:id
 * Looks up a single entry by its subdocument _id inside LPOSummary.entries.
 */
export const getLPOEntryById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const pipeline: any[] = [
      { $match: { isDeleted: false, 'entries._id': new mongoose.Types.ObjectId(id) } },
      { $unwind: { path: '$entries', includeArrayIndex: 'entryIdx' } },
      { $match: { 'entries._id': new mongoose.Types.ObjectId(id) } },
      DERIVE_STAGE,
      { $project: ENTRY_PROJECTION },
      { $limit: 1 },
    ];

    const [entry] = await LPOSummary.aggregate(pipeline);
    if (!entry) throw new ApiError(404, 'LPO entry not found');

    res.status(200).json({ success: true, message: 'LPO entry retrieved successfully', data: entry });
  } catch (error: any) {
    throw error;
  }
};

/**
 * GET /lpo-entries/lpo/:lpoNo
 * Returns all entries for a given LPO number.
 */
export const getLPOEntriesByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { lpoNo } = req.params;

    const pipeline: any[] = [
      { $match: { lpoNo, isDeleted: false } },
      { $unwind: { path: '$entries', includeArrayIndex: 'entryIdx' } },
      DERIVE_STAGE,
      { $sort: { entryIdx: 1 } },
      { $project: ENTRY_PROJECTION },
    ];

    const entries = await LPOSummary.aggregate(pipeline);
    const data = entries.map((e, idx) => ({ sn: idx + 1, ...e }));

    res.status(200).json({ success: true, message: 'LPO entries retrieved successfully', data });
  } catch (error: any) {
    throw error;
  }
};

/**
 * POST /lpo-entries
 * Creates a new single-entry LPOSummary (used by legacy/standalone creation path).
 */
export const createLPOEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payload = req.body as any;

    const currentYear = new Date().getFullYear();
    const counterId = `lpoNo_${currentYear}`;
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const lpoNo = counter.seq.toString();
    const date = payload.date || new Date().toISOString().split('T')[0];

    const entry: any = {
      doNo: payload.doSdo || 'PENDING',
      truckNo: payload.truckNo || 'UNKNOWN',
      liters: payload.ltrs || 0,
      rate: payload.pricePerLtr || 0,
      amount: (payload.ltrs || 0) * (payload.pricePerLtr || 0),
      dest: payload.destinations || 'PENDING',
      isDriverAccount: payload.isDriverAccount || false,
      isRefer: payload.isRefer || false,
      isCancelled: false,
    };

    const lpoSummary = await LPOSummary.create({
      lpoNo,
      date,
      year: currentYear,
      station: payload.dieselAt || 'UNKNOWN',
      orderOf: payload.orderOf || 'UNKNOWN',
      currency: payload.currency || 'TZS',
      entries: [entry],
      total: entry.amount,
      createdBy: req.user?.username,
    });

    const createdEntry = lpoSummary.entries[0];

    logger.info(`LPO entry created: ${lpoNo} by ${req.user?.username}`);

    await AuditService.logCreate(
      req.user?.userId || 'system',
      req.user?.username || 'system',
      'LPOEntry',
      (createdEntry as any)._id.toString(),
      { lpoNo, truckNo: entry.truckNo, dieselAt: lpoSummary.station, ltrs: entry.liters },
      req.ip
    );

    const responseEntry = {
      id: (createdEntry as any)._id,
      lpoId: lpoSummary._id,
      lpoNo,
      date,
      dieselAt: lpoSummary.station,
      doSdo: entry.doNo,
      truckNo: entry.truckNo,
      ltrs: entry.liters,
      pricePerLtr: entry.rate,
      destinations: entry.dest,
      currency: lpoSummary.currency,
      isCancelled: false,
      paymentMode: 'STATION',
    };

    res.status(201).json({ success: true, message: 'LPO entry created successfully', data: responseEntry });
    emitDataChange('lpo_entries', 'create', responseEntry);
  } catch (error: any) {
    throw error;
  }
};

/**
 * PUT /lpo-entries/:id
 * Updates a specific entry (identified by its subdocument _id) inside LPOSummary.
 */
export const updateLPOEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { clientUpdatedAt, reason, ...rawUpdates } = req.body as any;

    const SENSITIVE_FIELDS = ['ltrs', 'pricePerLtr', 'paymentMode', 'isCancelled'];
    if (SENSITIVE_FIELDS.some(f => rawUpdates[f] !== undefined) && (!reason || reason.length < 10)) {
      throw new ApiError(400, 'A reason of at least 10 characters is required when changing quantity, pricing, or payment fields');
    }

    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    // Find the parent LPO document
    const entryObjId = new mongoose.Types.ObjectId(id);
    const lpo = await LPOSummary.findOne({ 'entries._id': entryObjId, isDeleted: false });
    if (!lpo) throw new ApiError(404, 'LPO entry not found');

    // Enforce document-level edit lock
    const lock = (lpo as any).editLock;
    if (lock?.lockedBy) {
      const lockedUntil = lock.lockedUntil ? new Date(lock.lockedUntil) : null;
      if (lockedUntil && lockedUntil > new Date()) {
        if (lock.lockedBy !== username) {
          throw new ApiError(423, `Record is being edited by ${lock.lockedBy}`).withData({ editLock: lock });
        }
      }
    } else {
      throw new ApiError(409, 'You must acquire an edit lock before saving changes.');
    }

    // Version guard
    if (clientUpdatedAt && lpo.updatedAt) {
      const clientTime = new Date(clientUpdatedAt).getTime();
      const serverTime = new Date(lpo.updatedAt as any).getTime();
      if (Math.abs(clientTime - serverTime) > 1000) {
        throw new ApiError(409, 'LPO was modified by another user since you opened it. Refresh to see the latest version.').withData({
          current: { updatedAt: lpo.updatedAt, lpoNo: lpo.lpoNo },
        });
      }
    }

    const entryIndex = lpo.entries.findIndex((e: any) => e._id.toString() === id);
    if (entryIndex === -1) throw new ApiError(404, 'LPO entry not found');

    const existingEntry = lpo.entries[entryIndex] as any;
    const prevSnapshot: Record<string, any> = {};
    const nextSnapshot: Record<string, any> = {};

    // Apply updates with field mapping (LPOEntry names → LPOSummary.entries names)
    const applyField = (from: string, to: string, transform?: (v: any) => any) => {
      if (rawUpdates[from] !== undefined) {
        const newVal = transform ? transform(rawUpdates[from]) : rawUpdates[from];
        if (JSON.stringify(existingEntry[to]) !== JSON.stringify(newVal)) {
          prevSnapshot[from] = existingEntry[to];
          nextSnapshot[from] = newVal;
        }
        (lpo.entries[entryIndex] as any)[to] = newVal;
      }
    };

    applyField('ltrs', 'liters');
    applyField('pricePerLtr', 'rate');
    applyField('destinations', 'dest');
    applyField('truckNo', 'truckNo');
    applyField('isCancelled', 'isCancelled');

    // Amendment tracking
    if (rawUpdates.ltrs !== undefined && rawUpdates.ltrs !== existingEntry.liters) {
      if (existingEntry.originalLiters === null || existingEntry.originalLiters === undefined) {
        (lpo.entries[entryIndex] as any).originalLiters = existingEntry.liters;
      }
      (lpo.entries[entryIndex] as any).amendedAt = new Date();
    }

    // Recalculate amount for this entry
    const updatedEntry = lpo.entries[entryIndex] as any;
    updatedEntry.amount = updatedEntry.liters * updatedEntry.rate;

    // Recalculate LPO total
    lpo.total = lpo.entries
      .filter((e: any) => !e.isCancelled)
      .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    await lpo.save();

    logger.info(`LPO entry updated: ${lpo.lpoNo} / ${updatedEntry.truckNo} by ${username}`);

    await AuditService.logUpdate(
      req.user?.userId || 'system',
      username,
      'LPOEntry',
      id,
      { lpoNo: lpo.lpoNo, truckNo: existingEntry.truckNo, ...prevSnapshot },
      { lpoNo: lpo.lpoNo, truckNo: updatedEntry.truckNo, ...nextSnapshot },
      req.ip
    );

    const responseEntry = {
      id: entryObjId,
      lpoId: lpo._id,
      lpoNo: lpo.lpoNo,
      date: lpo.date,
      dieselAt: lpo.station,
      truckNo: updatedEntry.truckNo,
      ltrs: updatedEntry.liters,
      pricePerLtr: updatedEntry.rate,
      destinations: updatedEntry.dest,
      isCancelled: updatedEntry.isCancelled || false,
      currency: lpo.currency,
    };

    res.status(200).json({ success: true, message: 'LPO entry updated successfully', data: responseEntry });
    emitDataChange('lpo_entries', 'update', responseEntry);
  } catch (error: any) {
    throw error;
  }
};

/**
 * GET /lpo-entries/next-lpo-number
 * Atomic counter — same logic as before, unchanged.
 */
export const getNextLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentYear = new Date().getFullYear();
    const counterId = `lpoNo_${currentYear}`;
    const counter = await Counter.findOneAndUpdate(
      { _id: counterId },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    res.status(200).json({ success: true, message: 'Next LPO number retrieved successfully', data: { nextLPONo: counter.seq.toString() } });
  } catch (error: any) {
    throw error;
  }
};

// ─── Edit lock handlers ───────────────────────────────────────────────────────
// Lock is at the LPOSummary document level (the parent LPO is locked when any
// of its entries is being edited, preventing concurrent edits to the same sheet).

export const acquireEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // entry subdocument _id
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_TTL_MS);

    const lpo = await LPOSummary.findOneAndUpdate(
      {
        isDeleted: false,
        'entries._id': new mongoose.Types.ObjectId(id),
        $or: [
          { 'editLock.lockedBy': null },
          { 'editLock.lockedBy': username },
          { 'editLock.lockedUntil': { $lt: now } },
        ],
      },
      { 'editLock.lockedBy': username, 'editLock.lockedAt': now, 'editLock.lockedUntil': lockUntil },
      { new: true }
    );

    if (!lpo) {
      const current = await LPOSummary.findOne({ 'entries._id': new mongoose.Types.ObjectId(id) }).select('editLock').lean();
      const holder = (current as any)?.editLock?.lockedBy || 'another user';
      throw new ApiError(423, `Record is being edited by ${holder}`).withData({ editLock: (current as any)?.editLock });
    }

    logger.info(`Edit lock acquired on LPO ${lpo.lpoNo} / entry ${id} by ${username}`);
    emitDataChange('lpo_entries', 'update', { id, editLock: { lockedBy: username, lockedUntil: lockUntil } });

    res.json({ success: true, message: 'Lock acquired', data: { lockedUntil: lockUntil } });
  } catch (error: any) {
    throw error;
  }
};

export const releaseEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const lpo = await LPOSummary.findOneAndUpdate(
      {
        isDeleted: false,
        'entries._id': new mongoose.Types.ObjectId(id),
        $or: [{ 'editLock.lockedBy': username }, { 'editLock.lockedBy': null }],
      },
      { 'editLock.lockedBy': null, 'editLock.lockedAt': null, 'editLock.lockedUntil': null },
      { new: true }
    );

    if (!lpo) throw new ApiError(403, 'You do not hold the lock on this record');

    logger.info(`Edit lock released on entry ${id} by ${username}`);
    emitDataChange('lpo_entries', 'update', { id, editLock: null });

    res.json({ success: true, message: 'Lock released' });
  } catch (error: any) {
    throw error;
  }
};
