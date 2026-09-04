import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import {
  IReconciliationLine,
  ReconciliationSession,
} from '../models/ReconciliationSession';
import {
  reconciliationService,
} from '../services/reconciliationService';
import { emitDataChange } from '../services/websocket';

function parseStations(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function actorId(req: AuthRequest): string {
  return req.user?.username || req.user?.userId || 'unknown';
}

/** Broadcast so other clients invalidate React Query caches immediately. */
function emitReconciliationChange(
  req: AuthRequest,
  action: 'create' | 'update' | 'delete'
): void {
  emitDataChange('reconciliation_sessions', action, undefined, undefined, undefined, {
    id: req.user?.userId,
    username: req.user?.username || actorId(req),
  });
}

function sessionToJson(session: any) {
  const obj = session.toObject ? session.toObject() : session;
  return {
    ...obj,
    id: String(obj._id),
  };
}

async function reloadSessionLpoLines(session: InstanceType<typeof ReconciliationSession>): Promise<void> {
  const lpoEntries = await reconciliationService.loadLpoEntriesForSession({
    stations: session.stations,
    dateFrom: session.dateFrom,
    dateTo: session.dateTo,
    pendingMode: session.pendingMode,
    pendingDateFrom: session.pendingDateFrom,
    pendingDateTo: session.pendingDateTo,
    selectedPendingEntryIds: session.selectedPendingEntryIds,
    excludeSessionId: String(session._id),
  });

  if (session.statementLines?.length) {
    session.lines = reconciliationService.runAutoMatch(lpoEntries, session.statementLines, session);
    if (session.flaggedStatementStations?.length) {
      reconciliationService.applyFlaggedStatementStationExceptions(
        session.lines,
        new Set(session.flaggedStatementStations.map((s) => reconciliationService.normalizeStation(s)))
      );
    }
  } else {
    session.lines = lpoEntries.map((e) => ({
      lpoEntryId: e.lpoEntryId,
      lpoNo: e.lpoNo,
      lpoDate: e.lpoDate,
      lpoStation: e.lpoStation,
      lpoTruckNo: e.lpoTruckNo,
      lpoTruckNoRaw: e.lpoTruckNoRaw,
      lpoLiters: e.lpoLiters,
      lpoAmount: e.lpoAmount,
      lpoDoNo: e.lpoDoNo,
      source: e.source,
      originSessionId: e.originSessionId,
      matchStatus: 'unmatched_lpo' as const,
      exceptionCode: 'AWAITING_STATEMENT',
      exceptionMessage: 'Awaiting supplier statement upload',
    }));
  }

  session.summary = reconciliationService.computeSummary(session.lines, session.statementLines || []);
}

export const listSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  const {
    status,
    page = '1',
    limit = '20',
    search,
    stations: stationsRaw,
    station,
    dateFrom: filterDateFrom,
    dateTo: filterDateTo,
  } = req.query;
  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
  const filter: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  if (status) filter.status = String(status);

  const searchQ = typeof search === 'string' ? search.trim() : '';
  if (searchQ) {
    const regex = new RegExp(escapeRegex(searchQ), 'i');
    andConditions.push({
      $or: [{ sessionNo: regex }, { title: regex }, { stations: regex }],
    });
  }

  const stationList = parseStations(stationsRaw || station);
  if (stationList.length) {
    andConditions.push({
      stations: {
        $in: stationList.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i')),
      },
    });
  }

  const df = typeof filterDateFrom === 'string' ? filterDateFrom.substring(0, 10) : '';
  const dt = typeof filterDateTo === 'string' ? filterDateTo.substring(0, 10) : '';
  if (df) andConditions.push({ dateTo: { $gte: df } });
  if (dt) andConditions.push({ dateFrom: { $lte: dt } });

  if (andConditions.length) filter.$and = andConditions;

  const [items, total] = await Promise.all([
    ReconciliationSession.find(filter)
      .sort({ updatedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
    ReconciliationSession.countDocuments(filter),
  ]);

  res.json({
    data: items.map((s) => ({ ...s, id: String(s._id) })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
};

export const getSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const includeLines = req.query.includeLines === 'true';
  const session = includeLines
    ? await ReconciliationSession.findById(req.params.id)
    : await ReconciliationSession.findById(req.params.id).select('-lines -statementLines');
  if (!session) throw new ApiError(404, 'Reconciliation session not found');

  const payload = sessionToJson(session);
  if (!includeLines) {
    const lineDoc = await ReconciliationSession.findById(req.params.id)
      .select('lines statementLines')
      .lean();
    if (lineDoc) {
      payload.summary = reconciliationService.computeSummary(
        lineDoc.lines || [],
        lineDoc.statementLines || []
      );
    }
  }
  res.json(payload);
};

export const createSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const stations = parseStations(req.body.stations);
  const dateFrom = String(req.body.dateFrom || '').substring(0, 10);
  const dateTo = String(req.body.dateTo || '').substring(0, 10);

  if (!stations.length) throw new ApiError(400, 'At least one station is required');
  if (!dateFrom || !dateTo) throw new ApiError(400, 'dateFrom and dateTo are required');

  const sessionNo = await reconciliationService.generateSessionNo();
  const session = await ReconciliationSession.create({
    sessionNo,
    title: req.body.title ? String(req.body.title).trim() : `${stations.join(', ')} ${dateFrom} – ${dateTo}`,
    status: 'draft',
    stations,
    dateFrom,
    dateTo,
    pendingMode: req.body.pendingMode || 'none',
    pendingDateFrom: req.body.pendingDateFrom ? String(req.body.pendingDateFrom).substring(0, 10) : undefined,
    pendingDateTo: req.body.pendingDateTo ? String(req.body.pendingDateTo).substring(0, 10) : undefined,
    selectedPendingEntryIds: Array.isArray(req.body.selectedPendingEntryIds)
      ? req.body.selectedPendingEntryIds.map(String)
      : [],
    staleMatchThresholdDays: Number(req.body.staleMatchThresholdDays) || 45,
    statementLines: [],
    lines: [],
    summary: reconciliationService.computeSummary([], []),
    createdBy: actorId(req),
  });

  emitReconciliationChange(req, 'create');
  res.status(201).json(sessionToJson(session));
};

export const updateSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed' || session.status === 'dropped') {
    if (!req.body.reopen) {
      throw new ApiError(400, 'Cannot update a completed or dropped reconciliation — reopen first');
    }
    session.status = 'in_progress';
    session.completedAt = undefined;
    session.completedBy = undefined;
  }

  if (req.body.title != null) session.title = String(req.body.title).trim();
  if (req.body.stations != null) {
    const stations = parseStations(req.body.stations);
    if (!stations.length) throw new ApiError(400, 'At least one station is required');
    session.stations = stations;
  }
  if (req.body.dateFrom != null) session.dateFrom = String(req.body.dateFrom).substring(0, 10);
  if (req.body.dateTo != null) session.dateTo = String(req.body.dateTo).substring(0, 10);
  if (req.body.pendingMode != null) session.pendingMode = req.body.pendingMode;
  if (req.body.pendingDateFrom != null) {
    session.pendingDateFrom = String(req.body.pendingDateFrom).substring(0, 10);
  }
  if (req.body.pendingDateTo != null) {
    session.pendingDateTo = String(req.body.pendingDateTo).substring(0, 10);
  }
  if (req.body.selectedPendingEntryIds != null) {
    session.selectedPendingEntryIds = Array.isArray(req.body.selectedPendingEntryIds)
      ? req.body.selectedPendingEntryIds.map(String)
      : [];
  }
  if (req.body.staleMatchThresholdDays != null) {
    session.staleMatchThresholdDays = Math.max(1, Number(req.body.staleMatchThresholdDays) || 45);
  }

  session.updatedBy = actorId(req);
  if (session.status === 'draft') session.status = 'in_progress';
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const loadLpoLines = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed' || session.status === 'dropped') {
    throw new ApiError(400, 'Cannot reload LPO lines on a closed session');
  }

  const lpoEntries = await reconciliationService.loadLpoEntriesForSession({
    stations: session.stations,
    dateFrom: session.dateFrom,
    dateTo: session.dateTo,
    pendingMode: session.pendingMode,
    pendingDateFrom: session.pendingDateFrom,
    pendingDateTo: session.pendingDateTo,
    selectedPendingEntryIds: session.selectedPendingEntryIds,
    excludeSessionId: String(session._id),
  });

  const carryIds = lpoEntries.filter((e) => e.source === 'pending_carry');
  for (const entry of carryIds) {
    if (entry.originSessionId) {
      await reconciliationService.markPendingCarriedForward(
        entry.originSessionId,
        [entry.lpoEntryId],
        String(session._id)
      );
    }
  }

  const existingStatementLines = session.statementLines || [];
  if (existingStatementLines.length > 0) {
    session.lines = reconciliationService.runAutoMatch(lpoEntries, existingStatementLines, session);
  } else {
    session.lines = lpoEntries.map((e) => ({
      lpoEntryId: e.lpoEntryId,
      lpoNo: e.lpoNo,
      lpoDate: e.lpoDate,
      lpoStation: e.lpoStation,
      lpoTruckNo: e.lpoTruckNo,
      lpoTruckNoRaw: e.lpoTruckNoRaw,
      lpoLiters: e.lpoLiters,
      lpoAmount: e.lpoAmount,
      lpoDoNo: e.lpoDoNo,
      source: e.source,
      originSessionId: e.originSessionId,
      matchStatus: 'unmatched_lpo' as const,
      exceptionCode: 'AWAITING_STATEMENT',
      exceptionMessage: 'Awaiting supplier statement upload',
    }));
  }

  session.summary = reconciliationService.computeSummary(
    session.lines,
    existingStatementLines
  );
  session.status = 'in_progress';
  session.updatedBy = actorId(req);
  await session.save();

  emitReconciliationChange(req, 'update');
  res.json({
    ...sessionToJson(session),
    loadedLpoCount: lpoEntries.length,
  });
};

