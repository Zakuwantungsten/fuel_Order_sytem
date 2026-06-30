import mongoose from 'mongoose';
import { EventEmitter } from 'events';
import * as v8 from 'v8';
import logger from './logger';
import { IDatabaseMetrics, IActiveConnection, ISlowQuery, ICollectionStats } from '../types';
import { activeSessionTracker } from './activeSessionTracker';
import { sendCriticalEmail } from '../services/emailService';

/**
 * Database Monitor Service
 * Provides real-time monitoring of MongoDB database health and performance
 */
export class DatabaseMonitor extends EventEmitter {
  private metricsInterval: ReturnType<typeof setInterval> | null = null;
  private slowQueryThreshold = 500; // ms
  private isMonitoring = false;
  /** Cooldown tracker: prevents repeat emails for the same alert type within 30 min */
  private readonly _alertCooldowns = new Map<string, number>();
  private readonly ALERT_COOLDOWN_MS = 30 * 60 * 1000;
  /**
   * Bounded ring buffer of recent RSS samples (one per monitor tick). Used to
   * detect SUSTAINED memory growth — the real slow-leak signature — as opposed
   * to the instantaneous heap-limit spike already handled in checkAlertThresholds.
   * Capped so the trend tracker can never itself become a memory leak.
   */
  private readonly _rssSamples: number[] = [];
  private readonly RSS_SAMPLE_MAX = 30; // ~30 samples → 30 min at the 60s tick

  constructor() {
    super();
  }

  /**
   * Start monitoring the database
   */
  start(intervalMs: number = 5000): void {
    if (this.isMonitoring) {
      logger.warn('Database monitor is already running');
      return;
    }

    this.setupConnectionListeners();
    this.startMetricsCollection(intervalMs);
    this.isMonitoring = true;
    logger.info('Database monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Database monitor stopped');
  }

