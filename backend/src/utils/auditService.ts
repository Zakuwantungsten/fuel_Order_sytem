import { AuditLog, computeAuditHash } from '../models/AuditLog';
import { AuditAction, AuditSeverity, AuditOutcome } from '../types';
import logger from './logger';

// ─────────────────────────────────────────────────────────────────────────────
// Core log record shape accepted by AuditService.log()
// ─────────────────────────────────────────────────────────────────────────────
export interface AuditLogInput {
  userId?: string;
  username: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  details?: string;
  severity?: AuditSeverity;
  /** SUCCESS (default) | FAILURE | PARTIAL */
  outcome?: AuditOutcome;
  /** Piped from request x-request-id header */
  correlationId?: string;
  sessionId?: string;
  errorCode?: string;
  tags?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Default severity table
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SEVERITY: Record<AuditAction, AuditSeverity> = {
  CREATE: 'low', UPDATE: 'low', DELETE: 'medium', RESTORE: 'medium',
  PERMANENT_DELETE: 'high', IMPORT: 'medium',
  LOGIN: 'low', LOGOUT: 'low', FAILED_LOGIN: 'medium',
  PASSWORD_RESET: 'medium', TOKEN_REFRESH: 'low', SESSION_EXPIRED: 'low',
  ACCESS_DENIED: 'high', ROLE_CHANGE: 'critical',
  ACCOUNT_LOCKED: 'high', ACCOUNT_UNLOCKED: 'high',
  VIEW_SENSITIVE_DATA: 'medium', EXPORT: 'low',
  APPROVE: 'low', REJECT: 'low',
  CONFIG_CHANGE: 'critical', BULK_OPERATION: 'medium',
  ENABLE_MAINTENANCE: 'critical', DISABLE_MAINTENANCE: 'critical',
  CREATE_CHECKPOINT: 'low', UPDATE_CHECKPOINT: 'low',
  DELETE_CHECKPOINT: 'medium', REORDER_CHECKPOINTS: 'low', SEED_CHECKPOINTS: 'medium',
  VERIFY_INTEGRITY: 'low',
  user_migration_executed: 'high', user_flag_cleared: 'high',
};

// ─────────────────────────────────────────────────────────────────────────────
export class AuditService {

  // ── Core log method ─────────────────────────────────────────────────────
  // All helpers funnel through here. Never throws.
  // ────────────────────────────────────────────────────────────────────────
  static async log(data: AuditLogInput): Promise<void> {
    try {
      const severity: AuditSeverity = data.severity ?? DEFAULT_SEVERITY[data.action] ?? 'low';
      const outcome: AuditOutcome   = data.outcome ?? 'SUCCESS';

      await AuditLog.create({ timestamp: new Date(), ...data, severity, outcome });

      logger.info(
        `Audit [${data.action}] on ${data.resourceType} by ${data.username}` +
        ` | outcome=${outcome} | severity=${severity}`
      );
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  }

  // ── AUTH ────────────────────────────────────────────────────────────────

  static async logLogin(
    username: string, success: boolean,
    ipAddress?: string, userAgent?: string, userId?: string, correlationId?: string
  ): Promise<void> {
    await this.log({
      userId, username,
      action: success ? 'LOGIN' : 'FAILED_LOGIN',
      resourceType: 'auth', ipAddress, userAgent, correlationId,
      outcome: success ? 'SUCCESS' : 'FAILURE',
      details: success ? 'Successful login' : 'Failed login attempt',
      severity: success ? 'low' : 'medium',
    });
  }

  static async logLogout(
    userId: string, username: string, ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({
      userId, username, action: 'LOGOUT', resourceType: 'auth',
      ipAddress, correlationId, details: 'User logged out', severity: 'low',
    });
  }

  static async logPasswordReset(
    userId: string, username: string, ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({
      userId, username, action: 'PASSWORD_RESET', resourceType: 'auth',
      ipAddress, correlationId,
      details: 'Password reset via email token', severity: 'medium',
    });
  }

  static async logTokenRefresh(
    userId: string, username: string, ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({
      userId, username, action: 'TOKEN_REFRESH', resourceType: 'auth',
      ipAddress, correlationId,
      details: 'JWT access token refreshed', severity: 'low',
    });
  }

  // ── ACCESS CONTROL (PCI-DSS 10.2.1 / 10.2.3) ────────────────────────────

  /** Auto-called by the auditAccessDenied middleware on every 401/403 */
  static async logAccessDenied(params: {
    username: string; userId?: string;
    ipAddress?: string; userAgent?: string;
    resourceType: string; resourceId?: string;
    errorCode?: string; details?: string; correlationId?: string;
  }): Promise<void> {
    await this.log({
      ...params, action: 'ACCESS_DENIED', outcome: 'FAILURE', severity: 'high',
      details: params.details ?? `Access denied to ${params.resourceType}`,
    });
  }

  /** Log a role change — PCI-DSS 10.2.1, equivalent to Azure AD Audit / Google Admin Activity */
  static async logRoleChange(params: {
    userId: string; username: string;
    targetUserId: string; targetUsername: string;
    previousRole: string; newRole: string;
    ipAddress?: string; correlationId?: string;
  }): Promise<void> {
    await this.log({
      userId: params.userId, username: params.username,
      action: 'ROLE_CHANGE', resourceType: 'user', resourceId: params.targetUserId,
      previousValue: { role: params.previousRole }, newValue: { role: params.newRole },
      ipAddress: params.ipAddress, correlationId: params.correlationId,
      details: `Role changed for ${params.targetUsername}: ${params.previousRole} → ${params.newRole}`,
      severity: 'critical', tags: ['iam', 'privilege-change'],
    });
  }

  static async logAccountLock(
    targetUserId: string, targetUsername: string, reason: string,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({
      username: 'system', action: 'ACCOUNT_LOCKED', resourceType: 'user',
      resourceId: targetUserId, ipAddress, correlationId,
      details: `Account locked for ${targetUsername}: ${reason}`,
      severity: 'high', tags: ['security', 'brute-force'],
    });
  }

  static async logAccountUnlock(
    adminUserId: string, adminUsername: string,
    targetUserId: string, targetUsername: string,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({
      userId: adminUserId, username: adminUsername,
      action: 'ACCOUNT_UNLOCKED', resourceType: 'user', resourceId: targetUserId,
      ipAddress, correlationId,
      details: `Account unlocked for ${targetUsername} by ${adminUsername}`,
      severity: 'high', tags: ['security', 'account-management'],
    });
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  static async logCreate(
    userId: string, username: string,
    resourceType: string, resourceId: string, newValue: any,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'CREATE', resourceType, resourceId, newValue, ipAddress, correlationId, details: `Created ${resourceType}`, severity: 'low' });
  }

