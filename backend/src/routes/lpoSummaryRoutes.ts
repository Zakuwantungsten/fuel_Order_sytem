import { Router } from 'express';
import { lpoSummaryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { exportRateLimiter } from '../middleware/rateLimiters';
import { lpoSummaryValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { createEditLockHandlers } from '../controllers/editLockController';
import { LPOSummary } from '../models';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Workbook routes (must be before /:id routes to avoid conflicts)
// manager and super_manager have read access to workbooks
router.get('/workbooks', asyncHandler(lpoSummaryController.getAllWorkbooks));
router.get('/workbooks/years', asyncHandler(lpoSummaryController.getAvailableYears));
router.get('/workbooks/:year', asyncHandler(lpoSummaryController.getWorkbookByYear));
router.get('/workbooks/:year/export', exportRateLimiter, authorize('super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'fuel_order_maker', 'boss'), asyncHandler(lpoSummaryController.exportWorkbook));

// Monthly Summary tab Excel exports (server-side)
router.get('/summary-aggregate', asyncHandler(lpoSummaryController.getSummaryAggregate));
router.get('/summary-entries', asyncHandler(lpoSummaryController.getSummaryEntries));
router.get(
  '/summary-export/month',
  exportRateLimiter,
  authorize('super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'fuel_order_maker', 'boss'),
  asyncHandler(lpoSummaryController.exportSummaryMonth)
);
router.get(
  '/summary-export/year',
  exportRateLimiter,
  authorize('super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'fuel_order_maker', 'boss'),
  asyncHandler(lpoSummaryController.exportSummaryYear)
);

// LPO PDF download - server-generated PDF
router.get('/:id/pdf', commonValidation.mongoId, validate, asyncHandler(lpoSummaryController.downloadLPOPDF));

// Get routes - all authenticated users can read
router.get('/next-number', asyncHandler(lpoSummaryController.getNextLPONumber));
router.get('/find-at-checkpoint', asyncHandler(lpoSummaryController.findLPOsAtCheckpoint));
router.get('/check-duplicate', asyncHandler(lpoSummaryController.checkDuplicateAllocation));
router.get('/driver-entries/:truckNo', asyncHandler(lpoSummaryController.getDriverLPOEntries));
router.get('/entry-contexts', asyncHandler(lpoSummaryController.getEntryContextsForFuelRecord));
// Flat entry list — replaces the removed /lpo-entries endpoint
router.get('/entries/filters', asyncHandler(lpoSummaryController.getLPOEntriesFilters));
router.get('/entries', commonValidation.pagination, validate, asyncHandler(lpoSummaryController.getAllLPOEntriesFlat));
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

// Amend (partially reduce) a truck entry in an LPO - same permissions as cancel
router.post(
  '/amend-truck',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.amendTruckInLPO)
);

// Cancel ALL entries in an LPO route - same permissions as cancel-truck
router.post(
  '/:id/cancel-all',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.cancelAllEntriesInLPO)
);

// Forward LPO to another station route - UPDATE-level action per frontend LPOS permissions
router.post(
  '/forward',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.forwardLPO)
);

// Pick-up-at: cancel selected trucks on the source LPO and re-create them at the
// station where they actually filled, netting the fuel records. Same UPDATE roles.
router.post(
  '/pickup-at',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.pickupAtStation)
);

// In-place picked-at: keep truck on this LPO but record fill station override.
router.post(
  '/set-picked-at',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  asyncHandler(lpoSummaryController.setPickedAtStation)
);

// Update route - per frontend LPOS UPDATE permissions
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  validate,
  asyncHandler(lpoSummaryController.updateLPOSummary)
);

// NOTE: LPO documents cannot be deleted — business rule. They are cancelled
// (per-entry isCancelled) instead, which preserves the record. No DELETE route.

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

// NOTE: No sheet-delete route — deleting a workbook sheet is deleting an LPO
// document, which is disallowed. Sheets are cancelled, not deleted.

// Edit lock routes for LPO Summary documents (same roles as update)
const lpoSummaryLock = createEditLockHandlers(LPOSummary, 'lpo_summaries');
router.post('/:id/lock', commonValidation.mongoId, authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'), validate, asyncHandler(lpoSummaryLock.acquireEditLock));
router.delete('/:id/lock', commonValidation.mongoId, authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'), validate, asyncHandler(lpoSummaryLock.releaseEditLock));

export default router;