export const getStationsInRange = async (req: AuthRequest, res: Response): Promise<void> => {
  const dateFrom = req.query.dateFrom ? String(req.query.dateFrom).substring(0, 10) : '';
  const dateTo = req.query.dateTo ? String(req.query.dateTo).substring(0, 10) : '';
  if (!dateFrom || !dateTo) throw new ApiError(400, 'dateFrom and dateTo are required');

  const stations = await reconciliationService.getStationsInDateRange(dateFrom, dateTo);
  res.json({ data: stations, dateFrom, dateTo });
};

export const getPendingEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const stations = parseStations(req.query.stations);
  if (!stations.length) throw new ApiError(400, 'stations query param is required');

  const view = String(req.query.view || 'active');
  const pendingDateFrom = req.query.pendingDateFrom ? String(req.query.pendingDateFrom) : undefined;
  const pendingDateTo = req.query.pendingDateTo ? String(req.query.pendingDateTo) : undefined;

  if (view === 'dropped') {
    const dropped = await reconciliationService.getDroppedPendingEntries({
      stations,
      pendingDateFrom,
      pendingDateTo,
    });
    const sortBy = (req.query.sortBy as any) || 'lpoDate';
    const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    let data = reconciliationService.sortPendingEntries(dropped, sortBy, sortDir);
    if (search) {
      data = data.filter(
        (p) =>
          p.lpoNo.toLowerCase().includes(search) ||
          p.lpoTruckNo.toLowerCase().includes(search) ||
          (p.lpoTruckNoRaw || '').toLowerCase().includes(search) ||
          p.lpoStation.toLowerCase().includes(search) ||
          (p.originSessionNo || '').toLowerCase().includes(search)
      );
    }
    res.json({ data });
    return;
  }

  const pending = await reconciliationService.getOpenPendingEntries({
    stations,
    pendingMode: (req.query.pendingMode as any) || 'all',
    pendingDateFrom,
    pendingDateTo,
    selectedPendingEntryIds: req.query.selectedPendingEntryIds
      ? String(req.query.selectedPendingEntryIds).split(',')
      : undefined,
    excludeSessionId: req.query.excludeSessionId ? String(req.query.excludeSessionId) : undefined,
  });

  const sortBy = (req.query.sortBy as any) || 'lpoDate';
  const sortDir = req.query.sortDir === 'desc' ? 'desc' : 'asc';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  let data = reconciliationService.sortPendingEntries(pending, sortBy, sortDir);
  if (search) {
    data = data.filter(
      (p) =>
        p.lpoNo.toLowerCase().includes(search) ||
        p.lpoTruckNo.toLowerCase().includes(search) ||
        (p.lpoTruckNoRaw || '').toLowerCase().includes(search) ||
        p.lpoStation.toLowerCase().includes(search) ||
        (p.originSessionNo || '').toLowerCase().includes(search)
    );
  }

  res.json({ data });
};

