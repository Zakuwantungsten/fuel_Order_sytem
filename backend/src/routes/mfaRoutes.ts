import { Router } from 'express';
import mfaController from '../controllers/mfaController';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiters';

const router = Router();

// Use existing auth rate limiter for MFA endpoints
const mfaVerifyLimiter = authRateLimiter;
const mfaSetupLimiter = authRateLimiter;

// Get MFA status (requires authentication)
router.get('/status', authenticate, mfaController.getMFAStatus);

// TOTP Setup
router.post(
  '/setup/totp/generate',
  authenticate,
  mfaSetupLimiter,
  mfaController.generateTOTPSecret
);

router.post(
  '/setup/totp/verify',
  authenticate,
  mfaSetupLimiter,
  mfaController.verifyAndEnableTOTP
);

// MFA Verification (during login)
router.post('/verify', mfaVerifyLimiter, mfaController.verifyMFACode);

// Backup Codes
router.post(
  '/backup-codes/regenerate',
  authenticate,
  mfaController.regenerateBackupCodes
);

// Disable MFA
router.post('/disable', authenticate, mfaController.disableMFA);

// Trusted Devices
router.get('/trusted-devices', authenticate, mfaController.getTrustedDevices);

router.delete(
  '/trusted-devices/:deviceId',
  authenticate,
  mfaController.removeTrustedDevice
);

// Check if device is trusted (public, but needs user context)
router.post('/check-device', mfaController.checkTrustedDevice);

export default router;
