import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { getActiveSessions, terminateSession, terminateAllSessions } from '../controllers/sessionController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getActiveSessions);
router.delete('/', terminateAllSessions);
router.delete('/:userId', terminateSession);

export default router;
