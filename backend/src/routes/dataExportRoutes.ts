import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { listResources, exportData } from '../controllers/dataExportController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/resources', listResources);
router.post('/', exportData);

export default router;
