import { Router } from 'express';
import { lpoEntryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { lpoEntryValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { getResourceHistory } from '../controllers/historyController';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes
router.get('/available-filters', asyncHandler(lpoEntryController.getAvailableFilters));
router.get('/', commonValidation.pagination, validate, asyncHandler(lpoEntryController.getAllLPOEntries));
router.get('/next-lpo-number', asyncHandler(lpoEntryController.getNextLPONumber));
router.get('/lpo/:lpoNo', asyncHandler(lpoEntryController.getLPOEntriesByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(lpoEntryController.getLPOEntryById));

// Create route
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss'),
  lpoEntryValidation.create,
  validate,
  asyncHandler(lpoEntryController.createLPOEntry)
);

// Update route
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  lpoEntryValidation.update,
  validate,
  asyncHandler(lpoEntryController.updateLPOEntry)
);

// Edit lock routes — lock/unlock the parent LPOSummary document by entry _id
const lockRoles = ['super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'] as const;
router.post('/:id/lock', commonValidation.mongoId, authorize(...lockRoles), validate, asyncHandler(lpoEntryController.acquireEditLock));
router.delete('/:id/lock', commonValidation.mongoId, authorize(...lockRoles), validate, asyncHandler(lpoEntryController.releaseEditLock));

// Audit history route
router.get('/:id/history', commonValidation.mongoId, validate, asyncHandler(getResourceHistory('lpo_entry')));

export default router;
