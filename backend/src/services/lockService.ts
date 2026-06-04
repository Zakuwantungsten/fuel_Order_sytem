import { ApiError } from '../middleware/errorHandler';
import { EditLock, User } from '../models';

/**
 * Shared edit-lock primitives operating on the dedicated `EditLock` collection.
 *
 * A lock is identified by (collectionName, documentId). For per-document edit
 * locks `documentId` is the record's id; for named "resource" locks (e.g. only
 * one DO-creation at a time) `documentId` is a synthetic key. These functions are
 * pure lock mechanics — broadcasting (the "Editing: …" badge) is the caller's job,
 * so resource locks can stay silent.
 */

export const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve a friendly display name for a username ("First Last"), falling back to
 * the raw username.
 */
export async function getDisplayName(username: string): Promise<string> {
  try {
    const user = await User.findOne({ username }).select('firstName lastName').lean();
    if (user && user.firstName) {
      return `${user.firstName} ${user.lastName || ''}`.trim();
    }
  } catch { /* fall through */ }
  return username;
}

function isDuplicateKeyError(err: any): boolean {
  return err && (err.code === 11000 || err.code === 11001);
}

export interface AcquiredLock {
  lockedBy: string;
  lockedByName: string;
  lockedUntil: Date;
}

/**
 * Acquire (or re-acquire / steal-if-expired) a lock. Throws 423 when a live lock
 * is held by a different user.
 */
export async function acquireLock(
  collectionName: string,
  documentId: string,
  username: string,
  lockedByName: string,
): Promise<AcquiredLock> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCK_TTL_MS);

  try {
    // Match when the lock is free to take (ours already, or expired). upsert
    // creates the lock when none exists; a live lock held by someone else won't
    // match, so the upsert attempts an insert that violates the unique
    // (collection, document) index → caught below as "locked".
    const lock = await EditLock.findOneAndUpdate(
      {
        collectionName,
        documentId,
        $or: [
          { lockedBy: username },
          { lockedUntil: { $lt: now } },
        ],
      },
      {
        collectionName,
        documentId,
        lockedBy: username,
        lockedByName,
        lockedAt: now,
        lockedUntil: lockUntil,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    return { lockedBy: username, lockedByName, lockedUntil: lock.lockedUntil };
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      const current = await EditLock.findOne({ collectionName, documentId }).lean();
      const holderName = current?.lockedByName
        || (current?.lockedBy ? await getDisplayName(current.lockedBy) : 'another user');
      throw new ApiError(423, `Record is being edited by ${holderName}`)
        .withData({ editLock: { lockedByName: holderName } });
    }
    throw err;
  }
}

/**
 * Release a lock the caller owns. Returns true if a lock was removed, false if
 * there was nothing to release (idempotent). Throws 403 if a live lock is held by
 * someone else.
 */
export async function releaseLock(
  collectionName: string,
  documentId: string,
  username: string,
): Promise<boolean> {
  const deleted = await EditLock.findOneAndDelete({ collectionName, documentId, lockedBy: username });
  if (deleted) return true;

  const existing = await EditLock.findOne({ collectionName, documentId }).lean();
  if (existing) {
    throw new ApiError(403, 'You do not hold the lock on this record');
  }
  return false;
}

/**
 * Attach a live `editLock` field to each record in a list, looked up from the
 * EditLock collection in a single query. Used to power the "Editing: …" badge on
 * freshly-loaded lists (real-time updates arrive separately via `lock_changed`).
 * Mutates and returns the same array. Records with no live lock get `editLock: null`.
 */
export async function attachLocks<T extends Record<string, any>>(
  collectionName: string,
  records: T[],
): Promise<T[]> {
  if (!records || records.length === 0) return records;
  const idOf = (r: any) => String(r._id ?? r.id ?? '');
  const ids = records.map(idOf).filter(Boolean);
  if (ids.length === 0) return records;

  const now = new Date();
  const locks = await EditLock.find({
    collectionName,
    documentId: { $in: ids },
    lockedUntil: { $gt: now },
  }).lean();
  const byId = new Map(locks.map(l => [l.documentId, l]));

  for (const r of records) {
    const lock = byId.get(idOf(r));
    (r as any).editLock = lock
      ? { lockedBy: lock.lockedBy, lockedByName: lock.lockedByName, lockedUntil: lock.lockedUntil }
      : null;
  }
  return records;
}

/**
 * Enforce that the caller holds a valid lock. Throws 409 if no/expired lock,
 * 423 if held by another user.
 */
export async function enforceLock(
  collectionName: string,
  documentId: string,
  username: string,
): Promise<void> {
  const lock = await EditLock.findOne({ collectionName, documentId }).lean();
  if (!lock) {
    throw new ApiError(409, 'You must acquire an edit lock before saving changes.');
  }

  const now = new Date();
  if (lock.lockedUntil && new Date(lock.lockedUntil) <= now) {
    throw new ApiError(409, 'Your edit lock has expired. Please re-acquire the lock and try again.');
  }

  if (lock.lockedBy !== username) {
    const holderName = lock.lockedByName || (await getDisplayName(lock.lockedBy));
    throw new ApiError(423, `Record is being edited by ${holderName}`)
      .withData({ editLock: { lockedByName: holderName } });
  }
}
