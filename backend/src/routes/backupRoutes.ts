import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as backupController from '../controllers/backupController';

const router = express.Router();

// All routes require super_admin role
router.use(authenticate, authorize('super_admin'));

// Backup routes
router.post('/backups', backupController.createBackup);
router.get('/backups', backupController.getBackups);
router.get('/backups/stats', backupController.getBackupStats);
router.get('/backups/:id', backupController.getBackupById);
router.get('/backups/:id/download', backupController.downloadBackup);
router.post('/backups/:id/restore', backupController.restoreBackup);
router.delete('/backups/:id', backupController.deleteBackup);
router.post('/backups/cleanup', backupController.cleanupBackups);

// Backup schedule routes
router.get('/backup-schedules', backupController.getBackupSchedules);
router.post('/backup-schedules', backupController.createBackupSchedule);
router.put('/backup-schedules/:id', backupController.updateBackupSchedule);
router.delete('/backup-schedules/:id', backupController.deleteBackupSchedule);

export default router;
