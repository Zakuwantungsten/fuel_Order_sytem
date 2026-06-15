import { Router } from 'express';
import { fuelRecordController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { fuelRecordValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { createEditLockHandlers } from '../controllers/editLockController';
import { getResourceHistory } from '../controllers/historyController';
import { FuelRecord } from '../models';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes
router.get('/available-periods', asyncHandler(fuelRecordController.getAvailablePeriods));
router.get('/available-routes', asyncHandler(fuelRecordController.getAvailableRoutes));
router.get('/', commonValidation.pagination, validate, asyncHandler(fuelRecordController.getAllFuelRecords));
router.get('/monthly-summary', asyncHandler(fuelRecordController.getMonthlyFuelSummary));
router.get('/truck/:truckNo', asyncHandler(fuelRecordController.getFuelRecordsByTruck));
router.get('/do/:doNumber', asyncHandler(fuelRecordController.getFuelRecordByGoingDO));
router.get('/:id/details', commonValidation.mongoId, validate, asyncHandler(fuelRecordController.getFuelRecordDetails));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(fuelRecordController.getFuelRecordById));

// Create route
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'yard_personnel', 'station_manager', 'dar_yard', 'tanga_yard', 'mmsa_yard'),
  fuelRecordValidation.create,
  validate,
  asyncHandler(fuelRecordController.createFuelRecord)
);

// Update route
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'driver', 'fuel_order_maker', 'boss', 'yard_personnel', 'fuel_attendant', 'station_manager', 'payment_manager'),
  fuelRecordValidation.update,
  validate,
  asyncHandler(fuelRecordController.updateFuelRecord)
);

// Cancel route — admin-level only, no edit lock required
router.post(
  '/:id/cancel',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'boss'),
  validate,
  asyncHandler(fuelRecordController.cancelFuelRecord)
);

// Uncancel route — super_admin and admin only
router.post(
  '/:id/uncancel',
  commonValidation.mongoId,
  authorize('super_admin', 'admin'),
  validate,
  asyncHandler(fuelRecordController.uncancelFuelRecord)
);

// Edit lock routes (same roles as update)
const fuelLock = createEditLockHandlers(FuelRecord, 'fuel_records');
router.post('/:id/lock', commonValidation.mongoId, authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'driver', 'fuel_order_maker', 'boss', 'yard_personnel', 'fuel_attendant', 'station_manager', 'payment_manager'), validate, asyncHandler(fuelLock.acquireEditLock));
router.delete('/:id/lock', commonValidation.mongoId, authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'driver', 'fuel_order_maker', 'boss', 'yard_personnel', 'fuel_attendant', 'station_manager', 'payment_manager'), validate, asyncHandler(fuelLock.releaseEditLock));

// Audit history route
router.get('/:id/history', commonValidation.mongoId, validate, asyncHandler(getResourceHistory('fuel_record')));

export default router;
