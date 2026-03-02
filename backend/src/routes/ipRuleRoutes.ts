import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getRules, createRule, updateRule, deleteRule, toggleRule, testIP } from '../controllers/ipRuleController';

const router = Router();

// All IP rule endpoints are super_admin only
router.use(authenticate, authorize('super_admin'));

router.get('/', getRules);
router.post('/', createRule);
router.post('/test', testIP);
router.put('/:id', updateRule);
router.patch('/:id/toggle', toggleRule);
router.delete('/:id', deleteRule);

export default router;
