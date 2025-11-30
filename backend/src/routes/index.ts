import { Router } from 'express';
import authRoutes from './authRoutes';
import deliveryOrderRoutes from './deliveryOrderRoutes';
import lpoEntryRoutes from './lpoEntryRoutes';
import lpoSummaryRoutes from './lpoSummaryRoutes';
import fuelRecordRoutes from './fuelRecordRoutes';
import yardFuelRoutes from './yardFuelRoutes';
import dashboardRoutes from './dashboardRoutes';
import userRoutes from './userRoutes';
import adminRoutes from './adminRoutes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/delivery-orders', deliveryOrderRoutes);
router.use('/lpo-entries', lpoEntryRoutes);
router.use('/lpo-documents', lpoSummaryRoutes);
router.use('/fuel-records', fuelRecordRoutes);
router.use('/yard-fuel', yardFuelRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);

export default router;
