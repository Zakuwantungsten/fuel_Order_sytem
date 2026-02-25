import { Router } from 'express';
import { fuelRecordController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { fuelRecordValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes
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

// Delete route
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'boss'),
  validate,
  asyncHandler(fuelRecordController.deleteFuelRecord)
);

export default router;
