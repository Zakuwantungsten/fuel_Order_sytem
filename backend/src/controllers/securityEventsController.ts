/**
 * Security Events Controller
 *
 * Admin endpoints for querying the SecurityEvent collection.
 * All routes require super_admin authentication.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { securityLogService, EventFilter } from '../services/securityLogService';
import { SecurityEventType, SecuritySeverity } from '../models/SecurityEvent';

const VALID_EVENT_TYPES: SecurityEventType[] = [
  'path_blocked', 'ip_blocked', 'auth_failure', 'suspicious_404',
  'honeypot_hit', 'ua_blocked', 'rate_limited', 'csrf_failure', 'jwt_failure',
];
const VALID_SEVERITIES: SecuritySeverity[] = ['low', 'medium', 'high', 'critical'];

/**
 * GET /  — paginated, filterable event list
 */
export async function getSecurityEvents(req: AuthRequest, res: Response, _next: NextFunction) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));

  const filters: EventFilter = {};
  if (req.query.eventType && VALID_EVENT_TYPES.includes(req.query.eventType as SecurityEventType)) {
    filters.eventType = req.query.eventType as SecurityEventType;
  }
  if (req.query.severity && VALID_SEVERITIES.includes(req.query.severity as SecuritySeverity)) {
    filters.severity = req.query.severity as SecuritySeverity;
  }
  if (req.query.ip && typeof req.query.ip === 'string') {
    filters.ip = req.query.ip;
  }
  if (req.query.from) {
    const d = new Date(req.query.from as string);
    if (!isNaN(d.getTime())) filters.from = d;
  }
  if (req.query.to) {
    const d = new Date(req.query.to as string);
    if (!isNaN(d.getTime())) filters.to = d;
  }

  const result = await securityLogService.getEvents(filters, { page, limit });
  res.json({ success: true, data: result });
}

/**
 * GET /stats  — aggregate counts for dashboard
 */
export async function getSecurityEventStats(req: AuthRequest, res: Response, _next: NextFunction) {
  const hours = Math.min(720, Math.max(1, parseInt(req.query.hours as string) || 24));
  const stats = await securityLogService.getStats(hours);
  res.json({ success: true, data: stats });
}

/**
 * GET /top-ips  — top offending IPs
 */
export async function getTopIPs(req: AuthRequest, res: Response, _next: NextFunction) {
  const hours = Math.min(720, Math.max(1, parseInt(req.query.hours as string) || 24));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const ips = await securityLogService.getTopIPs(hours, limit);
  res.json({ success: true, data: ips });
}

/**
 * GET /timeline  — bucketed time-series for charts
 */
export async function getTimeline(req: AuthRequest, res: Response, _next: NextFunction) {
  const hours = Math.min(720, Math.max(1, parseInt(req.query.hours as string) || 24));
  const bucketMinutes = Math.min(1440, Math.max(1, parseInt(req.query.bucket as string) || 60));
  const data = await securityLogService.getTimeline(hours, bucketMinutes);
  res.json({ success: true, data });
}
