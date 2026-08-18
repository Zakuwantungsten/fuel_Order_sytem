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

export function isPendingGoingRecord(record: {
  isPendingGoing?: boolean;
  goingDo?: string;
} | null | undefined): boolean {
  if (!record) return false;
  return record.isPendingGoing === true || isPendingGoingDo(record.goingDo);
}

/**
 * Show "Create pending going DO" when lookup failed, journey is done, or the truck
 * has only an active (non-pending) journey — so the next trip can be queued in-form.
 */
export function shouldOfferPendingGoingCreate(opts: {
  warningType?: string | null;
  active?: { isPendingGoing?: boolean; goingDo?: string } | null;
  queued?: Array<{ isPendingGoing?: boolean; goingDo?: string }>;
}): boolean {
  const warning = opts.warningType;
  if (warning === 'not_found' || warning === 'no_active_record' || warning === 'journey_completed') {
    return true;
  }
  if ((opts.queued || []).length > 0) return false;
  if (!opts.active) return false;
  return !isPendingGoingRecord(opts.active);
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
  const pendingGoing = record.isPendingGoing === true || isPendingGoingDo(record.goingDo);
  const pendingReturn = record.isPendingReturn === true || isPendingReturnDo(record.returnDo);

  if (status === 'completed') {
    if (pendingGoing && pendingReturn) return 'Completed — Going & Return DO pending';
    if (pendingGoing) return 'Completed — DO pending';
    if (pendingReturn) return 'Completed — Return DO pending';
    return null;
  }

  if (status !== 'active' && status !== 'queued') return null;

  if (pendingGoing && pendingReturn) return 'Active — Going & Return DO pending';
  if (pendingGoing) return 'Active — DO pending';
  if (pendingReturn) return 'Active — Return DO pending';
  return null;
}
