import { Response } from 'express';
import { Types } from 'mongoose';
import {
  VisaOverstayCase,
  VisaOverstayPayment,
  VisaOverstayConfig,
  VisaOverstayBuildItem,
  VisaOverstayBuildRun,
} from '../models';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { emitDataChange } from '../services/websocket';

const DEFAULT_AMOUNT = 50;
const DEFAULT_GRACE_DAYS = 5;
const DEFAULT_OVERSTAY_CYCLE_DAYS = 10;
const DEFAULT_RESERVE_DAYS = 2;
const EXTRA_DAY_RATE = 5;
const COLLECTION = 'visa_overstays';

async function getConfig() {
  let cfg = await VisaOverstayConfig.findOne({ key: 'default' });
  if (!cfg) {
    cfg = await VisaOverstayConfig.create({
      key: 'default',
      reserveDays: DEFAULT_RESERVE_DAYS,
      overstayCycleDays: DEFAULT_OVERSTAY_CYCLE_DAYS,
      graceDays: DEFAULT_GRACE_DAYS,
      overstayAmount: DEFAULT_AMOUNT,
      visaAmount: DEFAULT_AMOUNT,
      duplicateTruckLookbackDays: 30,
      nameFuzzyThreshold: 78,
      nameFuzzyMinLength: 4,
      allowMultiBuild: false,
    });
  }
  // Backfill new fraud-check fields on older config docs
  let dirty = false;
  if (cfg.duplicateTruckLookbackDays == null) {
    cfg.duplicateTruckLookbackDays = 30;
    dirty = true;
  }
  if (cfg.nameFuzzyThreshold == null) {
    cfg.nameFuzzyThreshold = 78;
    dirty = true;
  }
  if (cfg.nameFuzzyMinLength == null) {
    cfg.nameFuzzyMinLength = 4;
    dirty = true;
  }
  if (cfg.allowMultiBuild == null) {
    cfg.allowMultiBuild = false;
    dirty = true;
  }
  if (dirty) await cfg.save();
  return cfg;
}

function normalizePersonName(name: string): string {
  return String(name || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Similarity 0–100 based on normalized Levenshtein + token overlap. */
function nameSimilarity(aRaw: string, bRaw: string): number {
  const a = normalizePersonName(aRaw);
  const b = normalizePersonName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const maxLen = Math.max(a.length, b.length);
  const levScore = Math.round((1 - levenshtein(a, b) / maxLen) * 100);

  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap += 1;
  const union = new Set([...aTokens, ...bTokens]).size || 1;
  const tokenScore = Math.round((overlap / union) * 100);

  // Compact form without spaces (JEANKABILA vs JEAN KABILA)
  const aCompact = a.replace(/\s/g, '');
  const bCompact = b.replace(/\s/g, '');
  const compactMax = Math.max(aCompact.length, bCompact.length) || 1;
  const compactScore = Math.round((1 - levenshtein(aCompact, bCompact) / compactMax) * 100);

  return Math.max(levScore, tokenScore, compactScore);
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function parseDateInput(value: unknown, fieldName: string): Date {
  if (!value) throw new ApiError(400, `${fieldName} is required`);
  const raw = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, `Invalid ${fieldName}`);
  return startOfDay(d);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Calendar-day bounds in Africa/Nairobi (matches frontend timezone default). */
function nairobiDayRange(date: Date): { start: Date; end: Date } {
  const ymd = isoDate(date);
  const start = new Date(`${ymd}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function inferPayoutRule(position?: string): 'two_days_before' | 'due_date' {
  const p = (position || '').toUpperCase();
  if (p.includes('WHISKY') || p.includes('WHIKSY') || p.includes('WHISKEY')) {
    return 'due_date';
  }
  return 'two_days_before';
}

/**
 * Already-at-border intake: billable days = max(0, days remaining to due − cycleDays),
 * amount = billable × $5. Does not create day-sheet payment rows.
 */
function computeBorderIntakeSettlement(
  passportDueDate: Date,
  asOf: Date,
  cycleDays: number
): {
  daysRemaining: number;
  cycleDays: number;
  extraDays: number;
  extraAmount: number;
} {
  const daysRemaining = daysBetween(startOfDay(asOf), startOfDay(passportDueDate));
  const extraDays = Math.max(0, daysRemaining - cycleDays);
  return {
    daysRemaining,
    cycleDays,
    extraDays,
    extraAmount: extraDays * EXTRA_DAY_RATE,
  };
}

function targetPayDate(
  passportDueDate: Date,
  rule: 'two_days_before' | 'due_date',
  reserveDays = DEFAULT_RESERVE_DAYS
): Date {
  return rule === 'due_date'
    ? startOfDay(passportDueDate)
    : addDays(startOfDay(passportDueDate), -Math.max(0, reserveDays));
}

function actorName(req: AuthRequest): string {
  const u = req.user;
  if (!u) return 'unknown';
  return u.username || u.userId || 'unknown';
}

function overstayLabel(sequence?: number | null): string {
  if (sequence == null || sequence <= 0) return 'First';
  return `Overstay ${sequence}`;
}

async function nextOverstaySequence(caseId: Types.ObjectId | string): Promise<number> {
  const count = await VisaOverstayPayment.countDocuments({
    caseId,
    type: 'overstay',
    isDeleted: false,
    status: { $ne: 'cancelled' },
  });
  return count; // 0 = first, 1 = Overstay 1, …
}

function buildUnifiedRows(payments: any[]) {
  const active = payments.filter((p) => !p.isDeleted && p.status !== 'cancelled');
  const byKey = new Map<string, any>();

  for (const p of active) {
    if (p.type !== 'overstay') continue;
    const key = `${String(p.caseId)}|${isoDate(new Date(p.paymentDate))}`;
    byKey.set(key, {
      caseId: String(p.caseId),
      truckNo: p.truckNo,
      driverName: p.driverName,
      position: p.position,
      paymentDate: isoDate(new Date(p.paymentDate)),
      overstaySequence: p.overstaySequence ?? 0,
      overstayLabel: overstayLabel(p.overstaySequence ?? 0),
      overstayPaymentId: String(p._id),
      overstayAmount: p.amount,
      overstayStatus: p.status,
      visaPaymentId: null as string | null,
      visaAmount: null as number | null,
      visaStatus: null as string | null,
      passportPaymentId: null as string | null,
      passportAmount: null as number | null,
      rowTotal: p.amount,
    });
  }

  for (const p of active) {
    if (p.type !== 'visa' && p.type !== 'passport_renewal') continue;
    const key = `${String(p.caseId)}|${isoDate(new Date(p.paymentDate))}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        caseId: String(p.caseId),
        truckNo: p.truckNo,
        driverName: p.driverName,
        position: p.position,
        paymentDate: isoDate(new Date(p.paymentDate)),
        overstaySequence: null,
        overstayLabel: '—',
        overstayPaymentId: null,
        overstayAmount: null,
        overstayStatus: null,
        visaPaymentId: null,
        visaAmount: null,
        visaStatus: null,
        passportPaymentId: null,
        passportAmount: null,
        rowTotal: 0,
      };
      byKey.set(key, row);
    }
    if (p.type === 'visa') {
      row.visaPaymentId = String(p._id);
      row.visaAmount = p.amount;
      row.visaStatus = p.status;
      row.rowTotal += p.amount;
    } else {
      row.passportPaymentId = String(p._id);
      row.passportAmount = p.amount;
      row.rowTotal += p.amount;
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.truckNo.localeCompare(b.truckNo));
}

/** Attach passport due / crossed / Harrison (confirmed $ disbursed) from cases. */
async function enrichRowsWithCases(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const caseIds = Array.from(new Set(rows.map((r) => r.caseId).filter(Boolean)));
  const cases = await VisaOverstayCase.find({ _id: { $in: caseIds } })
    .select('_id passportDueDate status crossedAt extraAmount extraDays daysSinceLastOverstay position')
    .lean();
  const byId = new Map(cases.map((c: any) => [String(c._id), c]));

  return rows.map((row) => {
    const c = byId.get(String(row.caseId));
    let harrison = 0;
    if (row.overstayStatus === 'confirmed' && row.overstayAmount != null) harrison += row.overstayAmount;
    if (row.visaStatus === 'confirmed' && row.visaAmount != null) harrison += row.visaAmount;
    return {
      ...row,
      passportDueDate: c?.passportDueDate ? isoDate(new Date(c.passportDueDate)) : null,
      caseStatus: c?.status || null,
      isCrossed: c?.status === 'crossed',
      crossedAt: c?.crossedAt || null,
      extraAmount: c?.extraAmount ?? 0,
      extraDays: c?.extraDays ?? 0,
      daysSinceLastOverstay: c?.daysSinceLastOverstay ?? 0,
      /** Money disbursed (confirmed) for this truck on this day — Harrison column */
      harrisonAmount: harrison,
    };
  });
}

/**
 * GET /visa-overstays/days — list day sheets (date ≈ LPO number)
 */
export const listDays = async (req: AuthRequest, res: Response): Promise<void> => {
  const { from, to, limit = '60' } = req.query as Record<string, string>;
  const match: Record<string, unknown> = {
    isDeleted: false,
    status: { $ne: 'cancelled' },
  };

  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = parseDateInput(from, 'from');
    if (to) range.$lt = addDays(parseDateInput(to, 'to'), 1);
    match.paymentDate = range;
  }

  const limitNum = Math.min(365, Math.max(1, parseInt(limit, 10) || 60));

  const days = await VisaOverstayPayment.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$paymentDate', timezone: 'Africa/Nairobi' },
        },
        truckNos: { $addToSet: '$truckNo' },
        paymentCount: { $sum: 1 },
        overstayTotal: {
          $sum: { $cond: [{ $eq: ['$type', 'overstay'] }, '$amount', 0] },
        },
        visaTotal: {
          $sum: { $cond: [{ $eq: ['$type', 'visa'] }, '$amount', 0] },
        },
        total: { $sum: '$amount' },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        confirmedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: -1 } },
    { $limit: limitNum },
    {
      $project: {
        _id: 0,
        date: '$_id',
        truckCount: { $size: '$truckNos' },
        paymentCount: 1,
        overstayTotal: 1,
        visaTotal: 1,
        total: 1,
        pendingCount: 1,
        confirmedCount: 1,
      },
    },
  ]);

  res.status(200).json({ success: true, data: days });
};

/**
 * GET /visa-overstays/entries — flattened truck rows across day sheets (like LPO list entries)
 */
export const listEntries = async (req: AuthRequest, res: Response): Promise<void> => {
  const { search, from, to, status, limit = '500' } = req.query as Record<string, string>;

  const match: Record<string, unknown> = {
    isDeleted: false,
    status: { $ne: 'cancelled' },
  };

  if (status === 'pending' || status === 'confirmed') {
    match.status = status;
  }

  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = nairobiDayRange(parseDateInput(from, 'from')).start;
    if (to) range.$lt = nairobiDayRange(parseDateInput(to, 'to')).end;
    match.paymentDate = range;
  }

  if (search?.trim()) {
    const q = search.trim();
    match.$or = [
      { truckNo: { $regex: q, $options: 'i' } },
      { driverName: { $regex: q, $options: 'i' } },
      { position: { $regex: q, $options: 'i' } },
    ];
  }

  const limitNum = Math.min(2000, Math.max(1, parseInt(limit, 10) || 500));

  const payments = await VisaOverstayPayment.find(match)
    .sort({ paymentDate: -1, truckNo: 1, type: 1 })
    .limit(limitNum * 3); // over-fetch so unify doesn't truncate mid-row

  // Group payments by Nairobi calendar date, then unify per day
  const byDate = new Map<string, any[]>();
  for (const p of payments) {
    const key = new Date(p.paymentDate).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(p);
  }

  let entries: any[] = [];
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  for (const date of dates) {
    const rows = buildUnifiedRows(byDate.get(date)!);
    for (const row of rows) {
      entries.push({
        ...row,
        paymentDate: date,
        date,
        rowStatus: row.overstayStatus || row.visaStatus || 'pending',
      });
    }
  }

  if (status === 'pending' || status === 'confirmed') {
    entries = entries.filter((e) => e.rowStatus === status);
  }

  entries = entries.slice(0, limitNum);
  entries = await enrichRowsWithCases(entries);

  const totals = entries.reduce(
    (acc, e) => {
      acc.trucks += 1;
      acc.overstay += e.overstayAmount || 0;
      acc.visa += e.visaAmount || 0;
      acc.all += e.rowTotal || 0;
      acc.harrison += e.harrisonAmount || 0;
      return acc;
    },
    { trucks: 0, overstay: 0, visa: 0, all: 0, harrison: 0 }
  );

  res.status(200).json({
    success: true,
    data: {
      entries,
      totals,
    },
  });
};

