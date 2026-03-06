/**
 * Security Audit Log Routes
 *
 * Filtered audit log view for security-related admin changes.
 */
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getSecurityAuditLog,
  exportSecurityAuditLog,
} from '../controllers/securityAuditController';

const router = Router();

router.use(authenticate, authorize('super_admin'));

router.get('/', getSecurityAuditLog);
router.get('/export', exportSecurityAuditLog);

export default router;
