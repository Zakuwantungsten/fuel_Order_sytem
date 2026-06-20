import { Response } from 'express';
import { DarLPODocument } from '../models/DarLPODocument';
import { FuelRecord } from '../models';
import { SystemConfig } from '../models/SystemConfig';
import { YardConfig } from '../models/YardConfig';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { getPaginationParams, createPaginatedResponse, calculateSkip, logger, sanitizeRegexInput } from '../utils';
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
  const query: any = {
    truckNo,
    $or: [{ goingDo: doNo }, { returnDo: doNo }],
    isDeleted: false,
    isCancelled: { $ne: true },
  };
  if (afterDate) query.date = { $gte: afterDate.toISOString().split('T')[0] };
  const records = await FuelRecord.find(query).sort({ date: -1 });
  return records.length ? records[0] : null;
}

async function applyDarYardDelta(
  fuelRecord: any,
  deltaLiters: number
): Promise<void> {
  fuelRecord.darYard = Math.max(0, (fuelRecord.darYard ?? 0) + deltaLiters);
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

async function resolveNextDarLPONo(year: number): Promise<string> {
  const lastLPO = await DarLPODocument.findOne({
    lpoNo: { $regex: `^DY-${year}-` },
    isDeleted: false,
  }).sort({ lpoNo: -1 });

  let seq = 1;
  if (lastLPO) {
    const parts = lastLPO.lpoNo.split('-');
    const parsed = parseInt(parts[2], 10);
    if (!isNaN(parsed)) seq = parsed + 1;
  }

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
    const safe = sanitizeRegexInput(search as string);
    if (safe) {
      filter.$or = [
        { lpoNo: { $regex: safe, $options: 'i' } },
        { 'entries.truckNo': { $regex: safe, $options: 'i' } },
        { 'entries.doNo': { $regex: safe, $options: 'i' } },
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

export const getNextDarLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = new Date().getFullYear();
  const nextLpoNo = await resolveNextDarLPONo(year);

  res.status(200).json({
    success: true,
    message: 'Next Dar LPO number retrieved successfully',
    data: { nextLpoNo },
  });
};

export const getDarAvailableYears = async (req: AuthRequest, res: Response): Promise<void> => {
  const years = await DarLPODocument.distinct('year', { isDeleted: false }) as number[];
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
export const getDarFilterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { year, dateFrom, dateTo, search, month } = req.query;
  const filter = buildDarLPOFilter({ year, dateFrom, dateTo, search });

  const docs = await DarLPODocument.find(filter).select('date entries.truckNo').lean();

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

  const [docs, total] = await Promise.all([
    DarLPODocument.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    DarLPODocument.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    message: 'Dar LPOs retrieved successfully',
    data: createPaginatedResponse(docs, page, limit, total),
  });
};

export const getDarLPOById = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const doc = await DarLPODocument.findOne({ _id: id, isDeleted: false }).lean();
  if (!doc) throw new ApiError(404, 'Dar LPO not found');

  res.status(200).json({
    success: true,
    message: 'Dar LPO retrieved successfully',
    data: { ...doc, id: doc._id },
  });
};

export const getDarLPOByLPONo = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoNo } = req.params;
  const doc = await DarLPODocument.findOne({ lpoNo, isDeleted: false }).lean();
  if (!doc) throw new ApiError(404, 'Dar LPO not found');

  res.status(200).json({
    success: true,
    message: 'Dar LPO retrieved successfully',
    data: { ...doc, id: doc._id },
  });
};

export const getDarWorkbookByYear = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year)) throw new ApiError(400, 'Invalid year');

  const docs = await DarLPODocument.find({ year, isDeleted: false })
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
    message: 'Dar workbook retrieved successfully',
    data: { year, months: grouped },
  });
};

