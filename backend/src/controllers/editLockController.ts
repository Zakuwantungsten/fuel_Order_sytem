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
} from '../services/lockService';
import logger from '../utils/logger';

/**
 * Verify the current user holds a valid (non-expired) edit lock on the given
 * record. Call this at the top of any update handler to enforce the lock.
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
): Promise<void> {
  const record = await model.findById(recordId).select('_id').lean();
  if (!record) return; // Let the update handler handle 404
  await enforceLockRecord(collection, recordId, username);
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

    // The record must exist (and not be soft-deleted) to be lockable.
    const record = await model.findOne({ _id: id, isDeleted: false }).select('_id').lean();
    if (!record) throw new ApiError(404, 'Record not found');

    const lockedByName = await getDisplayName(username);
    const lock = await acquireLockRecord(collection, id, username, lockedByName);

    logger.info(`Edit lock acquired on ${collection}/${id} by ${username} until ${lock.lockedUntil.toISOString()}`);
    emitLockChange(collection, id, {
      lockedBy: lock.lockedBy,
      lockedByName: lock.lockedByName,
      lockedUntil: lock.lockedUntil,
    });

    res.json({
      success: true,
      message: 'Lock acquired',
      data: { lockedUntil: lock.lockedUntil },
    });
  };

  const releaseEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const released = await releaseLockRecord(collection, id, username);
    if (released) {
      logger.info(`Edit lock released on ${collection}/${id} by ${username}`);
      emitLockChange(collection, id, null);
    }

    res.json({ success: true, message: 'Lock released' });
  };

  return { acquireEditLock, releaseEditLock };
}
