import { Response } from 'express';
import mongoose from 'mongoose';
import type { AuthRequest } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import logger from '../utils/logger';

/**
 * GET /api/system-admin/activity-heatmap
 * Returns hourly + weekday aggregations of audit log entries.
 * Query: ?days=30&userId=xxx
 */
export const getActivityHeatmap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? '30'), 10), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const matchStage: Record<string, unknown> = { createdAt: { $gte: since } };
    if (req.query.userId) {
      matchStage.userId = req.query.userId;
    }

    // Aggregate by hour-of-day (0-23) and day-of-week (0=Sun, 6=Sat)
    const [hourlyData, weekdayData, topUsers, topActions] = await Promise.all([
      AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AuditLog.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' }, // 1=Sun ... 7=Sat
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$username', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      AuditLog.aggregate([
        { $match: matchStage },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Build full 0-23 hours array
    const hourMap: Record<number, number> = {};
    hourlyData.forEach(({ _id, count }) => { hourMap[_id] = count; });
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap[h] ?? 0 }));

    // Build full 0-6 weekdays array (convert from 1-7 to 0-6)
    const weekMap: Record<number, number> = {};
    weekdayData.forEach(({ _id, count }) => { weekMap[_id - 1] = count; });
    const weekdays = Array.from({ length: 7 }, (_, d) => ({
      day: d,
      label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d],
      count: weekMap[d] ?? 0,
    }));

    const total = hours.reduce((s, h) => s + h.count, 0);

    res.json({
      success: true,
      data: {
        hours,
        weekdays,
        topUsers: topUsers.map(({ _id, count }) => ({ username: _id, count })),
        topActions: topActions.map(({ _id, count }) => ({ action: _id, count })),
        total,
        days,
      },
    });
  } catch (error: any) {
    logger.error('Error generating activity heatmap:', error);
    throw error;
  }
};

