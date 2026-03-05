import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as mfaManagementController from '../controllers/mfaManagementController';

const router = Router();
router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(mfaManagementController.listMFAStatus));
router.post('/:userId/disable', asyncHandler(mfaManagementController.disableUserMFA));
router.post('/:userId/require', asyncHandler(mfaManagementController.requireUserMFA));
router.post('/:userId/allowed-methods', asyncHandler(mfaManagementController.setUserAllowedMethods));

export default router;