export const getSessionLines = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id).select('lines').lean();
  if (!session) throw new ApiError(404, 'Reconciliation session not found');

  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  const sideRaw = typeof req.query.side === 'string' ? req.query.side : 'lpo';
  const side =
    sideRaw === 'statement' || sideRaw === 'all' || sideRaw === 'lpo' ? sideRaw : 'lpo';

  const result = reconciliationService.querySessionLines(session.lines || [], {
    filter: (req.query.filter as any) || 'all',
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    truck: typeof req.query.truck === 'string' ? req.query.truck : undefined,
    station: typeof req.query.station === 'string' ? req.query.station : undefined,
    exceptionCode: typeof req.query.exceptionCode === 'string' ? req.query.exceptionCode : undefined,
    side,
    sortBy: (req.query.sortBy as any) || 'lpoTruck',
    sortDir: req.query.sortDir === 'desc' ? 'desc' : 'asc',
    page,
    limit,
  });

  res.json({
    data: result.data.map((line) => ({
      ...line,
      _id: String((line as any)._id),
    })),
    pagination: result.pagination,
  });
};

export const getSessionLineFilterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id).select('lines').lean();
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  const sideRaw = typeof req.query.side === 'string' ? req.query.side : 'lpo';
  const side =
    sideRaw === 'statement' || sideRaw === 'all' || sideRaw === 'lpo' ? sideRaw : 'lpo';

  res.json(reconciliationService.extractLineFilterOptions(session.lines || [], side));
};

