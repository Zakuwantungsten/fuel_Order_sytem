import { Router } from 'express';
import { deliveryOrderController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { deliveryOrderValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// SDO Workbook routes (must be before /:id routes to avoid conflicts)
router.get('/sdo/workbooks', asyncHandler(deliveryOrderController.getAllSDOWorkbooks));
router.get('/sdo/workbooks/years', asyncHandler(deliveryOrderController.getAvailableSDOYears));
router.get('/sdo/workbooks/:year', asyncHandler(deliveryOrderController.getSDOWorkbookByYear));
router.get('/sdo/workbooks/:year/export', asyncHandler(deliveryOrderController.exportSDOWorkbook));
router.get('/sdo/workbooks/:year/monthly-summaries/export', asyncHandler(deliveryOrderController.exportSDOYearlyMonthlySummaries));
router.get('/sdo/workbooks/:year/month/:month/export', asyncHandler(deliveryOrderController.exportSDOMonth));

// DO Workbook routes (must be before /:id routes to avoid conflicts)
router.get('/workbooks', asyncHandler(deliveryOrderController.getAllWorkbooks));
router.get('/workbooks/years', asyncHandler(deliveryOrderController.getAvailableYears));
router.get('/workbooks/:year', asyncHandler(deliveryOrderController.getWorkbookByYear));
router.get('/workbooks/:year/export', asyncHandler(deliveryOrderController.exportWorkbook));
router.get('/workbooks/:year/monthly-summaries/export', asyncHandler(deliveryOrderController.exportYearlyMonthlySummaries));
router.get('/workbooks/:year/month/:month/export', asyncHandler(deliveryOrderController.exportMonth));

// Amended DOs routes (must be before /:id routes)
router.get('/amended', asyncHandler(deliveryOrderController.getAmendedDOs));
router.get('/amended/summary', asyncHandler(deliveryOrderController.getAmendmentsSummary));
router.post(
  '/amended/download-pdf',
  authorize('super_admin', 'admin', 'manager', 'clerk', 'fuel_order_maker'),
  asyncHandler(deliveryOrderController.downloadAmendedDOsPDF)
);

// Get routes
router.get('/', commonValidation.pagination, validate, asyncHandler(deliveryOrderController.getAllDeliveryOrders));
router.get('/next-do-number', asyncHandler(deliveryOrderController.getNextDONumber));
router.get('/trucks', asyncHandler(deliveryOrderController.getAllTrucks));
router.get('/truck/:truckNo', asyncHandler(deliveryOrderController.getDeliveryOrdersByTruck));
router.get('/truck/:truckNo/current-journey', asyncHandler(deliveryOrderController.getCurrentJourneyByTruck));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(deliveryOrderController.getDeliveryOrderById));

// Create route (requires appropriate role)
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'clerk', 'fuel_order_maker', 'import_officer', 'export_officer'),
  deliveryOrderValidation.create,
  validate,
  asyncHandler(deliveryOrderController.createDeliveryOrder)
);

// Update route (requires appropriate role)
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'clerk', 'fuel_order_maker', 'import_officer', 'export_officer'),
  deliveryOrderValidation.update,
  validate,
  asyncHandler(deliveryOrderController.updateDeliveryOrder)
);

// Cancel route (different from delete - keeps DO in records but marks as cancelled)
router.put(
  '/:id/cancel',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'import_officer', 'export_officer'),
  validate,
  asyncHandler(deliveryOrderController.cancelDeliveryOrder)
);

// Re-link EXPORT DO to fuel record (after truck number correction)
router.post(
  '/:id/relink-to-fuel-record',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'import_officer', 'export_officer'),
  validate,
  asyncHandler(deliveryOrderController.relinkExportDOToFuelRecord)
);

// Create notification for unlinked EXPORT DO
router.post(
  '/notify-unlinked-export',
  authorize('super_admin', 'admin', 'manager', 'clerk', 'fuel_order_maker'),
  asyncHandler(deliveryOrderController.createUnlinkedExportNotification)
);

// Delete route (requires appropriate role)
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager'),
  validate,
  asyncHandler(deliveryOrderController.deleteDeliveryOrder)
);

export default router;
