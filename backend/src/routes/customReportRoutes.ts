import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as customReportController from '../controllers/customReportController';

const router = Router();
router.use(authenticate, authorize('super_admin'));

router.get('/models', asyncHandler(customReportController.getAvailableModels));
router.post('/run', asyncHandler(customReportController.runReport));

export default router;