/**
 * GET /visa-overstays/sheet?date=
 * Day sheet: day entries + crossed (from this day's trucks only)
 */
export const getDaySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  const date = parseDateInput(req.query.date || new Date().toISOString().slice(0, 10), 'date');
  const { start, end } = nairobiDayRange(date);

  const payments = await VisaOverstayPayment.find({
    isDeleted: false,
    paymentDate: { $gte: start, $lt: end },
  }).sort({ truckNo: 1, type: 1 });

  let rows = buildUnifiedRows(payments);
  rows = await enrichRowsWithCases(rows);

  const sumActive = payments
    .filter((p) => p.status !== 'cancelled')
    .reduce(
      (acc, p) => {
        if (p.type === 'overstay') acc.overstay += p.amount;
        if (p.type === 'visa') acc.visa += p.amount;
        acc.all += p.amount;
        if (p.status === 'confirmed') acc.harrison += p.amount;
        return acc;
      },
      { overstay: 0, visa: 0, all: 0, harrison: 0 }
    );

  // Crossed = trucks that appear on this day's sheet and have crossed
  const dayCaseIds = rows.map((r) => r.caseId).filter(Boolean);
  const crossedCases = dayCaseIds.length
    ? await VisaOverstayCase.find({
        _id: { $in: dayCaseIds },
        isDeleted: false,
        status: 'crossed',
      }).sort({ crossedAt: -1 })
    : [];

  const crossed = crossedCases.map((c) => {
    const dayRow = rows.find((r) => String(r.caseId) === String(c._id));
    return {
      _id: c._id,
      caseId: String(c._id),
      truckNo: c.truckNo,
      driverName: c.driverName,
      position: c.position || dayRow?.position,
      passportDueDate: c.passportDueDate,
      crossedAt: c.crossedAt,
      daysSinceLastOverstay: c.daysSinceLastOverstay ?? 0,
      extraDays: c.extraDays ?? 0,
      extraAmount: c.extraAmount ?? 0,
      /** Confirmed money disbursed on this day sheet */
      harrisonAmount: dayRow?.harrisonAmount ?? 0,
      dayTotal: dayRow?.rowTotal ?? 0,
      overstayLabel: dayRow?.overstayLabel || '—',
      crossedBy: c.crossedBy,
    };
  });

  const activeCases = await VisaOverstayCase.find({
    isDeleted: false,
    status: 'active',
  }).sort({ truckNo: 1 });

  res.status(200).json({
    success: true,
    data: {
      date: isoDate(date),
      rows,
      payments,
      totals: sumActive,
      truckCount: rows.length,
      crossed,
      activeCases,
    },
  });
};

/**
 * GET /visa-overstays/cases
 */
export const listCases = async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, search, page = '1', limit = '50' } = req.query as Record<string, string>;

  const query: Record<string, unknown> = { isDeleted: false };
  if (status && status !== 'all') {
    if (status === 'waiting') {
      query.status = 'waiting_due';
    } else if (status === 'raw' || status === 'intake') {
      query.status = 'intake';
    } else {
      query.status = status;
    }
  }
  if (search?.trim()) {
    const q = search.trim();
    query.$or = [
      { truckNo: { $regex: q, $options: 'i' } },
      { driverName: { $regex: q, $options: 'i' } },
      { position: { $regex: q, $options: 'i' } },
    ];
  }

  // Hide trucks currently held in any pending Build review
  if (query.status === 'intake' || query.status === 'waiting_due') {
    const held = await VisaOverstayBuildItem.find({
      status: 'pending',
      isDeleted: false,
    })
      .select('caseId')
      .lean();
    const heldIds = held.map((h) => h.caseId);
    if (heldIds.length) {
      query._id = { $nin: heldIds };
    }
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    VisaOverstayCase.find(query).sort({ passportDueDate: 1, createdAt: -1 }).skip(skip).limit(limitNum),
    VisaOverstayCase.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: items,
    meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) || 1 },
  });
};

/**
 * POST /visa-overstays/cases — WhatsApp intake
 */
export const createCase = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { truckNo, driverName, passportDueDate, position, dateSubmitted, payoutRule, notes, status } =
    req.body;

  if (!truckNo?.trim() || !driverName?.trim() || !passportDueDate) {
    throw new ApiError(400, 'truckNo, driverName, and passportDueDate are required');
  }

  const due = parseDateInput(passportDueDate, 'passportDueDate');
  const submitted = dateSubmitted ? parseDateInput(dateSubmitted, 'dateSubmitted') : startOfDay(new Date());
  const rule =
    payoutRule === 'due_date' || payoutRule === 'two_days_before'
      ? payoutRule
      : inferPayoutRule(position);

  const existing = await VisaOverstayCase.findOne({
    truckNo: truckNo.trim().toUpperCase(),
    status: { $in: ['intake', 'waiting_due', 'active'] },
    isDeleted: false,
  });
  if (existing) {
    throw new ApiError(400, `Active intake/case already exists for ${truckNo}`);
  }

  const created = await VisaOverstayCase.create({
    truckNo: truckNo.trim().toUpperCase(),
    driverName: driverName.trim(),
    passportDueDate: due,
    position: position?.trim() || undefined,
    dateSubmitted: submitted,
    status: status === 'waiting_due' ? 'waiting_due' : 'intake',
    payoutRule: rule,
    notes: notes?.trim() || undefined,
    createdBy: actorName(req),
  });

  emitDataChange(COLLECTION, 'create', created.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(201).json({ success: true, message: 'Intake recorded', data: created });
};

/**
 * POST /visa-overstays/cases/bulk
 * Multi-row WhatsApp intake → raw | waiting | build review (late add) | crossed (border)
 * Each item may set its own destination; body.destination is the default fallback.
 */
export const createCasesBulk = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const defaultDestination = String(req.body?.destination || 'raw');
  if (!['raw', 'waiting', 'build', 'crossed'].includes(defaultDestination)) {
    throw new ApiError(400, 'destination must be raw | waiting | build | crossed');
  }

  const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) throw new ApiError(400, 'items array is required');

  const needsBuild = items.some((row) => {
    const d = String(row?.destination || defaultDestination);
    return d === 'build';
  });
  const needsCrossed = items.some((row) => {
    const d = String(row?.destination || defaultDestination);
    return d === 'crossed';
  });

  const buildDate = needsBuild
    ? parseDateInput(req.body?.buildDate || new Date().toISOString().slice(0, 10), 'buildDate')
    : null;

  const cfg = needsBuild || needsCrossed ? await getConfig() : null;
  const createdCases = [];
  const createdBuild = [];
  const errors: string[] = [];
  const counts = { raw: 0, waiting: 0, build: 0, crossed: 0 };

  for (let i = 0; i < items.length; i++) {
    const row = items[i] || {};
    const destination = String(row.destination || defaultDestination);
    if (!['raw', 'waiting', 'build', 'crossed'].includes(destination)) {
      errors.push(`Row ${i + 1}: destination must be raw | waiting | build | crossed`);
      continue;
    }

    const truckNo = String(row.truckNo || '')
      .trim()
      .toUpperCase();
    const driverName = String(row.driverName || '').trim();
    const passportDueDate = row.passportDueDate;
    const position = row.position ? String(row.position).trim() : undefined;
    const dateSubmitted = row.dateSubmitted;

    if (!truckNo || !passportDueDate) {
      errors.push(`Row ${i + 1}: truck and passport due are required`);
      continue;
    }

    try {
      const due = parseDateInput(passportDueDate, 'passportDueDate');
      const submitted = dateSubmitted
        ? parseDateInput(dateSubmitted, 'dateSubmitted')
        : startOfDay(new Date());
      const rule = inferPayoutRule(position);

      const existing = await VisaOverstayCase.findOne({
        truckNo,
        status: { $in: ['intake', 'waiting_due', 'active'] },
        isDeleted: false,
      });
      if (existing) {
        errors.push(`Row ${i + 1} (${truckNo}): active case already exists`);
        continue;
      }

      if (destination === 'crossed') {
        const crossedAt = startOfDay(new Date());
        const cycleDays = cfg?.overstayCycleDays ?? DEFAULT_OVERSTAY_CYCLE_DAYS;
        const settlement = computeBorderIntakeSettlement(due, crossedAt, cycleDays);

        const caseDoc = await VisaOverstayCase.create({
          truckNo,
          driverName: driverName || '',
          passportDueDate: due,
          position,
          dateSubmitted: submitted,
          status: 'crossed',
          payoutRule: rule,
          crossedAt,
          crossedBy: actorName(req),
          crossSource: 'intake',
          daysSinceLastOverstay: settlement.daysRemaining,
          extraDays: settlement.extraDays,
          extraAmount: settlement.extraAmount,
          notes:
            `Border intake: ${settlement.daysRemaining}d to due − ${settlement.cycleDays}d = ${settlement.extraDays}d × $${EXTRA_DAY_RATE}`,
          createdBy: actorName(req),
        });
        createdCases.push(caseDoc);
        counts.crossed += 1;
        continue;
      }

      const caseDoc = await VisaOverstayCase.create({
        truckNo,
        driverName: driverName || '',
        passportDueDate: due,
        position,
        dateSubmitted: submitted,
        status: destination === 'waiting' ? 'waiting_due' : 'intake',
        payoutRule: rule,
        createdBy: actorName(req),
      });
      createdCases.push(caseDoc);
      counts[destination as 'raw' | 'waiting' | 'build'] += 1;

      if (destination === 'build' && buildDate && cfg) {
        const pendingExists = await VisaOverstayBuildItem.findOne({
          caseId: caseDoc._id,
          buildDate: {
            $gte: nairobiDayRange(buildDate).start,
            $lt: nairobiDayRange(buildDate).end,
          },
          status: 'pending',
          isDeleted: false,
        });
        if (pendingExists) {
          errors.push(`Row ${i + 1} (${truckNo}): already in build review`);
          continue;
        }

        const buildItem = await VisaOverstayBuildItem.create({
          buildDate,
          caseId: caseDoc._id,
          truckNo: caseDoc.truckNo,
          driverName: caseDoc.driverName,
          passportDueDate: caseDoc.passportDueDate,
          position: caseDoc.position,
          source: 'late_add',
          heldFromStatus: 'intake',
          includeOverstay: true,
          includeVisa: true,
          overstayAmount: cfg.overstayAmount,
          visaAmount: cfg.visaAmount,
          status: 'pending',
          createdBy: actorName(req),
        });
        createdBuild.push(buildItem);
      }
    } catch (e: any) {
      errors.push(`Row ${i + 1}${truckNo ? ` (${truckNo})` : ''}: ${e?.message || 'failed'}`);
    }
  }

  emitDataChange(
    COLLECTION,
    'create',
    { count: createdCases.length, kind: 'bulk_intake' },
    undefined,
    undefined,
    { id: user.userId, username: actorName(req) }
  );

  res.status(201).json({
    success: true,
    message: `Saved ${createdCases.length} truck(s)`,
    data: {
      counts,
      buildDate: buildDate ? isoDate(buildDate) : null,
      cases: createdCases,
      buildItems: createdBuild,
      errors,
    },
  });
};

