import { Router } from 'express';
import { authController } from '../controllers';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { userValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { 
  authRateLimiter, 
  passwordResetRateLimiter, 
  registrationRateLimiter 
} from '../middleware/rateLimiters';

const router = Router();

// Public routes with strict rate limiting
router.post(
  '/register', 
  registrationRateLimiter,
  userValidation.register, 
  validate, 
  asyncHandler(authController.register)
);

router.post(
  '/login', 
  authRateLimiter,
  userValidation.login, 
  validate, 
  asyncHandler(authController.login)
);

// MFA verification (after initial login)
router.post(
  '/verify-mfa',
  authRateLimiter,
  asyncHandler(authController.verifyMFA)
);

router.post('/refresh', asyncHandler(authController.refreshToken));

router.post(
  '/forgot-password', 
  passwordResetRateLimiter,
  userValidation.forgotPassword, 
  validate, 
  asyncHandler(authController.forgotPassword)
);

router.post(
  '/reset-password', 
  passwordResetRateLimiter,
  userValidation.resetPassword, 
  validate, 
  asyncHandler(authController.resetPassword)
);

// Protected routes
router.post('/logout', authenticate, asyncHandler(authController.logout));
router.get('/me', authenticate, asyncHandler(authController.getProfile));
router.put('/me', authenticate, userValidation.update, validate, asyncHandler(authController.updateProfile));
router.post('/change-password', authenticate, asyncHandler(authController.changePassword));
router.post('/first-login-password', authenticate, asyncHandler(authController.firstLoginPassword));
router.patch('/preferences', authenticate, asyncHandler(authController.updatePreferences));

export default router;
