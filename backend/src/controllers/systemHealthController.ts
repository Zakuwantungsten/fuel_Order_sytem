import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import mongoose from 'mongoose';
import databaseMonitor from '../utils/databaseMonitor';
import { activeSessionTracker } from '../utils/activeSessionTracker';
import { jobRegistry } from '../jobs/jobRegistry';
import logger from '../utils/logger';

/**
 * GET /api/v1/system-admin/system-health
 * Returns process metrics, DB stats, session count, job statuses.
 */
export const getSystemHealth = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    // DB state
    const dbState = mongoose.connection.readyState;
    const dbStateMap: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const dbStatus = dbStateMap[dbState] ?? 'unknown';

    // DB metrics (may throw if DB unavailable — caught below)
    let dbMetrics: any = null;
    try {
      dbMetrics = await databaseMonitor.collectMetrics();
    } catch {
      /* fail gracefully */
    }

    const sessions = await activeSessionTracker.getActive();
    const jobs = jobRegistry.listJobs().map(({ id, name, status, isEnabled, lastRunAt, lastRunStatus }) => ({
      id, name, status, isEnabled, lastRunAt, lastRunStatus,
    }));

    res.status(200).json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        process: {
          uptimeSeconds: Math.round(uptimeSeconds),
          // nodeVersion, platform, pid intentionally omitted (fingerprint defense)
          memory: {
            heapUsedMB: +(memUsage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotalMB: +(memUsage.heapTotal / 1024 / 1024).toFixed(2),
            rssMB: +(memUsage.rss / 1024 / 1024).toFixed(2),
            externalMB: +(memUsage.external / 1024 / 1024).toFixed(2),
          },
        },
        database: {
          status: dbStatus,
          connections: dbMetrics?.connections ?? null,
          storage: dbMetrics?.storage ?? null,
          collections: dbMetrics?.collections?.length ?? null,
        },
        sessions: {
          active: sessions.length,
        },
        jobs: {
          total: jobs.length,
          enabled: jobs.filter((j) => j.isEnabled).length,
          running: jobs.filter((j) => j.status === 'running').length,
          list: jobs,
        },
      },
    });
  } catch (err) {
    logger.error('getSystemHealth error:', err);
    res.status(500).json({ success: false, message: 'Failed to gather system health' });
  }
};
