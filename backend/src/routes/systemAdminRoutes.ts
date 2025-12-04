import { Router } from 'express';
import * as systemAdminController from '../controllers/systemAdminController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication and admin-level access
router.use(authenticate);
router.use(authorize('super_admin', 'system_admin'));

// =====================
// Database Monitoring
// =====================
router.get('/database/metrics', asyncHandler(systemAdminController.getDatabaseMetrics));
router.get('/database/health', asyncHandler(systemAdminController.getDatabaseHealth));

// Enable profiling (Super Admin only)
router.post(
  '/database/profiling',
  authorize('super_admin'),
  asyncHandler(systemAdminController.enableProfiling)
);

// =====================
// Audit Logs
// =====================
router.get('/audit-logs', asyncHandler(systemAdminController.getAuditLogs));
router.get('/audit-logs/summary', asyncHandler(systemAdminController.getActivitySummary));
router.get('/audit-logs/critical', asyncHandler(systemAdminController.getCriticalEvents));

// =====================
// System Statistics
// =====================
router.get('/stats', asyncHandler(systemAdminController.getSystemStats));

// =====================
// Session Management
// =====================
router.get('/sessions/active', asyncHandler(systemAdminController.getActiveSessions));

// Force logout (Super Admin only)
router.post(
  '/sessions/:userId/force-logout',
  authorize('super_admin'),
  asyncHandler(systemAdminController.forceLogout)
);

// =====================
// Activity Feed
// =====================
router.get('/activity-feed', asyncHandler(systemAdminController.getActivityFeed));
router.get('/recent-activity', asyncHandler(systemAdminController.getRecentActivity));

// =====================
// Email Notifications
// =====================
router.get('/email/test-config', asyncHandler(systemAdminController.testEmailConfig));
router.post('/email/send-test', asyncHandler(systemAdminController.sendTestEmail));
router.post('/email/daily-summary', asyncHandler(systemAdminController.sendDailySummary));
router.post('/email/weekly-summary', asyncHandler(systemAdminController.sendWeeklySummary));

export default router;
