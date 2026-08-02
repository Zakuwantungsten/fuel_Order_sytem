import { Response } from 'express';
import { DarLPODocument } from '../models/DarLPODocument';
import { LPOSummary, FuelRecord } from '../models';
import { SystemConfig } from '../models/SystemConfig';
import { YardConfig } from '../models/YardConfig';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput, buildFuzzyRegex } from '../utils';
import { AuditService } from '../utils/auditService';
import { emitDataChange } from '../services/websocket';
import { enforceEditLock } from './editLockController';
import { createYardSummaryExportHandlers } from '../utils/yardLpoSummaryExport';
import {
  findLinkedFuelRecord,
  findFuelRecordsByTruck,
  dispenseAmount,
  applyYardFieldDelta,
  applyAmendYardDispense,
} from '../services/yardLpoFuelService';
import {
  allocateSharedLpoNo,
  createYardLpoOnSummary,
  findYardLpoById,
  findYardLpoByLpoNo,
  listMergedYardLpos,
  workbookMergedByYear,
  distinctYardYears,
  tagYardDoc,
  normalizeYardEntriesForSummary,
  preserveYardEntryFuelFieldsOnUpdate,
  getYardMeta,
} from '../services/yardUnifiedLpoService';
import { YARD_STATION } from '../utils/yardStations';

const YARD: 'dar' = 'dar';
const YARD_FUEL_FIELD = getYardMeta(YARD).fuelField;

async function applyDarYardDelta(fuelRecord: any, deltaLiters: number): Promise<void> {
  await applyYardFieldDelta(fuelRecord, YARD_FUEL_FIELD, deltaLiters);
}

async function applyDarAmendDispense(
  fuelRecord: any,
  oldDispense: number,
  newDispense: number,
): Promise<number> {
  return applyAmendYardDispense(fuelRecord, YARD_FUEL_FIELD, oldDispense, newDispense);
}

function emitYardChange(resolved: { source: string; emitKey: string }, op: 'create' | 'update' = 'update') {
  emitDataChange(resolved.emitKey as any, op);
  if (resolved.source === 'summary') {
    emitDataChange('dar_lpo_documents', op);
    emitDataChange('lpo_summaries', op);
  }
}

// ── LPO number helper ──────────────────────────────────────────────────────────

/**
 * Legacy DY-YYYY-NNN allocator — kept for Excel import of historical yard sheets only.
 * New creates use the shared regular LPO sequence via allocateSharedLpoNo / createYardLpoOnSummary.
 */
export async function resolveNextDarLPONo(year: number): Promise<string> {
  const result = await DarLPODocument.aggregate([
    { $match: { lpoNo: { $regex: `^DY-${year}-` }, isDeleted: false } },
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
  return `DY-${year}-${String(seq).padStart(3, '0')}`;
}

// ── List filter builder ─────────────────────────────────────────────────────────
// Shared by the paginated list and the filter-options endpoint so both honour the
// same scoping. Month / entity / linked / status are applied server-side so the
// filters and dropdowns reflect the whole dataset, not just the current page.

type YardFilterInput = {
  year?: unknown; dateFrom?: unknown; dateTo?: unknown; lpoNo?: unknown; search?: unknown;
  filterMode?: unknown; month?: unknown; entity?: unknown; linked?: unknown; status?: unknown;
};

function buildDarLPOFilter(q: YardFilterInput): any {
  const { year, dateFrom, dateTo, lpoNo, search, filterMode, month, entity, linked, status } = q;
  const filter: any = { isDeleted: false };

  if (year) filter.year = parseInt(year as string, 10);

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

export const getNextDarLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  const { date, year: yearParam } = req.query;
  let year = new Date().getFullYear();
  if (yearParam && !isNaN(parseInt(yearParam as string, 10))) {
    year = parseInt(yearParam as string, 10);
  } else if (date && !isNaN(new Date(date as string).getTime())) {
    year = new Date(date as string).getFullYear();
  }
  const nextLpoNo = await allocateSharedLpoNo(year);

  res.status(200).json({
    success: true,
    message: 'Next Dar LPO number retrieved successfully',
    data: { nextLpoNo },
  });
};

export const getDarAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  const years = await distinctYardYears(YARD);

  res.status(200).json({
    success: true,
    message: 'Available years retrieved successfully',
    data: years,
  });
};

export const getDarFilterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { year, dateFrom, dateTo, search, month } = req.query;
  const filter = buildDarLPOFilter({ year, dateFrom, dateTo, search });
  const meta = getYardMeta(YARD);
  const summaryFilter = { ...filter, station: { $regex: meta.stationRegex } };

  const [legacyDocs, summaryDocs] = await Promise.all([
    DarLPODocument.find(filter).select('date entries.truckNo').lean(),
    LPOSummary.find(summaryFilter).select('date entries.truckNo').lean(),
  ]);
  const docs = [...legacyDocs, ...summaryDocs];

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
    message: 'Dar filter options retrieved successfully',
    data: {
      months: [...monthsSet].sort((a, b) => a - b),
      entities: [...entitiesSet].sort(),
    },
  });
};

