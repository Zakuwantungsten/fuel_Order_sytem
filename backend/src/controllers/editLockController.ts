import { Response } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { emitLockChange } from '../services/websocket';
import {
  acquireLock as acquireLockRecord,
  releaseLock as releaseLockRecord,
  enforceLock as enforceLockRecord,
  getDisplayName,
  makeEntryLockId,
} from '../services/lockService';
import logger from '../utils/logger';
import { findYardLpoById, getYardMeta, type YardKind } from '../services/yardUnifiedLpoService';

function resolveLockDocumentId(recordId: string, entryId?: string | null): string {
  const eid = entryId != null ? String(entryId).trim() : '';
  return eid ? makeEntryLockId(recordId, eid) : recordId;
}

function readEntryId(req: AuthRequest): string | undefined {
  const fromBody = (req.body as any)?.entryId;
  const fromQuery = (req.query as any)?.entryId;
  const raw = fromBody ?? fromQuery;
  if (raw == null || raw === '') return undefined;
  return String(raw);
}

/**
 * Verify the current user holds a valid (non-expired) edit lock on the given
 * record (or a specific entry under it). Call this at the top of any update
 * handler to enforce the lock.
 *
 * Locks live in the dedicated `EditLock` collection (keyed by collection name +
 * document id), NOT on the domain document — so enforcing or taking a lock never
 * mutates the guarded record.
 *
 * Throws 423 if another user holds the lock, 409 if no lock was acquired at all.
 */
export async function enforceEditLock(
  model: mongoose.Model<any>,
  recordId: string,
  username: string,
  collection: string,
  entryId?: string | null,
): Promise<void> {
  const record = await model.findById(recordId).select('_id').lean();
  if (!record) return; // Let the update handler handle 404
  await enforceLockRecord(collection, resolveLockDocumentId(recordId, entryId), username);
}

/**
 * Generic acquire/release edit lock for any domain model.
 *
 * Locks are stored in the shared `EditLock` collection rather than on the model,
 * keyed by (collection, documentId). Acquiring/releasing therefore never writes
 * to the domain document and never triggers a `data_changed` broadcast, so other
 * clients are not forced to refetch when someone simply opens an edit form. A
 * lightweight `lock_changed` event is emitted instead so the "Editing: …" badge
 * updates in place.
 *
 * Optional `entryId` (body on POST, query on DELETE) scopes the lock to one
 * truck/entry under the parent document so multiple users can edit different
 * entries on the same LPO concurrently.
 *
 * @param model      The domain model (used only to verify the record exists).
 * @param collection Stable key namespacing locks for this model's documents.
 */
export function createEditLockHandlers(
  model: mongoose.Model<any>,
  collection: string,
) {
  const acquireEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const entryId = readEntryId(req);

    // The record must exist (and not be soft-deleted) to be lockable.
    const record = await model.findOne({ _id: id, isDeleted: false })
      .select(entryId ? '_id entries._id' : '_id')
      .lean();
    if (!record) throw new ApiError(404, 'Record not found');

    if (entryId) {
      const entries = (record as any).entries as Array<{ _id?: any }> | undefined;
      const found = Array.isArray(entries)
        && entries.some((e) => String(e?._id) === entryId);
      if (!found) throw new ApiError(404, 'Entry not found on this record');
    }

    const lockDocId = resolveLockDocumentId(id, entryId);
    const lockedByName = await getDisplayName(username);
    const lock = await acquireLockRecord(collection, lockDocId, username, lockedByName);

    logger.info(`Edit lock acquired on ${collection}/${lockDocId} by ${username} until ${lock.lockedUntil.toISOString()}`);
    emitLockChange(collection, lockDocId, {
      lockedBy: lock.lockedBy,
      lockedByName: lock.lockedByName,
      lockedUntil: lock.lockedUntil,
    });

    res.json({
      success: true,
      message: 'Lock acquired',
      data: { lockedUntil: lock.lockedUntil, entryId: entryId || null },
    });
  };

  const releaseEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const entryId = readEntryId(req);
    const lockDocId = resolveLockDocumentId(id, entryId);

    const released = await releaseLockRecord(collection, lockDocId, username);
    if (released) {
      logger.info(`Edit lock released on ${collection}/${lockDocId} by ${username}`);
      emitLockChange(collection, lockDocId, null);
    }

    res.json({ success: true, message: 'Lock released' });
  };

  return { acquireEditLock, releaseEditLock };
}

/**
 * Edit locks for yard LPO tabs that read from both legacy yard documents and
 * LPOSummary (dual-read). Resolves the backing collection via findYardLpoById.
 */
export function createYardLpoEditLockHandlers(yard: YardKind) {
  const meta = getYardMeta(yard);

  const acquireEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const resolved = await findYardLpoById(yard, id);
    if (!resolved) throw new ApiError(404, 'Record not found');

    const entryId = readEntryId(req);
    if (entryId) {
      const entries = (resolved.doc as any).entries as Array<{ _id?: any }> | undefined;
      const found = Array.isArray(entries)
        && entries.some((e) => String(e?._id) === entryId);
      if (!found) throw new ApiError(404, 'Entry not found on this record');
    }

    const collection = resolved.emitKey;
    const lockDocId = resolveLockDocumentId(id, entryId);
    const lockedByName = await getDisplayName(username);
    const lock = await acquireLockRecord(collection, lockDocId, username, lockedByName);

    logger.info(
      `Edit lock acquired on ${collection}/${lockDocId} by ${username} until ${lock.lockedUntil.toISOString()}`
    );
    emitLockChange(collection, lockDocId, {
      lockedBy: lock.lockedBy,
      lockedByName: lock.lockedByName,
      lockedUntil: lock.lockedUntil,
    });

    res.json({
      success: true,
      message: 'Lock acquired',
      data: { lockedUntil: lock.lockedUntil, entryId: entryId || null },
    });
  };

  const releaseEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const entryId = readEntryId(req);
    const lockDocId = resolveLockDocumentId(id, entryId);

    const resolved = await findYardLpoById(yard, id);
    const collections: string[] = resolved
      ? [resolved.emitKey]
      : [meta.legacyEmit, 'lpo_summaries'];

    let released = false;
    for (const collection of collections) {
      if (await releaseLockRecord(collection, lockDocId, username)) {
        released = true;
        logger.info(`Edit lock released on ${collection}/${lockDocId} by ${username}`);
        emitLockChange(collection, lockDocId, null);
      }
    }

    res.json({ success: true, message: 'Lock released' });
  };

  return { acquireEditLock, releaseEditLock };
}
