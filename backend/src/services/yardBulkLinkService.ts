/**
 * Shared yard LPO bulk-link logic — used at create-time (atomic) and from sheet bulk-link endpoints.
 */
import { FuelRecord, LPOSummary } from '../models';
import { ApiError } from '../middleware/errorHandler';
import {
  createYardLpoOnSummary,
  getYardMeta,
  type YardKind,
} from './yardUnifiedLpoService';
import { dispenseAmount, applyYardFieldDelta } from './yardLpoFuelService';

export type YardBulkLinkSelection = {
  entryId: string;
  fuelRecordId: string;
  dispenseLiters?: number;
  topUp?: boolean;
};

export type YardCreateLinkSelection = {
  index: number;
  fuelRecordId: string;
  topUp?: boolean;
  dispenseLiters?: number;
};

export type YardBulkLinkResult = {
  entryId: string;
  status: 'linked' | 'topped_up' | 'conflict' | 'not_found' | 'already_linked';
  truckNo: string;
  doNo: string;
  liters: number;
  dispenseLiters: number;
  existingValue?: number;
  fuelRecordId?: string;
};

export function mapIndexLinkSelections(
  lpo: { entries?: any[] },
  createSelections: YardCreateLinkSelection[],
): YardBulkLinkSelection[] {
  const entries = lpo.entries || [];
  const mapped: YardBulkLinkSelection[] = [];
  for (const sel of createSelections) {
    const entry = entries[sel.index];
    const entryId = entry?._id?.toString();
    if (!entryId || !sel.fuelRecordId) continue;
    mapped.push({
      entryId,
      fuelRecordId: String(sel.fuelRecordId),
      topUp: sel.topUp,
      ...(sel.dispenseLiters != null ? { dispenseLiters: sel.dispenseLiters } : {}),
    });
  }
  return mapped;
}

function findEntry(lpo: any, entryId: string) {
  return (lpo.entries as any[]).find((e: any) => e._id.toString() === entryId);
}

async function validateYardBulkLinks(
  lpo: any,
  yard: YardKind,
  selections: YardBulkLinkSelection[],
): Promise<void> {
  const fuelField = getYardMeta(yard).fuelField;
  const errors: string[] = [];

  for (const sel of selections) {
    const entry = findEntry(lpo, sel.entryId);
    if (!entry || entry.isCancelled) {
      errors.push(`Entry ${sel.entryId} not found or cancelled`);
      continue;
    }
    if (entry.linkedFuelRecordId) continue;

    const fr = sel.fuelRecordId
      ? await FuelRecord.findOne({ _id: sel.fuelRecordId, isDeleted: false, isCancelled: { $ne: true } })
      : null;
    if (!fr) {
      errors.push(`Fuel record not found for truck ${entry.truckNo}`);
      continue;
    }

    const existingValue: number = fr[fuelField] ?? 0;
    if (existingValue > 0 && !sel.topUp) {
      errors.push(
        `Truck ${entry.truckNo}: yard column already has ${existingValue}L — enable top-up or pick another record`,
      );
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, errors.join('; '));
  }
}

