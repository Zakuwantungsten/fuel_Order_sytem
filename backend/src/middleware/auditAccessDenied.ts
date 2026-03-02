/**
 * auditAccessDenied middleware
 *
 * Automatically creates an ACCESS_DENIED audit log entry for every
 * 401 / 403 response — satisfying PCI-DSS requirement 10.2.3:
 *   "All invalid logical access attempts must be logged."
 *
 * This is equivalent to:
 *   - Google Cloud "Policy Denied" audit logs
 *   - Azure AD Conditional Access failure logs
 *   - AWS IAM deny events in CloudTrail
 *
 * The middleware intercepts res.json() before the response is sent,
 * checks the status code, and fires an async audit log without
 * blocking or modifying the response in any way.
 */
import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import AuditService from '../utils/auditService';
import logger from '../utils/logger';

/** Routes that we intentionally skip (e.g. auth login — handled explicitly). */
const SKIP_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/auth/login',
]);

export function auditAccessDenied(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    const status = res.statusCode;
    if ((status === 401 || status === 403) && !SKIP_PATHS.has(req.path)) {
      const authReq    = req as AuthRequest;
      const user       = authReq.user;
      const ipAddress  =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        (req.headers['x-real-ip'] as string) ||
        req.socket?.remoteAddress ||
        'unknown';

      // Derive a coarse resource type from the URL path (e.g. /api/v1/admin/users → admin)
      const pathParts   = req.path.replace(/^\/api\/(v\d+\/)?/, '').split('/');
      const resourceType = pathParts[0] || 'unknown';
      const resourceId   = pathParts[1];

      AuditService.logAccessDenied({
        username:     user?.username ?? 'anonymous',
        userId:       user?.userId,
        ipAddress,
        userAgent:    req.headers['user-agent'],
        resourceType,
        resourceId,
        errorCode:    String(status),
        correlationId: (req as any).requestId,
        details:
          body?.message
            ? `${status} – ${body.message}`
            : `${status} access denied on ${req.method} ${req.path}`,
      }).catch((err) => logger.error('Failed to log ACCESS_DENIED:', err));
    }

    return originalJson(body);
  };

  next();
}
