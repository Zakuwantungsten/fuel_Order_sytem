import express from 'express';
import {
  getAllDriverCredentials,
  getDriverCredentialById,
  scanAndGenerateCredentials,
  resetDriverPIN,
  deactivateDriverCredential,
  reactivateDriverCredential,
  exportDriverCredentials,
  getDriverCredentialsStats,
} from '../controllers/driverCredentialController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// All routes require authentication and admin privileges
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Statistics
router.get('/stats', getDriverCredentialsStats);

// Export
router.get('/export', exportDriverCredentials);

// Scan for new trucks
router.post('/scan', scanAndGenerateCredentials);

// CRUD operations
router.get('/', getAllDriverCredentials);
router.get('/:id', getDriverCredentialById);
router.put('/:id/reset', resetDriverPIN);
router.put('/:id/deactivate', deactivateDriverCredential);
router.put('/:id/reactivate', reactivateDriverCredential);

export default router;
