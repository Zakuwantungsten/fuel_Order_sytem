import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getConfigChanges, getResourceTypes } from '../controllers/configDiffController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getConfigChanges);
router.get('/resource-types', getResourceTypes);

export default router;
