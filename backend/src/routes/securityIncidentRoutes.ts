import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getIncidents,
  getIncidentStats,
  getIncidentById,
  createIncident,
  createFromAlert,
  updateStatus,
  assignIncident,
  addNote,
  linkEvidence,
  setRootCause,
} from '../controllers/securityIncidentController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getIncidents);
router.get('/stats', getIncidentStats);
router.get('/:id', getIncidentById);
router.post('/', createIncident);
router.post('/from-alert/:alertId', createFromAlert);
router.patch('/:id/status', updateStatus);
router.patch('/:id/assign', assignIncident);
router.post('/:id/note', addNote);
router.post('/:id/link', linkEvidence);
router.patch('/:id/root-cause', setRootCause);

export default router;
