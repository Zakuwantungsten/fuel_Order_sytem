/**
 * Pending DO number helpers.
 * Going:  PG0001, PG0002, …  (resets to PG0001 each calendar year)
 * Return: PR0001, PR0002, …  (resets to PR0001 each calendar year)
 */

export type PendingDoKind = 'going' | 'return';

const GOING_PREFIX = 'PG';
const RETURN_PREFIX = 'PR';

export function formatPendingDoNumber(kind: PendingDoKind, sequentialNumber: number): string {
  const prefix = kind === 'going' ? GOING_PREFIX : RETURN_PREFIX;
  const padded = Math.max(1, sequentialNumber).toString().padStart(4, '0');
  return `${prefix}${padded}`;
}

export function parsePendingDoNumber(
  doNumber: string | null | undefined
): { kind: PendingDoKind; sequentialNumber: number } | null {
  if (!doNumber) return null;
  const match = doNumber.trim().toUpperCase().match(/^(PG|PR)(\d{1,4})$/);
  if (!match) return null;
  return {
    kind: match[1] === 'PG' ? 'going' : 'return',
    sequentialNumber: parseInt(match[2], 10),
  };
}

export function isPendingGoingDo(doNumber: string | null | undefined): boolean {
  const parsed = parsePendingDoNumber(doNumber);
  return parsed?.kind === 'going';
}

export function isPendingReturnDo(doNumber: string | null | undefined): boolean {
  const parsed = parsePendingDoNumber(doNumber);
  return parsed?.kind === 'return';
}

export function isPendingDo(doNumber: string | null | undefined): boolean {
  return parsePendingDoNumber(doNumber) !== null;
}

/** True when returnDo is empty OR still a pending PR#### placeholder. */
export function isReturnDoOpen(returnDo: string | null | undefined, isPendingReturn?: boolean): boolean {
  if (isPendingReturn === true) return true;
  const v = (returnDo || '').trim();
  if (!v) return true;
  return isPendingReturnDo(v);
}

/** Mongo filter fragment: returnDo empty OR still a pending return (PR####). */
export function returnDoOpenFilter(): Record<string, unknown> {
  return {
    $or: [
      { returnDo: { $exists: false } },
      { returnDo: null },
      { returnDo: '' },
      { isPendingReturn: true },
      { returnDo: { $regex: /^PR\d{1,4}$/i } },
    ],
  };
}

export function pendingDoCounterKey(kind: PendingDoKind, year?: number): string {
  const y = year ?? new Date().getFullYear();
  return kind === 'going' ? `pendingGoingDo_${y}` : `pendingReturnDo_${y}`;
}

export type ExportFuelCandidateLike = {
  _id?: unknown;
  date?: string | null;
  journeyStatus?: string | null;
  queueOrder?: number | null;
  returnDo?: string | null;
  isPendingReturn?: boolean | null;
};

function hasPendingReturnFlag(r: ExportFuelCandidateLike): boolean {
  return r.isPendingReturn === true || isPendingReturnDo(r.returnDo);
}

function journeyStatusRank(status: string | null | undefined): number {
  if (status === 'active') return 0;
  if (status === 'queued') return 1;
  return 2;
}

/**
 * Sort comparator for EXPORT auto-link among active open-return candidates.
 * Priority: pending PR first → newest date (same as historic date:-1 + PR prefer).
 */
export function compareExportFuelCandidates(a: ExportFuelCandidateLike, b: ExportFuelCandidateLike): number {
  const aPending = hasPendingReturnFlag(a) ? 0 : 1;
  const bPending = hasPendingReturnFlag(b) ? 0 : 1;
  if (aPending !== bPending) return aPending - bPending;

  const aDate = String(a.date || '');
  const bDate = String(b.date || '');
  if (aDate !== bDate) return aDate > bDate ? -1 : 1; // newer first

  return (a.queueOrder || 0) - (b.queueOrder || 0);
}

/** Pick the best active open-return fuel record for EXPORT create auto-link. */
export function pickBestExportFuelMatch<T extends ExportFuelCandidateLike>(records: T[]): T | null {
  if (!records.length) return null;
  return [...records].sort(compareExportFuelCandidates)[0];
}

/**
 * Sort comparator when attaching a new pending return (PR) to a truck journey.
 * Prefer active → queued (by queueOrder) → others; then oldest date.
 */
export function comparePendingReturnTargets(a: ExportFuelCandidateLike, b: ExportFuelCandidateLike): number {
  const aStatus = journeyStatusRank(a.journeyStatus);
  const bStatus = journeyStatusRank(b.journeyStatus);
  if (aStatus !== bStatus) return aStatus - bStatus;

  if (a.journeyStatus === 'queued' || b.journeyStatus === 'queued') {
    const q = (a.queueOrder || 0) - (b.queueOrder || 0);
    if (q !== 0) return q;
  }

  const aDate = String(a.date || '');
  const bDate = String(b.date || '');
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  return 0;
}

export function pickBestPendingReturnTarget<T extends ExportFuelCandidateLike>(records: T[]): T | null {
  if (!records.length) return null;
  return [...records].sort(comparePendingReturnTargets)[0];
}
