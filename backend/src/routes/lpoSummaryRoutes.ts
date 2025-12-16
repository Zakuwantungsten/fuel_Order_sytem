import { Router } from 'express';
import { lpoSummaryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
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
router.get('/workbooks/:year/export', asyncHandler(lpoSummaryController.exportWorkbook));

// Get routes - all authenticated users can read
router.get('/next-number', asyncHandler(lpoSummaryController.getNextLPONumber));
router.get('/find-at-checkpoint', asyncHandler(lpoSummaryController.findLPOsAtCheckpoint));
router.get('/check-duplicate', asyncHandler(lpoSummaryController.checkDuplicateAllocation));
router.get('/driver-entries/:truckNo', asyncHandler(lpoSummaryController.getDriverLPOEntries));
router.get('/', commonValidation.pagination, validate, asyncHandler(lpoSummaryController.getAllLPOSummaries));
router.get('/lpo/:lpoNo', asyncHandler(lpoSummaryController.getLPOSummaryByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(lpoSummaryController.getLPOSummaryById));

// Create route - managers (manager/super_manager) have READ-ONLY access
router.post(
  '/',
  authorize('super_admin', 'admin', 'fuel_order_maker', 'station_manager'),
  lpoSummaryValidation.create,
  validate,
  asyncHandler(lpoSummaryController.createLPOSummary)
);

// Cancel truck in LPO route - managers have READ-ONLY access
router.post(
  '/cancel-truck',
  authorize('super_admin', 'admin', 'fuel_order_maker', 'station_manager'),
  asyncHandler(lpoSummaryController.cancelTruckInLPO)
);

// Forward LPO to another station route - managers have READ-ONLY access
router.post(
  '/forward',
  authorize('super_admin', 'admin', 'fuel_order_maker', 'station_manager'),
  asyncHandler(lpoSummaryController.forwardLPO)
);

// Update route - managers have READ-ONLY access
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'fuel_order_maker', 'station_manager'),
  validate,
  asyncHandler(lpoSummaryController.updateLPOSummary)
);

// Delete route
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'fuel_order_maker'),
  validate,
  asyncHandler(lpoSummaryController.deleteLPOSummary)
);

// Legacy workbook sheet management routes (backward compatibility)
router.post(
  '/:workbookId/sheets',
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'station_manager'),
  validate,
  asyncHandler(lpoSummaryController.addSheetToWorkbook)
);

router.put(
  '/:workbookId/sheets/:sheetId',
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'station_manager'),
  validate,
  asyncHandler(lpoSummaryController.updateSheetInWorkbook)
);

router.delete(
  '/:workbookId/sheets/:sheetId',
  authorize('super_admin', 'admin', 'fuel_order_maker'),
  validate,
  asyncHandler(lpoSummaryController.deleteSheetFromWorkbook)
);

export default router;