export const createDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const data = req.body;
  const dateObj = new Date(data.date);
  const year = dateObj.getFullYear();

  const lpoNo = await resolveNextDarLPONo(year);

  const lpo = await DarLPODocument.create({
    ...data,
    lpoNo,
    year,
    createdBy: req.user?.username || 'Unknown',
  });

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'CREATE',
    resourceType: 'DarLPODocument',
    resourceId: lpoNo,
    details: `Dar LPO ${lpoNo} created (${lpo.entries.length} entries) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = lpo.toObject();
  res.status(201).json({
    success: true,
    message: 'Dar LPO created successfully',
    data: { ...responseData, id: responseData._id },
  });

  emitDataChange('dar_lpo_documents', 'create');
};

export const updateDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const newData = req.body;

  const existing = await DarLPODocument.findOne({ _id: id, isDeleted: false });
  if (!existing) throw new ApiError(404, 'Dar LPO not found');

  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');
  await enforceEditLock(DarLPODocument, id, username, 'dar_lpo_documents');

  if (newData.date) {
    newData.year = new Date(newData.date).getFullYear();
  }

  const updated = await DarLPODocument.findOneAndUpdate(
    { _id: id, isDeleted: false },
    newData,
    { new: true, runValidators: true }
  );

  if (!updated) throw new ApiError(404, 'Dar LPO not found');

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'DarLPODocument',
    resourceId: updated.lpoNo,
    details: `Dar LPO ${updated.lpoNo} updated by ${username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = updated.toObject();
  res.status(200).json({
    success: true,
    message: 'Dar LPO updated successfully',
    data: { ...responseData, id: responseData._id },
  });

  emitDataChange('dar_lpo_documents', 'update');
};

export const cancelEntryInDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, cancellationReason } = req.body;
  if (!lpoId || !entryId) throw new ApiError(400, 'lpoId and entryId are required');

  const lpo = await DarLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

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

  await lpo.save();

  res.status(200).json({
    success: true,
    message: 'Entry cancelled successfully',
    data: { ...lpo.toObject(), id: lpo._id },
  });

  emitDataChange('dar_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

export const cancelAllEntriesInDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { cancellationReason } = req.body;

  const lpo = await DarLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

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

  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'DarLPODocument',
    resourceId: lpo.lpoNo,
    details: `All entries in Dar LPO ${lpo.lpoNo} cancelled by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'high',
  });

  res.status(200).json({
    success: true,
    message: 'All entries cancelled successfully',
    data: { ...lpo.toObject(), id: lpo._id },
  });

  emitDataChange('dar_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

export const amendEntryInDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, newLiters, amendReason } = req.body;
  if (!lpoId || !entryId || newLiters == null) {
    throw new ApiError(400, 'lpoId, entryId and newLiters are required');
  }

  const lpo = await DarLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

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
    if (fr) await applyDarYardDelta(fr, delta);
  }

  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'DarLPODocument',
    resourceId: lpo.lpoNo,
    details: `Entry ${entryId} in Dar LPO ${lpo.lpoNo} amended from ${entry.originalLiters}L to ${newLiters}L by ${req.user?.username}${amendReason ? ': ' + amendReason : ''}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  res.status(200).json({
    success: true,
    message: 'Entry amended successfully',
    data: { ...lpo.toObject(), id: lpo._id },
  });

  emitDataChange('dar_lpo_documents', 'update');
  emitDataChange('fuel_records', 'update');
};

export const manualLinkDarEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, doNo, dispenseLiters } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const lpo = await DarLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

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
  entry.linkedFuelRecordId = fr._id.toString();
  await applyDarYardDelta(fr, dispenseAmount(entry));
  await lpo.save();

  await AuditService.log({
    userId: req.user?.userId,
    username: req.user?.username || 'system',
    action: 'UPDATE',
    resourceType: 'DarLPODocument',
    resourceId: lpo.lpoNo,
    details: `Entry ${entryId} in Dar LPO ${lpo.lpoNo} manually linked to FuelRecord ${fr._id} (DO: ${doNo}) by ${req.user?.username}`,
    ipAddress: req.ip,
    severity: 'medium',
  });

  const responseData = lpo.toObject();
  res.status(200).json({
    success: true,
    message: 'Entry manually linked to FuelRecord successfully',
    data: { ...responseData, id: responseData._id },
  });

  emitDataChange('dar_lpo_documents', 'update');
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
};

