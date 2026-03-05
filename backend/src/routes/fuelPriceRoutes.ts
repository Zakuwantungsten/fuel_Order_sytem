import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
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

router.get('/current', asyncHandler(getCurrentPrices));
router.get('/history', asyncHandler(getPriceHistory));
router.get('/schedules', asyncHandler(getSchedules));

// Write actions — super_admin and admin
router.post('/update', authorize('super_admin', 'admin'), asyncHandler(updatePrice));
router.post('/schedules', authorize('super_admin', 'admin'), asyncHandler(createSchedule));
router.delete('/schedules/:id', authorize('super_admin', 'admin'), asyncHandler(cancelSchedule));
router.post('/schedules/apply-due', authorize('super_admin', 'admin'), asyncHandler(applyDueSchedules));

export default router;
