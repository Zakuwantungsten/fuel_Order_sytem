import { Router } from 'express';
import { lpoEntryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { lpoEntryValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes
router.get('/', commonValidation.pagination, validate, asyncHandler(lpoEntryController.getAllLPOEntries));
router.get('/next-lpo-number', asyncHandler(lpoEntryController.getNextLPONumber));
router.get('/lpo/:lpoNo', asyncHandler(lpoEntryController.getLPOEntriesByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(lpoEntryController.getLPOEntryById));

// Create route
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'station_manager'),
  lpoEntryValidation.create,
  validate,
  asyncHandler(lpoEntryController.createLPOEntry)
);

// Update route
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'fuel_order_maker', 'station_manager'),
  lpoEntryValidation.update,
  validate,
  asyncHandler(lpoEntryController.updateLPOEntry)
);

// Delete route
router.delete(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager'),
  validate,
  asyncHandler(lpoEntryController.deleteLPOEntry)
);

export default router;
