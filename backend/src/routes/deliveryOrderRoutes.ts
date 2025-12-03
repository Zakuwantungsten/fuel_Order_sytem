import { Router } from 'express';
import { deliveryOrderController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { deliveryOrderValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Workbook routes (must be before /:id routes to avoid conflicts)
router.get('/workbooks', asyncHandler(deliveryOrderController.getAllWorkbooks));
router.get('/workbooks/years', asyncHandler(deliveryOrderController.getAvailableYears));
router.get('/workbooks/:year', asyncHandler(deliveryOrderController.getWorkbookByYear));
router.get('/workbooks/:year/export', asyncHandler(deliveryOrderController.exportWorkbook));
router.get('/workbooks/:year/month/:month/export', asyncHandler(deliveryOrderController.exportMonth));

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
  authorize('super_admin', 'admin', 'manager', 'clerk', 'fuel_order_maker'),
  deliveryOrderValidation.create,
  validate,
  asyncHandler(deliveryOrderController.createDeliveryOrder)
);

// Update route (requires appropriate role)
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'clerk', 'fuel_order_maker'),
  deliveryOrderValidation.update,
  validate,
  asyncHandler(deliveryOrderController.updateDeliveryOrder)
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
