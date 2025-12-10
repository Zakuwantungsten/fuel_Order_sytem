import { Router } from 'express';
import { yardFuelController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { yardFuelValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes
router.get('/', commonValidation.pagination, validate, asyncHandler(yardFuelController.getAllYardFuelDispenses));
router.get('/pending', asyncHandler(yardFuelController.getPendingYardFuelDispenses));
router.get('/summary', asyncHandler(yardFuelController.getYardFuelSummary));
router.get('/truck/:truckNo', asyncHandler(yardFuelController.getYardFuelDispensesByTruck));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(yardFuelController.getYardFuelDispenseById));

// Create route
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'yard_personnel', 'fuel_attendant', 'dar_yard', 'tanga_yard', 'mmsa_yard'),
  yardFuelValidation.create,
  validate,
  asyncHandler(yardFuelController.createYardFuelDispense)
);

// Update route
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'yard_personnel'),
  validate,
  asyncHandler(yardFuelController.updateYardFuelDispense)
);

// Delete route
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager'),
  validate,
  asyncHandler(yardFuelController.deleteYardFuelDispense)
);

// Reject route (fuel order maker can reject pending entries)
router.post(
  '/:id/reject',
  commonValidation.mongoId,
  authorize('fuel_order_maker', 'super_admin', 'admin', 'manager'),
  validate,
  asyncHandler(yardFuelController.rejectYardFuelDispense)
);

// Get rejection history (yard personnel can view their rejections)
router.get(
  '/history/rejections',
  authorize('yard_personnel', 'dar_yard', 'tanga_yard', 'mmsa_yard', 'super_admin', 'admin', 'manager'),
  asyncHandler(yardFuelController.getYardRejectionHistory)
);

// Link pending yard fuel to newly created fuel record
router.post(
  '/link-pending',
  authorize('fuel_order_maker', 'super_admin', 'admin', 'manager'),
  asyncHandler(yardFuelController.linkPendingYardFuelToFuelRecord)
);

export default router;
