/**
 * Security Audit Log Controller
 *
 * Provides a filtered view of AuditLog entries for security-related changes.
 * Also provides CSV export endpoints for security data.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import { SecurityEvent } from '../models/SecurityEvent';
import { securityLogService } from '../services/securityLogService';

// Resource types that are security-related
const SECURITY_RESOURCE_TYPES = [
  'security_settings',
  'session',
  'user_session',
  'user_mfa',
  'ip_rule',
  'break_glass_account',
  'security_blocklist',
  'dlp_rule',
  'api_token',
  'security_score',
  'csrf_protection',
  'access_control',
];

/**
 * GET /system-admin/security-audit-log?limit=20&page=1
 * Returns recent security-related AuditLog entries.
 */
export async function getSecurityAuditLog(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

    const query: Record<string, any> = {
      resourceType: { $in: SECURITY_RESOURCE_TYPES },
    };

    // Optional: filter by action type
    if (req.query.action && typeof req.query.action === 'string') {
      query.action = req.query.action;
    }

    // Optional: date range
    if (req.query.from || req.query.to) {
      query.timestamp = {};
      if (req.query.from) {
        const d = new Date(req.query.from as string);
        if (!isNaN(d.getTime())) query.timestamp.$gte = d;
      }
      if (req.query.to) {
        const d = new Date(req.query.to as string);
        if (!isNaN(d.getTime())) query.timestamp.$lte = d;
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('timestamp username action resourceType resourceId previousValue newValue details severity outcome ipAddress')
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch security audit log', error: error.message });
  }
}

/**
 * GET /system-admin/security-events/export?hours=24&format=csv
 * Exports security events as CSV.
 */
export async function exportSecurityEvents(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const hours = Math.min(720, Math.max(1, parseInt(req.query.hours as string) || 24));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const events = await SecurityEvent.find({ timestamp: { $gte: since } })
      .sort({ timestamp: -1 })
      .limit(50000) // Safety cap
      .lean();

    const header = 'Timestamp,Event Type,Severity,IP,Method,URL,Blocked,User Agent,Username\n';
    const rows = events.map(e => {
      const ts = new Date(e.timestamp).toISOString();
      const ua = ((e.userAgent || '') as string).replace(/"/g, '""');
      const url = ((e.url || '') as string).replace(/"/g, '""');
      return `${ts},${e.eventType},${e.severity},${e.ip},${e.method},"${url}",${e.blocked},"${ua}",${e.username || ''}`;
    }).join('\n');

    const csv = header + rows;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="security-events-${hours}h-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to export events', error: error.message });
  }
}

/**
 * GET /system-admin/security-audit-log/export?days=30&format=csv
 * Exports security audit log as CSV.
 */
export async function exportSecurityAuditLog(req: AuthRequest, res: Response, _next: NextFunction) {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days as string) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await AuditLog.find({
      resourceType: { $in: SECURITY_RESOURCE_TYPES },
      timestamp: { $gte: since },
    })
      .sort({ timestamp: -1 })
      .limit(50000)
      .select('timestamp username action resourceType resourceId details severity outcome ipAddress')
      .lean();

    const header = 'Timestamp,Username,Action,Resource Type,Resource ID,Details,Severity,Outcome,IP Address\n';
    const rows = logs.map(l => {
      const ts = new Date(l.timestamp).toISOString();
      const details = ((l.details || '') as string).replace(/"/g, '""');
      return `${ts},${l.username},${l.action},${l.resourceType},${l.resourceId || ''},"${details}",${l.severity},${l.outcome},${l.ipAddress || ''}`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="security-audit-log-${days}d-${Date.now()}.csv"`);
    res.send(header + rows);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to export audit log', error: error.message });
  }
}
