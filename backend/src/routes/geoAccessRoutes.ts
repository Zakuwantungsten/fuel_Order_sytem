import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getLoginGeography } from '../controllers/geoAccessController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getLoginGeography);

export default router;
