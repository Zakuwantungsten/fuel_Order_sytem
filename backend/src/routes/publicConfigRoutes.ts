import express from 'express';
import { authenticate } from '../middleware/auth';
import * as configController from '../controllers/configController';

const router = express.Router();

// Public read-only config routes - require authentication but not admin role
// These are used by all authenticated users when creating LPOs, DOs, etc.

router.use(authenticate); // Only require authentication, not authorization

// Fuel station routes (read-only)
router.get('/stations', configController.getFuelStations);

// Route configuration routes (read-only)
router.get('/routes', configController.getRoutes);
router.get('/routes/find/:destination', configController.findRouteByDestination);

// Truck batches (read-only)
router.get('/truck-batches', configController.getTruckBatches);

// Formula helpers
router.get('/formula-variables', configController.getFormulaVariables);

export default router;
