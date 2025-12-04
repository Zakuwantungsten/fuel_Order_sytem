import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { databaseMonitor } from '../utils/databaseMonitor';
import { AuditService } from '../utils/auditService';
import { User, DeliveryOrder, LPOEntry, FuelRecord, YardFuelDispense, DriverAccountEntry, AuditLog } from '../models';
import logger from '../utils/logger';
import emailService from '../services/emailService';

/**
 * Get database metrics
 */
export const getDatabaseMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const metrics = await databaseMonitor.collectMetrics();
    const status = await databaseMonitor.getStatus();

    res.status(200).json({
      success: true,
      data: {
        ...metrics,
        status: status.status,
        details: status.details,
      },
    });
  } catch (error: any) {
    logger.error('Error getting database metrics:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get database health check
 */
export const getDatabaseHealth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isHealthy = await databaseMonitor.healthCheck();
    const status = await databaseMonitor.getStatus();

    res.status(200).json({
      success: true,
      data: {
        healthy: isHealthy,
        status: status.status,
        details: status.details,
        timestamp: new Date(),
      },
    });
  } catch (error: any) {
    logger.error('Error checking database health:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get audit logs
 */
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      action,
      resourceType,
      username,
      severity,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const result = await AuditService.getLogs({
      action: action as any,
      resourceType: resourceType as string,
      username: username as string,
      severity: severity as any,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: Number(page),
      limit: Number(limit),
    });

    res.status(200).json({
      success: true,
      data: result.logs,
      pagination: result.pagination,
    });
  } catch (error: any) {
    logger.error('Error getting audit logs:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get activity summary for dashboard
 */
export const getActivitySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { days = 7 } = req.query;
    const summary = await AuditService.getActivitySummary(Number(days));

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    logger.error('Error getting activity summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get recent critical events
 */
export const getCriticalEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 10 } = req.query;
    const events = await AuditService.getRecentCriticalEvents(Number(limit));

    res.status(200).json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    logger.error('Error getting critical events:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get system statistics
 */
export const getSystemStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      userStats,
      doStats,
      lpoStats,
      fuelRecordStats,
      yardStats,
      driverAccountStats,
    ] = await Promise.all([
      // User stats
      User.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            active: [{ $match: { isDeleted: false, isActive: true } }, { $count: 'count' }],
            byRole: [
              { $match: { isDeleted: false } },
              { $group: { _id: '$role', count: { $sum: 1 } } },
            ],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
          },
        },
      ]),
      // Delivery Order stats
      DeliveryOrder.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            active: [{ $match: { isDeleted: false, isCancelled: false } }, { $count: 'count' }],
            cancelled: [{ $match: { isDeleted: false, isCancelled: true } }, { $count: 'count' }],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
            today: [
              {
                $match: {
                  isDeleted: false,
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),
      // LPO stats
      LPOEntry.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
            today: [
              {
                $match: {
                  isDeleted: false,
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),
      // Fuel Record stats
      FuelRecord.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
            today: [
              {
                $match: {
                  isDeleted: false,
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                },
              },
              { $count: 'count' },
            ],
          },
        },
      ]),
      // Yard dispense stats
      YardFuelDispense.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            byYard: [
              { $match: { isDeleted: false } },
              { $group: { _id: '$yard', count: { $sum: 1 } } },
            ],
            deleted: [{ $match: { isDeleted: true } }, { $count: 'count' }],
          },
        },
      ]),
      // Driver account stats
      DriverAccountEntry.aggregate([
        {
          $facet: {
            total: [{ $match: { isDeleted: false } }, { $count: 'count' }],
            pending: [{ $match: { isDeleted: false, status: 'pending' } }, { $count: 'count' }],
            settled: [{ $match: { isDeleted: false, status: 'settled' } }, { $count: 'count' }],
          },
        },
      ]),
    ]);

    const extractCount = (arr: any[]) => arr[0]?.count || 0;

    res.status(200).json({
      success: true,
      data: {
        users: {
          total: extractCount(userStats[0].total),
          active: extractCount(userStats[0].active),
          deleted: extractCount(userStats[0].deleted),
          byRole: userStats[0].byRole,
        },
        deliveryOrders: {
          total: extractCount(doStats[0].total),
          active: extractCount(doStats[0].active),
          cancelled: extractCount(doStats[0].cancelled),
          deleted: extractCount(doStats[0].deleted),
          today: extractCount(doStats[0].today),
        },
        lpoEntries: {
          total: extractCount(lpoStats[0].total),
          deleted: extractCount(lpoStats[0].deleted),
          today: extractCount(lpoStats[0].today),
        },
        fuelRecords: {
          total: extractCount(fuelRecordStats[0].total),
          deleted: extractCount(fuelRecordStats[0].deleted),
          today: extractCount(fuelRecordStats[0].today),
        },
        yardDispenses: {
          total: extractCount(yardStats[0].total),
          deleted: extractCount(yardStats[0].deleted),
          byYard: yardStats[0].byYard,
        },
        driverAccounts: {
          total: extractCount(driverAccountStats[0].total),
          pending: extractCount(driverAccountStats[0].pending),
          settled: extractCount(driverAccountStats[0].settled),
        },
      },
    });
  } catch (error: any) {
    logger.error('Error getting system stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get active sessions (users currently logged in)
 */
export const getActiveSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get users with refresh tokens and recent login
    const activeSessions = await User.find({
      isDeleted: false,
      isActive: true,
      refreshToken: { $ne: null, $exists: true },
      lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    })
      .select('username email role lastLogin')
      .lean();

    res.status(200).json({
      success: true,
      data: activeSessions,
    });
  } catch (error: any) {
    logger.error('Error getting active sessions:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Force logout a user (Super Admin only)
 */
export const forceLogout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can force logout users',
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Clear refresh token
    user.refreshToken = undefined;
    await user.save();

    // Log the action
    await AuditService.log({
      userId: req.user.userId,
      username: req.user.username,
      action: 'LOGOUT',
      resourceType: 'user_session',
      resourceId: userId,
      details: `Force logged out user ${user.username}`,
      severity: 'medium',
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `User ${user.username} has been logged out`,
    });
  } catch (error: any) {
    logger.error('Error forcing logout:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Enable database profiling (Super Admin only)
 */
export const enableProfiling = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'super_admin') {
      res.status(403).json({
        success: false,
        message: 'Only Super Admin can enable database profiling',
      });
      return;
    }

    const { level = 1, slowMs = 500 } = req.body;
    const success = await databaseMonitor.enableProfiling(level, slowMs);

    if (success) {
      await AuditService.logConfigChange(
        req.user.userId,
        req.user.username,
        'database_profiling',
        null,
        { level, slowMs },
        req.ip
      );
    }

    res.status(200).json({
      success,
      message: success ? 'Database profiling enabled' : 'Failed to enable profiling',
    });
  } catch (error: any) {
    logger.error('Error enabling profiling:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get recent system activity feed
 */
export const getActivityFeed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { limit = 20 } = req.query;

    const result = await AuditService.getLogs({
      limit: Number(limit),
    });

    res.status(200).json({
      success: true,
      data: result.logs,
    });
  } catch (error: any) {
    logger.error('Error getting activity feed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Test email configuration
 */
export const testEmailConfig = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const isConnected = await emailService.testConnection();
    
    if (isConnected) {
      res.status(200).json({
        success: true,
        message: 'Email service is configured and working',
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Email service is not configured or connection failed. Check SMTP credentials.',
      });
    }
  } catch (error: any) {
    logger.error('Error testing email config:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send test email to super admin
 */
export const sendTestEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { recipient } = req.body;
    
    // Use recipient if provided, otherwise use a default
    const emailRecipient = recipient || 'admin@example.com';
    
    await emailService.sendNotification(
      emailRecipient,
      'Test Email from Fuel Order System',
      '<p>This is a test email to verify email notifications are working correctly.</p><p>If you received this, the email service is configured properly.</p>'
    );

    res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending test email:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send daily summary email
 */
export const sendDailySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await emailService.sendDailySummary();

    res.status(200).json({
      success: true,
      message: 'Daily summary email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending daily summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Send weekly summary email
 */
export const sendWeeklySummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await emailService.sendWeeklySummary();

    res.status(200).json({
      success: true,
      message: 'Weekly summary email sent successfully',
    });
  } catch (error: any) {
    logger.error('Error sending weekly summary:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get recent activity from audit logs
 */
export const getRecentActivity = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    // Get recent audit logs
    const recentLogs = await AuditLog.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('timestamp username action resourceType resourceId details')
      .lean();

    // Format the logs for display
    const formattedActivity = recentLogs.map(log => {
      let description = '';
      let icon = 'activity';
      const details = typeof log.details === 'string' ? {} : log.details || {};
      
      switch (log.action) {
        case 'CREATE':
          if (log.resourceType === 'User') {
            description = `New user registered: ${(details as any).username || 'Unknown'}`;
            icon = 'user';
          } else {
            description = `New ${log.resourceType.toLowerCase()} created`;
            icon = 'plus';
          }
          break;
        case 'UPDATE':
          if (log.resourceType === 'Config') {
            description = `Config updated: ${(details as any).configKey || 'System settings'}`;
            icon = 'edit';
          } else {
            description = `${log.resourceType} updated`;
            icon = 'edit';
          }
          break;
        case 'DELETE':
          description = `${(details as any).count || 1} ${log.resourceType.toLowerCase()} items moved to trash`;
          icon = 'trash';
          break;
        case 'RESTORE':
          description = `${log.resourceType} restored from trash`;
          icon = 'refresh';
          break;
        case 'PERMANENT_DELETE':
          description = `${log.resourceType} permanently deleted`;
          icon = 'trash';
          break;
        case 'LOGIN':
          description = `${log.username} logged in`;
          icon = 'user';
          break;
        case 'LOGOUT':
          description = `${log.username} logged out`;
          icon = 'user';
          break;
        case 'FAILED_LOGIN':
          description = `Failed login attempt for ${log.username}`;
          icon = 'alert';
          break;
        case 'BULK_OPERATION':
          description = `Bulk operation completed: ${(details as any).operation || 'Unknown'}`;
          icon = 'database';
          break;
        case 'EXPORT':
          description = `Data exported: ${log.resourceType}`;
          icon = 'download';
          break;
        default:
          description = `${log.action} on ${log.resourceType}`;
          icon = 'activity';
      }

      // Calculate time ago
      const timeDiff = Date.now() - new Date(log.timestamp).getTime();
      let timeAgo = '';
      const minutes = Math.floor(timeDiff / 60000);
      const hours = Math.floor(timeDiff / 3600000);
      const days = Math.floor(timeDiff / 86400000);

      if (minutes < 1) {
        timeAgo = 'Just now';
      } else if (minutes < 60) {
        timeAgo = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
      } else if (hours < 24) {
        timeAgo = `${hours} hour${hours > 1 ? 's' : ''} ago`;
      } else {
        timeAgo = `${days} day${days > 1 ? 's' : ''} ago`;
      }

      return {
        id: log._id,
        description,
        icon,
        timestamp: log.timestamp,
        timeAgo,
        username: log.username,
        action: log.action,
        resourceType: log.resourceType,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedActivity,
    });
  } catch (error: any) {
    logger.error('Error getting recent activity:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

