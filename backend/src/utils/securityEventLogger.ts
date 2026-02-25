/**
 * Security Event Logger
 * Centralized utility for logging security-critical events to AuditLog
 * Used by middleware and controllers for authentication/authorization failures,
 * anomalies, and suspicious activities
 */

import { AuditService } from './auditService';
import logger from './logger';

export interface SecurityEventContext {
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  errorReason?: string;
  details?: Record<string, any>;
}

/**
 * Security Event Logger Service
 */
export class SecurityEventLogger {
  /**
   * Log unauthorized access (401)
   */
  static async logUnauthorized(context: SecurityEventContext): Promise<void> {
    try {
      await AuditService.log({
        userId: context.userId,
        username: context.username || 'anonymous',
        action: 'FAILED_LOGIN',
        resourceType: 'auth',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: `Unauthorized access attempt: ${context.errorReason || 'Invalid token'} at ${context.endpoint}`,
        severity: 'medium',
      });

      logger.warn('[SecurityEvent] Unauthorized access', {
        username: context.username || 'anonymous',
        endpoint: context.endpoint,
        ip: context.ipAddress,
        reason: context.errorReason,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log unauthorized access:', error);
    }
  }

  /**
   * Log forbidden access (403)
   */
  static async logForbidden(context: SecurityEventContext): Promise<void> {
    try {
      await AuditService.log({
        userId: context.userId,
        username: context.username || 'unknown',
        action: 'DELETE', // Use as generic "unauthorized operation" action
        resourceType: 'access_control',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: `Forbidden access attempt: ${context.errorReason || 'Insufficient permissions'} at ${context.endpoint} [${context.method}]`,
        severity: 'medium',
      });

      logger.warn('[SecurityEvent] Forbidden access', {
        userId: context.userId,
        username: context.username,
        endpoint: context.endpoint,
        method: context.method,
        ip: context.ipAddress,
        reason: context.errorReason,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log forbidden access:', error);
    }
  }

  /**
   * Log CSRF validation failure
   */
  static async logCSRFFailure(context: SecurityEventContext): Promise<void> {
    try {
      await AuditService.log({
        username: context.username || 'unknown',
        action: 'DELETE',
        resourceType: 'csrf_protection',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: `CSRF validation failed: ${context.errorReason} at ${context.endpoint}`,
        severity: 'high',
      });

      logger.warn('[SecurityEvent] CSRF validation failure', {
        username: context.username,
        endpoint: context.endpoint,
        ip: context.ipAddress,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log CSRF failure:', error);
    }
  }

  /**
   * Log JWT validation failure
   */
  static async logJWTFailure(context: SecurityEventContext): Promise<void> {
    try {
      await AuditService.log({
        username: context.username || 'unknown',
        action: 'FAILED_LOGIN',
        resourceType: 'auth',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: `JWT validation failed: ${context.errorReason} at ${context.endpoint}`,
        severity: 'medium',
      });

      logger.warn('[SecurityEvent] JWT validation failure', {
        username: context.username,
        endpoint: context.endpoint,
        ip: context.ipAddress,
        reason: context.errorReason,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log JWT failure:', error);
    }
  }

  /**
   * Log suspicious authentication pattern
   */
  static async logAuthAnomalyDetected(context: SecurityEventContext & {
    failedAttempts?: number;
    timeWindowMinutes?: number;
    locationChange?: boolean;
    newIP?: boolean;
    newCountry?: string;
  }): Promise<void> {
    try {
      const details = [
        `Suspicious auth pattern detected for ${context.username}`,
        context.failedAttempts ? `Failed attempts: ${context.failedAttempts}` : null,
        context.timeWindowMinutes ? `Time window: ${context.timeWindowMinutes}m` : null,
        context.locationChange ? 'Location changed' : null,
        context.newIP ? `New IP: ${context.ipAddress}` : null,
        context.newCountry ? `New country: ${context.newCountry}` : null,
      ]
        .filter(Boolean)
        .join('; ');

      await AuditService.log({
        userId: context.userId,
        username: context.username || 'unknown',
        action: 'FAILED_LOGIN',
        resourceType: 'auth_anomaly',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details,
        severity: 'high',
      });

      logger.warn('[SecurityEvent] Authentication anomaly', {
        username: context.username,
        failedAttempts: context.failedAttempts,
        ip: context.ipAddress,
        newCountry: context.newCountry,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log auth anomaly:', error);
    }
  }

  /**
   * Log suspicious bulk operation
   */
  static async logBulkOperationAnomaly(context: SecurityEventContext & {
    recordCount?: number;
    operationType?: string;
    isOffHours?: boolean;
    isWeekend?: boolean;
  }): Promise<void> {
    try {
      const anomalies = [
        context.recordCount && context.recordCount > 100 ? `Large operation: ${context.recordCount} records` : null,
        context.isOffHours ? 'Off-hours operation' : null,
        context.isWeekend ? 'Weekend operation' : null,
      ]
        .filter(Boolean)
        .join('; ');

      await AuditService.log({
        userId: context.userId,
        username: context.username || 'unknown',
        action: 'BULK_OPERATION',
        resourceType: context.operationType || 'unknown',
        ipAddress: context.ipAddress,
        details: `Anomalous bulk operation: ${anomalies}`,
        severity: context.recordCount && context.recordCount > 500 ? 'high' : 'medium',
      });

      logger.warn('[SecurityEvent] Bulk operation anomaly', {
        username: context.username,
        recordCount: context.recordCount,
        operationType: context.operationType,
        isOffHours: context.isOffHours,
        ip: context.ipAddress,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log bulk operation anomaly:', error);
    }
  }

  /**
   * Log suspicious data export
   */
  static async logExportAnomaly(context: SecurityEventContext & {
    recordCount?: number;
    exportFormat?: string;
    isOffHours?: boolean;
  }): Promise<void> {
    try {
      const anomalies = [
        context.recordCount && context.recordCount > 100 ? `Large export: ${context.recordCount} records` : null,
        context.isOffHours ? 'Off-hours export' : null,
      ]
        .filter(Boolean)
        .join('; ');

      await AuditService.log({
        userId: context.userId,
        username: context.username || 'unknown',
        action: 'EXPORT',
        resourceType: context.endpoint || 'unknown',
        ipAddress: context.ipAddress,
        details: `Data export: ${anomalies}`,
        severity: context.recordCount && context.recordCount > 500 ? 'high' : 'medium',
      });

      logger.warn('[SecurityEvent] Data export', {
        username: context.username,
        recordCount: context.recordCount,
        format: context.exportFormat,
        isOffHours: context.isOffHours,
        ip: context.ipAddress,
      });
    } catch (error) {
      logger.error('[SecurityEventLogger] Failed to log export anomaly:', error);
    }
  }
}

export default SecurityEventLogger;