export const getStatementRowFilterOptions = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id)
    .select('lines statementLines')
    .lean();
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  res.json(
    reconciliationService.extractStatementFilterOptions(
      session.lines || [],
      session.statementLines || []
    )
  );
};

export const getStatementRows = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id)
    .select('lines statementLines')
    .lean();
  if (!session) throw new ApiError(404, 'Reconciliation session not found');

  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

  const truckParam = req.query.truck ?? req.query.trucks;
  const stationParam = req.query.station ?? req.query.stations;
  const detailParam = req.query.detail ?? req.query.details ?? req.query.exceptionCode;

  const result = reconciliationService.queryStatementRows(
    session.lines || [],
    session.statementLines || [],
    {
      filter: (req.query.filter as any) || 'all',
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      truck: Array.isArray(truckParam)
        ? truckParam.map(String)
        : typeof truckParam === 'string'
          ? truckParam
          : undefined,
      station: Array.isArray(stationParam)
        ? stationParam.map(String)
        : typeof stationParam === 'string'
          ? stationParam
          : undefined,
      detail: Array.isArray(detailParam)
        ? detailParam.map(String)
        : typeof detailParam === 'string'
          ? detailParam
          : undefined,
      sortBy: (req.query.sortBy as any) || 'stmtRow',
      sortDir: req.query.sortDir === 'desc' ? 'desc' : 'asc',
      page,
      limit,
    }
  );

  res.json(result);
};

