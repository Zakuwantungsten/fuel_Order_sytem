import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getSystemHealth } from '../controllers/systemHealthController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getSystemHealth);

export default router;
