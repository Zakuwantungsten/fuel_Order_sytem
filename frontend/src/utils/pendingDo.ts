/**
 * Pending DO helpers (PG#### going / PR#### return).
 * Sequence resets each calendar year on the server.
 */

export type PendingDoKind = 'going' | 'return';

export function isPendingGoingDo(doNumber: string | null | undefined): boolean {
  return /^PG\d{1,4}$/i.test((doNumber || '').trim());
}

export function isPendingReturnDo(doNumber: string | null | undefined): boolean {
  return /^PR\d{1,4}$/i.test((doNumber || '').trim());
}

export function isPendingDo(doNumber: string | null | undefined): boolean {
  return isPendingGoingDo(doNumber) || isPendingReturnDo(doNumber);
}

/** Return DO is missing only when blank/NIL — PR#### pending return counts as present. */
export function isReturnDoMissing(returnDo: string | null | undefined): boolean {
  const v = (returnDo || '').trim();
  return !v || v.toUpperCase() === 'NIL' || v.toUpperCase() === 'N/A';
}

export function pendingDoStatusLabel(record: {
  journeyStatus?: string;
  isPendingGoing?: boolean;
  isPendingReturn?: boolean;
  goingDo?: string;
  returnDo?: string;
}): string | null {
  const status = record.journeyStatus || 'active';
  if (status !== 'active' && status !== 'queued') return null;

  const pendingGoing = record.isPendingGoing === true || isPendingGoingDo(record.goingDo);
  const pendingReturn = record.isPendingReturn === true || isPendingReturnDo(record.returnDo);

  if (pendingGoing && pendingReturn) return 'Active — Going & Return DO pending';
  if (pendingGoing) return 'Active — DO pending';
  if (pendingReturn) return 'Active — Return DO pending';
  return null;
}
