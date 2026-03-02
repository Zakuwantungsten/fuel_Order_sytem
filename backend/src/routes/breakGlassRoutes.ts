import { Router } from 'express';
import * as ctrl from '../controllers/breakGlassController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// All break-glass operations require super_admin
router.get('/', authenticate, authorize('super_admin'), ctrl.listAccounts);
router.post('/', authenticate, authorize('super_admin'), ctrl.createAccount);
router.patch('/:id/toggle', authenticate, authorize('super_admin'), ctrl.toggleAccount);
router.post('/:id/rotate', authenticate, authorize('super_admin'), ctrl.rotatePassword);
router.delete('/:id', authenticate, authorize('super_admin'), ctrl.deleteAccount);

export default router;
