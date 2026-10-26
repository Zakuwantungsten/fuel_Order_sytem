import { FuelRecord, LPOSummary, DarLPODocument, TangaLPODocument } from '../models';
import { isPendingGoingDo, isPendingReturnDo } from '../utils/pendingDoNumber';

/**
 * Read-only inspection of what switching a DO's direction (IMPORT <-> EXPORT)
 * would touch: the fuel journey it owns, a pending PG/PR placeholder that was
 * merged into that journey, LPO lines issued against the DO number, and liters
 * already dispensed on the journey. Nothing here writes to the database.
 */

const GOING_FUEL_FIELDS = [
  'mmsaYard', 'tangaYard', 'darYard',
  'tangaGoing', 'darGoing', 'moroGoing', 'mbeyaGoing', 'tdmGoing', 'zambiaGoing', 'congoFuel',
] as const;

const RETURN_FUEL_FIELDS = [
  'zambiaReturn', 'tundumaReturn', 'mbeyaReturn', 'moroReturn', 'darReturn', 'tangaReturn',
] as const;

export interface FlipImpactOrder {
  _id?: unknown;
  id?: unknown;
  doNumber: string;
  doType?: string;
  importOrExport?: string;
  truckNo?: string;
}

export interface FlipLpoLine {
  source: 'LPO' | 'DAR' | 'TANGA';
  lpoNo: string;
  station?: string;
  date?: string;
  truckNo?: string;
  liters: number;
}

export interface DirectionFlipImpact {
  doNumber: string;
  from: 'IMPORT' | 'EXPORT';
  to: 'IMPORT' | 'EXPORT';
  /** SDOs never own fuel journeys, so a flip is a plain field change. */
  affectsFuel: boolean;
  fuelRecord: {
    id: string;
    truckNo: string;
    goingDo?: string;
    returnDo?: string;
    journeyStatus?: string;
  } | null;
  /** Pending placeholder that was promoted into this DO's journey and can be restored. */
  pendingToRevive: { kind: 'going' | 'return'; pendingDo: string; pendingAt?: Date } | null;
  lpoLines: FlipLpoLine[];
  lpoLiters: number;
  /** Liters already dispensed on the part of the journey this flip undoes. */
  fuelIssued: Array<{ field: string; liters: number }>;
  fuelIssuedLiters: number;
  requiresConfirmation: boolean;
}

const toDirection = (v?: string): 'IMPORT' | 'EXPORT' =>
  String(v || '').toUpperCase() === 'EXPORT' ? 'EXPORT' : 'IMPORT';

const dateString = (d: unknown): string | undefined => {
  if (!d) return undefined;
  const parsed = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(parsed.getTime()) ? String(d) : parsed.toISOString().slice(0, 10);
};

async function findLpoLines(doNumbers: string[]): Promise<Map<string, FlipLpoLine[]>> {
  const byDo = new Map<string, FlipLpoLine[]>();
  if (doNumbers.length === 0) return byDo;
  const wanted = new Set(doNumbers);
  const filter = { isDeleted: false, 'entries.doNo': { $in: doNumbers } };

  const [lpos, darDocs, tangaDocs] = await Promise.all([
    LPOSummary.find(filter).select('lpoNo date station entries').lean(),
    DarLPODocument.find(filter).select('lpoNo date entries').lean(),
    TangaLPODocument.find(filter).select('lpoNo date entries').lean(),
  ]);

  const push = (doNo: string, line: FlipLpoLine) => {
    const list = byDo.get(doNo) || [];
    list.push(line);
    byDo.set(doNo, list);
  };

  for (const doc of lpos as any[]) {
    for (const e of doc.entries || []) {
      if (!wanted.has(e.doNo) || e.isCancelled) continue;
      push(e.doNo, {
        source: 'LPO',
        lpoNo: String(doc.lpoNo),
        station: doc.station,
        date: dateString(doc.date),
        truckNo: e.truckNo,
        liters: Number(e.liters) || 0,
      });
    }
  }
  for (const [source, docs] of [['DAR', darDocs], ['TANGA', tangaDocs]] as const) {
    for (const doc of docs as any[]) {
      for (const e of doc.entries || []) {
        if (!wanted.has(e.doNo) || e.isCancelled) continue;
        push(e.doNo, {
          source,
          lpoNo: String(doc.lpoNo),
          station: source === 'DAR' ? 'DAR YARD' : 'TANGA YARD',
          date: dateString(doc.date),
          truckNo: e.truckNo,
          liters: Number(e.dispenseLiters ?? e.liters) || 0,
        });
      }
    }
  }
  return byDo;
}