/**
 * PUT /visa-overstays/cases/:id
 * Updates case fields and cascades denormalized data to pending build preview
 * items and related payment rows so sheets stay consistent.
 */
export const updateCase = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const item = await VisaOverstayCase.findOne({ _id: req.params.id, isDeleted: false });
  if (!item) throw new ApiError(404, 'Case not found');
  if (item.status === 'crossed' || item.status === 'cancelled') {
    throw new ApiError(400, `Cannot update a ${item.status} case`);
  }

  const { truckNo, driverName, passportDueDate, position, payoutRule, notes, status } = req.body;

  const before = {
    truckNo: item.truckNo,
    driverName: item.driverName,
    passportDueDate: item.passportDueDate ? isoDate(new Date(item.passportDueDate)) : null,
    position: item.position || '',
  };

  if (truckNo != null) {
    const nextTruck = String(truckNo).trim().toUpperCase();
    if (!nextTruck) throw new ApiError(400, 'truckNo cannot be empty');
    if (nextTruck !== item.truckNo) {
      const clash = await VisaOverstayCase.findOne({
        truckNo: nextTruck,
        status: { $in: ['intake', 'waiting_due', 'active'] },
        isDeleted: false,
        _id: { $ne: item._id },
      });
      if (clash) {
        throw new ApiError(400, `Active case already exists for ${nextTruck}`);
      }
      item.truckNo = nextTruck;
    }
  }

  if (driverName != null) item.driverName = String(driverName).trim();
  if (passportDueDate != null) item.passportDueDate = parseDateInput(passportDueDate, 'passportDueDate');
  if (position != null) {
    item.position = String(position).trim() || undefined;
    if (payoutRule !== 'due_date' && payoutRule !== 'two_days_before') {
      item.payoutRule = inferPayoutRule(item.position);
    }
  }
  if (payoutRule === 'due_date' || payoutRule === 'two_days_before') item.payoutRule = payoutRule;
  if (notes != null) item.notes = String(notes).trim() || undefined;
  if (['intake', 'waiting_due', 'active', 'cancelled'].includes(status)) {
    item.status = status;
  }
  item.updatedBy = actorName(req);
  await item.save();

  const after = {
    truckNo: item.truckNo,
    driverName: item.driverName,
    passportDueDate: item.passportDueDate ? isoDate(new Date(item.passportDueDate)) : null,
    position: item.position || '',
  };

  const buildCascade: Record<string, unknown> = {};
  if (after.truckNo !== before.truckNo) buildCascade.truckNo = after.truckNo;
  if (after.driverName !== before.driverName) buildCascade.driverName = after.driverName;
  if (after.passportDueDate !== before.passportDueDate && item.passportDueDate) {
    buildCascade.passportDueDate = item.passportDueDate;
  }
  if (after.position !== before.position) buildCascade.position = item.position;

  let buildUpdated = 0;
  let paymentsUpdated = 0;

  if (Object.keys(buildCascade).length) {
    buildCascade.updatedBy = actorName(req);
    const buildResult = await VisaOverstayBuildItem.updateMany(
      { caseId: item._id, status: 'pending', isDeleted: false },
      { $set: buildCascade }
    );
    buildUpdated = buildResult.modifiedCount || 0;

    const payCascade: Record<string, unknown> = {};
    if (buildCascade.truckNo) payCascade.truckNo = after.truckNo;
    if (buildCascade.driverName) payCascade.driverName = after.driverName;
    if (Object.prototype.hasOwnProperty.call(buildCascade, 'position')) {
      payCascade.position = item.position;
    }
    if (Object.keys(payCascade).length) {
      payCascade.updatedBy = actorName(req);
      const payResult = await VisaOverstayPayment.updateMany(
        { caseId: item._id, status: { $in: ['pending', 'confirmed'] }, isDeleted: false },
        { $set: payCascade }
      );
      paymentsUpdated = payResult.modifiedCount || 0;
    }
  }

  emitDataChange(COLLECTION, 'update', item.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({
    success: true,
    message: 'Case updated',
    data: {
      case: item,
      cascaded: { buildItems: buildUpdated, payments: paymentsUpdated },
    },
  });
};

/**
 * GET /visa-overstays/history?truckNo=&passportDueDate=&caseId=
 * Truck overstay history for inspect modal (cases + payments + build items).
 * Each case keeps its own passportDueDate — never reused across trucks/cases.
 */
