import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as emailLogController from '../controllers/emailLogController';

const router = Router();

router.use(authenticate, authorize('super_admin'));
router.get('/', asyncHandler(emailLogController.getEmailLogs));

export default router;
