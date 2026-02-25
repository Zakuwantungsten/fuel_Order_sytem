import { logger } from '../utils';

interface SMSMessage {
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  message: string;
  recipientPhones: string[];
}

class SMSNotificationService {
  private isEnabled: boolean = false;
  private accountSid: string | null = null;
  private authToken: string | null = null;
  private fromNumber: string | null = null;
  private twilioClient: any = null;

  constructor() {
    this.initializeTwilio();
  }

  /**
   * Initialize Twilio client if credentials provided
   */
  private initializeTwilio(): void {
    try {
      this.accountSid = process.env.TWILIO_ACCOUNT_SID || null;
      this.authToken = process.env.TWILIO_AUTH_TOKEN || null;
      this.fromNumber = process.env.TWILIO_PHONE_NUMBER || null;

      if (this.accountSid && this.authToken && this.fromNumber) {
        // Optional: require('twilio') when Twilio is installed
        // For now, we'll implement without the package for flexibility
        this.isEnabled = true;
        logger.info('SMS notifications enabled (Twilio configured)');
      } else {
        logger.info('SMS notifications disabled (Twilio credentials not configured)');
      }
    } catch (error: any) {
      logger.error(`Failed to initialize Twilio: ${error.message}`);
      this.isEnabled = false;
    }
  }

  /**
   * Send SMS via Twilio
   */
  async sendSMS(phoneNumber: string, messageText: string): Promise<void> {
    if (!this.isEnabled || !this.accountSid || !this.authToken || !this.fromNumber) {
      logger.debug('SMS notifications disabled or Twilio not configured');
      return;
    }

    try {
      // Using axios to call Twilio REST API directly (no package dependency)
      const axios = require('axios');
      const params = new URLSearchParams();
      params.append('From', this.fromNumber);
      params.append('To', phoneNumber);
      params.append('Body', messageText);

      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
        'base64'
      );

      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        params,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 5000,
        }
      );

      logger.info(`SMS sent to ${phoneNumber}`);
    } catch (error: any) {
      logger.error(`Failed to send SMS to ${phoneNumber}: ${error.message}`);
      // Don't throw - SMS failure shouldn't crash main operations
    }
  }

  /**
   * Format message for SMS (keep short due to SMS length limits)
   */
  private formatSMSMessage(message: SMSMessage): string {
    const emoji =
      {
        critical: '🚨',
        high: '⚠️',
        medium: '⚡',
        info: 'ℹ️',
      }[message.severity] || '⚠️';

    // SMS has ~160 character limit, keep it short
    return `${emoji} ${message.title}: ${message.message}`.substring(0, 160);
  }

  /**
   * Send failed login anomaly SMS
   */
  async sendFailedLoginAnomaly(data: {
    username: string;
    failedAttempts: number;
    recipientPhones: string[];
  }): Promise<void> {
    const message = this.formatSMSMessage({
      severity: 'critical',
      title: 'Login Alert',
      message: `${data.failedAttempts} failed attempts for user ${data.username}`,
      recipientPhones: data.recipientPhones,
    });

    for (const phone of data.recipientPhones) {
      await this.sendSMS(phone, message);
    }
  }

  /**
   * Send new IP login SMS
   */
  async sendNewIPLogin(data: {
    username: string;
    country?: string;
    recipientPhones: string[];
  }): Promise<void> {
    const message = this.formatSMSMessage({
      severity: 'high',
      title: 'New Login Location',
      message: `User ${data.username} logged in from ${data.country || 'unknown location'}`,
      recipientPhones: data.recipientPhones,
    });

    for (const phone of data.recipientPhones) {
      await this.sendSMS(phone, message);
    }
  }

  /**
   * Send bulk operation anomaly SMS
   */
  async sendBulkOperationAnomaly(data: {
    username: string;
    operationType: string;
    recordCount: number;
    recipientPhones: string[];
  }): Promise<void> {
    const message = this.formatSMSMessage({
      severity: 'high',
      title: 'Bulk Operation Alert',
      message: `${data.operationType}: ${data.recordCount} records by ${data.username}`,
      recipientPhones: data.recipientPhones,
    });

    for (const phone of data.recipientPhones) {
      await this.sendSMS(phone, message);
    }
  }

  /**
   * Send export anomaly SMS
   */
  async sendExportAnomaly(data: {
    username: string;
    recordCount: number;
    recipientPhones: string[];
  }): Promise<void> {
    const message = this.formatSMSMessage({
      severity: 'high',
      title: 'Large Export Alert',
      message: `${data.recordCount} records exported by ${data.username}`,
      recipientPhones: data.recipientPhones,
    });

    for (const phone of data.recipientPhones) {
      await this.sendSMS(phone, message);
    }
  }

  /**
   * Send critical config change SMS
   */
  async sendConfigChangeAlert(data: {
    username: string;
    configKey: string;
    recipientPhones: string[];
  }): Promise<void> {
    const message = this.formatSMSMessage({
      severity: 'critical',
      title: 'Config Changed',
      message: `Critical setting changed by ${data.username}: ${data.configKey}`,
      recipientPhones: data.recipientPhones,
    });

    for (const phone of data.recipientPhones) {
      await this.sendSMS(phone, message);
    }
  }

  /**
   * Check if SMS is enabled
   */
  isSMSEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Update Twilio credentials from system settings
   */
  setTwilioCredentials(accountSid: string, authToken: string, phoneNumber: string): void {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = phoneNumber;
    this.isEnabled = !!(accountSid && authToken && phoneNumber);
    logger.info('Twilio credentials updated');
  }
}

export default new SMSNotificationService();
