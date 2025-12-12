import { Router } from 'express';
import * as trashController from '../controllers/trashController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get trash statistics (Super Admin only)
router.get(
  '/stats',
  authorize('super_admin'),
  asyncHandler(trashController.getTrashStats)
);

// Get deleted items by type (Super Admin only)
router.get(
  '/:type',
  authorize('super_admin'),
  asyncHandler(trashController.getDeletedItems)
);

// Restore single item (Super Admin only)
router.post(
  '/:type/:id/restore',
  authorize('super_admin'),
  asyncHandler(trashController.restoreItem)
);

// Bulk restore (Super Admin only)
router.post(
  '/bulk-restore',
  authorize('super_admin'),
  asyncHandler(trashController.bulkRestore)
);

// Permanent delete single item (Super Admin only)
router.delete(
  '/:type/:id/permanent',
  authorize('super_admin'),
  asyncHandler(trashController.permanentDelete)
);

// Bulk permanent delete (Super Admin only)
router.post(
  '/bulk-permanent-delete',
  authorize('super_admin'),
  asyncHandler(trashController.bulkPermanentDelete)
);

// Empty trash for a type (Super Admin only)
router.delete(
  '/:type/empty',
  authorize('super_admin'),
  asyncHandler(trashController.emptyTrash)
);

// Retention settings
router.get(
  '/settings/retention',
  authorize('super_admin'),
  asyncHandler(trashController.getRetentionSettings)
);

router.post(
  '/settings/retention',
  authorize('super_admin'),
  asyncHandler(trashController.updateRetentionSettings)
);

export default router;
