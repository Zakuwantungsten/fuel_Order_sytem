import { Response } from 'express';
import { TangaLPODocument } from '../models/TangaLPODocument';
import { FuelRecord } from '../models';
import { SystemConfig } from '../models/SystemConfig';
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

async function applyTangaYardDelta(
  fuelRecord: any,
  deltaLiters: number
): Promise<void> {
  fuelRecord.tangaYard = Math.max(0, (fuelRecord.tangaYard ?? 0) + deltaLiters);
  fuelRecord.balance = recalcBalance(fuelRecord);
  await fuelRecord.save();
  emitDataChange('fuel_records', 'update', fuelRecord.toObject());
}

// ── LPO number helper ──────────────────────────────────────────────────────────

async function resolveNextTangaLPONo(year: number): Promise<string> {
  const lastLPO = await TangaLPODocument.findOne({
    lpoNo: { $regex: `^TY-${year}-` },
    isDeleted: false,
  }).sort({ lpoNo: -1 });

  let seq = 1;
  if (lastLPO) {
    const parts = lastLPO.lpoNo.split('-');
    const parsed = parseInt(parts[2], 10);
    if (!isNaN(parsed)) seq = parsed + 1;
  }

  return `TY-${year}-${String(seq).padStart(3, '0')}`;
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const getNextTangaLPONumber = async (req: AuthRequest, res: Response): Promise<void> => {
  const year = new Date().getFullYear();
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

export const getAllTangaLPOs = async (req: AuthRequest, res: Response): Promise<void> => {
  const { page, limit, sort, order } = getPaginationParams(req.query);
  const { year, dateFrom, dateTo, lpoNo, search, filter: filterMode } = req.query;

  const filter: any = { isDeleted: false };

  if (year) filter.year = parseInt(year as string, 10);

  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = dateFrom as string;
    if (dateTo) filter.date.$lte = dateTo as string;
  }

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

  if (filterMode === 'unlinked') {
    filter['entries'] = {
      $elemMatch: {
        isCancelled: { $ne: true },
        $or: [
          { linkedFuelRecordId: { $exists: false } },
          { linkedFuelRecordId: null },
          { linkedFuelRecordId: '' },
        ],
      },
    };
  }

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

  const lpoNo = await resolveNextTangaLPONo(year);

  const lpo = await TangaLPODocument.create({
    ...data,
    lpoNo,
    year,
    createdBy: req.user?.username || 'Unknown',
  });

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
    if (fr) await applyTangaYardDelta(fr, -entry.liters);
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
      if (fr) await applyTangaYardDelta(fr, -entry.liters);
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

  const delta = newLiters - entry.liters; // negative — removes fuel
  entry.originalLiters = entry.originalLiters ?? entry.liters;
  entry.amendedAt = new Date();
  entry.liters = newLiters;
  entry.amount = newLiters * entry.rate;

  if (entry.linkedFuelRecordId) {
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
  const { lpoId, entryId, doNo } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const lpo = await TangaLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Cannot link a cancelled entry');
  if (entry.linkedFuelRecordId) throw new ApiError(400, 'Entry is already linked — cancel and re-create to re-link');

  const fr = await findLinkedFuelRecord(doNo as string, entry.truckNo);
  if (!fr) throw new ApiError(404, `No FuelRecord found for DO ${doNo} / truck ${entry.truckNo}`);

  entry.doNo = doNo;
  entry.linkedFuelRecordId = fr._id.toString();
  await applyTangaYardDelta(fr, entry.liters);
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
  existingValue?: number;
};

export const bulkAutoLinkTangaEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { entryIds, topUpEntryIds = [] } = req.body;

  if (!Array.isArray(entryIds) || entryIds.length === 0) {
    throw new ApiError(400, 'entryIds must be a non-empty array');
  }

  const lpo = await TangaLPODocument.findOne({ _id: id, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Tanga LPO not found');

  // Gate FuelRecord search to the configured tanga yard time window
  const timeLimitCfg = await SystemConfig.findOne({ configType: 'yard_fuel_time_limit', isDeleted: false }).lean();
  let afterDate: Date | undefined;
  const tlCfg = (timeLimitCfg as any)?.yardFuelTimeLimit;
  if (tlCfg?.enabled && tlCfg.perYard?.tangaYard?.enabled) {
    const days: number = tlCfg.perYard.tangaYard.timeLimitDays ?? 2;
    afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
  }

  const results: BulkLinkResult[] = [];
  const topUpSet = new Set<string>(topUpEntryIds as string[]);
  let didApply = false;

  for (const entryId of entryIds as string[]) {
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled) continue;

    if (entry.linkedFuelRecordId) {
      results.push({ entryId, status: 'already_linked', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters });
      continue;
    }

    const fr = await findLinkedFuelRecord(entry.doNo, entry.truckNo, afterDate);
    if (!fr) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters });
      continue;
    }

    const existingValue: number = fr.tangaYard ?? 0;

    if (existingValue > 0 && !topUpSet.has(entryId)) {
      results.push({ entryId, status: 'conflict', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, existingValue });
      continue;
    }

    entry.linkedFuelRecordId = fr._id.toString();
    await applyTangaYardDelta(fr, entry.liters);
    didApply = true;
    results.push({
      entryId,
      status: existingValue > 0 ? 'topped_up' : 'linked',
      truckNo: entry.truckNo,
      doNo: entry.doNo,
      liters: entry.liters,
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
  if (tlCfg?.enabled && tlCfg.perYard?.tangaYard?.enabled) {
    const days: number = tlCfg.perYard.tangaYard.timeLimitDays ?? 2;
    afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - days);
  }

  const results = [];

  for (const entryId of entryIds as string[]) {
    const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
    if (!entry || entry.isCancelled || entry.linkedFuelRecordId) continue;

    const fr = await findLinkedFuelRecord(entry.doNo, entry.truckNo, afterDate);
    if (!fr) {
      results.push({ entryId, status: 'not_found', truckNo: entry.truckNo, doNo: entry.doNo, liters: entry.liters, fuelRecord: null, existingValue: 0 });
      continue;
    }

    const existingValue: number = fr.tangaYard ?? 0;
    results.push({
      entryId,
      status: existingValue > 0 ? 'conflict' : 'found',
      truckNo: entry.truckNo,
      doNo: entry.doNo,
      liters: entry.liters,
      existingValue,
      fuelRecord: fr.toObject(),
    });
  }

  res.status(200).json({ success: true, message: 'Preview completed', results });
};
