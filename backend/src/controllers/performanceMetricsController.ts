import { Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { AuditLog } from '../models';

/**
 * GET /api/system-admin/performance-metrics
 * Aggregates AuditLog to surface action counts, hourly patterns, and user load
 */
export const getPerformanceMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
  const days = Math.min(Number(req.query.days) || 7, 90);
  const since = new Date(Date.now() - days * 86_400_000);

  const [actionCounts, hourlyCounts, userLoad, severityCounts] = await Promise.all([
    // Top actions by count
    AuditLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$action', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),

    // Requests per hour (last days)
    AuditLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]),

    // Top users by request volume
    AuditLog.aggregate([
      { $match: { timestamp: { $gte: since }, username: { $exists: true, $ne: null } } },
      { $group: { _id: '$username', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    // Severity distribution
    AuditLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$severity', count: { $sum: 1 } } },
    ]),
  ]);

  // Fill all 24 hours
  const hourMap: Record<number, number> = {};
  for (const h of hourlyCounts) hourMap[h._id] = h.count;
  const hourlyFull = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: hourMap[i] || 0 }));

  const totalRequests = actionCounts.reduce((s, a) => s + a.count, 0);
  const failureAudit = await AuditLog.countDocuments({ timestamp: { $gte: since }, outcome: 'FAILURE' });

  res.json({
    success: true,
    data: {
      period: { days, since },
      totalRequests,
      failureCount: failureAudit,
      failureRate: totalRequests > 0 ? ((failureAudit / totalRequests) * 100).toFixed(2) : '0',
      topActions: actionCounts.map((a) => ({ action: a._id, count: a.count })),
      hourlyDistribution: hourlyFull,
      topUsers: userLoad.map((u) => ({ username: u._id, requests: u.count })),
      severityBreakdown: severityCounts.map((s) => ({ severity: s._id, count: s.count })),
    },
  });
};

