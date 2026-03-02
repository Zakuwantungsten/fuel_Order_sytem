import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { getActivityHeatmap } from '../controllers/activityHeatmapController';

const router = Router();
router.use(authenticate, authorize('super_admin'));
router.get('/', asyncHandler(getActivityHeatmap));

export default router;
