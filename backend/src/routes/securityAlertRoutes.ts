/**
 * Security Alert Routes
 *
 * Persistent alert queue endpoints for the Security tab.
 * All routes require super_admin authentication.
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getSecurityAlerts,
  getUnresolvedAlertCount,
  acknowledgeAlert,
  investigateAlert,
  resolveAlert,
  markFalsePositive,
  addAlertNote,
} from '../controllers/securityAlertController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getSecurityAlerts);
router.get('/count', getUnresolvedAlertCount);
router.patch('/:id/acknowledge', acknowledgeAlert);
router.patch('/:id/investigate', investigateAlert);
router.patch('/:id/resolve', resolveAlert);
router.patch('/:id/false-positive', markFalsePositive);
router.patch('/:id/note', addAlertNote);

export default router;
