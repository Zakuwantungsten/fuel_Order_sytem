import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as analyticsController from '../controllers/analyticsController';

const router = express.Router();

// All routes require system_admin or super_admin role
router.use(authenticate, authorize('system_admin', 'super_admin'));

// Analytics dashboard
router.get('/dashboard', analyticsController.getDashboardAnalytics);

// Specific reports
router.get('/revenue', analyticsController.getRevenueReport);
router.get('/fuel', analyticsController.getFuelReport);
router.get('/user-activity', analyticsController.getUserActivityReport);
router.get('/system-performance', analyticsController.getSystemPerformance);

// Export
router.post('/export', analyticsController.exportAnalyticsReport);

export default router;
