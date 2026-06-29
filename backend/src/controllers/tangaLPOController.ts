import { Response } from 'express';
import { TangaLPODocument } from '../models/TangaLPODocument';
import { FuelRecord } from '../models';
import { SystemConfig } from '../models/SystemConfig';
import { YardConfig } from '../models/YardConfig';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput, buildFuzzyRegex, normalizeTruckNo } from '../utils';
import { AuditService } from '../utils/auditService';
import { emitDataChange } from '../services/websocket';
import { enforceEditLock } from './editLockController';

// ── Balance recalculation ──────────────────────────────────────────────────────

function recalcBalance(fr: any): number {
  const total = (fr.totalLts ?? 0) + (fr.extra ?? 0);
  const used =
    (fr.mmsaYard     ?? 0) + (fr.tangaYard    ?? 0) + (fr.darYard      ?? 0) +
    (fr.tangaGoing   ?? 0) + (fr.darGoing     ?? 0) + (fr.moroGoing    ?? 0) +
    (fr.mbeyaGoing   ?? 0) + (fr.tdmGoing     ?? 0) + (fr.zambiaGoing  ?? 0) +
    (fr.congoFuel    ?? 0) + (fr.zambiaReturn ?? 0) + (fr.tundumaReturn ?? 0) +
    (fr.mbeyaReturn  ?? 0) + (fr.moroReturn   ?? 0) + (fr.darReturn    ?? 0) +
    (fr.tangaReturn  ?? 0);
  return total - used;
}

// ── FuelRecord link helper ─────────────────────────────────────────────────────