export const getMatchCandidates = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id)
    .select('lines statementLines')
    .lean();
  if (!session) throw new ApiError(404, 'Reconciliation session not found');

  const side = req.query.side === 'statement' ? 'statement' : 'lpo';
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));
  const result = reconciliationService.queryMatchCandidates(
    session.lines || [],
    session.statementLines || [],
    {
      side,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      limit,
    }
  );

  res.json({
    lpoLines: result.lpoLines.map((line) => ({
      ...line,
      _id: String((line as any)._id),
    })),
    statementRows: result.statementRows,
  });
};

export const getVarianceDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id)
    .select('summary lines statementLines')
    .lean();
  if (!session) throw new ApiError(404, 'Reconciliation session not found');

  const summary = reconciliationService.computeSummary(
    session.lines || [],
    session.statementLines || []
  );
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '100'), 10) || 100));

  const result = reconciliationService.queryLiterVarianceDetails(summary, {
    category: (req.query.category as any) || 'all',
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    sortBy: (req.query.sortBy as any) || 'truck',
    sortDir: req.query.sortDir === 'desc' ? 'desc' : 'asc',
    page,
    limit,
  });

  res.json(result);
};

export const manualMatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'dropped') throw new ApiError(400, 'Cannot match on a dropped session');
  if (session.status === 'completed') throw new ApiError(400, 'Reopen reconciliation before manual match');

  const lpoLineIds = Array.isArray(req.body.lpoLineIds)
    ? req.body.lpoLineIds.map((id: unknown) => String(id))
    : [];
  const statementLineIndexes = Array.isArray(req.body.statementLineIndexes)
    ? req.body.statementLineIndexes.map((i: unknown) => Number(i))
    : [];
  const accept = req.body.accept === true;

  try {
    reconciliationService.applyManualMatch(session, {
      lpoLineIds,
      statementLineIndexes,
      accept,
    });
  } catch (err: any) {
    throw new ApiError(400, err.message || 'Manual match failed');
  }

  session.summary = reconciliationService.computeSummary(
    session.lines,
    session.statementLines || []
  );
  session.updatedBy = actorId(req);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const downloadTemplate = async (_req: AuthRequest, res: Response): Promise<void> => {
  const workbook = await reconciliationService.buildStatementTemplateWorkbook();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Supplier_Statement_Template.xlsx"'
  );
  await workbook.xlsx.write(res);
};

