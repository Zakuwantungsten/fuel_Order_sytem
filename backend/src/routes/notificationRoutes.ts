import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as notificationController from '../controllers/notificationController';

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for current user
 * @access  Private
 */
router.get('/', asyncHandler(notificationController.getNotifications));

/**
 * @route   GET /api/notifications/count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get('/count', asyncHandler(notificationController.getNotificationCount));

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.patch('/:id/read', asyncHandler(notificationController.markAsRead));

/**
 * @route   PATCH /api/notifications/:id/dismiss
 * @desc    Dismiss a notification
 * @access  Private
 */
router.patch('/:id/dismiss', asyncHandler(notificationController.dismissNotification));

/**
 * @route   PATCH /api/notifications/:id/resolve
 * @desc    Resolve a notification (admin only)
 * @access  Private (Admin)
 */
router.patch(
  '/:id/resolve',
  authorize('admin', 'super_admin'),
  asyncHandler(notificationController.resolveNotification)
);

export default router;
