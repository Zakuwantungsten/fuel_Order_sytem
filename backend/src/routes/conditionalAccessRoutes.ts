import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  togglePolicy,
  deletePolicy,
} from '../controllers/conditionalAccessController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getPolicies);
router.get('/:id', getPolicyById);
router.post('/', createPolicy);
router.put('/:id', updatePolicy);
router.patch('/:id/toggle', togglePolicy);
router.delete('/:id', deletePolicy);

export default router;
