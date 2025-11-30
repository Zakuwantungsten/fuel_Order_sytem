import { Router } from 'express';
import { authController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { userValidation } from '../middleware/validation';
import { validate } from '../utils/validate';

const router = Router();

// Public routes
router.post('/register', userValidation.register, validate, asyncHandler(authController.register));
router.post('/login', userValidation.login, validate, asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refreshToken));

// Protected routes
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.getProfile));
router.put('/me', authenticate, userValidation.update, validate, asyncHandler(authController.updateProfile));
router.post('/change-password', authenticate, asyncHandler(authController.changePassword));

export default router;
