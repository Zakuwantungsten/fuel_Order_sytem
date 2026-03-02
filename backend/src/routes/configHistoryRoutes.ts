import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as configHistoryController from '../controllers/configHistoryController';

const router = Router();
router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(configHistoryController.listSnapshots));
router.get('/:id', asyncHandler(configHistoryController.getSnapshot));
router.post('/snapshot', asyncHandler(configHistoryController.takeSnapshot));

export default router;
