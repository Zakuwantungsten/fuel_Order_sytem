import { Router } from 'express';
import * as userController from '../controllers/userController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { userValidation, commonValidation } from '../middleware/validation';
import { validate } from '../utils/validate';
import { body } from 'express-validator';

const router = Router();

// All routes require authentication and admin privileges
router.use(authenticate);
router.use(authorize('super_admin', 'admin'));

// ── Export (before /:id routes to avoid mongo ID conflict) ──────────────────
router.get('/export', asyncHandler(userController.exportUsers));

// ── Import (super_admin only — enforced inside controller) ──────────────────
router.post(
  '/import',
  (req, _res, next) => {
    // Accept raw CSV body (text/plain or application/octet-stream)
    if (!req.is('text/plain') && !req.is('application/octet-stream') && !req.is('text/csv')) {
      req.body = req.body || '';
    }
    next();
  },
  asyncHandler(userController.importUsers)
);

// ── Bulk operations ──────────────────────────────────────────────────────────
router.post(
  '/bulk/delete',
  [body('userIds').isArray({ min: 1 }).withMessage('userIds must be a non-empty array')],
  validate,
  asyncHandler(userController.bulkDeleteUsers)
);

router.post(
  '/bulk/reset-passwords',
  [body('userIds').isArray({ min: 1 }).withMessage('userIds must be a non-empty array')],
  validate,
  asyncHandler(userController.bulkResetPasswords)
);

// ── Standard CRUD ────────────────────────────────────────────────────────────
router.get('/', commonValidation.pagination, validate, asyncHandler(userController.getAllUsers));
router.get('/:id', commonValidation.mongoId, validate, asyncHandler(userController.getUserById));

router.get(
  '/:id/detail',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.getUserDetail)
);

router.post(
  '/',
  userValidation.adminCreate,
  validate,
  asyncHandler(userController.createUser)
);

router.put(
  '/:id',
  commonValidation.mongoId,
  userValidation.update,
  validate,
  asyncHandler(userController.updateUser)
);

router.delete(
  '/:id',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.deleteUser)
);

// ── Password ─────────────────────────────────────────────────────────────────
router.post(
  '/:id/reset-password',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.resetUserPassword)
);

// ── Status toggles ────────────────────────────────────────────────────────────
router.patch(
  '/:id/toggle-status',
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.toggleUserStatus)
);

// ── Ban / Unban (Super Admin only) ────────────────────────────────────────────
router.post(
  '/:id/ban',
  authorize('super_admin'),
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.banUser)
);

router.post(
  '/:id/unban',
  authorize('super_admin'),
  commonValidation.mongoId,
  validate,
  asyncHandler(userController.unbanUser)
);

// ── Admin notes ───────────────────────────────────────────────────────────────
router.patch(
  '/:id/notes',
  commonValidation.mongoId,
  [body('notes').isString().withMessage('notes must be a string')],
  validate,
  asyncHandler(userController.updateUserNotes)
);

export default router;
