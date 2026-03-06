import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getComplianceStatus } from '../controllers/complianceController';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), getComplianceStatus);

export default router;
