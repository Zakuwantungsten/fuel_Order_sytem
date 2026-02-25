/**
 * Anomaly Detection Service
 * Detects suspicious login patterns and triggers alerts
 * Monitors: failed login counts, new IPs, off-hours activity, bulk operations
 */

import { AuditLog } from '../models';
import logger from './logger';
import SecurityEventLogger from './securityEventLogger';
import emailService from '../services/emailService';
import slackNotificationService from '../services/slackNotificationService';
import smsNotificationService from '../services/smsNotificationService';
import geolocationService from './geolocationService';

export interface FailedLoginPattern {
  username: string;
  ipAddress: string;
  attemptCount: number;
  timeWindowMinutes: number;
  firstAttempt: Date;
  lastAttempt: Date;
}

/**
 * Anomaly Detection Service
 */
export class AnomalyDetectionService {
  private static failedLoginCache: Map<string, FailedLoginPattern> = new Map();
  private static readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Initialize cache cleanup
   */
  static initialize(): void {
    // Clean up cache every 30 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, pattern] of this.failedLoginCache.entries()) {
        const age = now - pattern.lastAttempt.getTime();
        if (age > this.CACHE_TTL) {
          this.failedLoginCache.delete(key);
        }
      }
    }, 30 * 60 * 1000);
  }

  /**
   * Track and detect failed login anomalies
   * Returns true if anomaly detected and alert sent
   */
  static async detectFailedLoginAnomaly(
    username: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<boolean> {
    try {
      const cacheKey = `${username}:${ipAddress}`;
      const now = Date.now();

      // Get or create pattern entry
      let pattern = this.failedLoginCache.get(cacheKey);
      if (!pattern) {
        pattern = {
          username,
          ipAddress,
          attemptCount: 0,
          timeWindowMinutes: 60,
          firstAttempt: new Date(),
          lastAttempt: new Date(),
        };
      }

      // Reset if outside time window
      const timeDiff = (now - pattern.firstAttempt.getTime()) / (1000 * 60);
      if (timeDiff > pattern.timeWindowMinutes) {
        pattern = {
          username,
          ipAddress,
          attemptCount: 0,
          timeWindowMinutes: 60,
          firstAttempt: new Date(),
          lastAttempt: new Date(),
        };
      }

      // Increment attempt count
      pattern.attemptCount++;
      pattern.lastAttempt = new Date();
      this.failedLoginCache.set(cacheKey, pattern);

      logger.warn(
        `[AnomalyDetection] Failed login attempt ${pattern.attemptCount} for ${username} from ${ipAddress}`
      );

      // Check threshold: 5+ failed attempts in 1 hour from same IP
      if (pattern.attemptCount >= 5) {
        const anomalyDetected = pattern.attemptCount === 5; // Alert only on first breach

        if (anomalyDetected) {
          logger.error(
            `[AnomalyDetection] ALERT: ${pattern.attemptCount} failed logins for ${username} from ${ipAddress} in ${pattern.timeWindowMinutes}m`
          );

          // Log to security trail
          await SecurityEventLogger.logAuthAnomalyDetected({
            username,
            ipAddress,
            userAgent,
            failedAttempts: pattern.attemptCount,
            timeWindowMinutes: pattern.timeWindowMinutes,
          });

          // Send alert email to super admins
          await emailService.sendCriticalEmail({
            subject: `🔴 SECURITY ALERT: Brute Force Attempt on ${username}`,
            message: `<strong>CRITICAL SECURITY ALERT</strong><br/><br/>
            <strong>Type:</strong> Potential Brute Force Attack<br/>
            <strong>User:</strong> ${username}<br/>
            <strong>Source IP:</strong> ${ipAddress}<br/>
            <strong>Failed Attempts:</strong> ${pattern.attemptCount} in ${pattern.timeWindowMinutes} minutes<br/>
            <strong>Time Window:</strong> ${pattern.firstAttempt.toLocaleString()} - ${pattern.lastAttempt.toLocaleString()}<br/>
            <strong>User Agent:</strong> ${userAgent || 'Unknown'}<br/><br/>
            <strong>Action Required:</strong> Review login attempts and consider blocking this IP address.<br/>
            <a href="https://your-admin-dashboard/audit-logs">View Audit Logs</a>`,
            priority: 'critical',
          }).catch(err => logger.error('[AnomalyDetection] Failed to send alert email:', err));

          // Send Slack notification
          await slackNotificationService.sendFailedLoginAnomaly({
            username,
            ipAddress,
            failedAttempts: pattern.attemptCount,
            timeWindow: `${pattern.timeWindowMinutes} minutes`,
            userAgent,
          }).catch(err => logger.error('[AnomalyDetection] Failed to send Slack notification:', err));

          // Send SMS alert to super admins
          await smsNotificationService.sendFailedLoginAnomaly({
            username,
            failedAttempts: pattern.attemptCount,
            recipientPhones: [], // Will be populated from system config
          }).catch(err => logger.error('[AnomalyDetection] Failed to send SMS:', err));

          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('[AnomalyDetection] Error detecting failed login anomaly:', error);
      return false;
    }
  }

  /**
   * Detect new IP login for a user
   */
  static async detectNewIPLogin(
    username: string,
    ipAddress: string,
    userAgent?: string
  ): Promise<boolean> {
    try {
      // Get last 30 days of successful logins by this user
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const previousLogins = await AuditLog.find({
        username,
        action: 'LOGIN',
        timestamp: { $gte: thirtyDaysAgo },
      })
        .select('ipAddress')
        .limit(100)
        .lean();

      // Get unique IPs used before
      const previousIPs = new Set(previousLogins.map(log => log.ipAddress).filter(Boolean));

      // Check if current IP is new
      if (!previousIPs.has(ipAddress) && previousIPs.size > 0) {
        logger.warn(
          `[AnomalyDetection] New IP login detected for ${username}: ${ipAddress}`
        );

        // Log anomaly
        await SecurityEventLogger.logAuthAnomalyDetected({
          username,
          ipAddress,
          userAgent,
          newIP: true,
        });

        // Get geolocation for new IP
        let countryName = 'Unknown';
        let previousCountry = 'Unknown';
        if (geolocationService.isGeolocationEnabled()) {
          const geoResult = await geolocationService.detectNewCountryLogin(
            username,
            ipAddress
          );
          countryName = geoResult.newCountry || 'Unknown';
          previousCountry = geoResult.previousCountry || 'Unknown';

          // Check for impossible travel
          const travel = await geolocationService.detectImpossibleTravel(
            username,
            ipAddress
          );
          if (travel.isImpossible) {
            logger.error(
              `[AnomalyDetection] CRITICAL: Impossible travel detected for ${username}: ${travel.details}`
            );
            // This is a critical alert - send even more urgent notifications
            await emailService.sendCriticalEmail({
              subject: `🚨 CRITICAL: Impossible Travel Detected - ${username}`,
              message: `<strong>CRITICAL SECURITY ALERT</strong><br/>
              Impossible travel pattern detected (user in multiple countries in too short time)<br/>
              ${travel.details}`,
              priority: 'critical',
            }).catch(err => logger.error('[AnomalyDetection] Failed to send impossible travel alert:', err));
          }
        }

        // Send email notification
        await emailService.sendCriticalEmail({
          subject: `⚠️ NOTICE: Login from New IP Address - ${username}`,
          message: `User <strong>${username}</strong> logged in from a new IP address not seen in the last 30 days.<br/><br/>
          <strong>New IP:</strong> ${ipAddress}<br/>
          <strong>Location:</strong> ${countryName}<br/>
          <strong>Previous Location:</strong> ${previousCountry}<br/>
          <strong>Time:</strong> ${new Date().toLocaleString()}<br/>
          <strong>User Agent:</strong> ${userAgent || 'Unknown'}<br/><br/>
          <strong>Action:</strong> If this wasn't you, please change your password immediately.`,
          priority: 'high',
        }).catch(err => logger.error('[AnomalyDetection] Failed to send new IP alert:', err));

        // Send Slack notification
        await slackNotificationService.sendNewIPLogin({
          username,
          ipAddress,
          country: countryName,
          previousCountry,
        }).catch(err => logger.error('[AnomalyDetection] Failed to send Slack notification:', err));

        // Send SMS alert
        await smsNotificationService.sendNewIPLogin({
          username,
          country: countryName,
          recipientPhones: [], // Will be populated from system config
        }).catch(err => logger.error('[AnomalyDetection] Failed to send SMS:', err));

        return true;
      }

      return false;
    } catch (error) {
      logger.error('[AnomalyDetection] Error detecting new IP login:', error);
      return false;
    }
  }

  /**
   * Detect off-hours login activity
   */
  static isOffHours(date: Date = new Date()): boolean {
    const hour = date.getHours();
    // Off-hours: 8 PM (20:00) to 6 AM (06:00)
    return hour >= 20 || hour < 6;
  }

  /**
   * Detect bulk operation anomalies
   */
  static async detectBulkOperationAnomaly(
    username: string,
    operationType: string,
    recordCount: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<boolean> {
    try {
      const now = new Date();
      const isOffHours = this.isOffHours(now);
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;

      // Alert if: > 100 records AND (off-hours OR weekend)
      if (recordCount > 100 && (isOffHours || isWeekend)) {
        logger.warn(
          `[AnomalyDetection] Suspicious bulk operation: ${operationType} with ${recordCount} records by ${username} at ${now.toLocaleString()}`
        );

        // Log anomaly
        await SecurityEventLogger.logBulkOperationAnomaly({
          username,
          operationType,
          recordCount,
          ipAddress,
          userAgent,
          isOffHours,
          isWeekend,
        });

        // Send alert email
        await emailService.sendCriticalEmail({
          subject: `🟡 ALERT: Large ${operationType} Operation Outside Business Hours`,
          message: `A large bulk operation was detected outside normal business hours.<br/><br/>
          <strong>Operation:</strong> ${operationType}<br/>
          <strong>Record Count:</strong> ${recordCount}<br/>
          <strong>User:</strong> ${username}<br/>
          <strong>IP Address:</strong> ${ipAddress || 'Unknown'}<br/>
          <strong>Time:</strong> ${now.toLocaleString()} (${isWeekend ? 'Weekend' : 'Off-hours'})<br/><br/>
          <strong>Action:</strong> Review this operation in the audit logs if unexpected.`,
          priority: 'high',
        }).catch(err => logger.error('[AnomalyDetection] Failed to send bulk operation alert:', err));

        // Send Slack notification
        await slackNotificationService.sendBulkOperationAnomaly({
          username,
          operationType,
          recordCount,
          timeOfDay: isWeekend ? 'Weekend' : 'Off-hours',
          ipAddress,
        }).catch(err => logger.error('[AnomalyDetection] Failed to send Slack notification:', err));

        // Send SMS alert
        await smsNotificationService.sendBulkOperationAnomaly({
          username,
          operationType,
          recordCount,
          recipientPhones: [], // Will be populated from system config
        }).catch(err => logger.error('[AnomalyDetection] Failed to send SMS:', err));

        return true;
      }

      return false;
    } catch (error) {
      logger.error('[AnomalyDetection] Error detecting bulk operation anomaly:', error);
      return false;
    }
  }

  /**
   * Detect data export anomalies
   */
  static async detectExportAnomaly(
    username: string,
    recordCount: number,
    exportFormat: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<boolean> {
    try {
      const now = new Date();
      const isOffHours = this.isOffHours(now);

      // Alert if: > 500 records OR (> 100 records AND off-hours)
      if (recordCount > 500 || (recordCount > 100 && isOffHours)) {
        logger.error(
          `[AnomalyDetection] ALERT: Large data export by ${username}: ${recordCount} records as ${exportFormat}`
        );

        // Log anomaly
        await SecurityEventLogger.logExportAnomaly({
          username,
          recordCount,
          exportFormat,
          ipAddress,
          userAgent,
          isOffHours,
        });

        // Send critical alert
        await emailService.sendCriticalEmail({
          subject: `🔴 CRITICAL: Large Data Export Detected`,
          message: `A large data export has been executed. This may indicate a potential data breach attempt.<br/><br/>
          <strong>User:</strong> ${username}<br/>
          <strong>Records Exported:</strong> ${recordCount}<br/>
          <strong>Format:</strong> ${exportFormat}<br/>
          <strong>IP Address:</strong> ${ipAddress || 'Unknown'}<br/>
          <strong>Time:</strong> ${now.toLocaleString()} ${isOffHours ? '(Off-hours)' : ''}<br/>
          <strong>Severity:</strong> HIGH<br/><br/>
          <strong>IMMEDIATE ACTION REQUIRED:</strong> Verify this export was authorized.`,
          priority: 'critical',
        }).catch(err => logger.error('[AnomalyDetection] Failed to send export alert:', err));

        // Send Slack notification
        await slackNotificationService.sendExportAnomaly({
          username,
          resourceType: 'Multiple Resources',
          recordCount,
          format: exportFormat,
          ipAddress,
        }).catch(err => logger.error('[AnomalyDetection] Failed to send Slack notification:', err));

        // Send SMS alert
        await smsNotificationService.sendExportAnomaly({
          username,
          recordCount,
          recipientPhones: [], // Will be populated from system config
        }).catch(err => logger.error('[AnomalyDetection] Failed to send SMS:', err));

        return true;
      }

      return false;
    } catch (error) {
      logger.error('[AnomalyDetection] Error detecting export anomaly:', error);
      return false;
    }
  }

  /**
   * Clear cache entry (e.g., after successful login)
   */
  static clearFailedLoginAttempts(username: string, ipAddress: string): void {
    const cacheKey = `${username}:${ipAddress}`;
    this.failedLoginCache.delete(cacheKey);
  }

  /**
   * Get failed login attempt count for monitoring
   */
  static getFailedLoginAttempts(username: string, ipAddress: string): number {
    const pattern = this.failedLoginCache.get(`${username}:${ipAddress}`);
    return pattern?.attemptCount || 0;
  }
}

// Initialize anomaly detection service when module loads
AnomalyDetectionService.initialize();

export default AnomalyDetectionService;
