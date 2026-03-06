import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getRolePermissions } from '../controllers/rolePermissionController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getRolePermissions);

export default router;
