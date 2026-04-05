import { Response } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { emitDataChange } from '../services/websocket';
import { User } from '../models';
import logger from '../utils/logger';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Look up the display name for a username.
 * Returns "firstName lastName" when available, otherwise the raw username.
 */
async function getDisplayName(username: string): Promise<string> {
  try {
    const user = await User.findOne({ username }).select('firstName lastName').lean();
    if (user && user.firstName) {
      return `${user.firstName} ${user.lastName || ''}`.trim();
    }
  } catch { /* fall through */ }
  return username;
}

/**
 * Verify the current user holds a valid (non-expired) edit lock on the given
 * record.  Call this at the top of any update handler to enforce the lock.
 *
 * Throws 423 if another user holds the lock, 409 if no lock was acquired at all.
 */
export async function enforceEditLock(
  model: mongoose.Model<any>,
  recordId: string,
  username: string,
): Promise<void> {
  const record = await model.findById(recordId).select('editLock').lean();
  if (!record) return; // Let the update handler handle 404

  const lock = (record as any).editLock;
  if (!lock?.lockedBy) {
    // No lock held — reject; the client must acquire a lock first
    throw new ApiError(409, 'You must acquire an edit lock before saving changes.');
  }

  const now = new Date();
  const lockedUntil = lock.lockedUntil ? new Date(lock.lockedUntil) : null;

  if (lockedUntil && lockedUntil <= now) {
    // Lock expired — treat as unlocked
    throw new ApiError(409, 'Your edit lock has expired. Please re-acquire the lock and try again.');
  }

  if (lock.lockedBy !== username) {
    const holderName = await getDisplayName(lock.lockedBy);
    throw new ApiError(423, `Record is being edited by ${holderName}`).withData({ editLock: lock });
  }
  // Lock is valid and belongs to the caller — proceed
}

/**
 * Generic acquire/release edit lock for any Mongoose model that has an `editLock` subdocument.
 * Returns controller handler functions for a given model + collection name.
 */
export function createEditLockHandlers(
  model: mongoose.Model<any>,
  collection: string,
) {
  const acquireEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const now = new Date();
    const lockUntil = new Date(now.getTime() + LOCK_TTL_MS);

    const record = await model.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        $or: [
          { 'editLock.lockedBy': null },
          { 'editLock.lockedBy': username },        // re-acquiring own lock
          { 'editLock.lockedUntil': { $lt: now } }, // expired lock
        ],
      },
      {
        'editLock.lockedBy': username,
        'editLock.lockedAt': now,
        'editLock.lockedUntil': lockUntil,
      },
      { new: true },
    );

    if (!record) {
      const current = await model.findById(id).select('editLock').lean();
      const holderUsername = (current as any)?.editLock?.lockedBy || 'another user';
      const holderName = await getDisplayName(holderUsername);
      throw new ApiError(423, `Record is being edited by ${holderName}`).withData({
        editLock: { ...(current as any)?.editLock, lockedByName: holderName },
      });
    }

    logger.info(`Edit lock acquired on ${collection}/${id} by ${username} until ${lockUntil.toISOString()}`);
    emitDataChange(collection, 'update', record.toObject());

    res.json({
      success: true,
      message: 'Lock acquired',
      data: { lockedUntil: lockUntil },
    });
  };

  const releaseEditLock = async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const username = req.user?.username;
    if (!username) throw new ApiError(401, 'Authentication required');

    const record = await model.findOneAndUpdate(
      {
        _id: id,
        isDeleted: false,
        $or: [
          { 'editLock.lockedBy': username },        // owner releases
          { 'editLock.lockedBy': null },            // already unlocked
        ],
      },
      {
        'editLock.lockedBy': null,
        'editLock.lockedAt': null,
        'editLock.lockedUntil': null,
      },
      { new: true },
    );

    if (!record) {
      // If the lock is held by someone else, an admin-level override could be added here
      throw new ApiError(403, 'You do not hold the lock on this record');
    }

    logger.info(`Edit lock released on ${collection}/${id} by ${username}`);
    emitDataChange(collection, 'update', record.toObject());

    res.json({ success: true, message: 'Lock released' });
  };

  return { acquireEditLock, releaseEditLock };
}
