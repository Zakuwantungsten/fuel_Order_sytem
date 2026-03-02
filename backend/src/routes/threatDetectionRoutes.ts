import { Router } from 'express';
import * as ctrl from '../controllers/threatDetectionController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/anomalies', authenticate, authorize('super_admin'), ctrl.getAnomalies);
router.get('/baseline/:username', authenticate, authorize('super_admin'), ctrl.getUserBaseline);

export default router;
