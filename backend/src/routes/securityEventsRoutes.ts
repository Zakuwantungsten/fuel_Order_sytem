import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getSecurityEvents,
  getSecurityEventStats,
  getTopIPs,
  getTimeline,
} from '../controllers/securityEventsController';

const router = Router();

// All security event endpoints are super_admin only
router.use(authenticate, authorize('super_admin'));

router.get('/', getSecurityEvents);
router.get('/stats', getSecurityEventStats);
router.get('/top-ips', getTopIPs);
router.get('/timeline', getTimeline);

export default router;
