import { Router } from 'express';
import { getSecurityScore, getSecurityScoreHistory } from '../controllers/securityScoreController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), getSecurityScore);
router.get('/history', authenticate, authorize('super_admin'), getSecurityScoreHistory);

export default router;
