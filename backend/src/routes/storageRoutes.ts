import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as storageController from '../controllers/storageController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/info', asyncHandler(storageController.getStorageInfo));
router.delete('/purge-temp', asyncHandler(storageController.purgeTempFiles));

export default router;
