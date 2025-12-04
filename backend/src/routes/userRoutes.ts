import { Router } from 'express';
import * as userController from '../controllers/userController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { userValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// All routes require authentication and admin privileges
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// Get routes
router.get('/', commonValidation.pagination, validate, asyncHandler(userController.getAllUsers));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(userController.getUserById));

// Create route
router.post(
  '/',
  userValidation.register,
  validate,
  asyncHandler(userController.createUser)
);

// Update route
router.put(
  '/:id',
  commonValidation.mongoId,
  userValidation.update,
  validate,
  asyncHandler(userController.updateUser)
);

// Delete route
router.delete(
  '/:id',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.deleteUser)
);

// Reset password route
router.post(
  '/:id/reset-password',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.resetUserPassword)
);

// Toggle status route
router.patch(
  '/:id/toggle-status',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.toggleUserStatus)
);

// Ban user route (Super Admin only)
router.post(
  '/:id/ban',
  authorize('super_admin'),
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.banUser)
);

// Unban user route (Super Admin only)
router.post(
  '/:id/unban',
  authorize('super_admin'),
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.unbanUser)
);

export default router;
