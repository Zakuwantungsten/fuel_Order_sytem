import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getPriceHistory,
  updatePrice,
  getSchedules,
  createSchedule,
  cancelSchedule,
  applyDueSchedules,
  getCurrentPrices,
} from '../controllers/fuelPriceController';

const router = Router();

router.use(authenticate, authorize('super_admin', 'admin', 'boss'));

router.get('/current', getCurrentPrices);
router.get('/history', getPriceHistory);
router.get('/schedules', getSchedules);

// Admin write actions — super_admin only
router.post('/update', authorize('super_admin'), updatePrice);
router.post('/schedules', authorize('super_admin'), createSchedule);
router.delete('/schedules/:id', authorize('super_admin'), cancelSchedule);
router.post('/schedules/apply-due', authorize('super_admin'), applyDueSchedules);

export default router;
