import { Router } from 'express';
import { lpoSummaryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { exportRateLimiter } from '../middleware/rateLimiters';
import { lpoSummaryValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Workbook routes (must be before /:id routes to avoid conflicts)
// manager and super_manager have read access to workbooks
router.get('/workbooks', asyncHandler(lpoSummaryController.getAllWorkbooks));
router.get('/workbooks/years', asyncHandler(lpoSummaryController.getAvailableYears));
router.get('/workbooks/:year', asyncHandler(lpoSummaryController.getWorkbookByYear));
router.get('/workbooks/:year/export', exportRateLimiter, authorize('super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'fuel_order_maker', 'boss'), asyncHandler(lpoSummaryController.exportWorkbook));

// Get routes - all authenticated users can read
router.get('/next-number', asyncHandler(lpoSummaryController.getNextLPONumber));
router.get('/find-at-checkpoint', asyncHandler(lpoSummaryController.findLPOsAtCheckpoint));
router.get('/check-duplicate', asyncHandler(lpoSummaryController.checkDuplicateAllocation));
router.get('/driver-entries/:truckNo', asyncHandler(lpoSummaryController.getDriverLPOEntries));
router.get('/', commonValidation.pagination, validate, asyncHandler(lpoSummaryController.getAllLPOSummaries));
router.get('/lpo/:lpoNo', asyncHandler(lpoSummaryController.getLPOSummaryByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(lpoSummaryController.getLPOSummaryById));

// Create route - per frontend LPOS CREATE permissions
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss'),
  lpoSummaryValidation.create,
  validate,
  asyncHandler(lpoSummaryController.createLPOSummary)
);

// Cancel truck in LPO route - UPDATE-level action per frontend LPOS permissions
router.post(
  '/cancel-truck',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.cancelTruckInLPO)
);

// Forward LPO to another station route - UPDATE-level action per frontend LPOS permissions
router.post(
  '/forward',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.forwardLPO)
);

// Update route - per frontend LPOS UPDATE permissions
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  validate,
  asyncHandler(lpoSummaryController.updateLPOSummary)
);

// Delete route - per frontend LPOS DELETE permissions (super_admin, admin, boss only)
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'boss'),
  validate,
  asyncHandler(lpoSummaryController.deleteLPOSummary)
);

// Legacy workbook sheet management routes (backward compatibility)
router.post(
  '/:workbookId/sheets',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  validate,
  asyncHandler(lpoSummaryController.addSheetToWorkbook)
);

router.put(
  '/:workbookId/sheets/:sheetId',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  validate,
  asyncHandler(lpoSummaryController.updateSheetInWorkbook)
);

router.delete(
  '/:workbookId/sheets/:sheetId',
  authorize('super_admin', 'admin', 'boss'),
  validate,
  asyncHandler(lpoSummaryController.deleteSheetFromWorkbook)
);

export default router;
