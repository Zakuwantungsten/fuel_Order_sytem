import axios from 'axios';
import { logger } from '../utils';

interface SlackMessage {
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  description: string;
  details?: Record<string, string | number | boolean>;
  username?: string;
  ipAddress?: string;
  timestamp?: Date;
}

class SlackNotificationService {
  private webhookUrl: string | null = null;
  private isEnabled: boolean = false;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL || null;
    this.isEnabled = !!this.webhookUrl;
  }

  /**
   * Get color based on severity level
   */
  private getColor(severity: SlackMessage['severity']): string {
    const colors: Record<SlackMessage['severity'], string> = {
      critical: '#ff0000', // Red
      high: '#ff6600',     // Orange
      medium: '#ffcc00',   // Yellow
      info: '#0099ff',     // Blue
    };
    return colors[severity];
  }

  /**
   * Get emoji based on severity level
   */
  private getEmoji(severity: SlackMessage['severity']): string {
    const emojis: Record<SlackMessage['severity'], string> = {
      critical: '🚨',
      high: '⚠️',
      medium: '⚡',
      info: 'ℹ️',
    };
    return emojis[severity];
  }

  /**
   * Send Slack notification
   */
  async sendNotification(message: SlackMessage): Promise<void> {
    if (!this.isEnabled || !this.webhookUrl) {
      logger.debug('Slack notifications disabled or webhook not configured');
      return;
    }

    try {
      const detailsText = message.details
        ? Object.entries(message.details)
            .map(([key, value]) => `• ${key}: ${value}`)
            .join('\n')
        : '';

      const payload = {
        username: 'Fuel Order Security Alert',
        icon_emoji: ':shield:',
        attachments: [
          {
            color: this.getColor(message.severity),
            title: `${this.getEmoji(message.severity)} ${message.title}`,
            text: message.description,
            fields: [
              ...(message.username
                ? [{ title: 'User', value: message.username, short: true }]
                : []),
              ...(message.ipAddress
                ? [{ title: 'IP Address', value: message.ipAddress, short: true }]
                : []),
              ...(detailsText
                ? [{ title: 'Details', value: detailsText, short: false }]
                : []),
            ],
            ts: Math.floor((message.timestamp || new Date()).getTime() / 1000),
            footer: 'Fuel Order System - Security Monitoring',
            footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
          },
        ],
      };

      await axios.post(this.webhookUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      logger.info(`Slack notification sent: ${message.title}`);
    } catch (error: any) {
      logger.error(`Failed to send Slack notification: ${error.message}`);
      // Don't throw - notification failure shouldn't crash main operations
    }
  }

  /**
   * Send failed login anomaly alert
   */
  async sendFailedLoginAnomaly(data: {
    username: string;
    ipAddress: string;
    failedAttempts: number;
    timeWindow: string;
    userAgent?: string;
  }): Promise<void> {
    await this.sendNotification({
      severity: 'critical',
      title: 'Failed Login Anomaly Detected',
      description: `Multiple failed login attempts detected for user ${data.username}`,
      username: data.username,
      ipAddress: data.ipAddress,
      details: {
        'Failed Attempts': data.failedAttempts,
        'Time Window': data.timeWindow,
        'User Agent': data.userAgent || 'unknown',
      },
      timestamp: new Date(),
    });
  }

  /**
   * Send new IP login alert
   */
  async sendNewIPLogin(data: {
    username: string;
    ipAddress: string;
    country?: string;
    previousCountry?: string;
  }): Promise<void> {
    await this.sendNotification({
      severity: 'high',
      title: 'Login from New IP Address',
      description: `User ${data.username} logged in from a new IP address`,
      username: data.username,
      ipAddress: data.ipAddress,
      details: {
        'New Country': data.country || 'unknown',
        'Previous Country': data.previousCountry || 'unknown',
        'Alert Type': 'New Geolocation',
      },
      timestamp: new Date(),
    });
  }

  /**
   * Send bulk operation anomaly alert
   */
  async sendBulkOperationAnomaly(data: {
    username: string;
    operationType: string;
    recordCount: number;
    timeOfDay: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.sendNotification({
      severity: 'high',
      title: 'Suspicious Bulk Operation',
      description: `Large bulk operation detected: ${data.operationType}`,
      username: data.username,
      ipAddress: data.ipAddress,
      details: {
        'Operation Type': data.operationType,
        'Record Count': data.recordCount,
        'Time of Day': data.timeOfDay,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Send export anomaly alert
   */
  async sendExportAnomaly(data: {
    username: string;
    resourceType: string;
    recordCount: number;
    format: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.sendNotification({
      severity: 'high',
      title: 'Large Data Export Detected',
      description: `Suspicious data export: ${data.recordCount} ${data.resourceType} records`,
      username: data.username,
      ipAddress: data.ipAddress,
      details: {
        'Resource Type': data.resourceType,
        'Record Count': data.recordCount,
        'Export Format': data.format,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Send authorization failure alert
   */
  async sendAuthorizationFailure(data: {
    username: string;
    endpoint: string;
    method: string;
    userRole: string;
    requiredRoles: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.sendNotification({
      severity: 'medium',
      title: 'Authorization Failure',
      description: `User attempted unauthorized access to ${data.endpoint}`,
      username: data.username,
      ipAddress: data.ipAddress,
      details: {
        'Endpoint': data.endpoint,
        'Method': data.method,
        'User Role': data.userRole,
        'Required Roles': data.requiredRoles,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Send config change alert
   */
  async sendConfigChangeAlert(data: {
    username: string;
    configKey: string;
    oldValue: string;
    newValue: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.sendNotification({
      severity: 'critical',
      title: 'Critical Configuration Changed',
      description: `System configuration was modified: ${data.configKey}`,
      username: data.username,
      ipAddress: data.ipAddress,
      details: {
        'Config Key': data.configKey,
        'Old Value': data.oldValue,
        'New Value': data.newValue,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Update webhook URL (from system settings)
   */
  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
    this.isEnabled = !!url;
    logger.info('Slack webhook URL updated');
  }

  /**
   * Check if Slack notifications are enabled
   */
  isSlackEnabled(): boolean {
    return this.isEnabled;
  }
}

export default new SlackNotificationService();
