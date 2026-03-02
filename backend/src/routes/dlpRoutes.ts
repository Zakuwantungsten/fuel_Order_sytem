import { Router } from 'express';
import * as ctrl from '../controllers/dlpController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), ctrl.listRules);
router.get('/stats', authenticate, authorize('super_admin'), ctrl.getStats);
router.post('/', authenticate, authorize('super_admin'), ctrl.createRule);
router.put('/:id', authenticate, authorize('super_admin'), ctrl.updateRule);
router.patch('/:id/toggle', authenticate, authorize('super_admin'), ctrl.toggleRule);
router.delete('/:id', authenticate, authorize('super_admin'), ctrl.deleteRule);

export default router;
