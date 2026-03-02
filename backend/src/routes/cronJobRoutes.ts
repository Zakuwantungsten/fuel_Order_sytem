import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { listJobs, triggerJob, toggleJob } from '../controllers/cronJobController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', listJobs);
router.post('/:id/trigger', triggerJob);
router.patch('/:id/toggle', toggleJob);

export default router;
