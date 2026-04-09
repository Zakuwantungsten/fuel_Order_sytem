import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getRolePermissions, updateRolePermissions } from '../controllers/rolePermissionController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getRolePermissions);
router.put('/', updateRolePermissions);

export default router;
