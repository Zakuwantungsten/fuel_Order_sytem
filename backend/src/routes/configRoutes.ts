import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as configController from '../controllers/configController';

const router = express.Router();

// All routes require super_admin or admin/boss role
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

export default router;
