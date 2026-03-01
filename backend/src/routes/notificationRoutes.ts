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
 * @route   GET /api/notifications/vapid-public-key
 * @desc    Return the VAPID public key for browser push subscriptions
 * @access  Private
 */
router.get('/vapid-public-key', asyncHandler(notificationController.getVapidPublicKey));

/**
 * @route   POST /api/notifications/push-subscribe
 * @desc    Register a browser push subscription for the current user
 * @access  Private
 */
router.post('/push-subscribe', asyncHandler(notificationController.subscribePush));

/**
 * @route   DELETE /api/notifications/push-subscribe
 * @desc    Remove the browser push subscription for the current user
 * @access  Private
 */
router.delete('/push-subscribe', asyncHandler(notificationController.unsubscribePush));

/**
 * @route   DELETE /api/notifications
 * @desc    Dismiss all notifications for current user
 * @access  Private
 */
router.delete('/', asyncHandler(notificationController.dismissAllNotifications));

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
