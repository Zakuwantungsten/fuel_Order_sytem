import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as announcementController from '../controllers/announcementController';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * Public (all authenticated roles) — read active announcements
 */
router.get('/active', announcementController.getActiveAnnouncements);

/**
 * Super Admin only — full CRUD
 */
router.get('/', authorize('super_admin'), announcementController.getAllAnnouncements);
router.post('/', authorize('super_admin'), announcementController.createAnnouncement);
router.put('/:id', authorize('super_admin'), announcementController.updateAnnouncement);
router.delete('/:id', authorize('super_admin'), announcementController.deleteAnnouncement);
router.patch('/:id/toggle', authorize('super_admin'), announcementController.toggleAnnouncement);

export default router;
