import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { Request } from 'express';

interface AuditLogOptions {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'PERMANENT_DELETE' | 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN' | 'PASSWORD_RESET' | 'CONFIG_CHANGE' | 'BULK_OPERATION' | 'EXPORT' | 'APPROVE' | 'REJECT';
  resourceType: string;
  resourceId?: string;
  details?: string;
  previousValue?: any;
  newValue?: any;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Centralized audit logging utility
 * Automatically captures user info, IP address, and user agent from request
 */
export const logAudit = async (
  req: AuthRequest | Request,
  options: AuditLogOptions
): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;

    // Extract IP address
    const ipAddress = 
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket?.remoteAddress ||
      'unknown';

    // Extract user agent
    const userAgent = req.headers['user-agent'] || 'unknown';

    await AuditLog.create({
      timestamp: new Date(),
      userId: user?.userId || 'system',
      username: user?.username || 'system',
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      details: options.details,
      previousValue: options.previousValue,
      newValue: options.newValue,
      ipAddress,
      userAgent,
      severity: options.severity || determineSeverity(options.action),
    });
  } catch (error) {
    // Don't throw error to prevent audit logging from breaking the main operation
    console.error('Failed to create audit log:', error);
  }
};

/**
 * Determine severity based on action type
 */
function determineSeverity(action: string): 'low' | 'medium' | 'high' | 'critical' {
  switch (action) {
    case 'DELETE':
    case 'PERMANENT_DELETE':
      return 'high';
    case 'CONFIG_CHANGE':
    case 'PASSWORD_RESET':
      return 'medium';
    case 'CREATE':
    case 'UPDATE':
    case 'APPROVE':
    case 'REJECT':
      return 'low';
    case 'RESTORE':
    case 'BULK_OPERATION':
      return 'medium';
    case 'FAILED_LOGIN':
      return 'medium';
    case 'LOGIN':
    case 'LOGOUT':
    case 'EXPORT':
      return 'low';
    default:
      return 'low';
  }
}

/**
 * Sanitize sensitive data from objects before logging
 */
export const sanitizeForAudit = (obj: any): any => {
  if (!obj) return obj;
  
  const sanitized = { ...obj };
  const sensitiveFields = ['password', 'passwordHash', 'token', 'refreshToken', 'secret'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
};