async function findLinkedFuelRecord(doNo: string, truckNo: string, afterDate?: Date): Promise<any | null> {
  const safeTruck = sanitizeRegexInput(truckNo);
  const safeDo    = sanitizeRegexInput(doNo);
  const query: any = {
    truckNo: { $regex: new RegExp(`^${safeTruck}$`, 'i') },
    $or: [
      { goingDo:  { $regex: new RegExp(`^${safeDo}$`, 'i') } },
      { returnDo: { $regex: new RegExp(`^${safeDo}$`, 'i') } },
    ],
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (afterDate) query.date = { $gte: afterDate.toISOString().split('T')[0] };
  const records = await FuelRecord.find(query).sort({ date: -1 });
  return records.length ? records[0] : null;
}

// Auto-link matches by TRUCK only (not DO): given a truck, return every eligible
// FuelRecord within the time window for the user to choose from in the preview.
// Truck matching is whitespace/hyphen-tolerant (mirrors normalizeTruckNo) so
// imported records like "T790EEU" / "T790-EEU" still match an LPO entry's
// "T790 EEU". Most-recent first.
async function findFuelRecordsByTruck(truckNo: string, afterDate?: Date): Promise<any[]> {
  const normalized = normalizeTruckNo(truckNo); // e.g. "T790 EEU" -> "T790EEU"
  if (!normalized) return [];
  // Allow optional separators between the numeric block and the letters. The
  // normalized form is purely [A-Z0-9], so it's safe to embed directly in a regex.
  const m = normalized.match(/^(T?\d+)([A-Z]+)$/);
  const pattern = m ? `^${m[1]}[\\s-]*${m[2]}$` : `^${normalized}$`;
  const query: any = {
    truckNo: { $regex: new RegExp(pattern, 'i') },
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (afterDate) query.date = { $gte: afterDate.toISOString().split('T')[0] };
  // Cap candidates so a truck with a long history (e.g. when no time window is
  // configured) can't load thousands of records into the picker.
  return FuelRecord.find(query).sort({ date: -1 }).limit(50);
}

async function applyTangaYardDelta(
  fuelRecord: any,
  deltaLiters: number
): Promise<void> {
  fuelRecord.tangaYard = Math.max(0, (fuelRecord.tangaYard ?? 0) + deltaLiters);
  fuelRecord.balance = recalcBalance(fuelRecord);
  await fuelRecord.save();
  emitDataChange('fuel_records', 'update', fuelRecord.toObject());
}

// The liters actually dispensed to the fuel record. Defaults to the full billed
// `liters` when no per-truck override has been set.
function dispenseAmount(entry: any): number {
  return entry.dispenseLiters != null ? entry.dispenseLiters : entry.liters;
}

// ── LPO number helper ──────────────────────────────────────────────────────────

export async function resolveNextTangaLPONo(year: number): Promise<string> {
  // Highest sequence already used for this year. Scoping the match to
  // `^TY-${year}-` is what makes the counter reset to 001 each new year — a
  // fresh year has no matching documents, so `maxSeq` is null and seq starts at 1.
  //
  // We take the numeric MAX via aggregation rather than a `.sort({ lpoNo: -1 })`
  // string sort: lexically "TY-2026-1000" sorts BELOW "TY-2026-999", which would
  // make the counter stall and collide once a year passes 999 entries. `$convert`
  // with onError keeps any malformed imported number from breaking the pipeline.
  const result = await TangaLPODocument.aggregate([
    { $match: { lpoNo: { $regex: `^TY-${year}-` }, isDeleted: false } },
    {
      $group: {
        _id: null,
        maxSeq: {
          $max: {
            $convert: {
              input: { $arrayElemAt: [{ $split: ['$lpoNo', '-'] }, 2] },
              to: 'int',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
    },
  ]);

  const seq = (result[0]?.maxSeq ?? 0) + 1;
  return `TY-${year}-${String(seq).padStart(3, '0')}`;
}

// ── List filter builder ─────────────────────────────────────────────────────────
// Shared by the paginated list and the filter-options endpoint so both honour the
// same scoping. Month / entity / linked / status are applied server-side so the
// filters and dropdowns reflect the whole dataset, not just the current page.

type YardFilterInput = {
  year?: unknown; dateFrom?: unknown; dateTo?: unknown; lpoNo?: unknown; search?: unknown;
  filterMode?: unknown; month?: unknown; entity?: unknown; linked?: unknown; status?: unknown;
};

function buildTangaLPOFilter(q: YardFilterInput): any {
  const { year, dateFrom, dateTo, lpoNo, search, filterMode, month, entity, linked, status } = q;
  const filter: any = { isDeleted: false };

  if (year) filter.year = parseInt(year as string, 10);

  // Date range + month both constrain the "YYYY-MM-DD" string date. Compose them
  // with $and so they can coexist without clobbering each other.
  const dateConds: any[] = [];
  if (dateFrom || dateTo) {
    const range: any = {};
    if (dateFrom) range.$gte = dateFrom as string;
    if (dateTo) range.$lte = dateTo as string;
    dateConds.push({ date: range });
  }
  if (month) {
    const mm = String(parseInt(month as string, 10)).padStart(2, '0');
    dateConds.push({ date: { $regex: `^\\d{4}-${mm}-` } });
  }
  if (dateConds.length === 1) filter.date = dateConds[0].date;
  else if (dateConds.length > 1) filter.$and = dateConds;

  if (search) {
    // Whitespace/separator-tolerant prefix match (same as LPO management) so
    // "t598 dtb" also finds "T598DTB", "T598-DTB", etc. Searches across the LPO
    // number, truck/entity, DO number and destination.
    const fuzzy = buildFuzzyRegex(search as string);
    if (fuzzy) {
      filter.$or = [
        { lpoNo: { $regex: fuzzy, $options: 'i' } },
        { 'entries.truckNo': { $regex: fuzzy, $options: 'i' } },
        { 'entries.doNo': { $regex: fuzzy, $options: 'i' } },
        { 'entries.dest': { $regex: fuzzy, $options: 'i' } },
      ];
    }
  } else if (lpoNo) {
    filter.lpoNo = { $regex: sanitizeRegexInput(lpoNo as string) || lpoNo, $options: 'i' };
  }

  // Entry-level filters: a document matches when ONE entry satisfies all of
  // entity / linked / status together ($elemMatch).
  const entryCond: any = {};
  if (status === 'active') entryCond.isCancelled = { $ne: true };
  else if (status === 'cancelled') entryCond.isCancelled = true;
  if (entity) entryCond.truckNo = entity as string;

  const linkedMode = linked || (filterMode === 'unlinked' ? 'unlinked' : undefined);
  if (linkedMode === 'linked') {
    entryCond.isCancelled = { $ne: true };
    entryCond.linkedFuelRecordId = { $exists: true, $nin: [null, ''] };
  } else if (linkedMode === 'unlinked') {
    entryCond.isCancelled = { $ne: true };
    entryCond.$or = [
      { linkedFuelRecordId: { $exists: false } },
      { linkedFuelRecordId: null },
      { linkedFuelRecordId: '' },
    ];
  }
  if (Object.keys(entryCond).length > 0) filter.entries = { $elemMatch: entryCond };

  return filter;
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const getNextTangaLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  // Preview only — the authoritative number is re-resolved at save time from the
  // LPO's own date. Honour an optional ?date= / ?year= so the preview can match
  // the year of the LPO being entered (e.g. backdated across a New Year boundary);
  // default to the current calendar year.
  const { date, year: yearParam } = req.query;
  let year = new Date().getFullYear();
  if (yearParam && !isNaN(parseInt(yearParam as string, 10))) {
    year = parseInt(yearParam as string, 10);
  } else if (date && !isNaN(new Date(date as string).getTime())) {
    year = new Date(date as string).getFullYear();
  }
  const nextLpoNo = await resolveNextTangaLPONo(year);

  res.status(200).json({
    success: true,
    message: 'Next Tanga LPO number retrieved successfully',
    data: { nextLpoNo },
  });
};

export const getTangaAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  const years = await TangaLPODocument.distinct('year', { isDeleted: false }) as number[];
  years.sort((a, b) => b - a);

  res.status(200).json({
    success: true,
    message: 'Available years retrieved successfully',
    data: years,
  });
};

// Distinct months + truck/entity values for the list filter dropdowns. Scoped by
// year / date range / search so the options reflect the current view, and by month
// for the entity list so it narrows to the selected month. The month list itself
// ignores the month filter so the user can always switch months.
export const getTangaFilterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { year, dateFrom, dateTo, search, month } = req.query;
  const filter = buildTangaLPOFilter({ year, dateFrom, dateTo, search });

  const docs = await TangaLPODocument.find(filter).select('date entries.truckNo').lean();

  const monthsSet = new Set<number>();
  const entitiesSet = new Set<string>();
  const m = month ? parseInt(month as string, 10) : null;

  for (const d of docs as any[]) {
    const docMonth = parseInt(String(d.date).slice(5, 7), 10);
    if (docMonth) monthsSet.add(docMonth);
    if (!m || docMonth === m) {
      for (const e of (d.entries || [])) {
        if (e?.truckNo) entitiesSet.add(e.truckNo);
      }
    }
  }

  res.status(200).json({
    success: true,
    message: 'Tanga filter options retrieved successfully',
    data: {
      months: [...monthsSet].sort((a, b) => a - b),
      entities: [...entitiesSet].sort(),
    },
  });
};

export const getAllTangaLPOs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, sort, order } = getPaginationParams(req.query);
  const { year, dateFrom, dateTo, lpoNo, search, filter: filterMode, month, entity, linked, status } = req.query;

  const filter: any = buildTangaLPOFilter({ year, dateFrom, dateTo, lpoNo, search, filterMode, month, entity, linked, status });

  const skip = calculateSkip(page, limit);
  const sortOrder = order === 'asc' ? 1 : -1;
  const sortField = (sort as string) || 'date';

  const [docs, total] = await Promise.all([
    TangaLPODocument.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    TangaLPODocument.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Tanga LPOs retrieved successfully',
    data: createPaginatedResponse(docs, page, limit, total),
  });
};

export const getTangaLPOById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const doc = await TangaLPODocument.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) throw new ApiError(404, 'Tanga LPO not found');

  res.status(200).json({
    success: true,
    message: 'Tanga LPO retrieved successfully',
    data: { ...doc, id: doc._id },
  });
};

