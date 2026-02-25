import express from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import * as fleetTrackingController from '../controllers/fleetTrackingController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Upload fleet report (Excel/CSV) — CREATE on fleet_tracking: super_admin, admin, fuel_order_maker
router.post('/upload', authorize('super_admin', 'admin', 'fuel_order_maker'), asyncHandler(fleetTrackingController.uploadFleetReport));

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
router.delete('/snapshots/:id', authorize('super_admin', 'admin'), asyncHandler(fleetTrackingController.deleteSnapshot));

export default router;
