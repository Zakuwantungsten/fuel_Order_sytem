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
import driverAccountRoutes from './driverAccountRoutes';
import systemAdminRoutes from './systemAdminRoutes';
import trashRoutes from './trashRoutes';
import backupRoutes from './backupRoutes';
import analyticsRoutes from './analyticsRoutes';
import configRoutes from './configRoutes';

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
router.use('/driver-accounts', driverAccountRoutes);
router.use('/system-admin', systemAdminRoutes);
router.use('/trash', trashRoutes);
router.use('/system-admin', backupRoutes);
router.use('/system-admin/analytics', analyticsRoutes);
router.use('/system-admin/config', configRoutes);

export default router;
