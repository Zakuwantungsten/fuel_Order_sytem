import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as bulkUserController from '../controllers/bulkUserController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(bulkUserController.listUsers));
router.post('/bulk-action', asyncHandler(bulkUserController.bulkAction));

export default router;
