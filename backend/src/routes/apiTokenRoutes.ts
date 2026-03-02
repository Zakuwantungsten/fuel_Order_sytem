import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as apiTokenController from '../controllers/apiTokenController';

const router = Router();
router.use(authenticate, authorize('super_admin'));

router.get('/', asyncHandler(apiTokenController.listTokens));
router.post('/', asyncHandler(apiTokenController.createToken));
router.delete('/:id', asyncHandler(apiTokenController.revokeToken));

export default router;
