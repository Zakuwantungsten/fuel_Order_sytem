/**
 * Security Log Service
 *
 * Persists security events to the SecurityEvent collection.
 * Provides query helpers for the admin dashboard (events list, stats,
 * top offenders, breakdown by type).
 *
 * Fail-open: a write failure is logged but never throws to the caller,
 * so production traffic is never disrupted by a logging hiccup.
 */

import { SecurityEvent, SecurityEventType, SecuritySeverity } from '../models/SecurityEvent';
import { config } from '../config';
import logger from '../utils/logger';

export interface SecurityEventInput {
  ip: string;
  method?: string;
  url: string;
  userAgent?: string;
  eventType: SecurityEventType;
  severity?: SecuritySeverity;
  metadata?: Record<string, any>;
  blocked?: boolean;
  userId?: string;
  username?: string;
}

export interface EventFilter {
  eventType?: SecurityEventType;
  severity?: SecuritySeverity;
  ip?: string;
  from?: Date;
  to?: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

class SecurityLogService {
  // ───────────────────── Write ─────────────────────

  async logEvent(input: SecurityEventInput): Promise<void> {
    if (!config.securityEventLogging) return;

    try {
      await SecurityEvent.create({
        timestamp: new Date(),
        ip: input.ip,
        method: input.method || 'GET',
        url: input.url,
        userAgent: input.userAgent,
        eventType: input.eventType,
        severity: input.severity || 'medium',
        metadata: input.metadata,
        blocked: input.blocked ?? true,
        userId: input.userId,
        username: input.username,
      });
    } catch (err) {
      logger.error('[SecurityLogService] Failed to persist security event:', err);
    }
  }

  // ───────────────────── Read ──────────────────────

  async getEvents(filters: EventFilter = {}, pagination: PaginationOptions = {}) {
    const { page = 1, limit = 50 } = pagination;
    const query: Record<string, any> = {};

    if (filters.eventType) query.eventType = filters.eventType;
    if (filters.severity) query.severity = filters.severity;
    if (filters.ip) query.ip = filters.ip;
    if (filters.from || filters.to) {
      query.timestamp = {};
      if (filters.from) query.timestamp.$gte = filters.from;
      if (filters.to) query.timestamp.$lte = filters.to;
    }

    const [events, total] = await Promise.all([
      SecurityEvent.find(query)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SecurityEvent.countDocuments(query),
    ]);

    return { events, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getStats(hours: number = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [totalEvents, byType, bySeverity] = await Promise.all([
      SecurityEvent.countDocuments({ timestamp: { $gte: since } }),

      SecurityEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      SecurityEvent.aggregate([
        { $match: { timestamp: { $gte: since } } },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      hours,
      since: since.toISOString(),
      totalEvents,
      byType: Object.fromEntries(byType.map((r: any) => [r._id, r.count])),
      bySeverity: Object.fromEntries(bySeverity.map((r: any) => [r._id, r.count])),
    };
  }

  async getTopIPs(hours: number = 24, limit: number = 20) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const results = await SecurityEvent.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: '$ip',
          count: { $sum: 1 },
          lastSeen: { $max: '$timestamp' },
          types: { $addToSet: '$eventType' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    return results.map((r: any) => ({
      ip: r._id,
      count: r.count,
      lastSeen: r.lastSeen,
      types: r.types,
    }));
  }

  async getTimeline(hours: number = 24, bucketMinutes: number = 60) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const results = await SecurityEvent.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: {
            $toDate: {
              $subtract: [
                { $toLong: '$timestamp' },
                { $mod: [{ $toLong: '$timestamp' }, bucketMinutes * 60 * 1000] },
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return results.map((r: any) => ({ time: r._id, count: r.count }));
  }

  // ───────────────────── Cleanup ───────────────────

  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await SecurityEvent.deleteMany({ timestamp: { $lt: cutoff } });
    return result.deletedCount ?? 0;
  }
}

export const securityLogService = new SecurityLogService();