export async function applyYardBulkLinksToLpo(
  lpo: any,
  yard: YardKind,
  selections: YardBulkLinkSelection[],
  opts?: { username?: string; requireAll?: boolean },
): Promise<{ results: YardBulkLinkResult[]; didApply: boolean }> {
  if (opts?.requireAll && selections.length > 0) {
    await validateYardBulkLinks(lpo, yard, selections);
  }

  const fuelField = getYardMeta(yard).fuelField;
  const username = opts?.username || 'yard-system';
  const results: YardBulkLinkResult[] = [];
  let didApply = false;

  for (const sel of selections) {
    const entryId = sel?.entryId;
    const entry = findEntry(lpo, entryId);
    if (!entry || entry.isCancelled) continue;

    if (sel.dispenseLiters != null && Number(sel.dispenseLiters) >= 0) {
      entry.dispenseLiters = Number(sel.dispenseLiters);
    }
    const disp = dispenseAmount(entry);

    if (entry.linkedFuelRecordId) {
      results.push({
        entryId,
        status: 'already_linked',
        truckNo: entry.truckNo,
        doNo: entry.doNo,
        liters: entry.liters,
        dispenseLiters: disp,
      });
      continue;
    }

    const fr = sel.fuelRecordId
      ? await FuelRecord.findOne({ _id: sel.fuelRecordId, isDeleted: false, isCancelled: { $ne: true } })
      : null;
    if (!fr) {
      results.push({
        entryId,
        status: 'not_found',
        truckNo: entry.truckNo,
        doNo: entry.doNo,
        liters: entry.liters,
        dispenseLiters: disp,
      });
      if (opts?.requireAll) {
        throw new ApiError(400, `Fuel record not found for truck ${entry.truckNo}`);
      }
      continue;
    }

    const existingValue: number = fr[fuelField] ?? 0;

    if (existingValue > 0 && !sel.topUp) {
      results.push({
        entryId,
        status: 'conflict',
        truckNo: entry.truckNo,
        doNo: fr.goingDo || entry.doNo,
        liters: entry.liters,
        dispenseLiters: disp,
        existingValue,
        fuelRecordId: fr._id.toString(),
      });
      if (opts?.requireAll) {
        throw new ApiError(
          400,
          `Truck ${entry.truckNo}: yard column already has ${existingValue}L — enable top-up`,
        );
      }
      continue;
    }

    entry.linkedFuelRecordId = fr._id.toString();
    if (fr.goingDo) entry.doNo = fr.goingDo;
    if (fr.to) entry.dest = fr.to;
    await applyYardFieldDelta(fr, fuelField, disp, username);
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

  return { results, didApply };
}

async function softDeleteLpo(lpoId: string): Promise<void> {
  await LPOSummary.updateOne({ _id: lpoId }, { isDeleted: true });
}

/**
 * Create a yard LPO on LPOSummary and atomically link fuel when linkSelections are provided.
 * On link failure the new LPO is soft-deleted so callers never see a half-linked document.
 */
export async function createYardLpoWithOptionalLinks(
  yard: YardKind,
  data: Parameters<typeof createYardLpoOnSummary>[1],
  linkSelections?: YardCreateLinkSelection[],
  username?: string,
): Promise<{ lpo: any; lpoNo: string; linkResults: YardBulkLinkResult[] }> {
  const { lpo, lpoNo } = await createYardLpoOnSummary(yard, data);

  if (!linkSelections?.length) {
    return { lpo, lpoNo, linkResults: [] };
  }

  const selections = mapIndexLinkSelections(lpo, linkSelections);
  if (selections.length !== linkSelections.length) {
    await softDeleteLpo(lpo._id.toString());
    throw new ApiError(400, 'Some link selections could not be matched to created entries');
  }

  try {
    const { results } = await applyYardBulkLinksToLpo(lpo, yard, selections, {
      username,
      requireAll: true,
    });
    return { lpo, lpoNo, linkResults: results };
  } catch (err) {
    await softDeleteLpo(lpo._id.toString());
    throw err;
  }
}

/**
 * Apply yard fuel links to an existing LPOSummary yard document (createLPOSummary path).
 * Rolls back the LPO (soft-delete) if any requested link fails.
 */
export async function applyYardLinksOnSummaryCreate(
  lpo: any,
  yard: YardKind,
  linkSelections: YardCreateLinkSelection[],
  username?: string,
): Promise<YardBulkLinkResult[]> {
  if (!linkSelections.length) return [];

  const selections = mapIndexLinkSelections(lpo, linkSelections);
  if (selections.length !== linkSelections.length) {
    await softDeleteLpo(lpo._id.toString());
    throw new ApiError(400, 'Some link selections could not be matched to created entries');
  }

  try {
    const { results } = await applyYardBulkLinksToLpo(lpo, yard, selections, {
      username,
      requireAll: true,
    });
    return results;
  } catch (err) {
    await softDeleteLpo(lpo._id.toString());
    throw err;
  }
}

export function yardKindFromStation(station: string): YardKind | null {
  const s = String(station || '').toLowerCase();
  if (/dar\s*yard/.test(s)) return 'dar';
  if (/tanga\s*yard/.test(s)) return 'tanga';
  return null;
}
