/**
 * Dual-source helpers: new yard LPOs live on LPOSummary; legacy TY-/DY- docs
 * stay on TangaLPODocument / DarLPODocument (no migration).
 */
import mongoose from 'mongoose';
import { LPOSummary } from '../models';
import { TangaLPODocument } from '../models/TangaLPODocument';
import { DarLPODocument } from '../models/DarLPODocument';
import {
  YARD_STATION,
  YARD_DEFAULT_ORDER_OF,
  type YardStationName,
  type YardFuelField,
} from '../utils/yardStations';
import { formatDONumber } from '../utils/doNumberFormatter';
import { ApiError } from '../middleware/errorHandler';

export type YardKind = 'tanga' | 'dar';

export type YardLpoSource = 'legacy' | 'summary';

export interface ResolvedYardLpo {
  doc: any;
  source: YardLpoSource;
  /** Realtime channel for this document's collection */
  emitKey: 'tanga_lpo_documents' | 'dar_lpo_documents' | 'lpo_summaries';
  yard: YardKind;
  fuelField: YardFuelField;
  station: YardStationName;
}

const YARD_META: Record<
  YardKind,
  {
    station: YardStationName;
    fuelField: YardFuelField;
    legacyEmit: 'tanga_lpo_documents' | 'dar_lpo_documents';
    LegacyModel: typeof TangaLPODocument | typeof DarLPODocument;
    stationRegex: RegExp;
    timeLimitYardKey: 'tangaYard' | 'darYard';
  }
> = {
  tanga: {
    station: YARD_STATION.TANGA,
    fuelField: 'tangaYard',
    legacyEmit: 'tanga_lpo_documents',
    LegacyModel: TangaLPODocument,
    stationRegex: /^tanga\s*yard$/i,
    timeLimitYardKey: 'tangaYard',
  },
  dar: {
    station: YARD_STATION.DAR,
    fuelField: 'darYard',
    legacyEmit: 'dar_lpo_documents',
    LegacyModel: DarLPODocument,
    stationRegex: /^dar\s*yard$/i,
    timeLimitYardKey: 'darYard',
  },
};

export function getYardMeta(yard: YardKind) {
  return YARD_META[yard];
}

/** Preview / allocate next regular LPO number (XXXX/YY) for yard creates. */
export async function allocateSharedLpoNo(
  year: number,
  session?: mongoose.ClientSession
): Promise<string> {
  const yearSuffix = year.toString().slice(-2);

  const maxNewFmt = await LPOSummary.aggregate([
    { $match: { isDeleted: false, year, lpoNo: { $regex: `/${yearSuffix}$` } } },
    { $project: { seq: { $toInt: { $arrayElemAt: [{ $split: ['$lpoNo', '/'] }, 0] } } } },
    { $group: { _id: null, maxSeq: { $max: '$seq' } } },
  ]).session(session ?? null);

  let nextSeq: number;
  if (maxNewFmt.length > 0 && maxNewFmt[0].maxSeq != null) {
    nextSeq = maxNewFmt[0].maxSeq + 1;
  } else {
    const legacy = await LPOSummary.aggregate([
      { $match: { isDeleted: false, year } },
      { $project: { lpoNoInt: { $toInt: '$lpoNo' } } },
      { $group: { _id: null, maxLpoNo: { $max: '$lpoNoInt' } } },
    ]).session(session ?? null);
    nextSeq = (legacy[0]?.maxLpoNo ?? 0) + 1;
  }

  let nextLpoNo = formatDONumber(nextSeq, year);
  let exists = await LPOSummary.exists({ lpoNo: nextLpoNo, isDeleted: false }).session(
    session ?? null
  );
  while (exists) {
    nextSeq++;
    nextLpoNo = formatDONumber(nextSeq, year);
    exists = await LPOSummary.exists({ lpoNo: nextLpoNo, isDeleted: false }).session(
      session ?? null
    );
  }
  return nextLpoNo;
}

/** Normalize yard entry fields so LPOSummary validators accept them. */
export function normalizeYardEntriesForSummary(entries: any[]): any[] {
  return (entries || []).map((e, idx) => ({
    ...e,
    doNo: e.doNo != null && String(e.doNo).trim() !== '' ? String(e.doNo).trim() : 'NIL',
    dest: e.dest != null && String(e.dest).trim() !== '' ? String(e.dest).trim() : '-',
    truckNo: e.truckNo,
    liters: e.liters,
    rate: e.rate,
    amount: e.amount != null ? e.amount : (e.liters || 0) * (e.rate || 0),
    dispenseLiters: e.dispenseLiters != null ? e.dispenseLiters : null,
    linkedFuelRecordId: e.linkedFuelRecordId || undefined,
    context: e.context != null && String(e.context).trim() !== '' ? String(e.context).trim() : null,
    sortOrder: e.sortOrder ?? idx,
    isCancelled: e.isCancelled === true,
    cancellationReason: e.cancellationReason,
    cancelledAt: e.cancelledAt,
    originalLiters: e.originalLiters ?? null,
    amendedAt: e.amendedAt ?? null,
  }));
}