export const getTangaLPOByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoNo } = req.params;
  const doc = await TangaLPODocument.findOne({ lpoNo, isDeleted: false }).lean();
  if (!doc) throw new ApiError(404, 'Tanga LPO not found');

  res.status(200).json({
    success: true,
    message: 'Tanga LPO retrieved successfully',
    data: { ...doc, id: doc._id },
  });
};

export const getTangaWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year)) throw new ApiError(400, 'Invalid year');

  const docs = await TangaLPODocument.find({ year, isDeleted: false })
    .sort({ date: 1, lpoNo: 1 })
    .lean();

  // Group by month (1-12)
  const grouped: Record<number, any[]> = {};
  for (const doc of docs) {
    const month = new Date(doc.date).getMonth() + 1;
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push({ ...doc, id: doc._id });
  }

  res.status(200).json({
    success: true,
    message: 'Tanga workbook retrieved successfully',
    data: { year, months: grouped },
  });
};

export const createTangaLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const data = req.body;
  const dateObj = new Date(data.date);
  const year = dateObj.getFullYear();

  // Resolve-then-insert with a bounded retry on the unique `lpoNo` index. Two
  // concurrent creates (or a collision with an imported number) re-pick the next
  // free number instead of failing with a 500 — this is what makes the
  // read-modify-write counter safe without a separate atomic sequence.
  let lpo: InstanceType<typeof TangaLPODocument> | undefined;
  let lpoNo = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    lpoNo = await resolveNextTangaLPONo(year);
    try {
      lpo = await TangaLPODocument.create({
        ...data,
        lpoNo,
        year,
        createdBy: req.user?.username || 'Unknown',
      });
      break;
    } catch (err: any) {
      if (err?.code === 11000 && attempt < 4) continue; // duplicate lpoNo — retry
      throw err;
    }
  }
  if (!lpo) throw new ApiError(500, 'Could not allocate a Tanga LPO number, please retry');

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'CREATE',
    resourceType: 'TangaLPODocument',
    resourceId: lpoNo,
    details: `Tanga LPO ${lpoNo} created (${lpo.entries.length} entries) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = lpo.toObject();
  res.status(201).json({
    success: true,
    message: 'Tanga LPO created successfully',
    data: { ...responseData, id: responseData._id },
  });

  emitDataChange('tanga_lpo_documents', 'create');
};

export const updateTangaLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const newData = req.body;

  const existing = await TangaLPODocument.findOne({ _id: id, isDeleted: false });
  if (!existing) throw new ApiError(404, 'Tanga LPO not found');

  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');
  await enforceEditLock(TangaLPODocument, id, username, 'tanga_lpo_documents');

  if (newData.date) {
    newData.year = new Date(newData.date).getFullYear();
  }

  const updated = await TangaLPODocument.findOneAndUpdate(
    { _id: id, isDeleted: false },
    newData,
    { new: true, runValidators: true }
  );

  if (!updated) throw new ApiError(404, 'Tanga LPO not found');

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'TangaLPODocument',
    resourceId: updated.lpoNo,
    details: `Tanga LPO ${updated.lpoNo} updated by ${username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = updated.toObject();
  res.status(200).json({
    success: true,
    message: 'Tanga LPO updated successfully',
    data: { ...responseData, id: responseData._id },
  });

  emitDataChange('tanga_lpo_documents', 'update');
};

