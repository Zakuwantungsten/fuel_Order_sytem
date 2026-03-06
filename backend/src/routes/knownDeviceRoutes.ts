import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getKnownDevices,
  getDeviceStats,
  trustDevice,
  blockDevice,
  untrustDevice,
  removeDevice,
  syncDevicesFromLoginActivity,
} from '../controllers/deviceManagementController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getKnownDevices);
router.get('/stats', getDeviceStats);
router.post('/sync', syncDevicesFromLoginActivity);
router.patch('/:id/trust', trustDevice);
router.patch('/:id/block', blockDevice);
router.patch('/:id/untrust', untrustDevice);
router.delete('/:id', removeDevice);

export default router;