/**
 * Plain PUT/update must not change billed/dispense liters or linkage — that path
 * bypasses amend (diff / context / fuel cascade). Preserve fuel-critical fields
 * from the existing entry and reject liters mutations.
 */
export function preserveYardEntryFuelFieldsOnUpdate(
  existingEntries: any[],
  incomingEntries: any[],
): any[] {
  const byId = new Map(
    (existingEntries || [])
      .filter((e) => e?._id != null)
      .map((e) => [String(e._id), e]),
  );

  return (incomingEntries || []).map((incoming, idx) => {
    const id = incoming?._id != null ? String(incoming._id) : null;
    const prev = id ? byId.get(id) : null;
    if (!prev) {
      return incoming;
    }

    const nextLiters = Number(incoming.liters);
    const prevLiters = Number(prev.liters);
    if (
      Number.isFinite(nextLiters) &&
      Number.isFinite(prevLiters) &&
      Math.abs(nextLiters - prevLiters) > 0.001
    ) {
      throw new ApiError(
        400,
        'Use Amend to change billed liters (sets dispense, context, and cascades linked fuel)',
      );
    }

    const rate = incoming.rate != null ? Number(incoming.rate) : Number(prev.rate);
    const liters = prevLiters;
    return {
      ...incoming,
      liters,
      rate: Number.isFinite(rate) ? rate : prev.rate,
      amount: +(liters * (Number.isFinite(rate) ? rate : Number(prev.rate) || 0)).toFixed(2),
      dispenseLiters: prev.dispenseLiters,
      originalLiters: prev.originalLiters,
      context: prev.context,
      linkedFuelRecordId: prev.linkedFuelRecordId,
      amendedAt: prev.amendedAt,
      sortOrder: incoming.sortOrder ?? prev.sortOrder ?? idx,
      isCancelled: prev.isCancelled === true ? true : incoming.isCancelled === true,
      cancellationReason: prev.cancellationReason ?? incoming.cancellationReason,
      cancelledAt: prev.cancelledAt ?? incoming.cancelledAt,
    };
  });
}

export async function createYardLpoOnSummary(
  yard: YardKind,
  data: {
    date: string;
    entries: any[];
    currency?: string;
    notes?: string;
    total?: number;
    createdBy?: string;
    approvedBy?: string;
  }
): Promise<{ lpo: any; lpoNo: string }> {
  const meta = YARD_META[yard];
  const dateObj = new Date(data.date);
  const year = dateObj.getFullYear();
  const entries = normalizeYardEntriesForSummary(data.entries);
  const total =
    data.total != null
      ? data.total
      : entries.reduce((sum, e) => sum + (e.isCancelled ? 0 : e.amount || 0), 0);

  // Ensure regular workbook year exists
  const { LPOWorkbook } = await import('../models/LPOWorkbook');
  const existingWb = await LPOWorkbook.findOne({ year, isDeleted: false });
  if (!existingWb) {
    await LPOWorkbook.create({ year, name: `LPO ${year}` });
  }

  let lpo: any;
  let lpoNo = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    lpoNo = await allocateSharedLpoNo(year);
    try {
      lpo = await LPOSummary.create({
        lpoNo,
        date: data.date,
        year,
        station: meta.station,
        orderOf: YARD_DEFAULT_ORDER_OF,
        entries,
        total,
        currency: data.currency === 'USD' ? 'USD' : 'TZS',
        createdBy: data.createdBy || 'Unknown',
        approvedBy: data.approvedBy,
      });
      break;
    } catch (err: any) {
      if (err?.code === 11000 && attempt < 4) continue;
      throw err;
    }
  }
  if (!lpo) throw new Error('Could not allocate an LPO number, please retry');
  return { lpo, lpoNo };
}

export async function findYardLpoById(
  yard: YardKind,
  id: string
): Promise<ResolvedYardLpo | null> {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  const meta = YARD_META[yard];

  const legacy = await meta.LegacyModel.findOne({ _id: id, isDeleted: false });
  if (legacy) {
    return {
      doc: legacy,
      source: 'legacy',
      emitKey: meta.legacyEmit,
      yard,
      fuelField: meta.fuelField,
      station: meta.station,
    };
  }

  const summary = await LPOSummary.findOne({
    _id: id,
    isDeleted: false,
    station: { $regex: meta.stationRegex },
  });
  if (summary) {
    return {
      doc: summary,
      source: 'summary',
      emitKey: 'lpo_summaries',
      yard,
      fuelField: meta.fuelField,
      station: meta.station,
    };
  }
  return null;
}