export const getAllDarLPOs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, sort, order } = getPaginationParams(req.query);
  const { year, dateFrom, dateTo, lpoNo, search, filter: filterMode, month, entity, linked, status } = req.query;

  const filter: any = buildDarLPOFilter({ year, dateFrom, dateTo, lpoNo, search, filterMode, month, entity, linked, status });

  const skip = calculateSkip(page, limit);
  const sortOrder = order === 'asc' ? 1 : -1;
  const sortField = (sort as string) || 'date';

  const { docs, total } = await listMergedYardLpos(YARD, filter, {
    skip,
    limit,
    sortField,
    sortOrder: sortOrder as 1 | -1,
  });

  res.status(200).json({
    success: true,
    message: 'Dar LPOs retrieved successfully',
    data: createPaginatedResponse(docs, page, limit, total),
  });
};

export const getDarLPOById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const resolved = await findYardLpoById(YARD, id);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');

  res.status(200).json({
    success: true,
    message: 'Dar LPO retrieved successfully',
    data: tagYardDoc(resolved.doc, resolved.source, resolved.station),
  });
};

export const getDarLPOByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoNo } = req.params;
  const resolved = await findYardLpoByLpoNo(YARD, lpoNo);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');

  res.status(200).json({
    success: true,
    message: 'Dar LPO retrieved successfully',
    data: tagYardDoc(resolved.doc, resolved.source, resolved.station),
  });
};

export const getDarWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year)) throw new ApiError(400, 'Invalid year');

  const data = await workbookMergedByYear(YARD, year);

  res.status(200).json({
    success: true,
    message: 'Dar workbook retrieved successfully',
    data,
  });
};

export const createDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const data = req.body;

  const { lpo, lpoNo } = await createYardLpoOnSummary(YARD, {
    date: data.date,
    entries: data.entries,
    currency: data.currency,
    notes: data.notes,
    total: data.total,
    createdBy: req.user?.username || 'Unknown',
    approvedBy: data.approvedBy,
  });

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'CREATE',
    resourceType: 'LPOSummary',
    resourceId: lpoNo,
    details: `Dar Yard LPO ${lpoNo} created on LPOSummary (${lpo.entries.length} entries) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = tagYardDoc(lpo, 'summary', YARD_STATION.DAR);
  res.status(201).json({
    success: true,
    message: 'Dar LPO created successfully',
    data: responseData,
  });

  emitDataChange('dar_lpo_documents', 'create');
  emitDataChange('lpo_summaries', 'create', lpo.toObject(), YARD_STATION.DAR);
};

export const updateDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const newData = req.body;

  const resolved = await findYardLpoById(YARD, id);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');

  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');
  const LockModel = resolved.source === 'legacy' ? DarLPODocument : LPOSummary;
  const lockChannel = resolved.source === 'legacy' ? 'dar_lpo_documents' : 'lpo_summaries';
  await enforceEditLock(LockModel as any, id, username, lockChannel);

  if (newData.date) {
    newData.year = new Date(newData.date).getFullYear();
  }
  if (resolved.source === 'summary' && Array.isArray(newData.entries)) {
    newData.entries = normalizeYardEntriesForSummary(newData.entries);
    newData.station = resolved.station;
    if (!newData.orderOf) newData.orderOf = resolved.doc.orderOf;
  }
  if (Array.isArray(newData.entries)) {
    newData.entries = preserveYardEntryFuelFieldsOnUpdate(resolved.doc.entries || [], newData.entries);
    if (resolved.source === 'summary') {
      newData.entries = normalizeYardEntriesForSummary(newData.entries);
    }
  }

  Object.assign(resolved.doc, newData);
  if (newData.entries) resolved.doc.markModified('entries');
  await resolved.doc.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: resolved.source === 'legacy' ? 'DarLPODocument' : 'LPOSummary',
    resourceId: resolved.doc.lpoNo,
    details: `Dar LPO ${resolved.doc.lpoNo} updated by ${username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(200).json({
    success: true,
    message: 'Dar LPO updated successfully',
    data: tagYardDoc(resolved.doc, resolved.source, resolved.station),
  });

  emitYardChange(resolved, 'update');
};

