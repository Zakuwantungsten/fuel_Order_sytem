import { Router } from 'express';
import { lpoEntryController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { lpoEntryValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { createEditLockHandlers } from '../controllers/editLockController';
import { getResourceHistory } from '../controllers/historyController';
import { LPOEntry } from '../models';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get routes - manager and super_manager have read access
router.get('/available-filters', asyncHandler(lpoEntryController.getAvailableFilters));
router.get('/', commonValidation.pagination, validate, asyncHandler(lpoEntryController.getAllLPOEntries));
router.get('/next-lpo-number', asyncHandler(lpoEntryController.getNextLPONumber));
router.get('/lpo/:lpoNo', asyncHandler(lpoEntryController.getLPOEntriesByLPONo));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(lpoEntryController.getLPOEntryById));

// Create route - station_manager has read/update/approve only, not create
router.post(
  '/',
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss'),
  lpoEntryValidation.create,
  validate,
  asyncHandler(lpoEntryController.createLPOEntry)
);

// Update route - full LPO UPDATE roles per frontend permissions
router.put(
  '/:id',
  commonValidation.mongoId,
  authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'),
  lpoEntryValidation.update,
  validate,
  asyncHandler(lpoEntryController.updateLPOEntry)
);

// Edit lock routes (same roles as update)
const lpoLock = createEditLockHandlers(LPOEntry, 'lpo_entries');
router.post('/:id/lock', commonValidation.mongoId, authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'), validate, asyncHandler(lpoLock.acquireEditLock));
router.delete('/:id/lock', commonValidation.mongoId, authorize('super_admin', 'admin', 'manager', 'supervisor', 'clerk', 'fuel_order_maker', 'boss', 'fuel_attendant', 'station_manager', 'payment_manager'), validate, asyncHandler(lpoLock.releaseEditLock));

// Audit history route
router.get('/:id/history', commonValidation.mongoId, validate, asyncHandler(getResourceHistory('lpo_entry')));

export default router;