export const uploadStatement = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed' || session.status === 'dropped') {
    throw new ApiError(400, 'Cannot upload statement to a closed session');
  }
  if (!req.file?.buffer) throw new ApiError(400, 'Excel file is required');

  const incomingMappings = reconciliationService.parseStationMappings(req.body.stationMappings);
  const flaggedList = parseStations(req.body.flaggedStatementStations);
  const flaggedSet = new Set(flaggedList.map((s) => reconciliationService.normalizeStation(s)));
  const existingMappings =
    session.statementStationMappings instanceof Map
      ? Object.fromEntries(session.statementStationMappings.entries())
      : { ...(session.statementStationMappings || {}) };
  const mergedMappings = { ...existingMappings, ...incomingMappings };

  let statementLines = await reconciliationService.parseStatementWorkbookAsync(req.file.buffer);
  statementLines = reconciliationService.applyStatementStationMappings(statementLines, mergedMappings);

  const knownStations = await reconciliationService.loadKnownStationNames();
  const stationValidation = reconciliationService.validateStatementStations(
    statementLines,
    session.stations,
    knownStations
  );
  const forceImport = String(req.body.forceImport || '') === 'true';
  if (!stationValidation.allValid && !forceImport) {
    const unknownRows = stationValidation.stationsInFile.filter((s) => !s.inSelectedScope && !s.isYard);
    const unresolved = unknownRows.filter((row) => {
      const mapped = mergedMappings[row.statementStation];
      const flagged = flaggedSet.has(reconciliationService.normalizeStation(row.statementStation));
      return !mapped && !flagged;
    });
    if (unresolved.length) {
      throw new ApiError(
        422,
        'Statement contains station names that do not match your selected stations. Map or flag them before import.'
      ).withData({ stationValidation, selectedStations: session.stations });
    }
  }

  session.statementLines = statementLines;
  session.statementFileName = req.file.originalname || 'statement.xlsx';
  session.statementUploadedAt = new Date();
  if (Object.keys(mergedMappings).length > 0) {
    session.statementStationMappings = mergedMappings as any;
  }
  if (flaggedList.length > 0) {
    session.flaggedStatementStations = [
      ...new Set([...(session.flaggedStatementStations || []), ...flaggedList]),
    ];
  }

  const lpoEntries = await reconciliationService.loadLpoEntriesForSession({
    stations: session.stations,
    dateFrom: session.dateFrom,
    dateTo: session.dateTo,
    pendingMode: session.pendingMode,
    pendingDateFrom: session.pendingDateFrom,
    pendingDateTo: session.pendingDateTo,
    selectedPendingEntryIds: session.selectedPendingEntryIds,
    excludeSessionId: String(session._id),
  });

  session.lines = reconciliationService.runAutoMatch(lpoEntries, statementLines, session);
  if (flaggedSet.size > 0) {
    reconciliationService.applyFlaggedStatementStationExceptions(session.lines, flaggedSet);
  }
  session.summary = reconciliationService.computeSummary(session.lines, statementLines);
  session.status = 'in_progress';
  session.updatedBy = actorId(req);
  await session.save();

  emitReconciliationChange(req, 'update');
  res.json({
    ...sessionToJson(session),
    stationValidation,
  });
};

export const validateStatementUpload = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed' || session.status === 'dropped') {
    throw new ApiError(400, 'Cannot validate statement for a closed session');
  }
  if (!req.file?.buffer) throw new ApiError(400, 'Excel file is required');

  const statementLines = await reconciliationService.parseStatementWorkbookAsync(req.file.buffer);
  const knownStations = await reconciliationService.loadKnownStationNames();
  const stationValidation = reconciliationService.validateStatementStations(
    statementLines,
    session.stations,
    knownStations
  );

  res.json({
    lineCount: statementLines.length,
    fileName: req.file.originalname || 'statement.xlsx',
    selectedStations: session.stations,
    stationValidation,
  });
};