export const cancelEntryInDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, cancellationReason } = req.body;
  if (!lpoId || !entryId) throw new ApiError(400, 'lpoId and entryId are required');

  const resolved = await findYardLpoById(YARD, lpoId);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Entry is already cancelled');

  entry.isCancelled = true;
  entry.cancellationReason = cancellationReason || '';
  entry.cancelledAt = new Date();

  if (entry.linkedFuelRecordId) {
    const fr = await FuelRecord.findById(entry.linkedFuelRecordId);
    if (fr) await applyDarYardDelta(fr, -dispenseAmount(entry));
  }

  lpo.markModified('entries');
  await lpo.save();

  res.status(200).json({
    success: true,
    message: 'Entry cancelled successfully',
    data: tagYardDoc(lpo, resolved.source, resolved.station),
  });

  emitYardChange(resolved, 'update');
  emitDataChange('fuel_records', 'update');
};

export const cancelAllEntriesInDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { cancellationReason } = req.body;

  const resolved = await findYardLpoById(YARD, id);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

  const now = new Date();

  for (const entry of lpo.entries as any[]) {
    if (entry.isCancelled) continue;

    if (entry.linkedFuelRecordId) {
      const fr = await FuelRecord.findById(entry.linkedFuelRecordId);
      if (fr) await applyDarYardDelta(fr, -dispenseAmount(entry));
    }

    entry.isCancelled = true;
    entry.cancellationReason = cancellationReason || 'Bulk cancellation';
    entry.cancelledAt = now;
  }

  lpo.markModified('entries');
  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: resolved.source === 'legacy' ? 'DarLPODocument' : 'LPOSummary',
    resourceId: lpo.lpoNo,
    details: `All entries in Dar LPO ${lpo.lpoNo} cancelled by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'high',
  });

  res.status(200).json({
    success: true,
    message: 'All entries cancelled successfully',
    data: tagYardDoc(lpo, resolved.source, resolved.station),
  });

  emitYardChange(resolved, 'update');
  emitDataChange('fuel_records', 'update');
};

export const amendEntryInDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, newLiters, newDispenseLiters, context, cascade, amendReason } = req.body;
  if (!lpoId || !entryId || newLiters == null) {
    throw new ApiError(400, 'lpoId, entryId and newLiters are required');
  }

  const resolved = await findYardLpoById(YARD, lpoId);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Cannot amend a cancelled entry');

  const oldLiters = entry.liters;
  const oldDispense = dispenseAmount(entry);
  const parsedLiters = Number(newLiters);
  if (!(parsedLiters > 0)) throw new ApiError(400, 'newLiters must be a positive number');
  if (parsedLiters === oldLiters) throw new ApiError(400, 'New liters must differ from the current value');

  const hasDispenseInput = newDispenseLiters != null && newDispenseLiters !== '';
  let newDispense = hasDispenseInput ? Number(newDispenseLiters) : parsedLiters;
  if (!(newDispense >= 0)) throw new ApiError(400, 'newDispenseLiters must be a non-negative number');
  // Never dispense more than the new billed amount (avoids negative billed−dispense when amending down).
  if (newDispense > parsedLiters) newDispense = parsedLiters;

  const diff = parsedLiters - newDispense;
  if (Math.abs(diff) > 0.001 && !(context && String(context).trim())) {
    throw new ApiError(400, 'Context is required when billed liters differ from dispense liters');
  }

  entry.originalLiters = entry.originalLiters ?? oldLiters;
  entry.liters = parsedLiters;
  entry.amount = parsedLiters * entry.rate;
  entry.dispenseLiters = newDispense;
  entry.context = context && String(context).trim() ? String(context).trim() : (entry.context ?? null);
  entry.amendedAt = new Date();

  // Reconcile fuel yard column to the new dispense. Plain (new−old) delta fails when
  // the column is still empty (initial link never wrote) — Math.max keeps it at 0.
  if (cascade !== false) {
    let fr = entry.linkedFuelRecordId
      ? await FuelRecord.findById(entry.linkedFuelRecordId)
      : null;
    if (!fr && entry.doNo && entry.truckNo) {
      const doNo = String(entry.doNo).trim();
      if (doNo && doNo.toUpperCase() !== 'NIL' && doNo.toUpperCase() !== 'N/A') {
        fr = await findLinkedFuelRecord(doNo, String(entry.truckNo));
        if (fr) entry.linkedFuelRecordId = fr._id.toString();
      }
    }
    if (fr) {
      await applyDarAmendDispense(fr, oldDispense, newDispense);
    } else if (entry.linkedFuelRecordId) {
      throw new ApiError(400, 'Linked fuel record not found — cannot cascade. Re-link the entry or uncheck cascade.');
    } else {
      throw new ApiError(
        400,
        'No fuel record found to update. Link this entry first (or check DO/truck), then amend.',
      );
    }
  }

  lpo.markModified('entries');
  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: resolved.source === 'legacy' ? 'DarLPODocument' : 'LPOSummary',
    resourceId: lpo.lpoNo,
    details: `Entry ${entryId} in Dar LPO ${lpo.lpoNo} amended from ${oldLiters}L to ${parsedLiters}L (dispense ${oldDispense}L → ${newDispense}L) by ${req.user?.username}${amendReason ? ': ' + amendReason : ''}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(200).json({
    success: true,
    message: 'Entry amended successfully',
    data: tagYardDoc(lpo, resolved.source, resolved.station),
  });

  emitYardChange(resolved, 'update');
  emitDataChange('fuel_records', 'update');
};

