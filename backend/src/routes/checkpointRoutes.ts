import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import * as checkpointController from '../controllers/checkpointController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all checkpoints
router.get('/', asyncHandler(checkpointController.getAllCheckpoints));

// Get checkpoint by ID
router.get('/:id', asyncHandler(checkpointController.getCheckpointById));

// Create new checkpoint (Admin only)
router.post('/', asyncHandler(checkpointController.createCheckpoint));

// Update checkpoint (Admin only)
router.put('/:id', asyncHandler(checkpointController.updateCheckpoint));

// Delete checkpoint (Admin only)
router.delete('/:id', asyncHandler(checkpointController.deleteCheckpoint));

// Reorder checkpoints (Admin only)
router.put('/reorder', asyncHandler(checkpointController.reorderCheckpoints));

// Seed initial checkpoints (Super Admin only)
router.post('/seed', asyncHandler(checkpointController.seedCheckpoints));

export default router;
