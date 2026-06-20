import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as configController from '../controllers/configController';

const router = express.Router();

// Operational configuration routes - accessible by super_admin, admin, boss
// These are for day-to-day operational settings (routes, stations, rates)
router.use(authenticate, authorize('super_admin', 'admin', 'boss'));

// Fuel station routes
router.get('/stations', configController.getFuelStations);
router.post('/stations', configController.createFuelStation);
router.put('/stations/:id', configController.updateFuelStation);
router.delete('/stations/:id', configController.deleteFuelStation);

// Route configuration routes
router.get('/routes', configController.getRoutes);
router.get('/routes/find/:destination', configController.findRouteByDestination);
router.post('/routes', configController.createRoute);
router.put('/routes/:id', configController.updateRoute);
router.delete('/routes/:id', configController.deleteRoute);

// Formula helpers
router.get('/formula-variables', configController.getFormulaVariables);

// Yard fuel time limit settings
// Read: any admin-level role. Write: strictly admin/super_admin (boss excluded).
router.get('/yard-fuel-time-limit', configController.getYardFuelTimeLimit);
router.put('/yard-fuel-time-limit', authorize('super_admin', 'admin'), configController.updateYardFuelTimeLimit);

// Yard configs (rate, supplier info per yard)
router.put('/yards/:yard', authorize('super_admin', 'admin'), configController.upsertYardConfig);

export default router;
