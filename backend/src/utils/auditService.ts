import { AuditLog } from '../models';
import { IAuditLog, AuditAction, AuditSeverity } from '../types';
import logger from './logger';

/**
 * Audit Logging Service
 * Provides centralized audit logging for all system actions
 */
export class AuditService {
  /**
   * Log an audit action
   */
  static async log(data: {
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
  }): Promise<void> {
    try {
      // Determine severity based on action if not provided
      const severity = data.severity || this.getDefaultSeverity(data.action);

      await AuditLog.create({
        timestamp: new Date(),
        ...data,
        severity,
      });

      logger.info(`Audit: ${data.action} on ${data.resourceType} by ${data.username}`);
    } catch (error) {
      logger.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break the main operation
    }
  }

  /**
   * Log a login attempt
   */
  static async logLogin(
    username: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    userId?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: success ? 'LOGIN' : 'FAILED_LOGIN',
      resourceType: 'auth',
      ipAddress,
      userAgent,
      details: success ? 'Successful login' : 'Failed login attempt',
      severity: success ? 'low' : 'medium',
    });
  }

  /**
   * Log a logout
   */
  static async logLogout(
    userId: string,
    username: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'LOGOUT',
      resourceType: 'auth',
      ipAddress,
      details: 'User logged out',
      severity: 'low',
    });
  }

  /**
   * Log a password reset
   */
  static async logPasswordReset(
    userId: string,
    username: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'PASSWORD_RESET',
      resourceType: 'auth',
      ipAddress,
      details: 'Password reset via email token',
      severity: 'medium',
    });
  }

  /**
   * Log a create operation
   */
  static async logCreate(
    userId: string,
    username: string,
    resourceType: string,
    resourceId: string,
    newValue: any,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'CREATE',
      resourceType,
      resourceId,
      newValue,
      ipAddress,
      details: `Created ${resourceType}`,
      severity: 'low',
    });
  }

  /**
   * Log an update operation
   */
  static async logUpdate(
    userId: string,
    username: string,
    resourceType: string,
    resourceId: string,
    previousValue: any,
    newValue: any,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'UPDATE',
      resourceType,
      resourceId,
      previousValue,
      newValue,
      ipAddress,
      details: `Updated ${resourceType}`,
      severity: 'low',
    });
  }

  /**
   * Log a soft delete operation
   */
  static async logDelete(
    userId: string,
    username: string,
    resourceType: string,
    resourceId: string,
    previousValue: any,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'DELETE',
      resourceType,
      resourceId,
      previousValue,
      ipAddress,
      details: `Soft deleted ${resourceType}`,
      severity: 'medium',
    });
  }

  /**
   * Log a restore operation
   */
  static async logRestore(
    userId: string,
    username: string,
    resourceType: string,
    resourceId: string,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'RESTORE',
      resourceType,
      resourceId,
      ipAddress,
      details: `Restored ${resourceType} from trash`,
      severity: 'medium',
    });
  }

  /**
   * Log a permanent delete operation
   */
  static async logPermanentDelete(
    userId: string,
    username: string,
    resourceType: string,
    resourceId: string,
    previousValue: any,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'PERMANENT_DELETE',
      resourceType,
      resourceId,
      previousValue,
      ipAddress,
      details: `Permanently deleted ${resourceType}`,
      severity: 'high',
    });
  }

  /**
   * Log a configuration change
   */
  static async logConfigChange(
    userId: string,
    username: string,
    configType: string,
    previousValue: any,
    newValue: any,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'CONFIG_CHANGE',
      resourceType: configType,
      previousValue,
      newValue,
      ipAddress,
      details: `Changed system configuration: ${configType}`,
      severity: 'high',
    });
  }

  /**
   * Log a bulk operation
   */
  static async logBulkOperation(
    userId: string,
    username: string,
    resourceType: string,
    operation: string,
    count: number,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'BULK_OPERATION',
      resourceType,
      ipAddress,
      details: `Bulk ${operation} on ${count} ${resourceType} items`,
      severity: count > 10 ? 'high' : 'medium',
    });
  }

  /**
   * Log an export operation
   */
  static async logExport(
    userId: string,
    username: string,
    resourceType: string,
    exportFormat: string,
    recordCount: number,
    ipAddress?: string
  ): Promise<void> {
    await this.log({
      userId,
      username,
      action: 'EXPORT',
      resourceType,
      ipAddress,
      details: `Exported ${recordCount} ${resourceType} records as ${exportFormat}`,
      severity: recordCount > 100 ? 'medium' : 'low',
    });
  }

  /**
   * Get audit logs with filters
   */
  static async getLogs(options: {
    action?: AuditAction;
    resourceType?: string;
    username?: string;
    severity?: AuditSeverity;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    page?: number;
  }) {
    const filter: any = {};

    if (options.action) filter.action = options.action;
    if (options.resourceType) filter.resourceType = options.resourceType;
    if (options.username) filter.username = new RegExp(options.username, 'i');
    if (options.severity) filter.severity = options.severity;

    if (options.startDate || options.endDate) {
      filter.timestamp = {};
      if (options.startDate) filter.timestamp.$gte = options.startDate;
      if (options.endDate) filter.timestamp.$lte = options.endDate;
    }

    const limit = options.limit || 50;
    const skip = ((options.page || 1) - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return {
      logs,
      pagination: {
        page: options.page || 1,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get default severity based on action type
   */
  private static getDefaultSeverity(action: AuditAction): AuditSeverity {
    const severityMap: Record<AuditAction, AuditSeverity> = {
      CREATE: 'low',
      UPDATE: 'low',
      DELETE: 'medium',
      RESTORE: 'medium',
      PERMANENT_DELETE: 'high',
      LOGIN: 'low',
      LOGOUT: 'low',
      FAILED_LOGIN: 'medium',
      PASSWORD_RESET: 'medium',
      CONFIG_CHANGE: 'high',
      BULK_OPERATION: 'medium',
      EXPORT: 'low',
      ENABLE_MAINTENANCE: 'critical',
      DISABLE_MAINTENANCE: 'critical',
      CREATE_CHECKPOINT: 'low',
      UPDATE_CHECKPOINT: 'low',
      DELETE_CHECKPOINT: 'medium',
      REORDER_CHECKPOINTS: 'low',
      SEED_CHECKPOINTS: 'medium',
    };
    return severityMap[action] || 'low';
  }

  /**
   * Get activity summary for dashboard
   */
  static async getActivitySummary(days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const summary = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: {
            action: '$action',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.date': 1 } },
    ]);

    return summary;
  }

  /**
   * Get recent critical events
   */
  static async getRecentCriticalEvents(limit: number = 10) {
    return AuditLog.find({ severity: { $in: ['high', 'critical'] } })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  }
}

export default AuditService;
