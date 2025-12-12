import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { body, param } from 'express-validator';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication and admin-level access
router.use(authenticate);
router.use(authorize('super_admin', 'admin', 'boss'));

// =====================
// Dashboard Stats
// =====================
router.get('/stats', asyncHandler(adminController.getAdminStats));

// =====================
// Fuel Stations
// =====================
router.get('/fuel-stations', asyncHandler(adminController.getFuelStations));

router.post(
  '/fuel-stations',
  [
    body('id').notEmpty().withMessage('Station ID is required'),
    body('name').notEmpty().withMessage('Station name is required'),
    body('location').notEmpty().withMessage('Location is required'),
    body('pricePerLiter').isNumeric().withMessage('Price per liter must be a number'),
  ],
  validate,
  asyncHandler(adminController.addFuelStation)
);

router.put(
  '/fuel-stations/:stationId',
  [
    param('stationId').notEmpty().withMessage('Station ID is required'),
    body('pricePerLiter').optional().isNumeric().withMessage('Price per liter must be a number'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  asyncHandler(adminController.updateFuelStation)
);

router.put(
  '/fuel-stations/bulk-update/rates',
  [
    body('updates').isArray().withMessage('Updates must be an array'),
    body('updates.*.stationId').notEmpty().withMessage('Station ID is required'),
    body('updates.*.pricePerLiter').isNumeric().withMessage('Price per liter must be a number'),
  ],
  validate,
  asyncHandler(adminController.bulkUpdateStationRates)
);

// =====================
// Routes Configuration
// =====================
router.get('/routes', asyncHandler(adminController.getRoutes));

router.post(
  '/routes',
  [
    body('destination').notEmpty().withMessage('Destination is required'),
    body('totalLiters').isNumeric().withMessage('Total liters must be a number'),
  ],
  validate,
  asyncHandler(adminController.addRoute)
);

router.put(
  '/routes/:destination',
  [
    param('destination').notEmpty().withMessage('Destination is required'),
    body('totalLiters').optional().isNumeric().withMessage('Total liters must be a number'),
    body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  ],
  validate,
  asyncHandler(adminController.updateRoute)
);

router.delete(
  '/routes/:destination',
  [param('destination').notEmpty().withMessage('Destination is required')],
  validate,
  asyncHandler(adminController.deleteRoute)
);

// =====================
// Truck Batches
// =====================
router.get('/truck-batches', asyncHandler(adminController.getTruckBatches));

router.post(
  '/truck-batches',
  [
    body('truckSuffix').notEmpty().withMessage('Truck suffix is required'),
    body('extraLiters').isIn([60, 80, 100]).withMessage('Extra liters must be 60, 80, or 100'),
    body('truckNumber').optional().isString(),
  ],
  validate,
  asyncHandler(adminController.addTruckToBatch)
);

router.delete(
  '/truck-batches/:truckSuffix',
  [param('truckSuffix').notEmpty().withMessage('Truck suffix is required')],
  validate,
  asyncHandler(adminController.removeTruckFromBatch)
);

// =====================
// Standard Allocations
// =====================
router.get('/standard-allocations', asyncHandler(adminController.getStandardAllocations));

router.put(
  '/standard-allocations',
  [
    body('tangaYardToDar').optional().isNumeric(),
    body('darYardStandard').optional().isNumeric(),
    body('darYardKisarawe').optional().isNumeric(),
    body('mbeyaGoing').optional().isNumeric(),
    body('tundumaReturn').optional().isNumeric(),
    body('mbeyaReturn').optional().isNumeric(),
    body('moroReturnToMombasa').optional().isNumeric(),
    body('tangaReturnToMombasa').optional().isNumeric(),
  ],
  validate,
  asyncHandler(adminController.updateStandardAllocations)
);

// =====================
// Combined Config
// =====================
router.get('/config', asyncHandler(adminController.getAllConfig));

router.post(
  '/config/reset/:configType',
  [
    param('configType')
      .isIn(['fuel_stations', 'routes', 'truck_batches', 'standard_allocations', 'all'])
      .withMessage('Invalid configuration type'),
  ],
  validate,
  asyncHandler(adminController.resetConfig)
);

// =====================
// System Admin Features (Super Admin only)
// =====================

// Database Monitoring
router.get('/database/metrics', authorize('super_admin'), asyncHandler(adminController.getDatabaseMetrics));
router.get('/database/health', authorize('super_admin'), asyncHandler(adminController.getDatabaseHealth));
router.post('/database/profiling', authorize('super_admin'), asyncHandler(adminController.enableProfiling));

// Audit Logs
router.get('/audit-logs', authorize('super_admin'), asyncHandler(adminController.getAuditLogs));
router.get('/audit-logs/summary', authorize('super_admin'), asyncHandler(adminController.getActivitySummary));
router.get('/audit-logs/critical', authorize('super_admin'), asyncHandler(adminController.getCriticalEvents));

// System Statistics
router.get('/system-stats', authorize('super_admin'), asyncHandler(adminController.getSystemStats));

// Session Management
router.get('/sessions/active', authorize('super_admin'), asyncHandler(adminController.getActiveSessions));
router.post('/sessions/:userId/force-logout', authorize('super_admin'), asyncHandler(adminController.forceLogout));

// Activity Feed
router.get('/activity-feed', authorize('super_admin'), asyncHandler(adminController.getActivityFeed));
router.get('/recent-activity', authorize('super_admin'), asyncHandler(adminController.getRecentActivity));

// Email Notifications
router.get('/email/test-config', authorize('super_admin'), asyncHandler(adminController.testEmailConfig));
router.post('/email/send-test', authorize('super_admin'), asyncHandler(adminController.sendTestEmail));
router.post('/email/daily-summary', authorize('super_admin'), asyncHandler(adminController.sendDailySummary));
router.post('/email/weekly-summary', authorize('super_admin'), asyncHandler(adminController.sendWeeklySummary));

// System Settings
router.get('/system-settings', authorize('super_admin'), asyncHandler(adminController.getSystemSettings));
router.put('/system-settings', authorize('super_admin'), asyncHandler(adminController.updateSystemSettings));
router.post('/maintenance-mode/toggle', authorize('super_admin'), asyncHandler(adminController.toggleMaintenanceMode));
router.get('/maintenance-mode/status', asyncHandler(adminController.getMaintenanceStatus)); // Public endpoint

// Security Settings
router.put('/security-settings', authorize('super_admin'), asyncHandler(adminController.updateSecuritySettings));

export default router;
