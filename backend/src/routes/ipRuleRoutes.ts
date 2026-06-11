import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getRules, createRule, updateRule, deleteRule, toggleRule, testIP } from '../controllers/ipRuleController';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// All IP rule endpoints are super_admin only
router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(getRules));
router.post('/', asyncHandler(createRule));
router.post('/test', asyncHandler(testIP));
router.put('/:id', asyncHandler(updateRule));
router.patch('/:id/toggle', asyncHandler(toggleRule));
router.delete('/:id', asyncHandler(deleteRule));

export default router;