export const runMatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (!session.statementLines?.length) {
    throw new ApiError(400, 'Upload a supplier statement before running match');
  }

  const lpoEntries = await reconciliationService.loadLpoEntriesForSession({
    stations: session.stations,
    dateFrom: session.dateFrom,
    dateTo: session.dateTo,
    pendingMode: session.pendingMode,
    pendingDateFrom: session.pendingDateFrom,
    pendingDateTo: session.pendingDateTo,
    selectedPendingEntryIds: session.selectedPendingEntryIds,
    excludeSessionId: String(session._id),
  });

  session.lines = reconciliationService.runAutoMatch(
    lpoEntries,
    session.statementLines,
    session,
    { preservedLines: session.lines || [] }
  );
  session.summary = reconciliationService.computeSummary(
    session.lines,
    session.statementLines
  );
  session.updatedBy = actorId(req);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const updateLine = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'dropped') {
    throw new ApiError(400, 'Cannot update lines on a dropped session');
  }
  if (session.status === 'completed' && !req.body.reopen && req.body.userDecision !== 'drop') {
    throw new ApiError(400, 'Reopen reconciliation before editing');
  }
  if (session.status === 'completed' && req.body.reopen) {
    session.status = 'in_progress';
    session.completedAt = undefined;
    session.completedBy = undefined;
  }

  const line = session.lines.find(
    (l) => String((l as any)._id) === String(req.params.lineId)
  );
  if (!line) throw new ApiError(404, 'Reconciliation line not found');

  const userId = actorId(req);

  if (req.body.userDecision != null) {
    line.userDecision = req.body.userDecision;
    line.resolvedAt = new Date();
    line.resolvedBy = userId;

    if (req.body.userDecision === 'accept') {
      if (line.matchStatus === 'stale_pending' || line.matchStatus === 'split_merge_candidate') {
        line.matchStatus = 'manual_matched';
        line.exceptionCode = undefined;
        line.exceptionMessage = 'Accepted by user';
      }
    }
    if (req.body.userDecision === 'drop') {
      line.matchStatus = 'dropped';
      line.exceptionMessage = line.exceptionMessage || 'Dropped by user';
    }
    if (req.body.userDecision === 'rectify') {
      line.matchStatus = 'rectified';
    }
  }

  const lpoEntryIdBefore = line.lpoEntryId;
  const lineIdBefore = String((line as any)._id);
  let truckChanged = false;
  let stationChanged = false;
  let correctionIndexes: number[] = [];

  if (req.body.statementTruckNo != null || req.body.statementStation != null) {
    if (req.body.statementStation != null) {
      const station = String(req.body.statementStation).trim();
      const allowed = new Set(session.stations.map((s) => s.toUpperCase()));
      if (station && !allowed.has(station.toUpperCase())) {
        throw new ApiError(400, 'Station must be one of the session selected stations');
      }
    }
    const result = reconciliationService.applyStatementCorrection(session, line, {
      statementTruckNo:
        req.body.statementTruckNo != null ? String(req.body.statementTruckNo) : undefined,
      statementStation:
        req.body.statementStation != null ? String(req.body.statementStation) : undefined,
    });
    truckChanged = result.truckChanged;
    stationChanged = result.stationChanged;
    correctionIndexes = result.targetIndexes;
  }
  if (req.body.lpoTruckNo != null) {
    line.lpoTruckNoRaw = reconciliationService.displayTruckNo(req.body.lpoTruckNo);
    line.lpoTruckNo = reconciliationService.normalizeTruckNo(req.body.lpoTruckNo);
  }
  if (req.body.statementLiters != null) {
    line.statementLiters = Number(req.body.statementLiters);
  }
  if (req.body.notes != null) {
    line.notes = String(req.body.notes).trim();
  }

  if (req.body.rematch === true) {
    if (!truckChanged && !stationChanged) {
      throw new ApiError(400, 'Change the statement truck or station before re-matching');
    }
    if (!session.statementLines?.length) {
      throw new ApiError(400, 'Upload a statement before re-matching');
    }
    // Revive dropped statement rows so rematch can claim them again
    if (line.matchStatus === 'dropped' || line.userDecision === 'drop') {
      (line as any).userDecision = undefined;
      line.resolvedAt = undefined;
      line.resolvedBy = undefined;
      line.matchStatus = line.lpoEntryId ? 'unmatched_lpo' : 'unmatched_statement';
      line.exceptionMessage = undefined;
      line.exceptionCode = undefined;
      line.notes = line.notes
        ? `${line.notes}; Revived for re-match`
        : 'Revived for re-match';
    }
  }

  let rematchOutcome:
    | {
        matched: boolean;
        matchStatus?: string;
        exceptionCode?: string;
        exceptionMessage?: string;
        lineId?: string;
      }
    | undefined;

  if (req.body.rematch === true && session.statementLines?.length) {
    const lpoEntries = await reconciliationService.loadLpoEntriesForSession({
      stations: session.stations,
      dateFrom: session.dateFrom,
      dateTo: session.dateTo,
      pendingMode: session.pendingMode,
      pendingDateFrom: session.pendingDateFrom,
      pendingDateTo: session.pendingDateTo,
      selectedPendingEntryIds: session.selectedPendingEntryIds,
      excludeSessionId: String(session._id),
    });
    // Exclude the line being revived/fixed from preserved dropped set by clearing it above
    session.lines = reconciliationService.runAutoMatch(
      lpoEntries,
      session.statementLines,
      session,
      { preservedLines: session.lines || [] }
    );
    rematchOutcome = reconciliationService.findLineMatchOutcome(session.lines, {
      lineId: lineIdBefore,
      lpoEntryId: lpoEntryIdBefore,
      statementLineIndex: correctionIndexes[0],
    });
  }

  session.summary = reconciliationService.computeSummary(session.lines, session.statementLines || []);
  session.updatedBy = userId;
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json({
    ...sessionToJson(session),
    rematchOutcome,
  });
};