export const getTruckHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  const truckNo = String(req.query.truckNo || '')
    .trim()
    .toUpperCase();
  if (!truckNo) throw new ApiError(400, 'truckNo is required');

  const dueFilter = req.query.passportDueDate
    ? parseDateInput(req.query.passportDueDate, 'passportDueDate')
    : null;
  const caseIdFilter =
    req.query.caseId && Types.ObjectId.isValid(String(req.query.caseId))
      ? String(req.query.caseId)
      : null;

  const cases = await VisaOverstayCase.find({ truckNo, isDeleted: false })
    .sort({ passportDueDate: -1, createdAt: -1 })
    .limit(40)
    .lean();

  const caseIds = cases.map((c) => c._id);
  const [payments, buildItems] = await Promise.all([
    caseIds.length
      ? VisaOverstayPayment.find({ caseId: { $in: caseIds }, isDeleted: false })
          .sort({ paymentDate: -1, createdAt: -1 })
          .lean()
      : Promise.resolve([]),
    caseIds.length
      ? VisaOverstayBuildItem.find({ caseId: { $in: caseIds }, isDeleted: false })
          .sort({ buildDate: -1, createdAt: -1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const paymentsByCase = new Map<string, any[]>();
  for (const p of payments as any[]) {
    const key = String(p.caseId);
    if (!paymentsByCase.has(key)) paymentsByCase.set(key, []);
    paymentsByCase.get(key)!.push({
      _id: p._id,
      type: p.type,
      status: p.status,
      amount: p.amount,
      overstaySequence: p.overstaySequence,
      paymentDate: p.paymentDate ? isoDate(new Date(p.paymentDate)) : null,
      position: p.position || null,
    });
  }

  const buildByCase = new Map<string, any[]>();
  for (const b of buildItems as any[]) {
    const key = String(b.caseId);
    if (!buildByCase.has(key)) buildByCase.set(key, []);
    buildByCase.get(key)!.push({
      _id: b._id,
      status: b.status,
      source: b.source,
      position: b.position,
      includeOverstay: b.includeOverstay,
      includeVisa: b.includeVisa,
      overstayAmount: b.overstayAmount,
      visaAmount: b.visaAmount,
      buildDate: b.buildDate ? isoDate(new Date(b.buildDate)) : null,
      passportDueDate: b.passportDueDate ? isoDate(new Date(b.passportDueDate)) : null,
    });
  }

  const dueYmd = dueFilter ? isoDate(dueFilter) : null;
  const timeline = (cases as any[]).map((c) => {
    const id = String(c._id);
    const due = c.passportDueDate ? isoDate(new Date(c.passportDueDate)) : null;
    return {
      _id: id,
      truckNo: c.truckNo,
      driverName: c.driverName,
      passportDueDate: due,
      dateSubmitted: c.dateSubmitted ? isoDate(new Date(c.dateSubmitted)) : null,
      position: c.position,
      status: c.status,
      payoutRule: c.payoutRule,
      firstPaidAt: c.firstPaidAt ? isoDate(new Date(c.firstPaidAt)) : null,
      lastOverstayPaidAt: c.lastOverstayPaidAt
        ? isoDate(new Date(c.lastOverstayPaidAt))
        : null,
      crossedAt: c.crossedAt ? isoDate(new Date(c.crossedAt)) : null,
      notes: c.notes,
      matchesDueDate: dueYmd ? due === dueYmd : false,
      matchesCaseId: caseIdFilter ? id === caseIdFilter : false,
      payments: paymentsByCase.get(id) || [],
      buildItems: buildByCase.get(id) || [],
    };
  });

  // Prefer exact case, then matching due-date, then newest due
  timeline.sort((a, b) => {
    if (a.matchesCaseId !== b.matchesCaseId) return Number(b.matchesCaseId) - Number(a.matchesCaseId);
    if (a.matchesDueDate !== b.matchesDueDate) return Number(b.matchesDueDate) - Number(a.matchesDueDate);
    return String(b.passportDueDate || '').localeCompare(String(a.passportDueDate || ''));
  });

  res.status(200).json({
    success: true,
    data: {
      truckNo,
      passportDueDate: dueYmd,
      caseId: caseIdFilter,
      caseCount: timeline.length,
      cases: timeline,
    },
  });
};

/**
 * POST /visa-overstays/cases/:id/wait — mark waiting due date
 */
export const markWaitingDue = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const item = await VisaOverstayCase.findOne({ _id: req.params.id, isDeleted: false });
  if (!item) throw new ApiError(404, 'Case not found');
  if (item.status === 'crossed' || item.status === 'cancelled') {
    throw new ApiError(400, `Cannot wait a ${item.status} case`);
  }

  item.status = 'waiting_due';
  item.updatedBy = actorName(req);
  if (req.body?.notes) item.notes = String(req.body.notes).trim();
  await item.save();

  emitDataChange(COLLECTION, 'update', item.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({ success: true, message: 'Marked waiting due date', data: item });
};

/**
 * POST /visa-overstays/cases/:id/to-raw — send back to WhatsApp raw input queue
 */
export const markRawInput = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const item = await VisaOverstayCase.findOne({ _id: req.params.id, isDeleted: false });
  if (!item) throw new ApiError(404, 'Case not found');
  if (item.status === 'crossed' || item.status === 'cancelled') {
    throw new ApiError(400, `Cannot move a ${item.status} case to raw input`);
  }

  item.status = 'intake';
  item.updatedBy = actorName(req);
  if (req.body?.notes) item.notes = String(req.body.notes).trim();
  await item.save();

  emitDataChange(COLLECTION, 'update', item.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({ success: true, message: 'Moved to raw input', data: item });
};

/**
 * POST /visa-overstays/cases/:id/add-to-day
 * Pull a raw/waiting case into a day sheet (create overstay ± visa lines).
 */
export const addCaseToDay = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const caseDoc = await VisaOverstayCase.findOne({ _id: req.params.id, isDeleted: false });
  if (!caseDoc) throw new ApiError(404, 'Case not found');
  if (caseDoc.status === 'crossed' || caseDoc.status === 'cancelled') {
    throw new ApiError(400, `Cannot add a ${caseDoc.status} case to a day sheet`);
  }

  const date = parseDateInput(req.body?.date || new Date().toISOString().slice(0, 10), 'date');
  const includeVisa = req.body?.includeVisa !== false;
  const amount = Number(req.body?.amount) || DEFAULT_AMOUNT;
  const isFirst = !caseDoc.firstPaidAt;
  const seq = isFirst ? 0 : await nextOverstaySequence(caseDoc._id);
  const types: Array<'overstay' | 'visa'> =
    isFirst && includeVisa ? ['overstay', 'visa'] : ['overstay'];

  const created = [];
  for (const type of types) {
    const exists = await VisaOverstayPayment.findOne({
      caseId: caseDoc._id,
      paymentDate: date,
      type,
      isDeleted: false,
      status: { $ne: 'cancelled' },
    });
    if (exists) continue;

    const payment = await VisaOverstayPayment.create({
      caseId: caseDoc._id,
      paymentDate: date,
      truckNo: caseDoc.truckNo,
      driverName: caseDoc.driverName,
      type,
      amount,
      position: req.body?.position || caseDoc.position,
      status: 'pending',
      overstaySequence: type === 'overstay' ? seq : undefined,
      createdBy: actorName(req),
    });
    created.push(payment);
  }

  if (!created.length) {
    throw new ApiError(400, `${caseDoc.truckNo} already has lines on ${isoDate(date)}`);
  }

  caseDoc.status = 'active';
  caseDoc.updatedBy = actorName(req);
  await caseDoc.save();

  emitDataChange(COLLECTION, 'create', { count: created.length }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(201).json({
    success: true,
    message: `Added ${caseDoc.truckNo} to ${isoDate(date)}`,
    data: { case: caseDoc, payments: created },
  });
};

/**
 * GET /visa-overstays/due?date=
 */
export const listDueForDate = async (req: AuthRequest, res: Response): Promise<void> => {
  const cfg = await getConfig();
  const date = parseDateInput(req.query.date || new Date().toISOString().slice(0, 10), 'date');
  const windowEnd = addDays(date, cfg.overstayCycleDays);

  const cases = await VisaOverstayCase.find({
    isDeleted: false,
    status: { $in: ['intake', 'waiting_due', 'active'] },
  }).sort({ passportDueDate: 1 });

  const due = cases
    .map((c) => {
      if (c.status === 'waiting_due') return null;
      const payTarget = targetPayDate(c.passportDueDate, c.payoutRule, cfg.reserveDays);
      const firstPaymentDue =
        payTarget.getTime() >= date.getTime() && payTarget.getTime() <= windowEnd.getTime();

      let cycleDue = false;
      if (c.lastOverstayPaidAt) {
        const nextCycle = addDays(c.lastOverstayPaidAt, cfg.overstayCycleDays);
        cycleDue = nextCycle.getTime() <= date.getTime();
      }

      const isFirst = !c.firstPaidAt;
      const reason = isFirst
        ? firstPaymentDue
          ? 'passport_due'
          : null
        : cycleDue
          ? 'overstay_cycle'
          : null;

      if (!reason) return null;

      return {
        case: c,
        reason,
        targetPayDate: payTarget,
        suggestedTypes: isFirst ? (['overstay', 'visa'] as const) : (['overstay'] as const),
        suggestedAmount: cfg.overstayAmount,
        nextOverstaySequence: isFirst ? 0 : undefined,
      };
    })
    .filter(Boolean);

  res.status(200).json({ success: true, data: due });
};

/**
 * GET /visa-overstays/payments?date= (legacy + unified rows)
 */
export const listPaymentsByDate = async (req: AuthRequest, res: Response): Promise<void> => {
  const date = parseDateInput(req.query.date || new Date().toISOString().slice(0, 10), 'date');
  const { start, end } = nairobiDayRange(date);

  const payments = await VisaOverstayPayment.find({
    isDeleted: false,
    paymentDate: { $gte: start, $lt: end },
  }).sort({ truckNo: 1, type: 1 });

  const rows = buildUnifiedRows(payments);
  const sum = (type?: string) =>
    payments
      .filter((p) => p.status !== 'cancelled' && (!type || p.type === type))
      .reduce((acc, p) => acc + (p.amount || 0), 0);

  res.status(200).json({
    success: true,
    data: {
      date: isoDate(date),
      payments,
      rows,
      totals: {
        overstay: sum('overstay'),
        visa: sum('visa'),
        passport: sum('passport_renewal'),
        all: sum(),
      },
    },
  });
};

/**
 * POST /visa-overstays/payments
 */
export const createPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const items = Array.isArray(req.body?.items) ? req.body.items : [req.body];
  if (!items.length) throw new ApiError(400, 'No payment items provided');

  const created = [];
  for (const raw of items) {
    const {
      caseId,
      paymentDate,
      type = 'overstay',
      amount = DEFAULT_AMOUNT,
      position,
      truckNo,
      driverName,
      overstaySequence,
    } = raw;

    if (!caseId) throw new ApiError(400, 'caseId is required');
    if (!['overstay', 'visa', 'passport_renewal'].includes(type)) {
      throw new ApiError(400, 'Invalid payment type');
    }

    const caseDoc = await VisaOverstayCase.findOne({ _id: caseId, isDeleted: false });
    if (!caseDoc) throw new ApiError(404, `Case ${caseId} not found`);
    if (caseDoc.status === 'crossed' || caseDoc.status === 'cancelled') {
      throw new ApiError(400, `Case ${caseDoc.truckNo} is ${caseDoc.status}`);
    }

    const payDate = parseDateInput(paymentDate || new Date().toISOString().slice(0, 10), 'paymentDate');

    const existing = await VisaOverstayPayment.findOne({
      caseId,
      paymentDate: payDate,
      type,
      isDeleted: false,
      status: { $ne: 'cancelled' },
    });
    if (existing) {
      throw new ApiError(400, `${type} already exists for ${caseDoc.truckNo} on that date`);
    }

    let seq: number | undefined;
    if (type === 'overstay') {
      seq = typeof overstaySequence === 'number' ? overstaySequence : await nextOverstaySequence(caseId);
    }

    const payment = await VisaOverstayPayment.create({
      caseId,
      paymentDate: payDate,
      truckNo: (truckNo || caseDoc.truckNo).trim().toUpperCase(),
      driverName: (driverName || caseDoc.driverName).trim(),
      type,
      amount: Number(amount) || DEFAULT_AMOUNT,
      position: (position || caseDoc.position || '').trim() || undefined,
      status: 'pending',
      overstaySequence: seq,
      createdBy: actorName(req),
    });

    if (caseDoc.status === 'intake' || caseDoc.status === 'waiting_due') {
      caseDoc.status = 'active';
      caseDoc.updatedBy = actorName(req);
      await caseDoc.save();
    }

    created.push(payment);
  }

  emitDataChange(COLLECTION, 'create', { count: created.length }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(201).json({
    success: true,
    message: `Created ${created.length} payment line(s)`,
    data: created,
  });
};

/**
 * Restore pending build-preview trucks to Raw / Waiting / Active, then clear
 * pending items + build run for that date so Build day can run again.
 */
async function unwindPendingBuildForDate(
  date: Date,
  req: AuthRequest
): Promise<{ restored: number; cleared: number }> {
  const { start, end } = nairobiDayRange(date);
  const pending = await VisaOverstayBuildItem.find({
    buildDate: { $gte: start, $lt: end },
    status: 'pending',
    isDeleted: false,
  });

  let restored = 0;
  for (const item of pending) {
    const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
    if (caseDoc && caseDoc.status !== 'crossed' && caseDoc.status !== 'cancelled') {
      // Carry build-row amendments (truck / name / position) back onto the case
      if (item.truckNo) caseDoc.truckNo = item.truckNo;
      if (item.driverName) caseDoc.driverName = item.driverName;
      if (item.position != null) {
        caseDoc.position = item.position;
        caseDoc.payoutRule = inferPayoutRule(item.position);
      }

      const fromSource =
        item.source === 'cycle'
          ? 'active'
          : item.source === 'reserve_raw' || item.source === 'late_add'
            ? 'intake'
            : caseDoc.firstPaidAt
              ? 'active'
              : 'intake';
      const restore = (item as any).heldFromStatus || fromSource;
      if (['intake', 'waiting_due', 'active'].includes(restore)) {
        caseDoc.status = restore;
        caseDoc.updatedBy = actorName(req);
        await caseDoc.save();
        restored += 1;
      } else {
        caseDoc.updatedBy = actorName(req);
        await caseDoc.save();
      }
    }
    item.isDeleted = true;
    item.updatedBy = actorName(req);
    await item.save();
  }

  await VisaOverstayBuildRun.deleteOne({ buildDateKey: isoDate(date) });
  return { restored, cleared: pending.length };
}

/**
 * POST /visa-overstays/payments/build-day
 * Builds a REVIEW staging list (does not write day-sheet payments yet).
 * Sources:
 *  1) passport due date == build date
 *  2) not-crossed cycle due (lookback overstayCycleDays)
 *  3) raw / waiting within reserveDays window
 * body.rebuild=true requires config.allowMultiBuild — restores pending then rebuilds.
 */
export const buildDayPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const cfg = await getConfig();
  const date = parseDateInput(req.body?.date || new Date().toISOString().slice(0, 10), 'date');
  const { start, end } = nairobiDayRange(date);
  const buildDateKey = isoDate(date);
  const wantsRebuild = Boolean(req.body?.rebuild);

  const existingRun = await VisaOverstayBuildRun.findOne({ buildDateKey });
  if (existingRun && !wantsRebuild) {
    const pendingCount = await VisaOverstayBuildItem.countDocuments({
      buildDate: { $gte: start, $lt: end },
      status: 'pending',
      isDeleted: false,
    });
    res.status(200).json({
      success: true,
      message: `Already built for ${buildDateKey}`,
      data: {
        alreadyBuilt: true,
        allowMultiBuild: Boolean(cfg.allowMultiBuild),
        date: buildDateKey,
        run: existingRun,
        pendingCount,
        created: [],
        skipped: [],
      },
    });
    return;
  }

  let unwind: { restored: number; cleared: number } | null = null;
  if (existingRun && wantsRebuild) {
    if (!cfg.allowMultiBuild) {
      throw new ApiError(400, 'Multi-build / rebuild is disabled in Configuration');
    }
    unwind = await unwindPendingBuildForDate(date, req);
  }

  const reserveDays = cfg.reserveDays;
  const cycleDays = cfg.overstayCycleDays;
  const lookbackStart = addDays(date, -cycleDays);

  const cases = await VisaOverstayCase.find({
    isDeleted: false,
    status: { $in: ['intake', 'waiting_due', 'active'] },
  });

  type Candidate = {
    caseDoc: (typeof cases)[0];
    source: 'due_date' | 'cycle' | 'reserve_raw';
    includeOverstay: boolean;
    includeVisa: boolean;
  };

  const byCase = new Map<string, Candidate>();

  const upsert = (c: Candidate) => {
    const id = String(c.caseDoc._id);
    const prev = byCase.get(id);
    if (!prev) {
      byCase.set(id, c);
      return;
    }
    const rank = { due_date: 3, cycle: 2, reserve_raw: 1 } as const;
    if (rank[c.source] > rank[prev.source]) {
      // Higher-priority source owns the row (and its visa default)
      prev.source = c.source;
      prev.includeOverstay = c.includeOverstay;
      prev.includeVisa = c.includeVisa;
    } else if (rank[c.source] === rank[prev.source]) {
      prev.includeOverstay = prev.includeOverstay || c.includeOverstay;
      prev.includeVisa = prev.includeVisa || c.includeVisa;
    } else {
      // Lower priority only fills overstay if missing — never force visa on
      prev.includeOverstay = prev.includeOverstay || c.includeOverstay;
    }
  };

  for (const c of cases) {
    const dueYmd = isoDate(c.passportDueDate);
    const buildYmd = isoDate(date);
    const rule = c.payoutRule || inferPayoutRule(c.position);
    const payTarget = targetPayDate(c.passportDueDate, rule, reserveDays);
    const isFirst = !c.firstPaidAt;

    // 1) Exact passport due date matches build date — visa off by default
    if (dueYmd === buildYmd && c.status !== 'waiting_due') {
      upsert({
        caseDoc: c,
        source: 'due_date',
        includeOverstay: true,
        includeVisa: false,
      });
    }

    // 2) Cycle: not crossed, last overstay + cycleDays <= build date — visa off
    if (c.status === 'active' && c.lastOverstayPaidAt) {
      const nextCycle = addDays(startOfDay(c.lastOverstayPaidAt), cycleDays);
      if (
        nextCycle.getTime() <= date.getTime() &&
        startOfDay(c.lastOverstayPaidAt).getTime() >= lookbackStart.getTime()
      ) {
        upsert({
          caseDoc: c,
          source: 'cycle',
          includeOverstay: true,
          includeVisa: false,
        });
      } else if (nextCycle.getTime() <= date.getTime()) {
        upsert({
          caseDoc: c,
          source: 'cycle',
          includeOverstay: true,
          includeVisa: false,
        });
      }
    }

    // 3) Raw / Waiting within reserve window — visa on by default for raw intake
    if (c.status === 'intake' || c.status === 'waiting_due') {
      const due = startOfDay(c.passportDueDate);
      const reserveEnd = addDays(date, reserveDays);
      const dueInReserve = due.getTime() >= date.getTime() && due.getTime() <= reserveEnd.getTime();
      const payToday = isoDate(payTarget) === buildYmd;
      if (dueInReserve || payToday) {
        upsert({
          caseDoc: c,
          source: 'reserve_raw',
          includeOverstay: true,
          includeVisa: c.status === 'intake',
        });
      }
    }
  }

  const created = [];
  const skipped: string[] = [];

  for (const cand of byCase.values()) {
    const c = cand.caseDoc;
    const existingPending = await VisaOverstayBuildItem.findOne({
      buildDate: { $gte: start, $lt: end },
      caseId: c._id,
      status: 'pending',
      isDeleted: false,
    });
    if (existingPending) {
      skipped.push(c.truckNo);
      continue;
    }

    const alreadyOnSheet = await VisaOverstayPayment.findOne({
      caseId: c._id,
      paymentDate: { $gte: start, $lt: end },
      isDeleted: false,
      status: { $ne: 'cancelled' },
    });
    if (alreadyOnSheet) {
      skipped.push(`${c.truckNo}:already_on_sheet`);
      continue;
    }

    const heldFromStatus =
      c.status === 'waiting_due' || c.status === 'intake' || c.status === 'active'
        ? c.status
        : 'intake';

    const item = await VisaOverstayBuildItem.create({
      buildDate: date,
      caseId: c._id,
      truckNo: c.truckNo,
      driverName: c.driverName,
      passportDueDate: c.passportDueDate,
      position: c.position,
      source: cand.source,
      heldFromStatus,
      includeOverstay: cand.includeOverstay,
      includeVisa: cand.includeVisa,
      overstayAmount: cfg.overstayAmount,
      visaAmount: cfg.visaAmount,
      status: 'pending',
      createdBy: actorName(req),
    });
    created.push(item);
  }

  const run = await VisaOverstayBuildRun.create({
    buildDate: date,
    buildDateKey: isoDate(date),
    createdCount: created.length,
    skippedCount: skipped.length,
    builtBy: actorName(req),
    builtAt: new Date(),
  });

  emitDataChange(
    COLLECTION,
    'create',
    { count: created.length, kind: wantsRebuild ? 'build_rebuild' : 'build_preview' },
    undefined,
    undefined,
    { id: user.userId, username: actorName(req) }
  );

  res.status(201).json({
    success: true,
    message: wantsRebuild
      ? `Rebuilt ${created.length} review item(s) — restored ${unwind?.restored || 0} then rebuilt`
      : `Built ${created.length} review item(s) — fill positions before confirming to day`,
    data: {
      alreadyBuilt: false,
      rebuilt: wantsRebuild,
      allowMultiBuild: Boolean(cfg.allowMultiBuild),
      unwind,
      date: isoDate(date),
      created,
      skipped,
      run,
      config: {
        reserveDays: cfg.reserveDays,
        overstayCycleDays: cfg.overstayCycleDays,
        overstayAmount: cfg.overstayAmount,
        visaAmount: cfg.visaAmount,
      },
    },
  });
};

async function confirmOnePayment(paymentId: string, req: AuthRequest) {
  const payment = await VisaOverstayPayment.findOne({ _id: paymentId, isDeleted: false });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status === 'confirmed') return payment;
  if (payment.status === 'cancelled') throw new ApiError(400, 'Cannot confirm a cancelled payment');

  payment.status = 'confirmed';
  payment.confirmedAt = new Date();
  payment.confirmedBy = actorName(req);
  payment.updatedBy = actorName(req);
  await payment.save();

  const caseDoc = await VisaOverstayCase.findOne({ _id: payment.caseId, isDeleted: false });
  if (caseDoc) {
    if (!caseDoc.firstPaidAt) caseDoc.firstPaidAt = payment.paymentDate;
    if (payment.type === 'overstay') caseDoc.lastOverstayPaidAt = payment.paymentDate;
    if (payment.type === 'visa') caseDoc.lastVisaPaidAt = payment.paymentDate;
    if (caseDoc.status === 'intake' || caseDoc.status === 'waiting_due') caseDoc.status = 'active';
    caseDoc.updatedBy = actorName(req);
    await caseDoc.save();
  }

  return payment;
}

export const confirmPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');
  const payment = await confirmOnePayment(req.params.id, req);
  emitDataChange(COLLECTION, 'update', payment.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });
  res.status(200).json({ success: true, message: 'Payment confirmed', data: payment });
};

