import { Router } from 'express';
import { dashboardController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Dashboard routes
router.get('/stats', asyncHandler(dashboardController.getDashboardStats));
router.get('/monthly-stats', asyncHandler(dashboardController.getMonthlyStats));
router.get('/reports', asyncHandler(dashboardController.getReportStats));
router.get('/chart-data', asyncHandler(dashboardController.getChartData));
router.get('/journey-queue', asyncHandler(dashboardController.getJourneyQueueStats));
router.get('/health', asyncHandler(dashboardController.healthCheck));

export default router;
