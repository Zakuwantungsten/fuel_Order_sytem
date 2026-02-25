import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { checkpointValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import * as checkpointController from '../controllers/checkpointController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all checkpoints
router.get('/', checkpointValidation.list, validate, asyncHandler(checkpointController.getAllCheckpoints));

// Get checkpoint by ID
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(checkpointController.getCheckpointById));

// Create new checkpoint — CREATE on checkpoints: super_admin, admin, fuel_order_maker
router.post(
	'/',
	authorize('super_admin', 'admin', 'fuel_order_maker'),
	checkpointValidation.create,
	validate,
	asyncHandler(checkpointController.createCheckpoint)
);

// Update checkpoint — UPDATE on checkpoints: super_admin, admin, fuel_order_maker
router.put(
	'/:id',
	commonValidation.mongoId,
	authorize('super_admin', 'admin', 'fuel_order_maker'),
	checkpointValidation.update,
	validate,
	asyncHandler(checkpointController.updateCheckpoint)
);

// Delete checkpoint (Admin only)
router.delete(
	'/:id',
	commonValidation.mongoId,
	authorize('super_admin', 'admin'),
	validate,
	asyncHandler(checkpointController.deleteCheckpoint)
);

// Reorder checkpoints (Admin only)
router.put(
	'/reorder',
	authorize('super_admin', 'admin'),
	checkpointValidation.reorder,
	validate,
	asyncHandler(checkpointController.reorderCheckpoints)
);

// Seed initial checkpoints (Super Admin only)
router.post('/seed', authorize('super_admin'), asyncHandler(checkpointController.seedCheckpoints));

export default router;