  /**
   * Setup connection event listeners
   */
  private setupConnectionListeners(): void {
    mongoose.connection.on('connected', () => {
      this.emit('status', { status: 'connected', timestamp: new Date() });
      logger.info('Database connected');
    });

    mongoose.connection.on('disconnected', () => {
      this.emit('status', { status: 'disconnected', timestamp: new Date() });
      this.emit('alert', {
        type: 'critical',
        message: 'Database disconnected!',
        timestamp: new Date(),
      });
      logger.error('Database disconnected');
      
      // Send critical email notification
      sendCriticalEmail({
        subject: 'Database Disconnected',
        message: `<strong>CRITICAL:</strong> The MongoDB database has disconnected at ${new Date().toLocaleString()}.<br/><br/>
                  <strong>Impact:</strong> All database operations are currently unavailable.<br/>
                  <strong>Action Required:</strong> Immediate investigation needed.<br/><br/>
                  Please check the database server status and connection configuration.`,
        priority: 'critical',
      }).catch(err => logger.error('Failed to send disconnection email:', err));
    });

    mongoose.connection.on('error', (err) => {
      this.emit('error', { error: err.message, timestamp: new Date() });
      this.emit('alert', {
        type: 'critical',
        message: `Database error: ${err.message}`,
        timestamp: new Date(),
      });
      logger.error('Database error:', err);
      
      // Send critical email notification
      sendCriticalEmail({
        subject: 'Database Error Detected',
        message: `<strong>ERROR:</strong> A database error has occurred at ${new Date().toLocaleString()}.<br/><br/>
                  <strong>Error Details:</strong><br/>
                  <code style="background: #f3f4f6; padding: 10px; display: block; border-radius: 4px; margin-top: 10px;">${err.message}</code><br/><br/>
                  <strong>Action Required:</strong> Review database logs and investigate the cause.`,
        priority: 'critical',
      }).catch(e => logger.error('Failed to send error email:', e));
    });

    mongoose.connection.on('reconnected', () => {
      this.emit('status', { status: 'reconnected', timestamp: new Date() });
      logger.info('Database reconnected');
    });
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(intervalMs: number): void {
    // Collect immediately on start, then periodically. The periodic path is the
    // ONLY place that evaluates alert thresholds — see collectMetrics() note below.
    const tick = async () => {
      // Sample memory FIRST and unconditionally — it must run even when DB metric
      // collection fails (e.g. DB briefly unreachable), since memory pressure is
      // independent of database availability.
      this.sampleMemory();
      const metrics = await this.collectMetrics();
      if (metrics) this.checkAlertThresholds(metrics);
    };

    void tick();
    this.metricsInterval = setInterval(() => void tick(), intervalMs);
  }

  /**
   * Sample process memory once per tick.
   *
   * 2.1 — Emits a compact, parseable one-line marker at info level so the memory
   *       trend can be graphed straight from the logs (rss, heapUsed, % of the
   *       hard heap limit). 2.3 (below) consumes the bounded sample buffer to
   *       detect sustained growth.
   */
  private sampleMemory(): void {
    const mem = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const rssMB = mem.rss / 1024 / 1024;
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    const heapPct = heapLimit > 0 ? (mem.heapUsed / heapLimit) * 100 : 0;

    // Stable key=value shape so it's easy to grep/extract: `[mem] rss=… heap=… …`
    logger.info(
      `[mem] rss=${rssMB.toFixed(0)}MB heapUsed=${heapUsedMB.toFixed(0)}MB heapLimitPct=${heapPct.toFixed(0)}%`
    );

    // Maintain the bounded ring buffer (drop oldest once full).
    this._rssSamples.push(mem.rss);
    if (this._rssSamples.length > this.RSS_SAMPLE_MAX) this._rssSamples.shift();

    // 2.3 sustained-growth trend check runs against this buffer.
    this.checkMemoryTrend();
  }

  /**
   * 2.3 — Detect SUSTAINED memory growth (slow-leak signature) and raise a
   * rate-limited warning + email. Deliberately distinct from the instantaneous
   * heap>=90% critical alert in checkAlertThresholds: that catches a sudden
   * spike; this catches a slow climb that would otherwise only surface as a
   * mysterious mid-day PM2 restart.
   */
  private checkMemoryTrend(): void {
    // Need a full window before judging a trend (avoids false alarms on startup).
    if (this._rssSamples.length < this.RSS_SAMPLE_MAX) return;

    // Compare the first third vs the last third of the window. A real leak shows
    // last-third >> first-third; ordinary GC sawtooth averages out and does not.
    const third = Math.max(1, Math.floor(this.RSS_SAMPLE_MAX / 3));
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const oldAvg = avg(this._rssSamples.slice(0, third));
    const newAvg = avg(this._rssSamples.slice(-third));

    const growthPct = oldAvg > 0 ? ((newAvg - oldAvg) / oldAvg) * 100 : 0;
    // Only care once RSS is genuinely elevated (>1.5 GB) — small fluctuations at
    // low memory are noise, not a problem worth paging anyone about.
    const elevated = newAvg > 1.5 * 1024 * 1024 * 1024;

    if (growthPct < 25 || !elevated) return;

    const newAvgMB = (newAvg / 1024 / 1024).toFixed(0);
    this.emit('alert', {
      type: 'warning',
      message: `RSS trending up ${growthPct.toFixed(0)}% over ${this.RSS_SAMPLE_MAX} samples (now ~${newAvgMB}MB)`,
      timestamp: new Date(),
    });

    // Rate-limit the email via the shared cooldown map (one per 30 min).
    const now = Date.now();
    const last = this._alertCooldowns.get('rss_trend') ?? 0;
    if (now - last >= this.ALERT_COOLDOWN_MS) {
      this._alertCooldowns.set('rss_trend', now);
      sendCriticalEmail({
        subject: 'DB Alert: Memory Trending Upward (possible leak)',
        message: `Resident memory (RSS) has grown roughly <strong>${growthPct.toFixed(0)}%</strong> over the last ~${this.RSS_SAMPLE_MAX} minutes (now ~${newAvgMB} MB).<br/><br/>
                  This is the signature of a <strong>slow memory leak</strong> rather than a transient spike. The process will auto-restart at the PM2 ceiling, but if this recurs after deploys it should be investigated.<br/><br/>
                  <strong>Action:</strong> Correlate with recent releases and check the <code>[mem]</code> trend lines in the logs.`,
        priority: 'high',
      }).catch(e => logger.error('Failed to send RSS trend email:', e));
    }
  }

  /**
   * Collect database metrics (optimized for speed)
   */
  async collectMetrics(): Promise<IDatabaseMetrics | null> {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        logger.warn('Database not connected, skipping metrics collection');
        return null;
      }

      const admin = db.admin();

      // Get server status for connection and performance info
      let serverStatus: any = { connections: {} };
      try {
        serverStatus = await admin.serverStatus();
      } catch (e) {
        // May not have permission for serverStatus
        logger.debug('Could not get server status');
      }
      
      // Get database stats for storage info
      let dbStats: any = {};
      try {
        dbStats = await db.stats();
      } catch (e) {
        logger.debug('Could not get db stats');
      }

      // Get collection stats (simplified - just count documents, skip detailed stats)
      const collections = await this.getCollectionStatsSimple();

      const activeConnections = await this.getActiveConnections();

      const metrics: IDatabaseMetrics = {
        connections: {
          current: serverStatus.connections?.current || 0,
          available: serverStatus.connections?.available || 0,
          totalCreated: serverStatus.connections?.totalCreated || 0,
        },
        performance: {
          queriesPerSecond: serverStatus.opcounters?.query || 0,
          averageResponseTime: 0, // Skip slow calculation
          slowQueries: [], // Skip slow query fetch
          failedQueries: 0,
        },
        storage: {
          totalSize: dbStats.storageSize || 0,
          dataSize: dbStats.dataSize || 0,
          indexSize: dbStats.indexSize || 0,
          freeSpace: dbStats.freeStorageSize || 0,
          growthRate: 0,
        },
        collections,
        activeConnections,
      };

      this.emit('metrics', metrics);
      // NOTE: alert thresholds are deliberately NOT evaluated here. collectMetrics()
      // is called on-demand whenever a super-admin opens a monitoring/health tab, so
      // evaluating (and emailing) alerts here meant alerts only ever fired — and fired
      // repeatedly — while an admin happened to be watching. Threshold evaluation now
      // lives solely on the periodic interval started by start(), so it reflects real
      // server state continuously and independently of who is viewing the dashboard.
      return metrics;
    } catch (error: any) {
      logger.error('Failed to collect database metrics:', error);
      this.emit('error', { error: error.message, timestamp: new Date() });
      return null;
    }
  }

  /**
   * Get active application sessions tracked by activeSessionTracker.
   * This works on all MongoDB Atlas tiers (no admin commands required).
   */
  async getActiveConnections(): Promise<IActiveConnection[]> {
    const sessions = await activeSessionTracker.getActive();
    const now = Date.now();

    return sessions.map((s) => ({
      identifier: `${s.username}@${s.ip}`,
      user: s.username,
      role: s.role,
      ip: s.ip,
      requestCount: s.requestCount,
      durationSeconds: Math.floor((now - s.firstSeen.getTime()) / 1000),
      activeSince: s.firstSeen.toISOString(),
      lastSeen: s.lastSeen.toISOString(),
    }));
  }

  /**
   * Get simplified stats for each collection (faster)
   */
  private async getCollectionStatsSimple(): Promise<ICollectionStats[]> {
    const db = mongoose.connection.db;
    if (!db) return [];

    try {
      const collectionNames = await db.listCollections().toArray();
      const stats: ICollectionStats[] = [];

      // Limit to main collections only for speed
      const mainCollections = ['users', 'deliveryorders', 'lposummaries', 'fuelrecords', 'yardfueldispenses', 'driveraccountentries', 'auditlogs'];
      
      for (const col of collectionNames) {
        // Skip system collections and only process main ones
        if (col.name.startsWith('system.')) continue;
        
        try {
          // Just get document count - much faster than full stats
          const count = await db.collection(col.name).estimatedDocumentCount();
          stats.push({
            name: col.name,
            documentCount: count,
            size: 0, // Skip - requires slow command
            avgDocSize: 0,
            indexes: 0,
          });
        } catch (e) {
          // Skip collections we can't access
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to get collection stats:', error);
      return [];
    }
  }

  /**
   * Calculate average response time from recent operations
   */
  private async calculateAverageResponseTime(): Promise<number> {
    // This would require profiling enabled or custom tracking
    // For now, return a placeholder
    return 0;
  }

  /**
   * Get recent slow queries from the system.profile collection
   */
  private async getRecentSlowQueries(): Promise<ISlowQuery[]> {
    const db = mongoose.connection.db;
    if (!db) return [];

    try {
      // Check if profiling is enabled
      const profileCollection = db.collection('system.profile');
      const exists = await db.listCollections({ name: 'system.profile' }).hasNext();

      if (!exists) {
        return [];
      }

      const slowQueries = await profileCollection
        .find({ millis: { $gt: this.slowQueryThreshold } })
        .sort({ ts: -1 })
        .limit(10)
        .toArray();

      return slowQueries.map((q: any) => ({
        query: JSON.stringify(q.command || q.query || {}),
        collection: q.ns || '',
        executionTime: q.millis || 0,
        timestamp: q.ts || new Date(),
        user: q.user || undefined,
      }));
    } catch (error) {
      // Profiling might not be enabled
      return [];
    }
  }

  /**
   * Check metrics against alert thresholds and send email notifications for critical breaches.
   * Emails are rate-limited to one per 30 minutes per alert type.
   */
  private checkAlertThresholds(metrics: IDatabaseMetrics): void {
    const now = Date.now();
    const canAlert = (key: string): boolean => {
      const last = this._alertCooldowns.get(key) ?? 0;
      if (now - last >= this.ALERT_COOLDOWN_MS) {
        this._alertCooldowns.set(key, now);
        return true;
      }
      return false;
    };

    // Connection pool exhaustion warning (90% used)
    const connectionUsage = metrics.connections.current / (metrics.connections.available || 1);
    if (connectionUsage >= 0.9) {
      this.emit('alert', {
        type: 'critical',
        message: `Connection pool nearly exhausted! ${metrics.connections.current}/${metrics.connections.available}`,
        timestamp: new Date(),
      });
      if (canAlert('connection_critical')) {
        sendCriticalEmail({
          subject: 'DB Alert: Connection Pool Nearly Exhausted',
          message: `Database connection pool usage is <strong>${(connectionUsage * 100).toFixed(1)}%</strong> (${metrics.connections.current} active / ${metrics.connections.available} available).<br/><br/>
                    <strong>Action Required:</strong> Reduce concurrent operations or increase the connection pool limit.`,
          priority: 'critical',
        }).catch(e => logger.error('Failed to send connection alert email:', e));
      }
    } else if (connectionUsage >= 0.7) {
      this.emit('alert', {
        type: 'warning',
        message: `Connection pool usage high: ${(connectionUsage * 100).toFixed(1)}%`,
        timestamp: new Date(),
      });
    }

    // Storage warning (less than 500MB free)
    if (metrics.storage.freeSpace > 0 && metrics.storage.freeSpace < 500 * 1024 * 1024) {
      this.emit('alert', {
        type: 'critical',
        message: `Database storage critically low! Only ${(metrics.storage.freeSpace / 1024 / 1024).toFixed(1)}MB free`,
        timestamp: new Date(),
      });
      if (canAlert('storage_critical')) {
        sendCriticalEmail({
          subject: 'DB Alert: Storage Critically Low',
          message: `Database free storage is critically low: only <strong>${(metrics.storage.freeSpace / 1024 / 1024).toFixed(1)} MB</strong> remaining.<br/><br/>
                    <strong>Action Required:</strong> Archive old records or expand storage capacity immediately.`,
          priority: 'critical',
        }).catch(e => logger.error('Failed to send storage alert email:', e));
      }
    }

    // High response time
    if (metrics.performance.averageResponseTime > 1000) {
      this.emit('alert', {
        type: 'warning',
        message: `High database response time: ${metrics.performance.averageResponseTime}ms`,
        timestamp: new Date(),
      });
    }

    // Memory usage — measured against the actual V8 heap *limit* (--max-old-space-size),
    // NOT heapTotal. heapTotal is the heap V8 has currently committed; it grows lazily
    // and a healthy process routinely sits at 70-95% of it, so heapUsed/heapTotal is a
    // false-positive generator. heap_size_limit is the hard ceiling before the process
    // OOMs, so heapUsed/heap_size_limit is the real "running out of memory" signal.
    const mem = process.memoryUsage();
    const heapLimit = v8.getHeapStatistics().heap_size_limit;
    const heapPct = heapLimit > 0 ? (mem.heapUsed / heapLimit) * 100 : 0;
    if (heapPct >= 90) {
      this.emit('alert', {
        type: 'critical',
        message: `High memory usage: ${heapPct.toFixed(1)}% of heap limit used`,
        timestamp: new Date(),
      });
      if (canAlert('memory_critical')) {
        sendCriticalEmail({
          subject: 'DB Alert: High Memory Usage',
          message: `Node.js heap usage is at <strong>${heapPct.toFixed(1)}%</strong> of the heap limit (${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB used / ${(heapLimit / 1024 / 1024).toFixed(0)} MB limit, RSS ${(mem.rss / 1024 / 1024).toFixed(0)} MB).<br/><br/>
                    <strong>Action Required:</strong> Investigate memory leaks or restart the service.`,
          priority: 'critical',
        }).catch(e => logger.error('Failed to send memory alert email:', e));
      }
    }
  }

  /**
   * Get current database status
   */
  async getStatus(): Promise<{ status: string; details: any }> {
    const state = mongoose.connection.readyState;
    const stateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      status: stateMap[state] || 'unknown',
      details: {
        // ✅ SECURITY: host and port omitted — internal DB hostnames / private IPs
        // must never be returned to clients (OWASP info-leakage).
        name: mongoose.connection.name,
        readyState: state,
      },
    };
  }

  /**
   * Get a quick health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const db = mongoose.connection.db;
      if (!db) return false;

      await db.admin().ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Enable profiling for slow query detection
   */
  async enableProfiling(level: 0 | 1 | 2 = 1, slowMs: number = 500): Promise<boolean> {
    try {
      const db = mongoose.connection.db;
      if (!db) return false;

      await db.command({ profile: level, slowms: slowMs });
      this.slowQueryThreshold = slowMs;
      logger.info(`Database profiling enabled at level ${level} with slowms=${slowMs}`);
      return true;
    } catch (error) {
      logger.error('Failed to enable profiling:', error);
      return false;
    }
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Create singleton instance
export const databaseMonitor = new DatabaseMonitor();
export default databaseMonitor;
