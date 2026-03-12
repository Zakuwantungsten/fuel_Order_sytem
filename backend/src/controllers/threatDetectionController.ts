import { Request, Response } from 'express';
import { AuditLog } from '../models';
import logger from '../utils/logger';

/**
 * Threat Detection / UEBA (User & Entity Behavior Analytics) Controller
 * Provides behavioral baseline deviation alerts per user.
 */

// Get behavioral anomalies for all users (last N days)
export const getAnomalies = async (req: Request, res: Response) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 1. Users with high-risk actions
    const highRiskUsers = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: since }, riskScore: { $gte: 50 } } },
      { $group: {
        _id: '$username',
        highRiskEvents: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        maxRiskScore: { $max: '$riskScore' },
        actions: { $addToSet: '$action' },
      }},
      { $sort: { avgRiskScore: -1 } },
      { $limit: 20 },
    ]);

    // 2. Failed login clusters (potential brute force)
    const failedLoginClusters = await AuditLog.aggregate([
      { $match: { action: 'FAILED_LOGIN', timestamp: { $gte: since } } },
      { $group: {
        _id: { ip: '$ipAddress', username: '$username' },
        attempts: { $sum: 1 },
        firstAttempt: { $min: '$timestamp' },
        lastAttempt: { $max: '$timestamp' },
      }},
      { $match: { attempts: { $gte: 5 } } },
      { $sort: { attempts: -1 } },
      { $limit: 20 },
    ]);

    // 3. Off-hours activity (8PM-6AM, weekends)
    const offHoursActivity = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $addFields: {
        hour: { $hour: '$timestamp' },
        dayOfWeek: { $dayOfWeek: '$timestamp' },
      }},
      { $match: {
        $or: [
          { hour: { $gte: 20 } },
          { hour: { $lt: 6 } },
          { dayOfWeek: { $in: [1, 7] } }, // Sunday=1, Saturday=7
        ],
      }},
      { $group: {
        _id: '$username',
        offHoursEvents: { $sum: 1 },
        actions: { $addToSet: '$action' },
        latestEvent: { $max: '$timestamp' },
      }},
      { $sort: { offHoursEvents: -1 } },
      { $limit: 15 },
    ]);

    // 4. Large data exports
    const largeExports = await AuditLog.aggregate([
      { $match: {
        action: { $in: ['EXPORT', 'DATA_EXPORT'] },
        timestamp: { $gte: since },
      }},
      { $group: {
        _id: '$username',
        exportCount: { $sum: 1 },
        totalRecords: { $sum: { $ifNull: ['$details.recordCount', 0] } },
        latestExport: { $max: '$timestamp' },
      }},
      { $sort: { exportCount: -1 } },
      { $limit: 10 },
    ]);

    // 5. Access pattern anomalies (users accessing resources they rarely touch)
    const accessAnomalies = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: since }, action: 'VIEW_SENSITIVE_DATA' } },
      { $group: {
        _id: { username: '$username', resourceType: '$resourceType' },
        accessCount: { $sum: 1 },
        lastAccess: { $max: '$timestamp' },
      }},
      { $match: { accessCount: { $lte: 2 } } }, // Rarely accessed
      { $sort: { lastAccess: -1 } },
      { $limit: 20 },
    ]);

    // 6. Impossible travel events
    const impossibleTravel = await AuditLog.aggregate([
      { $match: {
        timestamp: { $gte: since },
        'details.impossibleTravel': true,
      }},
      { $sort: { timestamp: -1 } },
      { $limit: 10 },
    ]);

    // Calculate overall threat level
    const totalAnomalies = highRiskUsers.length + failedLoginClusters.length + impossibleTravel.length;
    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (totalAnomalies >= 15) threatLevel = 'critical';
    else if (totalAnomalies >= 8) threatLevel = 'high';
    else if (totalAnomalies >= 3) threatLevel = 'medium';

    res.json({
      success: true,
      data: {
        threatLevel,
        period: { days, since: since.toISOString() },
        highRiskUsers,
        failedLoginClusters,
        offHoursActivity,
        largeExports,
        accessAnomalies,
        impossibleTravel,
        summary: {
          highRiskUserCount: highRiskUsers.length,
          bruteForceAttempts: failedLoginClusters.length,
          offHoursUsers: offHoursActivity.length,
          exportEvents: largeExports.length,
          impossibleTravelEvents: impossibleTravel.length,
        },
      },
    });
  } catch (error: any) {
    logger.error('Threat detection query failed:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get user behavioral baseline
export const getUserBaseline = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;
    const days = 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [activityByHour, activityByDay, topActions, riskHistory] = await Promise.all([
      // Hourly activity distribution
      AuditLog.aggregate([
        { $match: { username, timestamp: { $gte: since } } },
        { $group: { _id: { $hour: '$timestamp' }, count: { $sum: 1 } } },
        { $sort: { '_id': 1 } },
      ]),
      // Daily activity volume
      AuditLog.aggregate([
        { $match: { username, timestamp: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          count: { $sum: 1 },
        }},
        { $sort: { '_id': 1 } },
      ]),
      // Top actions
      AuditLog.aggregate([
        { $match: { username, timestamp: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      // Risk score trend
      AuditLog.aggregate([
        { $match: { username, timestamp: { $gte: since }, riskScore: { $gt: 0 } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          avgRisk: { $avg: '$riskScore' },
          maxRisk: { $max: '$riskScore' },
          count: { $sum: 1 },
        }},
        { $sort: { '_id': 1 } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        username,
        period: { days, since: since.toISOString() },
        activityByHour,
        activityByDay,
        topActions,
        riskHistory,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
