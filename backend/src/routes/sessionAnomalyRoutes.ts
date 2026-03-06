import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getSessionAnomalies } from '../controllers/sessionAnomalyController';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), getSessionAnomalies);

export default router;
