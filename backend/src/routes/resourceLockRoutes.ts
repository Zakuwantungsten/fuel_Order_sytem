import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { acquireResourceLock, releaseResourceLock } from '../controllers/resourceLockController';

const router = Router();

// All resource-lock endpoints require an authenticated user. The key is
// validated against an allowlist in the controller. These are advisory
// mutual-exclusion locks for "one-at-a-time" create flows; the underlying
// create endpoints still enforce their own role checks.
router.use(authenticate);

router.post('/:key/lock', asyncHandler(acquireResourceLock));
router.delete('/:key/lock', asyncHandler(releaseResourceLock));

export default router;