export const confirmPaymentsBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) throw new ApiError(400, 'ids required');
  const confirmed = [];
  for (const id of ids) confirmed.push(await confirmOnePayment(id, req));
  emitDataChange(COLLECTION, 'update', { count: confirmed.length }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });
  res.status(200).json({
    success: true,
    message: `Confirmed ${confirmed.length} payment(s)`,
    data: confirmed,
  });
};

/**
 * POST /visa-overstays/rows/confirm — confirm whole unified row (overstay + visa)
 */
export const confirmRow = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');
  const ids: string[] = [];
  if (req.body?.overstayPaymentId) ids.push(req.body.overstayPaymentId);
  if (req.body?.visaPaymentId) ids.push(req.body.visaPaymentId);
  if (req.body?.passportPaymentId) ids.push(req.body.passportPaymentId);
  if (!ids.length) throw new ApiError(400, 'No payment ids on row');
  const confirmed = [];
  for (const id of ids) confirmed.push(await confirmOnePayment(id, req));
  emitDataChange(COLLECTION, 'update', { count: confirmed.length }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });
  res.status(200).json({ success: true, message: 'Row confirmed', data: confirmed });
};

export const cancelPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const payment = await VisaOverstayPayment.findOne({ _id: req.params.id, isDeleted: false });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status === 'cancelled') {
    res.status(200).json({ success: true, message: 'Already cancelled', data: payment });
    return;
  }

  payment.status = 'cancelled';
  payment.cancelledAt = new Date();
  payment.cancelledBy = actorName(req);
  payment.cancelReason = req.body?.reason?.trim() || undefined;
  payment.updatedBy = actorName(req);
  await payment.save();

  emitDataChange(COLLECTION, 'update', payment.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({ success: true, message: 'Payment cancelled', data: payment });
};

/**
 * POST /visa-overstays/rows/remove — cancel overstay (+ visa) for truck on date
 */
export const removeRow = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { caseId, date, reason } = req.body;
  if (!caseId || !date) throw new ApiError(400, 'caseId and date required');
  const payDate = parseDateInput(date, 'date');
  const { start, end } = nairobiDayRange(payDate);

  const payments = await VisaOverstayPayment.find({
    caseId,
    paymentDate: { $gte: start, $lt: end },
    isDeleted: false,
    status: { $ne: 'cancelled' },
  });

  for (const payment of payments) {
    payment.status = 'cancelled';
    payment.cancelledAt = new Date();
    payment.cancelledBy = actorName(req);
    payment.cancelReason = reason?.trim() || 'Removed from day sheet';
    payment.updatedBy = actorName(req);
    await payment.save();
  }

  emitDataChange(COLLECTION, 'update', { count: payments.length }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({
    success: true,
    message: `Removed ${payments.length} line(s) from day`,
    data: payments,
  });
};

/**
 * PUT /visa-overstays/payments/:id — amend amount / position / name
 */
export const amendPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const payment = await VisaOverstayPayment.findOne({ _id: req.params.id, isDeleted: false });
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (payment.status === 'cancelled') throw new ApiError(400, 'Cannot amend cancelled payment');

  const { amount, position, driverName } = req.body;
  if (amount != null) payment.amount = Number(amount);
  if (position != null) payment.position = String(position).trim() || undefined;
  if (driverName != null) payment.driverName = String(driverName).trim();
  payment.updatedBy = actorName(req);
  await payment.save();

  emitDataChange(COLLECTION, 'update', payment.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({ success: true, message: 'Payment amended', data: payment });
};

/**
 * POST /visa-overstays/rows/assign-visa — add visa to a day row
 */
export const assignVisa = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { caseId, date, amount = DEFAULT_AMOUNT, position } = req.body;
  if (!caseId || !date) throw new ApiError(400, 'caseId and date required');

  const caseDoc = await VisaOverstayCase.findOne({ _id: caseId, isDeleted: false });
  if (!caseDoc) throw new ApiError(404, 'Case not found');

  const payDate = parseDateInput(date, 'date');
  const existing = await VisaOverstayPayment.findOne({
    caseId,
    paymentDate: payDate,
    type: 'visa',
    isDeleted: false,
    status: { $ne: 'cancelled' },
  });
  if (existing) throw new ApiError(400, 'Visa already assigned on this date');

  const payment = await VisaOverstayPayment.create({
    caseId,
    paymentDate: payDate,
    truckNo: caseDoc.truckNo,
    driverName: caseDoc.driverName,
    type: 'visa',
    amount: Number(amount) || DEFAULT_AMOUNT,
    position: position || caseDoc.position,
    status: 'pending',
    createdBy: actorName(req),
  });

  emitDataChange(COLLECTION, 'create', payment.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(201).json({ success: true, message: 'Visa assigned', data: payment });
};

/**
 * POST /visa-overstays/cases/:id/cross
 */
export const markCrossed = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const caseDoc = await VisaOverstayCase.findOne({ _id: req.params.id, isDeleted: false });
  if (!caseDoc) throw new ApiError(404, 'Case not found');
  if (caseDoc.status === 'crossed') {
    res.status(200).json({ success: true, message: 'Already marked crossed', data: { case: caseDoc } });
    return;
  }
  if (caseDoc.status === 'cancelled') {
    throw new ApiError(400, 'Cannot cross a cancelled case');
  }

  const crossedAt = req.body?.crossedAt
    ? parseDateInput(req.body.crossedAt, 'crossedAt')
    : startOfDay(new Date());

  let daysSinceLastOverstay = 0;
  let extraDays = 0;
  let extraAmount = 0;

  const cfg = await getConfig();
  const graceDays = cfg.graceDays;

  if (caseDoc.lastOverstayPaidAt) {
    daysSinceLastOverstay = daysBetween(caseDoc.lastOverstayPaidAt, crossedAt);
    if (daysSinceLastOverstay > graceDays) {
      extraDays = daysSinceLastOverstay - graceDays;
      extraAmount = extraDays * EXTRA_DAY_RATE;
    }
  }

  caseDoc.status = 'crossed';
  caseDoc.crossedAt = crossedAt;
  caseDoc.crossedBy = actorName(req);
  caseDoc.crossSource = 'settlement';
  caseDoc.daysSinceLastOverstay = daysSinceLastOverstay;
  caseDoc.extraDays = extraDays;
  caseDoc.extraAmount = extraAmount;
  caseDoc.updatedBy = actorName(req);
  if (req.body?.notes) caseDoc.notes = String(req.body.notes).trim();
  await caseDoc.save();

  emitDataChange(COLLECTION, 'update', caseDoc.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({
    success: true,
    message: 'Marked as crossed',
    data: {
      case: caseDoc,
      settlement: {
        truckNo: caseDoc.truckNo,
        driverName: caseDoc.driverName,
        lastOverstayPaidAt: caseDoc.lastOverstayPaidAt,
        crossedAt,
        daysSinceLastOverstay,
        graceDays,
        extraDays,
        extraAmount,
        ratePerExtraDay: EXTRA_DAY_RATE,
      },
    },
  });
};

