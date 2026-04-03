import { Response } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { emitDataChange } from '../services/websocket';
import logger from '../utils/logger';

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
      const holder = (current as any)?.editLock?.lockedBy || 'another user';
      throw new ApiError(423, `Record is being edited by ${holder}`).withData({
        editLock: (current as any)?.editLock,
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