export async function findYardLpoByLpoNo(
  yard: YardKind,
  lpoNo: string
): Promise<ResolvedYardLpo | null> {
  const meta = YARD_META[yard];
  const legacy = await meta.LegacyModel.findOne({ lpoNo, isDeleted: false });
  if (legacy) {
    return {
      doc: legacy,
      source: 'legacy',
      emitKey: meta.legacyEmit,
      yard,
      fuelField: meta.fuelField,
      station: meta.station,
    };
  }
  const summary = await LPOSummary.findOne({
    lpoNo,
    isDeleted: false,
    station: { $regex: meta.stationRegex },
  });
  if (summary) {
    return {
      doc: summary,
      source: 'summary',
      emitKey: 'lpo_summaries',
      yard,
      fuelField: meta.fuelField,
      station: meta.station,
    };
  }
  return null;
}

/** Tag lean docs for the frontend dual-read UI. */
export function tagYardDoc(doc: any, source: YardLpoSource, station: YardStationName) {
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  return {
    ...plain,
    id: plain._id,
    source,
    station: plain.station || station,
    // Yard tabs historically had no orderOf; keep UI happy
    orderOf: plain.orderOf || YARD_DEFAULT_ORDER_OF,
  };
}

export async function listMergedYardLpos(
  yard: YardKind,
  filterLegacy: any,
  opts: { skip: number; limit: number; sortField: string; sortOrder: 1 | -1 }
): Promise<{ docs: any[]; total: number }> {
  const meta = YARD_META[yard];

  // Map legacy-style filters onto LPOSummary (same entry/date/year shape).
  const summaryFilter: any = {
    ...filterLegacy,
    station: { $regex: meta.stationRegex },
  };

  const [legacyDocs, summaryDocs] = await Promise.all([
    meta.LegacyModel.find(filterLegacy).lean(),
    LPOSummary.find(summaryFilter).lean(),
  ]);

  const merged = [
    ...legacyDocs.map((d) => tagYardDoc(d, 'legacy', meta.station)),
    ...summaryDocs.map((d) => tagYardDoc(d, 'summary', meta.station)),
  ];

  const sf = opts.sortField || 'date';
  merged.sort((a, b) => {
    const av = a[sf];
    const bv = b[sf];
    if (av === bv) {
      // Stable tie-break by lpoNo
      const cmp = String(a.lpoNo || '').localeCompare(String(b.lpoNo || ''));
      return opts.sortOrder === 1 ? cmp : -cmp;
    }
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return opts.sortOrder === 1 ? -1 : 1;
    return opts.sortOrder === 1 ? 1 : -1;
  });

  const total = merged.length;
  const docs = merged.slice(opts.skip, opts.skip + opts.limit);
  return { docs, total };
}

export async function workbookMergedByYear(yard: YardKind, year: number) {
  const meta = YARD_META[yard];
  const [legacyDocs, summaryDocs] = await Promise.all([
    meta.LegacyModel.find({ year, isDeleted: false }).sort({ date: 1, lpoNo: 1 }).lean(),
    LPOSummary.find({
      year,
      isDeleted: false,
      station: { $regex: meta.stationRegex },
    })
      .sort({ date: 1, lpoNo: 1 })
      .lean(),
  ]);

  const docs = [
    ...legacyDocs.map((d) => tagYardDoc(d, 'legacy', meta.station)),
    ...summaryDocs.map((d) => tagYardDoc(d, 'summary', meta.station)),
  ].sort((a, b) => {
    const dc = String(a.date).localeCompare(String(b.date));
    if (dc !== 0) return dc;
    return String(a.lpoNo).localeCompare(String(b.lpoNo));
  });

  const grouped: Record<number, any[]> = {};
  for (const doc of docs) {
    const month = new Date(doc.date).getMonth() + 1;
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(doc);
  }
  return { year, months: grouped };
}

export async function distinctYardYears(yard: YardKind): Promise<number[]> {
  const meta = YARD_META[yard];
  const [legacyYears, summaryYears] = await Promise.all([
    meta.LegacyModel.distinct('year', { isDeleted: false }) as Promise<number[]>,
    LPOSummary.distinct('year', {
      isDeleted: false,
      station: { $regex: meta.stationRegex },
    }) as Promise<number[]>,
  ]);
  const set = new Set<number>([...legacyYears, ...summaryYears]);
  return [...set].sort((a, b) => b - a);
}
