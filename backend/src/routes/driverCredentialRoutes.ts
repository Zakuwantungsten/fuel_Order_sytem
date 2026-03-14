import express from 'express';
import {
  getAllDriverCredentials,
  getDriverCredentialById,
  createDriverCredential,
  scanAndGenerateCredentials,
  resetDriverPIN,
  deactivateDriverCredential,
  reactivateDriverCredential,
  exportDriverCredentials,
  getDriverCredentialsStats,
} from '../controllers/driverCredentialController';
import { authenticate, authorize } from '../middleware/auth';
import { exportRateLimiter } from '../middleware/rateLimiters';
import { asyncHandler } from '../middleware/errorHandler';

const router = express.Router();

// All routes require authentication and admin privileges
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Statistics
router.get('/stats', asyncHandler(getDriverCredentialsStats));

// Export
router.get('/export', exportRateLimiter, asyncHandler(exportDriverCredentials));

// Scan for new trucks
router.post('/scan', asyncHandler(scanAndGenerateCredentials));

// CRUD operations
router.get('/', asyncHandler(getAllDriverCredentials));
router.post('/', asyncHandler(createDriverCredential));
router.get('/:id', asyncHandler(getDriverCredentialById));
router.put('/:id/reset', asyncHandler(resetDriverPIN));
router.put('/:id/deactivate', asyncHandler(deactivateDriverCredential));
router.put('/:id/reactivate', asyncHandler(reactivateDriverCredential));

export default router;