export const bulkAutoLinkDarEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { entryIds, topUpEntryIds = [], dispenseOverrides = {} } = req.body;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    throw new ApiError(400, 'entryIds must be a non-empty array');
  }

  const lpo = await DarLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

  // Gate FuelRecord search to the configured dar yard time window
  const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
  let afterDate: Date | undefined;
  const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
  if (tlCfg?.enabled && tlCfg.perYard?.darYard?.enabled) {
    const days: number = tlCfg.perYard.darYard.timeLimitDays ?? 2;
    afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
  }

  const results: BulkLinkResult[] = [];
  const topUpSet = new Set<string>(topUpEntryIds as string[]);
  const overrides = (dispenseOverrides || {}) as Record<string, number>;
  let didApply = false;

  for (const entryId of entryIds as string[]) {
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled) continue;

    // Apply any per-truck dispense override before resolving the amount.
    if (overrides[entryId] != null && Number(overrides[entryId]) >= 0) {
      entry.dispenseLiters = Number(overrides[entryId]);
    }
    const disp = dispenseAmount(entry);

    if (entry.linkedFuelRecordId) {
      results.push({ entryId, status: 'already_linked', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp });
      continue;
    }

    const fr = await findLinkedFuelRecord(entry.doNo, entry.truckNo, afterDate);
    if (!fr) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp });
      continue;
    }

    const existingValue: number = fr.darYard ?? 0;

    if (existingValue > 0 && !topUpSet.has(entryId)) {
      results.push({ entryId, status: 'conflict', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp, existingValue });
      continue;
    }

    entry.linkedFuelRecordId = fr._id.toString();
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
    resourceType: 'DarLPODocument',
    resourceId: lpo.lpoNo,
    details: `Bulk auto-link on Dar LPO ${lpo.lpoNo}: ${linked} linked, ${conflicts.length} conflicts, ${notFound} not found — by ${req.user?.username}`,
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
    emitDataChange('dar_lpo_documents', 'update');
    emitDataChange('fuel_records', 'update');
  }
};

// ── Preview Manual Link (dry-run, no writes) ───────────────────────────────────

export const previewManualLinkDarEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  const { lpoId, entryId, doNo } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const lpo = await DarLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

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

export const previewBulkAutoLinkDarEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { entryIds } = req.body;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    throw new ApiError(400, 'entryIds must be a non-empty array');
  }

  const lpo = await DarLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

  const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
  let afterDate: Date | undefined;
  const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
  if (tlCfg?.enabled && tlCfg.perYard?.darYard?.enabled) {
    const days: number = tlCfg.perYard.darYard.timeLimitDays ?? 2;
    afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
  }

  const results = [];

  for (const entryId of entryIds as string[]) {
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled || entry.linkedFuelRecordId) continue;

    const disp = dispenseAmount(entry);
    const fr = await findLinkedFuelRecord(entry.doNo, entry.truckNo, afterDate);
    if (!fr) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, dispenseLiters: disp, fuelRecord: null, existingValue: 0 });
      continue;
    }

    const existingValue: number = fr.darYard ?? 0;
    results.push({
      entryId,
      status: existingValue > 0 ? 'conflict' : 'found',
      truckNo: entry.truckNo,
      doNo: entry.doNo,
      liters: entry.liters,
      dispenseLiters: disp,
      existingValue,
      fuelRecord: fr.toObject(),
    });
  }

  res.status(200).json({ success: true, message: 'Preview completed', results });
};

export const downloadDarLPOPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  const lpo = await DarLPODocument.findById(id).lean();
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

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