/**
 * GET /visa-overstays/crossed
 * Query: from, to, lookbackDays (default 90). Pass lookbackDays=0 for all crossed.
 */
export const listCrossedOutput = async (req: AuthRequest, res: Response): Promise<void> => {
  const { from, to, lookbackDays = '90' } = req.query as Record<string, string>;
  const lookback = Math.max(0, parseInt(lookbackDays, 10) || 0);

  const query: Record<string, unknown> = {
    isDeleted: false,
    status: 'crossed',
  };

  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = parseDateInput(from, 'from');
    if (to) range.$lte = parseDateInput(to, 'to');
    query.crossedAt = range;
  } else if (lookback > 0) {
    const since = addDays(startOfDay(new Date()), -lookback);
    query.crossedAt = { $gte: since };
  }

  const items = await VisaOverstayCase.find(query).sort({ crossedAt: -1 });

  const output = items.map((c) => ({
    _id: c._id,
    truckNo: c.truckNo,
    driverName: c.driverName,
    position: c.position,
    passportDueDate: c.passportDueDate ? isoDate(new Date(c.passportDueDate)) : null,
    dateSubmitted: c.dateSubmitted ? isoDate(new Date(c.dateSubmitted)) : null,
    lastOverstayPaidAt: c.lastOverstayPaidAt
      ? isoDate(new Date(c.lastOverstayPaidAt))
      : null,
    crossedAt: c.crossedAt ? isoDate(new Date(c.crossedAt)) : null,
    crossSource: c.crossSource || (c.lastOverstayPaidAt ? 'settlement' : 'intake'),
    daysSinceLastOverstay: c.daysSinceLastOverstay ?? 0,
    extraDays: c.extraDays ?? 0,
    extraAmount: c.extraAmount ?? 0,
    crossedBy: c.crossedBy,
    notes: c.notes,
  }));

  const totalExtra = output.reduce((acc, r) => acc + (r.extraAmount || 0), 0);
  const intakeCount = output.filter((r) => r.crossSource === 'intake').length;

  res.status(200).json({
    success: true,
    data: {
      items: output,
      totals: {
        trucks: output.length,
        extraAmount: totalExtra,
        intakeBorder: intakeCount,
        settlement: output.length - intakeCount,
      },
    },
  });
};

/**
 * GET /visa-overstays/config
 */
export const getVisaOverstayConfig = async (_req: AuthRequest, res: Response): Promise<void> => {
  const cfg = await getConfig();
  res.status(200).json({ success: true, data: cfg });
};

/**
 * PUT /visa-overstays/config
 */
export const updateVisaOverstayConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const cfg = await getConfig();
  const {
    reserveDays,
    overstayCycleDays,
    graceDays,
    overstayAmount,
    visaAmount,
    duplicateTruckLookbackDays,
    nameFuzzyThreshold,
    nameFuzzyMinLength,
    allowMultiBuild,
  } = req.body;

  if (reserveDays != null) cfg.reserveDays = Math.max(0, Math.min(30, Number(reserveDays)));
  if (overstayCycleDays != null) {
    cfg.overstayCycleDays = Math.max(1, Math.min(60, Number(overstayCycleDays)));
  }
  if (graceDays != null) cfg.graceDays = Math.max(0, Math.min(30, Number(graceDays)));
  if (overstayAmount != null) cfg.overstayAmount = Math.max(0, Number(overstayAmount));
  if (visaAmount != null) cfg.visaAmount = Math.max(0, Number(visaAmount));
  if (duplicateTruckLookbackDays != null) {
    cfg.duplicateTruckLookbackDays = Math.max(1, Math.min(365, Number(duplicateTruckLookbackDays)));
  }
  if (nameFuzzyThreshold != null) {
    cfg.nameFuzzyThreshold = Math.max(50, Math.min(100, Number(nameFuzzyThreshold)));
  }
  if (nameFuzzyMinLength != null) {
    cfg.nameFuzzyMinLength = Math.max(2, Math.min(20, Number(nameFuzzyMinLength)));
  }
  if (allowMultiBuild != null) cfg.allowMultiBuild = Boolean(allowMultiBuild);
  cfg.updatedBy = actorName(req);
  await cfg.save();

  emitDataChange(COLLECTION, 'update', cfg.toObject(), undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({ success: true, message: 'Configuration saved', data: cfg });
};

/**
 * POST /visa-overstays/intake-checks
 * Fraud / duplicate checks for Add truck rows.
 * body: { items: [{ key?, truckNo?, driverName? }] }
 */
export const checkIntakeDuplicates = async (req: AuthRequest, res: Response): Promise<void> => {
  const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) {
    res.status(200).json({ success: true, data: { results: [], config: null } });
    return;
  }

  const cfg = await getConfig();
  const lookbackDays = cfg.duplicateTruckLookbackDays || 30;
  const threshold = cfg.nameFuzzyThreshold || 78;
  const minLen = cfg.nameFuzzyMinLength || 4;
  const since = addDays(startOfDay(new Date()), -lookbackDays);

  const truckNos = [
    ...new Set(
      items
        .map((r) => String(r.truckNo || '').trim().toUpperCase())
        .filter((t) => t.length >= 3)
    ),
  ];

  const truckCases = truckNos.length
    ? await VisaOverstayCase.find({
        truckNo: { $in: truckNos },
        isDeleted: false,
        $or: [
          { status: 'intake' },
          { dateSubmitted: { $gte: since } },
          { createdAt: { $gte: since } },
        ],
      })
        .select(
          'truckNo driverName passportDueDate position status dateSubmitted createdAt crossedAt'
        )
        .sort({ createdAt: -1 })
        .limit(200)
        .lean()
    : [];

  // Candidate name pool: active queues + lookback window (for fuzzy fraud)
  const nameCandidates = await VisaOverstayCase.find({
    isDeleted: false,
    $or: [
      { status: { $in: ['intake', 'waiting_due', 'active'] } },
      { dateSubmitted: { $gte: since } },
      { createdAt: { $gte: since } },
    ],
  })
    .select('truckNo driverName passportDueDate position status dateSubmitted createdAt')
    .sort({ createdAt: -1 })
    .limit(800)
    .lean();

  const mapCase = (c: any) => ({
    _id: String(c._id),
    truckNo: c.truckNo,
    driverName: c.driverName,
    passportDueDate: c.passportDueDate ? isoDate(new Date(c.passportDueDate)) : null,
    position: c.position || null,
    status: c.status,
    dateSubmitted: c.dateSubmitted ? isoDate(new Date(c.dateSubmitted)) : null,
    crossedAt: c.crossedAt ? isoDate(new Date(c.crossedAt)) : null,
  });

  const results = items.map((row, idx) => {
    const key = row.key != null ? String(row.key) : String(idx);
    const truckNo = String(row.truckNo || '')
      .trim()
      .toUpperCase();
    const driverName = String(row.driverName || '').trim();

    const truckHits = truckNo
      ? (truckCases as any[])
          .filter((c) => c.truckNo === truckNo)
          .map(mapCase)
      : [];

    const inRaw = truckHits.filter((c) => c.status === 'intake');
    const recentOther = truckHits.filter((c) => c.status !== 'intake');

    let nameMatches: Array<ReturnType<typeof mapCase> & { similarity: number }> = [];
    const normalized = normalizePersonName(driverName);
    if (normalized.length >= minLen) {
      nameMatches = (nameCandidates as any[])
        .map((c) => {
          // Same truck + same name is not passport fraud across trucks
          if (truckNo && c.truckNo === truckNo) return null;
          const similarity = nameSimilarity(driverName, c.driverName || '');
          if (similarity < threshold) return null;
          return { ...mapCase(c), similarity };
        })
        .filter(Boolean) as Array<ReturnType<typeof mapCase> & { similarity: number }>;

      // Keep best matches first, unique by case id
      const seen = new Set<string>();
      nameMatches = nameMatches
        .sort((a, b) => b.similarity - a.similarity)
        .filter((m) => {
          if (seen.has(m._id)) return false;
          seen.add(m._id);
          return true;
        })
        .slice(0, 8);
    }

    const flags: string[] = [];
    if (inRaw.length) flags.push('truck_in_raw');
    if (recentOther.length) flags.push('truck_recent');
    if (nameMatches.some((m) => m.similarity >= 99)) flags.push('name_exact');
    else if (nameMatches.length) flags.push('name_fuzzy');

    return {
      key,
      truckNo: truckNo || null,
      driverName: driverName || null,
      flags,
      truckInRaw: inRaw,
      truckRecent: recentOther,
      nameMatches,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      results,
      config: {
        duplicateTruckLookbackDays: lookbackDays,
        nameFuzzyThreshold: threshold,
        nameFuzzyMinLength: minLen,
      },
    },
  });
};

/**
 * GET /visa-overstays/build?date=
 */
export const listBuildItems = async (req: AuthRequest, res: Response): Promise<void> => {
  const date = parseDateInput(req.query.date || new Date().toISOString().slice(0, 10), 'date');
  const { start, end } = nairobiDayRange(date);
  const status = (req.query.status as string) || 'pending';

  const query: Record<string, unknown> = {
    isDeleted: false,
    buildDate: { $gte: start, $lt: end },
  };
  if (status !== 'all') query.status = status;

  const items = await VisaOverstayBuildItem.find(query).sort({ source: 1, truckNo: 1 }).lean();
  const caseIds = items.map((i) => i.caseId).filter(Boolean);
  const cases = caseIds.length
    ? await VisaOverstayCase.find({ _id: { $in: caseIds }, isDeleted: false })
        .select('_id truckNo driverName passportDueDate position lastOverstayPaidAt firstPaidAt status')
        .lean()
    : [];
  const caseById = new Map(cases.map((c: any) => [String(c._id), c]));

  const mapped = items.map((i: any) => {
    const c = caseById.get(String(i.caseId));
    // Prefer live case fields so amendments in Raw/Waiting stay visible here
    const due = c?.passportDueDate || i.passportDueDate;
    return {
      ...i,
      _id: String(i._id),
      caseId: String(i.caseId),
      truckNo: c?.truckNo || i.truckNo,
      driverName: c?.driverName || i.driverName,
      position: c?.position != null && c.position !== '' ? c.position : i.position,
      buildDate: i.buildDate ? isoDate(new Date(i.buildDate)) : null,
      passportDueDate: due ? isoDate(new Date(due)) : null,
      lastOverstayPaidAt: c?.lastOverstayPaidAt
        ? isoDate(new Date(c.lastOverstayPaidAt))
        : null,
      firstPaidAt: c?.firstPaidAt ? isoDate(new Date(c.firstPaidAt)) : null,
      caseStatus: c?.status || null,
    };
  });

  const run = await VisaOverstayBuildRun.findOne({ buildDateKey: isoDate(date) });
  const cfg = await getConfig();
  res.status(200).json({
    success: true,
    data: {
      date: isoDate(date),
      items: mapped,
      runExists: !!run,
      allowMultiBuild: Boolean(cfg.allowMultiBuild),
      counts: {
        pending: mapped.filter((i) => i.status === 'pending').length,
        total: mapped.length,
      },
    },
  });
};

