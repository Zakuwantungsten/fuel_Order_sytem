import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as webhookController from '../controllers/webhookController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(webhookController.listWebhooks));
router.get('/events', asyncHandler(webhookController.getWebhookEvents));
router.post('/', asyncHandler(webhookController.createWebhook));
router.put('/:id', asyncHandler(webhookController.updateWebhook));
router.delete('/:id', asyncHandler(webhookController.deleteWebhook));
router.post('/:id/test', asyncHandler(webhookController.testWebhook));
router.post('/:id/regenerate-secret', asyncHandler(webhookController.regenerateSecret));

export default router;
