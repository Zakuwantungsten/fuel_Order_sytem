import { Router } from 'express';
import { getSecurityScore } from '../controllers/securityScoreController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), getSecurityScore);

export default router;