/**
 * PUT /visa-overstays/build/:id
 * Amend truck / name / position on a pending build row — cascades to the case
 * so Wait / Raw / rebuild keep the changes.
 */
export const updateBuildItem = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const item = await VisaOverstayBuildItem.findOne({ _id: req.params.id, isDeleted: false });
  if (!item) throw new ApiError(404, 'Build item not found');
  if (item.status !== 'pending') throw new ApiError(400, 'Only pending build items can be edited');

  const { truckNo, driverName, position, includeOverstay, includeVisa, overstayAmount, visaAmount, notes } =
    req.body;

  const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
  if (!caseDoc) throw new ApiError(404, 'Linked case not found');
  if (caseDoc.status === 'crossed' || caseDoc.status === 'cancelled') {
    throw new ApiError(400, `Cannot amend a ${caseDoc.status} case`);
  }

  const caseSet: Record<string, unknown> = { updatedBy: actorName(req) };
  let caseDirty = false;

  if (truckNo != null) {
    const nextTruck = String(truckNo).trim().toUpperCase();
    if (!nextTruck) throw new ApiError(400, 'truckNo cannot be empty');
    if (nextTruck !== item.truckNo) {
      const clash = await VisaOverstayCase.findOne({
        truckNo: nextTruck,
        status: { $in: ['intake', 'waiting_due', 'active'] },
        isDeleted: false,
        _id: { $ne: caseDoc._id },
      });
      if (clash) throw new ApiError(400, `Active case already exists for ${nextTruck}`);
      item.truckNo = nextTruck;
      caseDoc.truckNo = nextTruck;
      caseSet.truckNo = nextTruck;
      caseDirty = true;
    }
  }

  if (driverName != null) {
    const nextName = String(driverName).trim();
    if (!nextName) throw new ApiError(400, 'driverName cannot be empty');
    item.driverName = nextName;
    caseDoc.driverName = nextName;
    caseSet.driverName = nextName;
    caseDirty = true;
  }

  if (position != null) {
    item.position = String(position).trim() || undefined;
    caseDoc.position = item.position;
    caseSet.position = item.position;
    caseDoc.payoutRule = inferPayoutRule(item.position);
    caseSet.payoutRule = caseDoc.payoutRule;
    caseDirty = true;
  }

  if (includeOverstay != null) item.includeOverstay = Boolean(includeOverstay);
  if (includeVisa != null) item.includeVisa = Boolean(includeVisa);
  if (overstayAmount != null) item.overstayAmount = Math.max(0, Number(overstayAmount));
  if (visaAmount != null) item.visaAmount = Math.max(0, Number(visaAmount));
  if (notes != null) item.notes = String(notes).trim() || undefined;
  item.updatedBy = actorName(req);
  await item.save();

  if (caseDirty) {
    await caseDoc.save();
    const payCascade: Record<string, unknown> = {};
    if (caseSet.truckNo) payCascade.truckNo = caseSet.truckNo;
    if (caseSet.driverName) payCascade.driverName = caseSet.driverName;
    if (Object.prototype.hasOwnProperty.call(caseSet, 'position')) {
      payCascade.position = caseSet.position;
    }
    if (Object.keys(payCascade).length) {
      await VisaOverstayPayment.updateMany(
        { caseId: caseDoc._id, isDeleted: false, status: { $ne: 'cancelled' } },
        { $set: payCascade }
      );
    }
  }

  res.status(200).json({
    success: true,
    data: {
      ...item.toObject(),
      _id: String(item._id),
      caseId: String(item.caseId),
      buildDate: item.buildDate ? isoDate(new Date(item.buildDate)) : null,
      passportDueDate: item.passportDueDate ? isoDate(new Date(item.passportDueDate)) : null,
    },
  });
};

async function confirmBuildItemToDay(item: InstanceType<typeof VisaOverstayBuildItem>, req: AuthRequest) {
  if (!item.includeOverstay && !item.includeVisa) {
    throw new ApiError(400, `${item.truckNo}: enable overstay and/or visa, or dismiss`);
  }
  if (!item.position?.trim()) {
    throw new ApiError(400, `${item.truckNo}: position is required before confirming to day`);
  }

  const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
  if (!caseDoc) throw new ApiError(404, `Case for ${item.truckNo} not found`);
  if (caseDoc.status === 'crossed' || caseDoc.status === 'cancelled') {
    throw new ApiError(400, `Cannot confirm a ${caseDoc.status} case`);
  }

  caseDoc.position = item.position;
  if (item.truckNo) caseDoc.truckNo = item.truckNo;
  if (item.driverName) caseDoc.driverName = item.driverName;
  const isFirst = !caseDoc.firstPaidAt;
  const seq = isFirst ? 0 : await nextOverstaySequence(caseDoc._id);
  const created = [];

  if (item.includeOverstay) {
    const exists = await VisaOverstayPayment.findOne({
      caseId: caseDoc._id,
      paymentDate: item.buildDate,
      type: 'overstay',
      isDeleted: false,
      status: { $ne: 'cancelled' },
    });
    if (!exists) {
      created.push(
        await VisaOverstayPayment.create({
          caseId: caseDoc._id,
          paymentDate: item.buildDate,
          truckNo: caseDoc.truckNo,
          driverName: caseDoc.driverName,
          type: 'overstay',
          amount: item.overstayAmount,
          position: item.position,
          status: 'pending',
          overstaySequence: seq,
          createdBy: actorName(req),
        })
      );
    }
  }

  if (item.includeVisa) {
    const exists = await VisaOverstayPayment.findOne({
      caseId: caseDoc._id,
      paymentDate: item.buildDate,
      type: 'visa',
      isDeleted: false,
      status: { $ne: 'cancelled' },
    });
    if (!exists) {
      created.push(
        await VisaOverstayPayment.create({
          caseId: caseDoc._id,
          paymentDate: item.buildDate,
          truckNo: caseDoc.truckNo,
          driverName: caseDoc.driverName,
          type: 'visa',
          amount: item.visaAmount,
          position: item.position,
          status: 'pending',
          createdBy: actorName(req),
        })
      );
    }
  }

  if (caseDoc.status === 'intake' || caseDoc.status === 'waiting_due') {
    caseDoc.status = 'active';
  }
  caseDoc.updatedBy = actorName(req);
  await caseDoc.save();

  item.status = 'confirmed';
  item.resolvedAt = new Date();
  item.updatedBy = actorName(req);
  await item.save();

  return { item, payments: created };
}

/**
 * POST /visa-overstays/build/:id/resolve
 * body: { action: 'confirm' | 'waiting' | 'crossed' | 'dismiss', position?, includeOverstay? }
 */
export const resolveBuildItem = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const item = await VisaOverstayBuildItem.findOne({ _id: req.params.id, isDeleted: false });
  if (!item) throw new ApiError(404, 'Build item not found');
  if (item.status !== 'pending') throw new ApiError(400, 'Item already resolved');

  const action = String(req.body?.action || '');
  if (req.body?.truckNo != null) {
    const nextTruck = String(req.body.truckNo).trim().toUpperCase();
    if (nextTruck) item.truckNo = nextTruck;
  }
  if (req.body?.driverName != null) {
    const nextName = String(req.body.driverName).trim();
    if (nextName) item.driverName = nextName;
  }
  if (req.body?.position != null) item.position = String(req.body.position).trim() || undefined;
  if (req.body?.includeOverstay != null) item.includeOverstay = Boolean(req.body.includeOverstay);
  if (req.body?.includeVisa != null) item.includeVisa = Boolean(req.body.includeVisa);

  if (action === 'confirm') {
    const result = await confirmBuildItemToDay(item, req);
    emitDataChange(COLLECTION, 'update', result, undefined, undefined, {
      id: user.userId,
      username: actorName(req),
    });
    res.status(200).json({ success: true, message: 'Added to day sheet', data: result });
    return;
  }

  if (action === 'waiting') {
    if (!item.position?.trim()) {
      throw new ApiError(400, `${item.truckNo}: position is required before waiting`);
    }
    const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
    if (!caseDoc) throw new ApiError(404, 'Case not found');
    caseDoc.status = 'waiting_due';
    caseDoc.position = item.position.trim();
    if (item.truckNo) caseDoc.truckNo = item.truckNo;
    if (item.driverName) caseDoc.driverName = item.driverName;
    caseDoc.updatedBy = actorName(req);
    await caseDoc.save();
    item.status = 'waiting';
    item.resolvedAt = new Date();
    item.updatedBy = actorName(req);
    await item.save();
    res.status(200).json({ success: true, message: 'Moved to waiting due date', data: item });
    return;
  }

  if (action === 'crossed') {
    const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
    if (!caseDoc) throw new ApiError(404, 'Case not found');

    let settlement = {
      extraDays: caseDoc.extraDays ?? 0,
      extraAmount: caseDoc.extraAmount ?? 0,
      crossedAt: caseDoc.crossedAt || null,
      daysSinceLastOverstay: caseDoc.daysSinceLastOverstay ?? 0,
    };

    if (caseDoc.status !== 'crossed') {
      const cfg = await getConfig();
      let crossedAt: Date;
      if (req.body?.crossedAt) {
        const raw = String(req.body.crossedAt);
        const dm = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
        if (dm) {
          crossedAt = new Date(
            Date.UTC(
              Number(dm[1]),
              Number(dm[2]) - 1,
              Number(dm[3]),
              Number(dm[4] || 12),
              Number(dm[5] || 0)
            )
          );
        } else {
          crossedAt = parseDateInput(raw, 'crossedAt');
        }
      } else {
        crossedAt = startOfDay(item.buildDate);
      }

      let daysSinceLastOverstay = 0;
      let extraDays = 0;
      let extraAmount = 0;

      if (caseDoc.lastOverstayPaidAt) {
        daysSinceLastOverstay = daysBetween(caseDoc.lastOverstayPaidAt, crossedAt);
        if (daysSinceLastOverstay > cfg.graceDays) {
          extraDays = daysSinceLastOverstay - cfg.graceDays;
          extraAmount = extraDays * EXTRA_DAY_RATE;
        }
      } else {
        const border = computeBorderIntakeSettlement(
          caseDoc.passportDueDate,
          crossedAt,
          cfg.overstayCycleDays
        );
        daysSinceLastOverstay = border.daysRemaining;
        extraDays = border.extraDays;
        extraAmount = border.extraAmount;
      }

      caseDoc.status = 'crossed';
      caseDoc.crossedAt = crossedAt;
      caseDoc.crossedBy = actorName(req);
      caseDoc.crossSource = 'build';
      caseDoc.daysSinceLastOverstay = daysSinceLastOverstay;
      caseDoc.extraDays = extraDays;
      caseDoc.extraAmount = extraAmount;
      if (item.position) caseDoc.position = item.position;
      caseDoc.updatedBy = actorName(req);
      await caseDoc.save();
      settlement = {
        extraDays,
        extraAmount,
        crossedAt,
        daysSinceLastOverstay,
      };
    }

    item.status = 'crossed';
    item.resolvedAt = new Date();
    item.updatedBy = actorName(req);
    await item.save();
    res.status(200).json({
      success: true,
      message: 'Marked crossed',
      data: { item, settlement },
    });
    return;
  }

  if (action === 'dismiss') {
    const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
    if (caseDoc && caseDoc.status !== 'crossed' && caseDoc.status !== 'cancelled') {
      if (item.truckNo) caseDoc.truckNo = item.truckNo;
      if (item.driverName) caseDoc.driverName = item.driverName;
      if (item.position != null) {
        caseDoc.position = item.position;
        caseDoc.payoutRule = inferPayoutRule(item.position);
      }
      caseDoc.updatedBy = actorName(req);
      await caseDoc.save();
    }
    item.status = 'dismissed';
    item.resolvedAt = new Date();
    item.updatedBy = actorName(req);
    await item.save();
    res.status(200).json({ success: true, message: 'Dismissed from build', data: item });
    return;
  }

  throw new ApiError(400, 'action must be confirm | waiting | crossed | dismiss');
};