export const manualLinkDarEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, doNo, dispenseLiters } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const resolved = await findYardLpoById(YARD, lpoId);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

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
  await applyDarYardDelta(fr, dispenseAmount(entry));
  lpo.markModified('entries');
  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: resolved.source === 'legacy' ? 'DarLPODocument' : 'LPOSummary',
    resourceId: lpo.lpoNo,
    details: `Entry ${entryId} in Dar LPO ${lpo.lpoNo} manually linked to FuelRecord ${fr._id} (DO: ${doNo}) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(200).json({
    success: true,
    message: 'Entry manually linked to FuelRecord successfully',
    data: tagYardDoc(lpo, resolved.source, resolved.station),
  });

  emitYardChange(resolved, 'update');
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

type BulkLinkSelection = {
  entryId: string;
  fuelRecordId: string;
  dispenseLiters?: number;
  topUp?: boolean;
};

export const bulkAutoLinkDarEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const body = req.body as {
    selections?: BulkLinkSelection[];
    entryIds?: string[];
    topUpEntryIds?: string[];
    dispenseOverrides?: Record<string, number>;
  };

  const resolved = await findYardLpoById(YARD, id);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

  let selections: BulkLinkSelection[];
  if (Array.isArray(body.selections) && body.selections.length > 0) {
    selections = body.selections;
  } else if (Array.isArray(body.entryIds) && body.entryIds.length > 0) {
    const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
    let afterDate: Date | undefined;
    const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
    if (tlCfg?.enabled && tlCfg.perYard?.darYard?.enabled && tlCfg.perYard.darYard.timeLimitDays != null) {
      const days: number = tlCfg.perYard.darYard.timeLimitDays;
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

    if (sel.dispenseLiters != null && Number(sel.dispenseLiters) >= 0) {
      entry.dispenseLiters = Number(sel.dispenseLiters);
    }
    const disp = dispenseAmount(entry);

    if (entry.linkedFuelRecordId) {
      results.push({ entryId, status: 'already_linked', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp });
      continue;
    }

    const fr = sel.fuelRecordId
      ? await FuelRecord.findOne({ _id: sel.fuelRecordId, isDeleted: false, isCancelled: { $ne: true } })
      : null;
    if (!fr) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp });
      continue;
    }

    const existingValue: number = fr.darYard ?? 0;

    if (existingValue > 0 && !sel.topUp) {
      results.push({ entryId, status: 'conflict', truckNo: entry.truckNo, doNo: fr.goingDo || entry.doNo, liters: entry.liters, dispenseLiters: disp, existingValue, fuelRecordId: fr._id.toString() });
      continue;
    }

    entry.linkedFuelRecordId = fr._id.toString();
    if (fr.goingDo) entry.doNo = fr.goingDo;
    if (fr.to) entry.dest = fr.to;
    await applyDarYardDelta(fr, disp);
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

  if (didApply) {
    lpo.markModified('entries');
    await lpo.save();
  }

  const linked = results.filter(r => r.status === 'linked' || r.status === 'topped_up').length;
  const conflicts = results.filter(r => r.status === 'conflict');
  const notFound = results.filter(r => r.status === 'not_found').length;

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: resolved.source === 'legacy' ? 'DarLPODocument' : 'LPOSummary',
    resourceId: lpo.lpoNo,
    details: `Bulk auto-link on Dar LPO ${lpo.lpoNo}: ${linked} linked, ${conflicts.length} conflicts, ${notFound} not found — by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(200).json({
    success: true,
    message: 'Bulk auto-link completed',
    data: tagYardDoc(lpo, resolved.source, resolved.station),
    results,
    summary: { linked, conflicts: conflicts.length, notFound },
  });

  if (didApply) {
    emitYardChange(resolved, 'update');
    emitDataChange('fuel_records', 'update');
  }
};

