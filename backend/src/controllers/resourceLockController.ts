import { Response } from 'express';
import { ApiError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { acquireLock, releaseLock, getDisplayName } from '../services/lockService';
import logger from '../utils/logger';

/**
 * Named "resource" locks — mutual exclusion over an *operation* rather than a
 * specific document. Used to enforce "only one at a time" flows that don't yet
 * have a record to lock (e.g. creating DOs, building a new LPO in the detail
 * form). Backed by the same `EditLock` collection (with a synthetic documentId)
 * and the same 5-minute TTL, so abandoned locks self-clear.
 *
 * Unlike per-document edit locks these are NOT broadcast: there's no row badge to
 * update, and broadcasting could only cause needless client work.
 */
const RESOURCE_LOCK_COLLECTION = 'resource_lock';

/**
 * Allowlist of permitted resource keys. Validating here keeps the EditLock
 * collection from being polluted with arbitrary client-supplied keys.
 */
const ALLOWED_RESOURCE_KEYS = new Set<string>([
  'do_create',   // one DO creation (single or bulk) at a time
  'lpo_create',  // one user in the LPO detail form at a time
]);

export const acquireResourceLock = async (req: AuthRequest, res: Response): Promise<void> => {
  const { key } = req.params;
  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');
  if (!ALLOWED_RESOURCE_KEYS.has(key)) throw new ApiError(400, 'Unknown resource lock');

  const lockedByName = await getDisplayName(username);
  const lock = await acquireLock(RESOURCE_LOCK_COLLECTION, key, username, lockedByName);

  logger.info(`Resource lock acquired on ${key} by ${username} until ${lock.lockedUntil.toISOString()}`);
  res.json({
    success: true,
    message: 'Lock acquired',
    data: { lockedUntil: lock.lockedUntil },
  });
};

export const releaseResourceLock = async (req: AuthRequest, res: Response): Promise<void> => {
  const { key } = req.params;
  const username = req.user?.username;
  if (!username) throw new ApiError(401, 'Authentication required');
  if (!ALLOWED_RESOURCE_KEYS.has(key)) throw new ApiError(400, 'Unknown resource lock');

  await releaseLock(RESOURCE_LOCK_COLLECTION, key, username);
  res.json({ success: true, message: 'Lock released' });
};
