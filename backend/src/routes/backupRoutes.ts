import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as backupController from '../controllers/backupController';
import { exportRateLimiter } from '../middleware/rateLimiters';

const router = express.Router();

// All routes require super_admin role
router.use(authenticate, authorize('super_admin'));

// Backup routes
router.post('/backups', backupController.createBackup);
router.get('/backups/trash', backupController.getDeletedBackups);          // LE-3: trash list (before :id)
router.get('/backups', backupController.getBackups);
router.get('/backups/stats', backupController.getBackupStats);
router.get('/backups/:id', backupController.getBackupById);
router.get('/backups/:id/download', exportRateLimiter, backupController.downloadBackup);
router.post('/backups/:id/restore', backupController.restoreBackup);
router.post('/backups/:id/verify', backupController.verifyBackup);         // ME-1: integrity verify
router.post('/backups/:id/undelete', backupController.undeleteBackup);     // LE-3: restore from trash
router.delete('/backups/:id', backupController.deleteBackup);              // LE-3: soft delete
router.delete('/backups/:id/permanent', backupController.permanentlyDeleteBackup); // LE-3: hard delete
router.post('/backups/cleanup', backupController.cleanupBackups);

// Disaster Recovery: list/restore directly from R2 (works on empty/new MongoDB)
router.get('/r2-backups', backupController.listR2Backups);
router.post('/restore-from-r2', backupController.restoreFromR2Key);
router.post('/restore-to-new-db', backupController.restoreToNewDb);  // safe restore: into a new DB, live data untouched
router.post('/sync-from-r2', backupController.syncBackupsFromR2);   // rebuild catalog from R2 after DB migration
router.post('/dr-drill', backupController.runDrill);               // chaos drill: verify backups are restorable

// Backup schedule routes
router.get('/backup-schedules', backupController.getBackupSchedules);
router.post('/backup-schedules', backupController.createBackupSchedule);
router.put('/backup-schedules/:id', backupController.updateBackupSchedule);
router.delete('/backup-schedules/:id', backupController.deleteBackupSchedule);

export default router;
