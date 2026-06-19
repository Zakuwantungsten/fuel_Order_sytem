import { Response } from 'express';
import { DarLPODocument } from '../models/DarLPODocument';
import { FuelRecord } from '../models';
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

async function findLinkedFuelRecord(doNo: string, truckNo: string): Promise<any | null> {
  const records = await FuelRecord.find({
    truckNo,
    $or: [{ goingDo: doNo }, { returnDo: doNo }],
    isDeleted: false,
    isCancelled: { $ne: true },
  }).sort({ date: -1 });

  if (records.length === 0) return null;
  return records[0];
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

export const getAllDarLPOs = async (req: AuthRequest, res: Response): Promise<void> => {
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

  // Link entries to FuelRecords sequentially (read-modify-write, never $inc)
  const warnings: string[] = [];

  for (const entry of lpo.entries) {
    if (entry.isCancelled) continue;

    const fr = await findLinkedFuelRecord(entry.doNo, entry.truckNo);
    if (!fr) {
      warnings.push(`No FuelRecord found for DO ${entry.doNo} / truck ${entry.truckNo}`);
      logger.warn(`[DarLPO] Unlinked entry: DO=${entry.doNo}, truck=${entry.truckNo}, lpo=${lpoNo}`);
      continue;
    }

    // Store the link on the entry (update in-place via Mongoose sub-doc)
    entry.linkedFuelRecordId = fr._id.toString();
    await applyDarYardDelta(fr, entry.liters);
  }

  // Persist linkedFuelRecordId values set above
  await lpo.save();

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
    warnings: warnings.length ? warnings : undefined,
  });

  emitDataChange('dar_lpo_documents', 'create');
  emitDataChange('fuel_records', 'update');
};

export const updateDarLPO = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const newData = req.body;

  const existing = await DarLPODocument.findOne({ _id: id, isDeleted: false });
  if (!existing) throw new ApiError(404, 'Dar LPO not found');

  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');
  await enforceEditLock(DarLPODocument, id, username, 'dar_lpo_documents');

  // Build maps keyed by entry _id string for diffing
  const oldMap = new Map(existing.entries.map((e: any) => [e._id.toString(), e]));
  const newEntries: any[] = newData.entries || existing.entries;

  for (const newEntry of newEntries) {
    if (newEntry.isCancelled) continue;

    const oldEntry = newEntry._id ? oldMap.get(newEntry._id.toString()) : undefined;
    if (!oldEntry) {
      // Brand-new entry added during update
      const fr = await findLinkedFuelRecord(newEntry.doNo, newEntry.truckNo);
      if (fr) {
        newEntry.linkedFuelRecordId = fr._id.toString();
        await applyDarYardDelta(fr, newEntry.liters);
      }
      continue;
    }

    if (oldEntry.isCancelled) continue;

    const delta = newEntry.liters - (oldEntry as any).liters;
    if (delta !== 0 && oldEntry.linkedFuelRecordId) {
      const fr = await FuelRecord.findById(oldEntry.linkedFuelRecordId);
      if (fr) {
        // Track amendment
        newEntry.originalLiters = (oldEntry as any).originalLiters ?? (oldEntry as any).liters;
        newEntry.amendedAt = new Date();
        await applyDarYardDelta(fr, delta);
      }
    }
  }

  // Handle entries removed in this update
  const newIds = new Set(newEntries.map((e: any) => e._id?.toString()).filter(Boolean));
  for (const [oldId, oldEntry] of oldMap) {
    if (!newIds.has(oldId) && !(oldEntry as any).isCancelled && (oldEntry as any).linkedFuelRecordId) {
      const fr = await FuelRecord.findById((oldEntry as any).linkedFuelRecordId);
      if (fr) await applyDarYardDelta(fr, -(oldEntry as any).liters);
    }
  }

  if (newData.date) {
    newData.year = new Date(newData.date).getFullYear();
  }
  newData.entries = newEntries;

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
  emitDataChange('fuel_records', 'update');
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
    if (fr) await applyDarYardDelta(fr, -entry.liters);
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
      if (fr) await applyDarYardDelta(fr, -entry.liters);
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

  const delta = newLiters - entry.liters; // negative — removes fuel
  entry.originalLiters = entry.originalLiters ?? entry.liters;
  entry.amendedAt = new Date();
  entry.liters = newLiters;
  entry.amount = newLiters * entry.rate;

  if (entry.linkedFuelRecordId) {
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
  const { lpoId, entryId, doNo } = req.body;
  if (!lpoId || !entryId || !doNo) throw new ApiError(400, 'lpoId, entryId and doNo are required');

  const lpo = await DarLPODocument.findOne({ _id: lpoId, isDeleted: false });
  if (!lpo) throw new ApiError(404, 'Dar LPO not found');

  const entry = (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
  if (!entry) throw new ApiError(404, 'Entry not found');
  if (entry.isCancelled) throw new ApiError(400, 'Cannot link a cancelled entry');
  if (entry.linkedFuelRecordId) throw new ApiError(400, 'Entry is already linked — cancel and re-create to re-link');

  const fr = await findLinkedFuelRecord(doNo as string, entry.truckNo);
  if (!fr) throw new ApiError(404, `No FuelRecord found for DO ${doNo} / truck ${entry.truckNo}`);

  entry.doNo = doNo;
  entry.linkedFuelRecordId = fr._id.toString();
  await applyDarYardDelta(fr, entry.liters);
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