export const cancelEntryInTangaLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, cancellationReason } = req.body;
  if (!lpoId || !entryId) throw new ApiError(400, 'lpoId and entryId are required');

  const lpo = await TangaLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Entry is already cancelled');

  entry.isCancelled = true;
  entry.cancellationReason = cancellationReason || '';
  entry.cancelledAt = new Date();

  if (entry.linkedFuelRecordId) {
    const fr = await FuelRecord.findById(entry.linkedFuelRecordId);
    if (fr) await applyTangaYardDelta(fr, -dispenseAmount(entry));
  }

  await lpo.save();

  res.status(200).json({
    success: true,
    message: 'Entry cancelled successfully',
    data: { ...lpo.toObject(), id: lpo._id },
  });

  emitDataChange('tanga_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

export const cancelAllEntriesInTangaLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { cancellationReason } = req.body;

  const lpo = await TangaLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const now = new Date();

  for (const entry of lpo.entries as any[]) {
    if (entry.isCancelled) continue;

    if (entry.linkedFuelRecordId) {
      const fr = await FuelRecord.findById(entry.linkedFuelRecordId);
      if (fr) await applyTangaYardDelta(fr, -dispenseAmount(entry));
    }

    entry.isCancelled = true;
    entry.cancellationReason = cancellationReason || 'Bulk cancellation';
    entry.cancelledAt = now;
  }

  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'TangaLPODocument',
    resourceId: lpo.lpoNo,
    details: `All entries in Tanga LPO ${lpo.lpoNo} cancelled by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'high',
  });

  res.status(200).json({
    success: true,
    message: 'All entries cancelled successfully',
    data: { ...lpo.toObject(), id: lpo._id },
  });

  emitDataChange('tanga_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

export const amendEntryInTangaLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, newLiters, amendReason } = req.body;
  if (!lpoId || !entryId || newLiters == null) {
    throw new ApiError(400, 'lpoId, entryId and newLiters are required');
  }

  const lpo = await TangaLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Cannot amend a cancelled entry');
  if (newLiters >= entry.liters) {
    throw new ApiError(400, 'Amendment must reduce liters (new value must be less than current)');
  }

  // Reconcile the dispensed amount. When dispense was left at its default (== the
  // billed liters), it follows the new liters; a custom per-truck override is kept.
  const oldDispense = dispenseAmount(entry);
  const wasCustomized = entry.dispenseLiters != null && entry.dispenseLiters !== entry.liters;
  entry.originalLiters = entry.originalLiters ?? entry.liters;
  entry.amendedAt = new Date();
  entry.liters = newLiters;
  entry.amount = newLiters * entry.rate;
  const newDispense = wasCustomized ? oldDispense : newLiters;
  entry.dispenseLiters = newDispense;
  const delta = newDispense - oldDispense; // <= 0 — removes fuel

  if (entry.linkedFuelRecordId && delta !== 0) {
    const fr = await FuelRecord.findById(entry.linkedFuelRecordId);
    if (fr) await applyTangaYardDelta(fr, delta);
  }

  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'TangaLPODocument',
    resourceId: lpo.lpoNo,
    details: `Entry ${entryId} in Tanga LPO ${lpo.lpoNo} amended from ${entry.originalLiters}L to ${newLiters}L by ${req.user?.username}${amendReason ? ': ' + amendReason : ''}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(200).json({
    success: true,
    message: 'Entry amended successfully',
    data: { ...lpo.toObject(), id: lpo._id },
  });

  emitDataChange('tanga_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

export const manualLinkTangaEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, doNo, dispenseLiters } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const lpo = await TangaLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Cannot link a cancelled entry');
  if (entry.linkedFuelRecordId) throw new ApiError(400, 'Entry is already linked — cancel and re-create to re-link');

  const fr = await findLinkedFuelRecord(doNo as string, entry.truckNo);
  if (!fr) throw new ApiError(404, `No FuelRecord found for DO ${doNo} / truck ${entry.truckNo}`);

  if (dispenseLiters != null && Number(dispenseLiters) >= 0) {
    entry.dispenseLiters = Number(dispenseLiters);
  }
  entry.doNo = doNo;
  if (fr.to) entry.dest = fr.to;
  entry.linkedFuelRecordId = fr._id.toString();
  await applyTangaYardDelta(fr, dispenseAmount(entry));
  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'TangaLPODocument',
    resourceId: lpo.lpoNo,
    details: `Entry ${entryId} in Tanga LPO ${lpo.lpoNo} manually linked to FuelRecord ${fr._id} (DO: ${doNo}) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = lpo.toObject();
  res.status(200).json({
    success: true,
    message: 'Entry manually linked to FuelRecord successfully',
    data: { ...responseData, id: responseData._id },
  });

  emitDataChange('tanga_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

// ── Bulk Auto-Link ─────────────────────────────────────────────────────────────

type BulkLinkResult = {
  entryId: string;
  status: 'linked' | 'topped_up' | 'conflict' | 'not_found' | 'already_linked';
  truckNo: string;
  doNo: string;
  liters: number;
  dispenseLiters: number;
  existingValue?: number;
  fuelRecordId?: string;
};

// One selection from the auto-link preview: the entry plus the specific fuel
// record the user picked for it (auto-link matches many records per truck, so the
// chosen record id is required — the server no longer re-resolves it).
type BulkLinkSelection = {
  entryId: string;
  fuelRecordId: string;
  dispenseLiters?: number;
  topUp?: boolean;
};

export const bulkAutoLinkTangaEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const body = req.body as {
    selections?: BulkLinkSelection[];
    entryIds?: string[];
    topUpEntryIds?: string[];
    dispenseOverrides?: Record<string, number>;
  };

  const lpo = await TangaLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  // Two accepted input shapes, normalized to a single `selections` list:
  //  • selections — the auto-link preview already resolved a specific fuel record
  //    per entry (truck-based discovery, the user's explicit choice).
  //  • entryIds — legacy/creation path: resolve each entry by its OWN truck + DO
  //    (manual-link semantics) within the configured yard time window.
  let selections: BulkLinkSelection[];
  if (Array.isArray(body.selections) && body.selections.length > 0) {
    selections = body.selections;
  } else if (Array.isArray(body.entryIds) && body.entryIds.length > 0) {
    const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
    let afterDate: Date | undefined;
    const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
    if (tlCfg?.enabled && tlCfg.perYard?.tangaYard?.enabled && tlCfg.perYard.tangaYard.timeLimitDays != null) {
      const days: number = tlCfg.perYard.tangaYard.timeLimitDays;
      afterDate = new Date();
      afterDate.setDate(afterDate.getDate() - days);
    }
    const topUpSet = new Set<string>((body.topUpEntryIds as string[]) || []);
    const overrides = (body.dispenseOverrides || {}) as Record<string, number>;
    selections = [];
    for (const entryId of body.entryIds) {
      const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
      if (!entry || entry.isCancelled || entry.linkedFuelRecordId) continue;
      const fr = await findLinkedFuelRecord(entry.doNo, entry.truckNo, afterDate);
      selections.push({
        entryId,
        fuelRecordId: fr ? fr._id.toString() : '',
        dispenseLiters: overrides[entryId],
        topUp: topUpSet.has(entryId),
      });
    }
  } else {
    throw new ApiError(400, 'selections or entryIds must be a non-empty array');
  }

  const results: BulkLinkResult[] = [];
  let didApply = false;

  for (const sel of selections) {
    const entryId = sel?.entryId;
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled) continue;

    // Apply any per-truck dispense override before resolving the amount.
    if (sel.dispenseLiters != null && Number(sel.dispenseLiters) >= 0) {
      entry.dispenseLiters = Number(sel.dispenseLiters);
    }
    const disp = dispenseAmount(entry);

    if (entry.linkedFuelRecordId) {
      results.push({ entryId, status: 'already_linked', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp });
      continue;
    }

    // Link to the exact fuel record the user chose in the preview.
    const fr = sel.fuelRecordId
      ? await FuelRecord.findOne({ _id: sel.fuelRecordId, isDeleted: false, isCancelled: { $ne: true } })
      : null;
    if (!fr) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp });
      continue;
    }

    const existingValue: number = fr.tangaYard ?? 0;

    if (existingValue > 0 && !sel.topUp) {
      results.push({ entryId, status: 'conflict', truckNo: entry.truckNo, doNo: fr.goingDo || entry.doNo, liters: entry.liters, dispenseLiters: disp, existingValue, fuelRecordId: fr._id.toString() });
      continue;
    }

    entry.linkedFuelRecordId = fr._id.toString();
    // Backfill the entry's DO and destination from the matched fuel record (manual link does the same).
    if (fr.goingDo) entry.doNo = fr.goingDo;
    if (fr.to) entry.dest = fr.to;
    await applyTangaYardDelta(fr, disp);
    didApply = true;
    results.push({
      entryId,
      status: existingValue > 0 ? 'topped_up' : 'linked',
      truckNo: entry.truckNo,
      doNo: entry.doNo,
      liters: entry.liters,
      dispenseLiters: disp,
      existingValue: existingValue > 0 ? existingValue : undefined,
      fuelRecordId: fr._id.toString(),
    });
  }

  if (didApply) await lpo.save();

  const linked = results.filter(r => r.status === 'linked' || r.status === 'topped_up').length;
  const conflicts = results.filter(r => r.status === 'conflict');
  const notFound = results.filter(r => r.status === 'not_found').length;

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'TangaLPODocument',
    resourceId: lpo.lpoNo,
    details: `Bulk auto-link on Tanga LPO ${lpo.lpoNo}: ${linked} linked, ${conflicts.length} conflicts, ${notFound} not found — by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = lpo.toObject();
  res.status(200).json({
    success: true,
    message: 'Bulk auto-link completed',
    data: { ...responseData, id: responseData._id },
    results,
    summary: { linked, conflicts: conflicts.length, notFound },
  });

  if (didApply) {
    emitDataChange('tanga_lpo_documents', 'update');
    emitDataChange('fuel_records', 'update');
  }
};

