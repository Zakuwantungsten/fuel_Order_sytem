import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { listFlags, toggleFlag, updateFlag, createFlag, deleteFlag } from '../controllers/featureFlagController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', listFlags);
router.post('/', createFlag);
router.patch('/:key/toggle', toggleFlag);
router.put('/:key', updateFlag);
router.delete('/:key', deleteFlag);

export default router;
