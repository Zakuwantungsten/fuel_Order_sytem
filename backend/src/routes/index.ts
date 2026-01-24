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
import trashRoutes from './trashRoutes';
import backupRoutes from './backupRoutes';
import analyticsRoutes from './analyticsRoutes';
import configRoutes from './configRoutes';
import publicConfigRoutes from './publicConfigRoutes';
import notificationRoutes from './notificationRoutes';
import archivalRoutes from './archivalRoutes';
import systemConfigRoutes from './systemConfigRoutes';
import driverCredentialRoutes from './driverCredentialRoutes';
import checkpointRoutes from './checkpointRoutes';
import fleetTrackingRoutes from './fleetTrackingRoutes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/config', publicConfigRoutes); // Public read-only config for all authenticated users
router.use('/delivery-orders', deliveryOrderRoutes);
router.use('/lpo-entries', lpoEntryRoutes);
router.use('/lpo-documents', lpoSummaryRoutes);
router.use('/fuel-records', fuelRecordRoutes);
router.use('/yard-fuel', yardFuelRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/driver-accounts', driverAccountRoutes);
router.use('/notifications', notificationRoutes);
router.use('/trash', trashRoutes);
router.use('/backup', backupRoutes);
router.use('/system-admin/analytics', analyticsRoutes); // Super admin analytics
router.use('/system-config', configRoutes);
router.use('/system-admin/config', systemConfigRoutes); // Super admin only system configuration
router.use('/archival', archivalRoutes);
router.use('/driver-credentials', driverCredentialRoutes); // Driver credential management
router.use('/checkpoints', checkpointRoutes); // Checkpoint management for fleet tracking
router.use('/fleet-tracking', fleetTrackingRoutes); // Fleet position tracking and visualization

export default router;
