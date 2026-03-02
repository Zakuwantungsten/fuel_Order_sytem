import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getBlockedIPs,
  getSuspiciousIPs,
  getBlocklistStats,
  getBlockHistory,
  blockIP,
  unblockIP,
} from '../controllers/securityBlocklistController';

const router = Router();

// All security blocklist endpoints are super_admin only
router.use(authenticate, authorize('super_admin'));

router.get('/', getBlockedIPs);
router.get('/suspicious', getSuspiciousIPs);
router.get('/stats', getBlocklistStats);
router.get('/history', getBlockHistory);
router.post('/block', blockIP);
router.delete('/unblock/:ip', unblockIP);

export default router;