  static async logUpdate(
    userId: string, username: string,
    resourceType: string, resourceId: string, previousValue: any, newValue: any,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'UPDATE', resourceType, resourceId, previousValue, newValue, ipAddress, correlationId, details: `Updated ${resourceType}`, severity: 'low' });
  }

  static async logDelete(
    userId: string, username: string,
    resourceType: string, resourceId: string, previousValue: any,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'DELETE', resourceType, resourceId, previousValue, ipAddress, correlationId, details: `Soft deleted ${resourceType}`, severity: 'medium' });
  }

  static async logRestore(
    userId: string, username: string,
    resourceType: string, resourceId: string,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'RESTORE', resourceType, resourceId, ipAddress, correlationId, details: `Restored ${resourceType} from trash`, severity: 'medium' });
  }

  static async logPermanentDelete(
    userId: string, username: string,
    resourceType: string, resourceId: string, previousValue: any,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'PERMANENT_DELETE', resourceType, resourceId, previousValue, ipAddress, correlationId, details: `Permanently deleted ${resourceType}`, severity: 'high' });
  }

  // ── SYSTEM ────────────────────────────────────────────────────────────────

  static async logConfigChange(
    userId: string, username: string,
    configType: string, previousValue: any, newValue: any,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'CONFIG_CHANGE', resourceType: configType, previousValue, newValue, ipAddress, correlationId, details: `Changed system configuration: ${configType}`, severity: 'critical', tags: ['config', 'system'] });
  }

  static async logBulkOperation(
    userId: string, username: string,
    resourceType: string, operation: string, count: number,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'BULK_OPERATION', resourceType, ipAddress, correlationId, details: `Bulk ${operation} on ${count} ${resourceType} items`, severity: count > 10 ? 'high' : 'medium', tags: ['bulk', operation.toLowerCase()] });
  }

  static async logExport(
    userId: string, username: string,
    resourceType: string, exportFormat: string, recordCount: number,
    ipAddress?: string, correlationId?: string
  ): Promise<void> {
    await this.log({ userId, username, action: 'EXPORT', resourceType, ipAddress, correlationId, details: `Exported ${recordCount} ${resourceType} records as ${exportFormat}`, severity: recordCount > 100 ? 'medium' : 'low', tags: ['export', exportFormat.toLowerCase()] });
  }

  // ── DATA ACCESS (Google Cloud "Data Access Logs" equivalent) ─────────────

  /**
   * Log reading of sensitive data — mirrors Google Cloud Data Access Logs and
   * Microsoft Purview "MailItemsAccessed" / "SearchQueryInitiated" event types.
   */
  static async logSensitiveView(params: {
    userId: string; username: string;
    resourceType: string; resourceId?: string;
    details?: string; ipAddress?: string; correlationId?: string;
  }): Promise<void> {
    await this.log({ ...params, action: 'VIEW_SENSITIVE_DATA', severity: 'medium', tags: ['data-access', 'sensitive'] });
  }

  // ── WORKFLOW ──────────────────────────────────────────────────────────────

  static async logApprove(params: { userId: string; username: string; resourceType: string; resourceId: string; details?: string; ipAddress?: string; correlationId?: string; }): Promise<void> {
    await this.log({ ...params, action: 'APPROVE', severity: 'low' });
  }

  static async logReject(params: { userId: string; username: string; resourceType: string; resourceId: string; details?: string; ipAddress?: string; correlationId?: string; }): Promise<void> {
    await this.log({ ...params, action: 'REJECT', severity: 'low' });
  }

  // ── QUERY ─────────────────────────────────────────────────────────────────

  static async getLogs(options: {
    action?: AuditAction;
    resourceType?: string;
    username?: string;
    severity?: AuditSeverity;
    outcome?: AuditOutcome;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    page?: number;
    minRiskScore?: number;
    correlationId?: string;
  }) {
    const filter: any = {};

    if (options.action)        filter.action        = options.action;
    if (options.resourceType)  filter.resourceType  = options.resourceType;
    if (options.username)      filter.username      = new RegExp(options.username, 'i');
    if (options.severity)      filter.severity      = options.severity;
    if (options.outcome)       filter.outcome       = options.outcome;
    if (options.correlationId) filter.correlationId = options.correlationId;
    if (options.minRiskScore != null) filter.riskScore = { $gte: options.minRiskScore };

    if (options.startDate || options.endDate) {
      filter.timestamp = {};
      if (options.startDate) filter.timestamp.$gte = options.startDate;
      if (options.endDate)   filter.timestamp.$lte = options.endDate;
    }

    const limit = options.limit || 50;
    const skip  = ((options.page || 1) - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).limit(limit).skip(skip).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return { logs, pagination: { page: options.page || 1, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ── ANALYTICS / DASHBOARD ─────────────────────────────────────────────────

  /**
   * Real-time stats for the dashboard header cards.
   * Mirrors what Google Cloud Monitoring / Datadog provide in their audit dashboards.
   */
  static async getStatsSummary() {
    const now    = new Date();
    const today  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [todayTotal, todayCritical, todayFailedLogins, todayAccessDenied, highRiskCount, last24hFailures] =
      await Promise.all([
        AuditLog.countDocuments({ timestamp: { $gte: today } }),
        AuditLog.countDocuments({ timestamp: { $gte: today }, severity: 'critical' }),
        AuditLog.countDocuments({ timestamp: { $gte: today }, action: 'FAILED_LOGIN' }),
        AuditLog.countDocuments({ timestamp: { $gte: today }, action: 'ACCESS_DENIED' }),
        AuditLog.countDocuments({ timestamp: { $gte: last24h }, riskScore: { $gte: 70 } }),
        AuditLog.countDocuments({ timestamp: { $gte: last24h }, outcome: 'FAILURE' }),
      ]);

    return { todayTotal, todayCritical, todayFailedLogins, todayAccessDenied, highRiskCount, last24hFailures };
  }

  static async getActivitySummary(days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return AuditLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: { action: '$action', date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } } },
          count:    { $sum: 1 },
          failures: { $sum: { $cond: [{ $eq: ['$outcome', 'FAILURE'] }, 1, 0] } },
          avgRisk:  { $avg: '$riskScore' },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);
  }

  static async getRecentCriticalEvents(limit: number = 10) {
    return AuditLog.find({ severity: { $in: ['high', 'critical'] } })
      .sort({ timestamp: -1 }).limit(limit).lean();
  }

  // ── INTEGRITY VERIFICATION ────────────────────────────────────────────────
  /**
   * Walk the entire audit log chain and verify each entry's hash.
   * Equivalent to running `aws cloudtrail validate-logs`.
   * Returns an integrity report with tampered and chain-broken entries.
   */
  static async verifyIntegrity(params?: { startDate?: Date; endDate?: Date; limit?: number }) {
    const filter: any = {};
    if (params?.startDate) (filter.timestamp ??= {}).$gte = params.startDate;
    if (params?.endDate)   (filter.timestamp ??= {}).$lte = params.endDate;

    const batchSize = params?.limit ?? 5000;
    const entries = await AuditLog
      .find(filter).sort({ timestamp: 1, _id: 1 }).limit(batchSize).lean();

    const tampered:    { id: string; timestamp: Date; action: string; reason: string }[] = [];
    const chainBroken: { id: string; timestamp: Date; action: string; reason: string }[] = [];

    let previousHash = '0'.repeat(64);

    for (const entry of entries) {
      const id = String(entry._id);

      if (entry.hash) {
        const recomputed = computeAuditHash(
          {
            timestamp: entry.timestamp, userId: entry.userId, username: entry.username,
            action: entry.action, resourceType: entry.resourceType, resourceId: entry.resourceId,
            outcome: (entry as any).outcome ?? 'SUCCESS',
            ipAddress: entry.ipAddress, correlationId: (entry as any).correlationId,
          },
          entry.previousHash ?? previousHash
        );

        if (recomputed !== entry.hash)
          tampered.push({ id, timestamp: entry.timestamp, action: entry.action, reason: 'hash_mismatch' });

        if (entry.previousHash !== previousHash)
          chainBroken.push({ id, timestamp: entry.timestamp, action: entry.action, reason: 'chain_broken' });

        previousHash = entry.hash;
      }
    }

    const totalChecked = entries.length;
    const issues = tampered.length + chainBroken.length;
    const integrityScore = totalChecked === 0 ? 100 : Math.round(((totalChecked - issues) / totalChecked) * 100);

    return { totalChecked, valid: totalChecked - issues, tampered, chainBroken, integrityScore };
  }
}

export default AuditService;
