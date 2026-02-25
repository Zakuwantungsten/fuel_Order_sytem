import { Router } from 'express';
import { driverAccountController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { exportRateLimiter } from '../middleware/rateLimiters';
import { commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get next LPO number
router.get('/next-lpo-number', asyncHandler(driverAccountController.getNextLPONumber));

// Get available years
router.get('/years', asyncHandler(driverAccountController.getAvailableYears));

// Get summary statistics
router.get('/summary', asyncHandler(driverAccountController.getDriverAccountSummary));

// Get entries by year (workbook view)
router.get('/year/:year', asyncHandler(driverAccountController.getDriverAccountEntriesByYear));

// Export workbook to Excel
router.get(
  '/year/:year/export',
  exportRateLimiter,
  authorize('super_admin', 'admin', 'manager', 'super_manager', 'supervisor', 'fuel_order_maker', 'boss'),
  asyncHandler(driverAccountController.exportDriverAccountWorkbook)
);

// Get all entries with pagination
router.get(
  '/',
  commonValidation.pagination,
  validate,
  asyncHandler(driverAccountController.getAllDriverAccountEntries)
);

// Get entry by ID
router.get(
  '/:id',
  commonValidation.mongoId,
  validate,
  asyncHandler(driverAccountController.getDriverAccountEntryById)
);

// Create entry
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss'),
  asyncHandler(driverAccountController.createDriverAccountEntry)
);

// Create batch entries
router.post(
  '/batch',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss'),
  asyncHandler(driverAccountController.createBatchDriverAccountEntries)
);

// Update entry
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  validate,
  asyncHandler(driverAccountController.updateDriverAccountEntry)
);

// Update entry status
router.patch(
  '/:id/status',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'boss'),
  validate,
  asyncHandler(driverAccountController.updateDriverAccountStatus)
);

// Delete entry
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'boss'),
  validate,
  asyncHandler(driverAccountController.deleteDriverAccountEntry)
);

export default router;
