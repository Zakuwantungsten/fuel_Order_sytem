import { config } from '../config';
import { BlockedIP, BlockReason } from '../models/BlockedIP';
import logger from '../utils/logger';
import { securityAlertService } from './securityAlertService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SuspiciousRecord {
  count: number;
  events: Array<{ reason: string; timestamp: number }>;
  firstEvent: number;
}

interface BlockRecord {
  expiresAt: number | null;   // null = permanent
  reason: BlockReason;
  blockedAt: number;
}

// ─── In-Memory State ─────────────────────────────────────────────────────────

// Fast in-memory lookup for blocked IPs (avoids DB hit per request)
const blockedIPs = new Map<string, BlockRecord>();

// Suspicious event counts per IP (sliding window)
const suspiciousIPs = new Map<string, SuspiciousRecord>();

// Track when we last synced from DB
let _lastDbSync = 0;
const DB_SYNC_INTERVAL_MS = 60_000; // Re-sync from DB every 60s

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeIP(ip: string): string {
  // Strip IPv6-mapped IPv4 prefix
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/** Prune expired entries from in-memory maps */
function pruneExpired(): void {
  const now = Date.now();
  for (const [ip, record] of blockedIPs) {
    if (record.expiresAt !== null && record.expiresAt <= now) {
      blockedIPs.delete(ip);
    }
  }
}

/** Prune old suspicious events outside the sliding window */
function pruneSuspiciousWindow(record: SuspiciousRecord): SuspiciousRecord {
  const windowStart = Date.now() - config.security404WindowMs;
  record.events = record.events.filter(e => e.timestamp >= windowStart);
  record.count = record.events.length;
  return record;
}

// ─── Sync from DB ────────────────────────────────────────────────────────────

async function syncFromDB(): Promise<void> {
  try {
    const now = new Date();
    const activeBlocks = await BlockedIP.find({
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } },
      ],
    }).lean();

    // Merge DB blocks into memory (don't remove memory-only blocks)
    for (const block of activeBlocks) {
      const ip = normalizeIP(block.ip);
      if (!blockedIPs.has(ip)) {
        blockedIPs.set(ip, {
          expiresAt: block.expiresAt ? block.expiresAt.getTime() : null,
          reason: block.reason,
          blockedAt: block.blockedAt.getTime(),
        });
      }
    }

    _lastDbSync = Date.now();
  } catch (err) {
    logger.error('BlocklistService: Failed to sync from DB', err);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

const BlocklistService = {

  /**
   * Check if an IP is currently blocked.
   * Fast in-memory check, periodically synced from DB.
   */
  async isBlocked(ip: string): Promise<{ blocked: boolean; reason?: BlockReason; retryAfterMs?: number }> {
    if (!config.securityIpBlocking) {
      return { blocked: false };
    }

    const normalized = normalizeIP(ip);

    // Sync from DB periodically
    if (Date.now() - _lastDbSync > DB_SYNC_INTERVAL_MS) {
      await syncFromDB();
    }

    // Prune expired blocks
    pruneExpired();

    const record = blockedIPs.get(normalized);
    if (!record) {
      return { blocked: false };
    }

    // Check expiry
    if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
      blockedIPs.delete(normalized);
      return { blocked: false };
    }

    const retryAfterMs = record.expiresAt !== null
      ? record.expiresAt - Date.now()
      : undefined;

    return { blocked: true, reason: record.reason, retryAfterMs };
  },

  /**
   * Record a suspicious event from an IP.
   * After N events within the sliding window → auto-block.
   */
  async recordSuspiciousEvent(ip: string, reason: BlockReason, details?: string): Promise<{ blocked: boolean }> {
    if (!config.securityIpBlocking) {
      return { blocked: false };
    }

    const normalized = normalizeIP(ip);
    const now = Date.now();

    // Get or create suspicious record
    let record = suspiciousIPs.get(normalized);
    if (!record) {
      record = { count: 0, events: [], firstEvent: now };
      suspiciousIPs.set(normalized, record);
    }

    // Add the event
    record.events.push({ reason, timestamp: now });

    // Prune events outside the window
    pruneSuspiciousWindow(record);

    logger.debug(`BlocklistService: Suspicious event from ${normalized} (${reason}), count=${record.count}`, {
      ip: normalized,
      reason,
      count: record.count,
      threshold: config.securitySuspiciousThreshold,
    });

    // Check threshold for auto-block
    if (record.count >= config.securitySuspiciousThreshold) {
      await this.block(
        normalized,
        config.securityBlockDurationMs,
        'auto_escalation',
        `Auto-blocked after ${record.count} suspicious events. Last reason: ${reason}. ${details || ''}`
      );

      // Clear suspicious record after blocking
      suspiciousIPs.delete(normalized);
      return { blocked: true };
    }

    return { blocked: false };
  },

  /**
   * Manually or automatically block an IP.
   * @param durationMs - block duration in ms. 0 or null = permanent.
   */
  async block(ip: string, durationMs: number | null, reason: BlockReason, details?: string, blockedBy?: string): Promise<void> {
    const normalized = normalizeIP(ip);
    const now = Date.now();
    const expiresAt = durationMs && durationMs > 0 ? now + durationMs : null;

    // Add to in-memory map
    blockedIPs.set(normalized, {
      expiresAt,
      reason,
      blockedAt: now,
    });

    // Persist to DB
    try {
      // Deactivate any existing active blocks for this IP
      await BlockedIP.updateMany(
        { ip: normalized, isActive: true },
        { isActive: false }
      );

      // Create new block record
      await BlockedIP.create({
        ip: normalized,
        reason,
        blockedAt: new Date(now),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        blockedBy: blockedBy || 'system',
        suspiciousCount: suspiciousIPs.get(normalized)?.count || 1,
        lastSuspiciousEvent: new Date(now),
        details: (details || '').slice(0, 1000),
        isActive: true,
      });

      logger.warn('BlocklistService: IP blocked', {
        event: 'IP_BLOCKED',
        ip: normalized,
        reason,
        durationMs,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : 'permanent',
        blockedBy: blockedBy || 'system',
      });

      // Fire alert to admins (email + Slack + WebSocket)
      securityAlertService.alertIPBlocked(
        normalized, reason, details || '', durationMs ?? null
      ).catch(() => {});
    } catch (err) {
      logger.error('BlocklistService: Failed to persist block to DB', { ip: normalized, err });
      // In-memory block is still active even if DB persist fails
    }
  },

  /**
   * Unblock an IP (manual admin action).
   */
  async unblock(ip: string, unblockedBy: string): Promise<boolean> {
    const normalized = normalizeIP(ip);

    // Remove from in-memory
    blockedIPs.delete(normalized);
    suspiciousIPs.delete(normalized);

    // Update DB
    try {
      const result = await BlockedIP.updateMany(
        { ip: normalized, isActive: true },
        {
          isActive: false,
          unblockedAt: new Date(),
          unblockedBy,
        }
      );

      logger.info('BlocklistService: IP unblocked', {
        event: 'IP_UNBLOCKED',
        ip: normalized,
        unblockedBy,
        recordsUpdated: result.modifiedCount,
      });

      return result.modifiedCount > 0;
    } catch (err) {
      logger.error('BlocklistService: Failed to unblock in DB', { ip: normalized, err });
      return false;
    }
  },

  /**
   * Get all currently blocked IPs (active, not expired).
   */
  async getBlockedIPs(): Promise<Array<{
    ip: string;
    reason: BlockReason;
    blockedAt: Date;
    expiresAt: Date | null;
    blockedBy: string;
    suspiciousCount: number;
    details: string;
  }>> {
    try {
      const now = new Date();
      const blocks = await BlockedIP.find({
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: now } },
        ],
      })
        .sort({ blockedAt: -1 })
        .lean();

      return blocks.map(b => ({
        ip: b.ip,
        reason: b.reason,
        blockedAt: b.blockedAt,
        expiresAt: b.expiresAt,
        blockedBy: b.blockedBy,
        suspiciousCount: b.suspiciousCount,
        details: b.details,
      }));
    } catch (err) {
      logger.error('BlocklistService: Failed to fetch blocked IPs', err);
      return [];
    }
  },

  /**
   * Get IPs with suspicious activity (not yet blocked).
   */
  getSuspiciousIPs(): Array<{
    ip: string;
    count: number;
    firstEvent: number;
    lastEvent: number;
    reasons: string[];
  }> {
    const result: Array<{
      ip: string;
      count: number;
      firstEvent: number;
      lastEvent: number;
      reasons: string[];
    }> = [];

    for (const [ip, record] of suspiciousIPs) {
      // Prune expired events first
      pruneSuspiciousWindow(record);
      if (record.count === 0) {
        suspiciousIPs.delete(ip);
        continue;
      }

      const reasons = [...new Set(record.events.map(e => e.reason))];
      const timestamps = record.events.map(e => e.timestamp);

      result.push({
        ip,
        count: record.count,
        firstEvent: Math.min(...timestamps),
        lastEvent: Math.max(...timestamps),
        reasons,
      });
    }

    return result.sort((a, b) => b.count - a.count);
  },

  /**
   * Get block history (all blocks, including expired/unblocked).
   */
  async getBlockHistory(options: {
    page?: number;
    limit?: number;
    ip?: string;
    reason?: string;
    activeOnly?: boolean;
  } = {}): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 200);
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (options.ip) filter.ip = { $regex: options.ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (options.reason) filter.reason = options.reason;
    if (options.activeOnly) {
      filter.isActive = true;
      filter.$or = [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ];
    }

    try {
      const [data, total] = await Promise.all([
        BlockedIP.find(filter).sort({ blockedAt: -1 }).skip(skip).limit(limit).lean(),
        BlockedIP.countDocuments(filter),
      ]);

      return { data, total, page, limit };
    } catch (err) {
      logger.error('BlocklistService: Failed to fetch block history', err);
      return { data: [], total: 0, page, limit };
    }
  },

  /**
   * Get stats for the security dashboard.
   */
  async getStats(): Promise<{
    activeBlocks: number;
    blockedToday: number;
    suspiciousIPs: number;
    topReasons: Array<{ reason: string; count: number }>;
  }> {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const [activeBlocks, blockedToday, reasonAgg] = await Promise.all([
        BlockedIP.countDocuments({
          isActive: true,
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: now } },
          ],
        }),
        BlockedIP.countDocuments({
          blockedAt: { $gte: todayStart },
        }),
        BlockedIP.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$reason', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      ]);

      return {
        activeBlocks,
        blockedToday,
        suspiciousIPs: suspiciousIPs.size,
        topReasons: reasonAgg.map(r => ({ reason: r._id, count: r.count })),
      };
    } catch (err) {
      logger.error('BlocklistService: Failed to fetch stats', err);
      return { activeBlocks: 0, blockedToday: 0, suspiciousIPs: 0, topReasons: [] };
    }
  },

  /**
   * Clean up expired blocks in DB (called by cron or on startup).
   */
  async cleanupExpiredBlocks(): Promise<number> {
    try {
      const result = await BlockedIP.updateMany(
        {
          isActive: true,
          expiresAt: { $ne: null, $lte: new Date() },
        },
        { isActive: false }
      );

      if (result.modifiedCount > 0) {
        logger.info(`BlocklistService: Cleaned up ${result.modifiedCount} expired blocks`);
      }

      return result.modifiedCount;
    } catch (err) {
      logger.error('BlocklistService: Failed to cleanup expired blocks', err);
      return 0;
    }
  },

  /** Force re-sync from DB (e.g. after manual DB edits). */
  async forceSync(): Promise<void> {
    _lastDbSync = 0;
    await syncFromDB();
  },

  /** Clear all in-memory state (for testing). */
  _clearMemory(): void {
    blockedIPs.clear();
    suspiciousIPs.clear();
    _lastDbSync = 0;
  },
};

export default BlocklistService;
