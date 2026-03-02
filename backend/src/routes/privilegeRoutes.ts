import { Router } from 'express';
import * as ctrl from '../controllers/privilegeController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Any authenticated user can request elevation
router.post('/request', authenticate, ctrl.createRequest);
router.get('/my-requests', authenticate, ctrl.getMyRequests);

// Super admin only: list, approve, deny, revoke
router.get('/', authenticate, authorize('super_admin'), ctrl.listRequests);
router.post('/:id/approve', authenticate, authorize('super_admin'), ctrl.approveRequest);
router.post('/:id/deny', authenticate, authorize('super_admin'), ctrl.denyRequest);
router.post('/:id/revoke', authenticate, authorize('super_admin'), ctrl.revokeElevation);

export default router;
