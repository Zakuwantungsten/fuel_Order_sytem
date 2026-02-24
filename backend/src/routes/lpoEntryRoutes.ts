import { Router } from 'express';
import { lpoEntryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { lpoEntryValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes - manager and super_manager have read access
router.get('/', commonValidation.pagination, validate, asyncHandler(lpoEntryController.getAllLPOEntries));
router.get('/next-lpo-number', asyncHandler(lpoEntryController.getNextLPONumber));
router.get('/lpo/:lpoNo', asyncHandler(lpoEntryController.getLPOEntriesByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(lpoEntryController.getLPOEntryById));

// Create route - managers don't have write access, only read
router.post(
  '/',
  authorize('super_admin', 'admin', 'fuel_order_maker', 'station_manager'),
  lpoEntryValidation.create,
  validate,
  asyncHandler(lpoEntryController.createLPOEntry)
);

// Update route - managers don't have write access, only read
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'fuel_order_maker', 'station_manager'),
  lpoEntryValidation.update,
  validate,
  asyncHandler(lpoEntryController.updateLPOEntry)
);

export default router;
