import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as notificationConfigController from '../controllers/notificationConfigController';

const router = Router();
router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(notificationConfigController.getNotificationConfig));
router.put('/', asyncHandler(notificationConfigController.updateNotificationConfig));

export default router;
