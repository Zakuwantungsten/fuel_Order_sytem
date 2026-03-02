import { Router } from 'express';
import * as ctrl from '../controllers/siemController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, authorize('super_admin'), ctrl.listConfigs);
router.post('/', authenticate, authorize('super_admin'), ctrl.createConfig);
router.put('/:id', authenticate, authorize('super_admin'), ctrl.updateConfig);
router.patch('/:id/toggle', authenticate, authorize('super_admin'), ctrl.toggleConfig);
router.post('/:id/test', authenticate, authorize('super_admin'), ctrl.testConnection);
router.delete('/:id', authenticate, authorize('super_admin'), ctrl.deleteConfig);

export default router;