export const previewManualLinkDarEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, doNo } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const resolved = await findYardLpoById(YARD, lpoId);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

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

export const previewBulkAutoLinkDarEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { entryIds } = req.body;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    throw new ApiError(400, 'entryIds must be a non-empty array');
  }

  const resolved = await findYardLpoById(YARD, id);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc;

  const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
  let afterDate: Date | undefined;
  const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
  if (tlCfg?.enabled && tlCfg.perYard?.darYard?.enabled && tlCfg.perYard.darYard.timeLimitDays != null) {
    const days: number = tlCfg.perYard.darYard.timeLimitDays;
    afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
  }

  const results = [];

  for (const entryId of entryIds as string[]) {
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled || entry.linkedFuelRecordId) continue;

    const disp = dispenseAmount(entry);
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
        existingValue: fr.darYard ?? 0,
        fuelRecord: fr.toObject(),
      })),
    });
  }

  res.status(200).json({ success: true, message: 'Preview completed', results });
};

export const downloadDarLPOPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const resolved = await findYardLpoById(YARD, id);
  if (!resolved) throw new ApiError(404, 'Dar LPO not found');
  const lpo = resolved.doc.toObject ? resolved.doc.toObject() : resolved.doc;

  const { generateLPOPDF, getCompanyBranding } = await import('../utils/pdfGenerator');
  const branding = await getCompanyBranding();

  const yardConfig = await YardConfig.findOne({ yard: 'DAR' }).lean();
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
    station: 'DAR YARD',
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

  logger.info(`Dar LPO PDF downloaded: ${lpo.lpoNo} by ${req.user?.username}`);
};

export const downloadDarMonthPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = parseInt(req.params.year, 10);
  const month = parseInt(req.params.month, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    throw new ApiError(400, 'Invalid year or month');
  }

  const mm = String(month).padStart(2, '0');
  const meta = getYardMeta(YARD);
  const monthDateFilter = { $regex: `^${year}-${mm}-` };

  const [legacyLpos, summaryLpos] = await Promise.all([
    DarLPODocument.find({
      year,
      date: monthDateFilter,
      isDeleted: false,
    }).sort({ date: 1, lpoNo: 1 }).lean(),
    LPOSummary.find({
      year,
      date: monthDateFilter,
      isDeleted: false,
      station: { $regex: meta.stationRegex },
    }).sort({ date: 1, lpoNo: 1 }).lean(),
  ]);

  const lpos = [...legacyLpos, ...summaryLpos].sort((a, b) => {
    const dc = String(a.date).localeCompare(String(b.date));
    if (dc !== 0) return dc;
    return String(a.lpoNo).localeCompare(String(b.lpoNo));
  });

  if (lpos.length === 0) throw new ApiError(404, 'No LPOs found for this month');

  const { generateLPOPDFBuffer, mergeMonthLPOsPDF, getCompanyBranding } = await import('../utils/pdfGenerator');
  const branding = await getCompanyBranding();

  const yardConfig = await YardConfig.findOne({ yard: 'DAR' }).lean();
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
        station: 'DAR YARD',
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
  res.setHeader('Content-Disposition', `attachment; filename="DAR-LPOs-${monthName}-${year}.pdf"`);
  res.send(merged);

  logger.info(`Dar month PDF downloaded: ${monthName} ${year} (${lpos.length} LPOs) by ${req.user?.username}`);
};

// Summary export still reads legacy DarLPODocument only (no LPOSummary merge yet).
const darSummaryExport = createYardSummaryExportHandlers({
  Model: DarLPODocument,
  dieselAt: 'Dar Yard',
  filePrefix: 'Dar_LPO',
  resourceType: 'DarLPOSummary',
  label: 'Dar LPO',
  summaryStationRegex: /^dar\s*yard$/i,
});

export const exportDarSummaryMonth = darSummaryExport.exportSummaryMonth;
export const exportDarSummaryYear = darSummaryExport.exportSummaryYear;
