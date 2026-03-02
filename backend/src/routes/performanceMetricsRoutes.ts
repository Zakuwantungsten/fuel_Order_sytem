import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as performanceMetricsController from '../controllers/performanceMetricsController';

const router = Router();
router.use(authenticate, authorize('super_admin'));
router.get('/', asyncHandler(performanceMetricsController.getPerformanceMetrics));

export default router;