export const reopenSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'dropped') throw new ApiError(400, 'Cannot reopen a dropped session');
  session.status = 'in_progress';
  session.completedAt = undefined;
  session.completedBy = undefined;
  session.updatedBy = actorId(req);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const addStations = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'dropped') throw new ApiError(400, 'Cannot modify dropped session');

  const add = parseStations(req.body.stations || req.body.addStations);
  if (!add.length) throw new ApiError(400, 'stations required');

  session.stations = [...new Set([...session.stations, ...add])];
  session.status = 'in_progress';
  session.updatedBy = actorId(req);

  await reloadSessionLpoLines(session);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const updateSessionStations = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed' || session.status === 'dropped') {
    throw new ApiError(400, 'Cannot change scope on a closed session');
  }

  const stations = parseStations(req.body.stations);
  if (!stations.length) throw new ApiError(400, 'At least one station is required');

  const dateFrom =
    req.body.dateFrom != null
      ? String(req.body.dateFrom).substring(0, 10)
      : session.dateFrom;
  const dateTo =
    req.body.dateTo != null ? String(req.body.dateTo).substring(0, 10) : session.dateTo;
  if (!dateFrom || !dateTo) throw new ApiError(400, 'dateFrom and dateTo are required');
  if (dateFrom > dateTo) throw new ApiError(400, 'dateFrom must be on or before dateTo');

  session.stations = stations;
  session.dateFrom = dateFrom;
  session.dateTo = dateTo;
  session.status = 'in_progress';
  session.updatedBy = actorId(req);

  await reloadSessionLpoLines(session);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const saveDraft = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed' || session.status === 'dropped') {
    throw new ApiError(400, 'Cannot save draft on closed session');
  }
  session.status = session.status === 'draft' ? 'draft' : 'in_progress';
  if (req.body.title != null) session.title = String(req.body.title).trim();
  session.updatedBy = actorId(req);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const completeSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed') throw new ApiError(400, 'Session already completed');
  if (session.status === 'dropped') throw new ApiError(400, 'Session was dropped');

  const unresolvedStale = (session.lines || []).filter(
    (l: IReconciliationLine) =>
      l.matchStatus === 'stale_pending' && l.userDecision !== 'accept' && l.userDecision !== 'drop'
  );
  if (unresolvedStale.length > 0) {
    throw new ApiError(
      400,
      `${unresolvedStale.length} stale pending match(es) require accept or drop before completing`
    );
  }

  session.status = 'completed';
  session.completedAt = new Date();
  session.completedBy = actorId(req);
  session.summary = reconciliationService.computeSummary(
    session.lines,
    session.statementLines || []
  );
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const dropSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed') throw new ApiError(400, 'Cannot drop a completed session');

  await reconciliationService.releaseCarriedForwardForSession(String(session._id));

  session.status = 'dropped';
  session.droppedAt = new Date();
  session.updatedBy = actorId(req);
  await session.save();
  emitReconciliationChange(req, 'update');
  res.json(sessionToJson(session));
};

export const exportSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');

  const workbook = await reconciliationService.exportSessionReportWorkbook(session);
  const filename = `${session.sessionNo}_Reconciliation_Report.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
};

export const deleteSession = async (req: AuthRequest, res: Response): Promise<void> => {
  const session = await ReconciliationSession.findById(req.params.id);
  if (!session) throw new ApiError(404, 'Reconciliation session not found');
  if (session.status === 'completed') {
    throw new ApiError(400, 'Completed reconciliations cannot be deleted');
  }
  await session.deleteOne();
  emitReconciliationChange(req, 'delete');
  res.json({ success: true });
};
