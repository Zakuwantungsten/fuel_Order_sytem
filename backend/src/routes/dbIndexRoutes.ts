import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as dbIndexController from '../controllers/dbIndexController';

const router = Router();
router.use(authenticate, authorize('super_admin'));
router.get('/', asyncHandler(dbIndexController.listIndexes));

export default router;