// ── Preview Manual Link (dry-run, no writes) ───────────────────────────────────

export const previewManualLinkTangaEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, doNo } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const lpo = await TangaLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Cannot link a cancelled entry');
  if (entry.linkedFuelRecordId) throw new ApiError(400, 'Entry is already linked');

  const fr = await findLinkedFuelRecord(doNo, entry.truckNo);
  if (!fr) throw new ApiError(404, `No FuelRecord found for DO ${doNo} / truck ${entry.truckNo}`);

  res.status(200).json({
    success: true,
    message: 'FuelRecord found',
    data: { fuelRecord: fr.toObject() },
  });
};

// ── Preview Bulk Auto-Link (dry-run, no writes) ────────────────────────────────

export const previewBulkAutoLinkTangaEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { entryIds } = req.body;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    throw new ApiError(400, 'entryIds must be a non-empty array');
  }

  const lpo = await TangaLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
  let afterDate: Date | undefined;
  const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
  if (tlCfg?.enabled && tlCfg.perYard?.tangaYard?.enabled && tlCfg.perYard.tangaYard.timeLimitDays != null) {
    const days: number = tlCfg.perYard.tangaYard.timeLimitDays;
    afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
  }

  const results = [];

  for (const entryId of entryIds as string[]) {
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled || entry.linkedFuelRecordId) continue;

    const disp = dispenseAmount(entry);
    // Auto-link by truck: surface every eligible fuel record in the window so the
    // user can choose which one this entry links to (no DO requirement).
    const candidates = await findFuelRecordsByTruck(entry.truckNo, afterDate);
    if (candidates.length === 0) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp, candidates: [] });
      continue;
    }

    results.push({
      entryId,
      status: 'found',
      truckNo: entry.truckNo,
      doNo: entry.doNo,
      liters: entry.liters,
      dispenseLiters: disp,
      candidates: candidates.map((fr: any) => ({
        fuelRecordId: fr._id.toString(),
        date: fr.date,
        goingDo: fr.goingDo,
        returnDo: fr.returnDo,
        existingValue: fr.tangaYard ?? 0,
        fuelRecord: fr.toObject(),
      })),
    });
  }

  res.status(200).json({ success: true, message: 'Preview completed', results });
};