/**
 * POST /visa-overstays/build/resolve-batch
 * body: { ids: string[], action: 'waiting' | 'crossed' | 'dismiss' | 'confirm', crossedAt?, position? }
 */
export const resolveBuildBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const action = String(req.body?.action || '');
  if (!ids.length) throw new ApiError(400, 'ids required');
  if (!['confirm', 'waiting', 'crossed', 'dismiss'].includes(action)) {
    throw new ApiError(400, 'action must be confirm | waiting | crossed | dismiss');
  }

  const resolved = [];
  const errors: string[] = [];

  for (const id of ids) {
    try {
      // Reuse resolveBuildItem logic via internal call pattern
      req.params = { ...req.params, id };
      const item = await VisaOverstayBuildItem.findOne({ _id: id, isDeleted: false });
      if (!item || item.status !== 'pending') {
        errors.push(`${id}: not pending`);
        continue;
      }

      if (req.body?.position != null) {
        item.position = String(req.body.position).trim() || item.position;
      }

      if (action === 'confirm') {
        resolved.push(await confirmBuildItemToDay(item, req));
        continue;
      }

      if (action === 'waiting') {
        if (!item.position?.trim()) {
          errors.push(`${item.truckNo}: position required`);
          continue;
        }
        const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
        if (!caseDoc) {
          errors.push(`${item.truckNo}: case missing`);
          continue;
        }
        caseDoc.status = 'waiting_due';
        caseDoc.position = item.position.trim();
        if (item.truckNo) caseDoc.truckNo = item.truckNo;
        if (item.driverName) caseDoc.driverName = item.driverName;
        caseDoc.updatedBy = actorName(req);
        await caseDoc.save();
        item.status = 'waiting';
        item.resolvedAt = new Date();
        item.updatedBy = actorName(req);
        await item.save();
        resolved.push(item);
        continue;
      }

      if (action === 'crossed') {
        const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
        if (!caseDoc) {
          errors.push(`${item.truckNo}: case missing`);
          continue;
        }
        if (caseDoc.status !== 'crossed') {
          const cfg = await getConfig();
          let crossedAt: Date;
          if (req.body?.crossedAt) {
            const raw = String(req.body.crossedAt);
            const dm = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(raw);
            if (dm) {
              crossedAt = new Date(
                Date.UTC(
                  Number(dm[1]),
                  Number(dm[2]) - 1,
                  Number(dm[3]),
                  Number(dm[4] || 12),
                  Number(dm[5] || 0)
                )
              );
            } else {
              crossedAt = parseDateInput(raw, 'crossedAt');
            }
          } else {
            crossedAt = startOfDay(item.buildDate);
          }

          let daysSinceLastOverstay = 0;
          let extraDays = 0;
          let extraAmount = 0;
          if (caseDoc.lastOverstayPaidAt) {
            daysSinceLastOverstay = daysBetween(caseDoc.lastOverstayPaidAt, crossedAt);
            if (daysSinceLastOverstay > cfg.graceDays) {
              extraDays = daysSinceLastOverstay - cfg.graceDays;
              extraAmount = extraDays * EXTRA_DAY_RATE;
            }
          } else {
            const border = computeBorderIntakeSettlement(
              caseDoc.passportDueDate,
              crossedAt,
              cfg.overstayCycleDays
            );
            daysSinceLastOverstay = border.daysRemaining;
            extraDays = border.extraDays;
            extraAmount = border.extraAmount;
          }
          caseDoc.status = 'crossed';
          caseDoc.crossedAt = crossedAt;
          caseDoc.crossedBy = actorName(req);
          caseDoc.crossSource = 'build';
          caseDoc.daysSinceLastOverstay = daysSinceLastOverstay;
          caseDoc.extraDays = extraDays;
          caseDoc.extraAmount = extraAmount;
          if (item.position) caseDoc.position = item.position;
          caseDoc.updatedBy = actorName(req);
          await caseDoc.save();
        }
        item.status = 'crossed';
        item.resolvedAt = new Date();
        item.updatedBy = actorName(req);
        await item.save();
        resolved.push(item);
        continue;
      }

      if (action === 'dismiss') {
        const caseDoc = await VisaOverstayCase.findOne({ _id: item.caseId, isDeleted: false });
        if (caseDoc && caseDoc.status !== 'crossed' && caseDoc.status !== 'cancelled') {
          if (item.truckNo) caseDoc.truckNo = item.truckNo;
          if (item.driverName) caseDoc.driverName = item.driverName;
          if (item.position != null) {
            caseDoc.position = item.position;
            caseDoc.payoutRule = inferPayoutRule(item.position);
          }
          caseDoc.updatedBy = actorName(req);
          await caseDoc.save();
        }
        item.status = 'dismissed';
        item.resolvedAt = new Date();
        item.updatedBy = actorName(req);
        await item.save();
        resolved.push(item);
      }
    } catch (e: any) {
      errors.push(e?.message || String(e));
    }
  }

  emitDataChange(COLLECTION, 'update', { resolved: resolved.length, action }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({
    success: true,
    message: `Resolved ${resolved.length}`,
    data: { resolved, errors },
  });
};

/**
 * POST /visa-overstays/build/confirm-batch
 * body: { ids: string[] }
 */
export const confirmBuildBatch = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) throw new ApiError(400, 'ids required');

  const confirmed = [];
  const errors: string[] = [];

  for (const id of ids) {
    try {
      const item = await VisaOverstayBuildItem.findOne({ _id: id, isDeleted: false });
      if (!item || item.status !== 'pending') {
        errors.push(`${id}: not pending`);
        continue;
      }
      confirmed.push(await confirmBuildItemToDay(item, req));
    } catch (e: any) {
      errors.push(e?.message || String(e));
    }
  }

  emitDataChange(COLLECTION, 'update', { confirmed: confirmed.length }, undefined, undefined, {
    id: user.userId,
    username: actorName(req),
  });

  res.status(200).json({
    success: true,
    message: `Confirmed ${confirmed.length} to day sheet`,
    data: { confirmed, errors },
  });
};

type ExportFormat = 'xlsx' | 'pdf' | 'png' | 'svg';

function parseExportFormat(raw: unknown): ExportFormat {
  const f = String(raw || 'xlsx').toLowerCase();
  if (f === 'xlsx' || f === 'pdf' || f === 'png' || f === 'svg') return f;
  if (f === 'image') return 'png';
  throw new ApiError(400, 'format must be xlsx | pdf | png | svg');
}

async function loadDaySheetExportData(date: Date) {
  const { start, end } = nairobiDayRange(date);
  const payments = await VisaOverstayPayment.find({
    isDeleted: false,
    paymentDate: { $gte: start, $lt: end },
  }).sort({ truckNo: 1, type: 1 });
  let rows = buildUnifiedRows(payments);
  rows = await enrichRowsWithCases(rows);
  const totals = payments
    .filter((p) => p.status !== 'cancelled')
    .reduce(
      (acc, p) => {
        if (p.type === 'overstay') acc.overstay += p.amount;
        if (p.type === 'visa') acc.visa += p.amount;
        acc.all += p.amount;
        return acc;
      },
      { overstay: 0, visa: 0, all: 0 }
    );
  return { dateYmd: isoDate(date), rows, totals };
}

/**
 * GET /visa-overstays/exports/day-sheet?date=&format=xlsx|pdf|png|svg
 */
export const exportDaySheet = async (req: AuthRequest, res: Response): Promise<void> => {
  const date = parseDateInput(req.query.date || new Date().toISOString().slice(0, 10), 'date');
  const format = parseExportFormat(req.query.format);
  const { dateYmd, rows, totals } = await loadDaySheetExportData(date);

  const {
    buildDaySheetWorkbook,
    buildDaySheetPdfBuffer,
    buildDaySheetPngBuffer,
    buildDaySheetSvg,
  } = await import('../utils/visaOverstayExport');

  const base = `Visas_Overstays_${dateYmd}`;

  if (format === 'xlsx') {
    const wb = await buildDaySheetWorkbook(dateYmd, rows, totals);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    await wb.xlsx.write(res);
    return;
  }

  if (format === 'pdf') {
    try {
      const buf = await buildDaySheetPdfBuffer(dateYmd, rows, totals);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
      res.send(buf);
    } catch (err: any) {
      if (err?.statusCode) throw new ApiError(err.statusCode, err.message);
      throw err;
    }
    return;
  }

  if (format === 'png') {
    try {
      const buf = await buildDaySheetPngBuffer(dateYmd, rows, totals);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.png"`);
      res.send(buf);
    } catch (err: any) {
      if (err?.statusCode) throw new ApiError(err.statusCode, err.message);
      throw err;
    }
    return;
  }

  const svg = buildDaySheetSvg(dateYmd, rows, totals);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.svg"`);
  res.send(svg);
};

/**
 * GET /visa-overstays/exports/build?date=&format=xlsx|pdf|png|svg
 */
export const exportBuildReview = async (req: AuthRequest, res: Response): Promise<void> => {
  const date = parseDateInput(req.query.date || new Date().toISOString().slice(0, 10), 'date');
  const format = parseExportFormat(req.query.format);
  const { start, end } = nairobiDayRange(date);

  const items = await VisaOverstayBuildItem.find({
    isDeleted: false,
    buildDate: { $gte: start, $lt: end },
    status: 'pending',
  })
    .sort({ source: 1, truckNo: 1 })
    .lean();

  const caseIds = items.map((i) => i.caseId).filter(Boolean);
  const cases = caseIds.length
    ? await VisaOverstayCase.find({ _id: { $in: caseIds }, isDeleted: false })
        .select('_id truckNo driverName passportDueDate position')
        .lean()
    : [];
  const byId = new Map(cases.map((c: any) => [String(c._id), c]));

  const mapped = items.map((i: any) => {
    const c = byId.get(String(i.caseId));
    const due = c?.passportDueDate || i.passportDueDate;
    return {
      truckNo: c?.truckNo || i.truckNo,
      driverName: c?.driverName || i.driverName,
      passportDueDate: due ? isoDate(new Date(due)) : null,
      position: c?.position != null && c.position !== '' ? c.position : i.position,
      source: i.source,
      includeOverstay: i.includeOverstay,
      includeVisa: i.includeVisa,
      overstayAmount: i.overstayAmount,
      visaAmount: i.visaAmount,
    };
  });

  const {
    buildBuildReviewWorkbook,
    buildBuildReviewPdfBuffer,
    buildBuildReviewPngBuffer,
    buildBuildReviewSvg,
  } = await import('../utils/visaOverstayExport');

  const dateYmd = isoDate(date);
  const base = `Build_Review_${dateYmd}`;

  if (format === 'xlsx') {
    const wb = await buildBuildReviewWorkbook(dateYmd, mapped);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    await wb.xlsx.write(res);
    return;
  }

  if (format === 'pdf') {
    try {
      const buf = await buildBuildReviewPdfBuffer(dateYmd, mapped);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`);
      res.send(buf);
    } catch (err: any) {
      if (err?.statusCode) throw new ApiError(err.statusCode, err.message);
      throw err;
    }
    return;
  }

  if (format === 'png') {
    try {
      const buf = await buildBuildReviewPngBuffer(dateYmd, mapped);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${base}.png"`);
      res.send(buf);
    } catch (err: any) {
      if (err?.statusCode) throw new ApiError(err.statusCode, err.message);
      throw err;
    }
    return;
  }

  const svg = buildBuildReviewSvg(dateYmd, mapped);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.svg"`);
  res.send(svg);
};

