import mongoose from 'mongoose';
import { EventEmitter } from 'events';
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
    // Collect immediately on start
    this.collectMetrics();

    // Then collect periodically
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);
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
      this.checkAlertThresholds(metrics);

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
      const mainCollections = ['users', 'deliveryorders', 'lpoentries', 'fuelrecords', 'yardfueldispenses', 'driveraccountentries', 'auditlogs'];
      
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

    // Memory usage — 70% heap threshold (early warning before GC starts struggling)
    const mem = process.memoryUsage();
    const heapPct = (mem.heapUsed / mem.heapTotal) * 100;
    if (heapPct >= 70) {
      this.emit('alert', {
        type: 'critical',
        message: `High memory usage: ${heapPct.toFixed(1)}% heap used`,
        timestamp: new Date(),
      });
      if (canAlert('memory_critical')) {
        sendCriticalEmail({
          subject: 'DB Alert: High Memory Usage',
          message: `Node.js heap usage is at <strong>${heapPct.toFixed(1)}%</strong> (${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(0)} MB).<br/><br/>
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