export const downloadTangaLPOPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const lpo = await TangaLPODocument.findById(id).lean();
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const { generateLPOPDF, getCompanyBranding } = await import('../utils/pdfGenerator');
  const branding = await getCompanyBranding();

  const yardConfig = await YardConfig.findOne({ yard: 'TANGA' }).lean();
  const stationInfo = yardConfig ? {
    supplierName: (yardConfig as any).supplierName,
    supplierAddress: (yardConfig as any).supplierAddress,
    supplierPlotNo: (yardConfig as any).supplierPlotNo,
    supplierPoBox: (yardConfig as any).supplierPoBox,
    description: (yardConfig as any).description,
  } : undefined;

  const lpoData: any = {
    lpoNo: lpo.lpoNo,
    date: lpo.date,
    year: lpo.year,
    station: 'TANGA YARD',
    orderOf: '',
    entries: (lpo.entries as any[]).map(e => ({
      doNo: e.doNo || 'NIL',
      truckNo: e.truckNo,
      liters: e.liters,
      rate: e.rate,
      amount: e.amount,
      dest: e.dest || '',
      isCancelled: !!e.isCancelled,
    })),
    total: lpo.total,
    currency: lpo.currency || 'TZS',
  };

  const doc = generateLPOPDF(lpoData, branding, req.user?.username, (lpo as any).approvedBy, stationInfo);

  const dateStr = new Date().toISOString().split('T')[0];
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="LPO-${lpo.lpoNo}-${dateStr}.pdf"`);
  doc.pipe(res);
  doc.end();

  logger.info(`Tanga LPO PDF downloaded: ${lpo.lpoNo} by ${req.user?.username}`);
};

export const downloadTangaMonthPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new ApiError(400, 'Invalid year or month');
  }

  const mm = String(month).padStart(2, '0');
  const lpos = await TangaLPODocument.find({
    year,
    date: { $regex: `^${year}-${mm}-` },
    isDeleted: false,
  }).sort({ date: 1, lpoNo: 1 }).lean();

  if (lpos.length === 0) throw new ApiError(404, 'No LPOs found for this month');

  const { generateLPOPDFBuffer, mergeMonthLPOsPDF, getCompanyBranding } = await import('../utils/pdfGenerator');
  const branding = await getCompanyBranding();

  const yardConfig = await YardConfig.findOne({ yard: 'TANGA' }).lean();
  const stationInfo = yardConfig ? {
    supplierName: (yardConfig as any).supplierName,
    supplierAddress: (yardConfig as any).supplierAddress,
    supplierPlotNo: (yardConfig as any).supplierPlotNo,
    supplierPoBox: (yardConfig as any).supplierPoBox,
    description: (yardConfig as any).description,
  } : undefined;

  const buffers = await Promise.all(
    lpos.map(lpo => {
      const lpoData: any = {
        lpoNo: lpo.lpoNo,
        date: lpo.date,
        year: lpo.year,
        station: 'TANGA YARD',
        orderOf: '',
        entries: (lpo.entries as any[]).map(e => ({
          doNo: e.doNo || 'NIL',
          truckNo: e.truckNo,
          liters: e.liters,
          rate: e.rate,
          amount: e.amount,
          dest: e.dest || '',
          isCancelled: !!e.isCancelled,
        })),
        total: lpo.total,
        currency: (lpo as any).currency || 'TZS',
      };
      return generateLPOPDFBuffer(lpoData, branding, req.user?.username, (lpo as any).approvedBy, stationInfo);
    })
  );

  const merged = await mergeMonthLPOsPDF(buffers);
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="TANGA-LPOs-${monthName}-${year}.pdf"`);
  res.send(merged);

  logger.info(`Tanga month PDF downloaded: ${monthName} ${year} (${lpos.length} LPOs) by ${req.user?.username}`);
};