/**
 * Inspect direction-flip impact for each order. `targetDirection` is the
 * direction the orders would be switched to; orders already in that direction
 * are omitted from the result.
 */
export async function inspectDirectionFlipImpacts(
  orders: FlipImpactOrder[],
  targetDirection: 'IMPORT' | 'EXPORT'
): Promise<Map<string, DirectionFlipImpact>> {
  const result = new Map<string, DirectionFlipImpact>();
  const flipping = orders.filter((o) => o.doNumber && toDirection(o.importOrExport) !== targetDirection);
  if (flipping.length === 0) return result;

  const fuelOrders = flipping.filter((o) => String(o.doType || '').toUpperCase() !== 'SDO');
  const fromImport = fuelOrders.filter((o) => toDirection(o.importOrExport) === 'IMPORT').map((o) => o.doNumber);
  const fromExport = fuelOrders.filter((o) => toDirection(o.importOrExport) === 'EXPORT').map((o) => o.doNumber);

  const baseFilter = { isDeleted: false, isCancelled: { $ne: true } };
  const [goingRecords, returnRecords, lpoLinesByDo] = await Promise.all([
    fromImport.length
      ? FuelRecord.find({ ...baseFilter, goingDo: { $in: fromImport } }).lean()
      : Promise.resolve([] as any[]),
    fromExport.length
      ? FuelRecord.find({ ...baseFilter, returnDo: { $in: fromExport } }).lean()
      : Promise.resolve([] as any[]),
    findLpoLines(fuelOrders.map((o) => o.doNumber)),
  ]);
  const goingByDo = new Map((goingRecords as any[]).map((r) => [String(r.goingDo), r]));
  const returnByDo = new Map((returnRecords as any[]).map((r) => [String(r.returnDo), r]));

  for (const order of flipping) {
    const from = toDirection(order.importOrExport);
    const affectsFuel = String(order.doType || '').toUpperCase() !== 'SDO';
    const record: any = !affectsFuel
      ? null
      : from === 'IMPORT'
        ? goingByDo.get(order.doNumber)
        : returnByDo.get(order.doNumber);

    let pendingToRevive: DirectionFlipImpact['pendingToRevive'] = null;
    const hasRealReturn =
      !!record?.returnDo && !isPendingReturnDo(record.returnDo) && !record.isPendingReturn;
    if (record && from === 'IMPORT' && isPendingGoingDo(record.previousPendingGoingDo) && !hasRealReturn) {
      pendingToRevive = {
        kind: 'going',
        pendingDo: String(record.previousPendingGoingDo),
        pendingAt: record.previousPendingGoingAt || undefined,
      };
    } else if (record && from === 'EXPORT' && isPendingReturnDo(record.previousPendingReturnDo)) {
      pendingToRevive = {
        kind: 'return',
        pendingDo: String(record.previousPendingReturnDo),
        pendingAt: record.previousPendingReturnAt || undefined,
      };
    }

    // IMPORT flip undoes the whole going journey; EXPORT flip strips the return leg.
    const fields = from === 'IMPORT' ? [...GOING_FUEL_FIELDS, ...RETURN_FUEL_FIELDS] : RETURN_FUEL_FIELDS;
    const fuelIssued = record
      ? fields
          .map((field) => ({ field, liters: Math.abs(Number(record[field]) || 0) }))
          .filter((f) => f.liters > 0)
      : [];
    const fuelIssuedLiters = fuelIssued.reduce((sum, f) => sum + f.liters, 0);

    const lpoLines = affectsFuel ? lpoLinesByDo.get(order.doNumber) || [] : [];
    const lpoLiters = lpoLines.reduce((sum, l) => sum + l.liters, 0);

    result.set(order.doNumber, {
      doNumber: order.doNumber,
      from,
      to: targetDirection,
      affectsFuel,
      fuelRecord: record
        ? {
            id: String(record._id),
            truckNo: String(record.truckNo || ''),
            goingDo: record.goingDo || undefined,
            returnDo: record.returnDo || undefined,
            journeyStatus: record.journeyStatus || undefined,
          }
        : null,
      pendingToRevive,
      lpoLines,
      lpoLiters,
      fuelIssued,
      fuelIssuedLiters,
      requiresConfirmation: lpoLines.length > 0 || fuelIssuedLiters > 0,
    });
  }

  return result;
}
