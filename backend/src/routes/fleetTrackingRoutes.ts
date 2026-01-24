import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import * as fleetTrackingController from '../controllers/fleetTrackingController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Upload fleet report (Excel/CSV)
router.post('/upload', asyncHandler(fleetTrackingController.uploadFleetReport));

// Get all snapshots
router.get('/snapshots', asyncHandler(fleetTrackingController.getAllSnapshots));

// Get latest snapshot
router.get('/latest', asyncHandler(fleetTrackingController.getLatestSnapshot));

// Get truck positions (with filters)
router.get('/positions', asyncHandler(fleetTrackingController.getTruckPositions));

// Get checkpoint distribution statistics
router.get('/stats/distribution', asyncHandler(fleetTrackingController.getCheckpointDistribution));

// Get trucks at specific checkpoint
router.get('/checkpoint/:name', asyncHandler(fleetTrackingController.getTrucksAtCheckpoint));

// Get copyable truck list for specific checkpoint (KEY FEATURE!)
router.get('/checkpoint/:name/copy', asyncHandler(fleetTrackingController.getCopyableTruckList));

// Delete snapshot (Admin only)
router.delete('/snapshots/:id', asyncHandler(fleetTrackingController.deleteSnapshot));

export default router;
