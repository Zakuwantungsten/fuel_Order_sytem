import nodemailer from 'nodemailer';
import { User, SystemConfig } from '../models';
import logger from '../utils/logger';
import { config as appConfig } from '../config';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from?: string;
  fromName?: string;
}

interface CriticalEmailOptions {
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  additionalRecipients?: string[];
}

interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

interface PasswordResetEmailOptions {
  email: string;
  name: string;
  resetToken: string;
  resetUrl: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;
  private currentConfig: EmailConfig | null = null;

  constructor() {
    this.initialize();
  }

  /**
   * Get email configuration from SystemConfig or environment variables
   */
  private async getEmailConfig(): Promise<EmailConfig> {
    try {
      // Try to get config from database first
      const systemConfig = await SystemConfig.findOne({ 
        configType: 'system',
        isDeleted: false,
      });

      if (systemConfig?.systemSettings?.email?.host && systemConfig?.systemSettings?.email?.user) {
        return {
          host: systemConfig.systemSettings.email.host,
          port: systemConfig.systemSettings.email.port || 587,
          secure: systemConfig.systemSettings.email.secure || false,
          auth: {
            user: systemConfig.systemSettings.email.user,
            pass: systemConfig.systemSettings.email.password,
          },
          from: systemConfig.systemSettings.email.from,
          fromName: systemConfig.systemSettings.email.fromName || 'Fuel Order System',
        };
      }
    } catch (error) {
      logger.warn('Could not fetch email config from database, falling back to env vars');
    }

    // Fallback to environment variables
    return {
      host: appConfig.emailHost || process.env.SMTP_HOST || 'smtp.gmail.com',
      port: appConfig.emailPort || parseInt(process.env.SMTP_PORT || '587'),
      secure: appConfig.emailSecure || process.env.SMTP_SECURE === 'true',
      auth: {
        user: appConfig.emailUser || process.env.SMTP_USER || '',
        pass: appConfig.emailPassword || process.env.SMTP_PASS || '',
      },
      from: appConfig.emailFrom || process.env.EMAIL_FROM || '',
      fromName: appConfig.emailFromName || process.env.EMAIL_FROM_NAME || 'Fuel Order System',
    };
  }

  private async initialize() {
    const config = await this.getEmailConfig();

    // Only initialize if credentials are provided
    if (config.auth.user && config.auth.pass) {
      try {
        this.transporter = nodemailer.createTransport(config);
        this.currentConfig = config;
        this.isConfigured = true;
        logger.info('Email service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize email service:', error);
        this.isConfigured = false;
      }
    } else {
      logger.warn('Email service not configured - missing SMTP credentials');
      this.isConfigured = false;
    }
  }

  /**
   * Reinitialize email service with updated configuration
   */
  async reinitialize(): Promise<void> {
    await this.initialize();
  }

  /**
   * Send critical alert email to super admins
   */
  async sendCriticalEmail(options: CriticalEmailOptions): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - skipping email notification');
      return;
    }

    // Honour the admin-configured criticalAlerts toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      const criticalAlertsEnabled = sysConfig?.systemSettings?.notifications?.criticalAlerts;
      if (criticalAlertsEnabled === false) {
        logger.info('Critical alerts disabled by system settings — skipping critical email');
        return;
      }
    } catch {
      // DB unavailable — fall through and send anyway to avoid silently dropping alerts
    }

    try {
      // Get all super admin emails
      const superAdmins = await User.find({
        role: 'super_admin',
        isActive: true,
        isDeleted: false,
      }).select('email firstName lastName');

      if (superAdmins.length === 0) {
        logger.warn('No super admin users found to send critical email');
        return;
      }

      const recipients = [
        ...superAdmins.map((admin) => admin.email),
        ...(options.additionalRecipients || []),
      ];

      const priorityEmoji: Record<string, string> = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🟢',
      };

      const priorityColor: Record<string, string> = {
        critical: '#dc2626',
        high: '#f97316',
        medium: '#eab308',
        low: '#10b981',
      };

      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: ${priorityColor[options.priority]}; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">
              ${priorityEmoji[options.priority]} ${options.subject}
            </h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                <strong>Time:</strong> ${new Date().toLocaleString()}
              </p>
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                <strong>Priority:</strong> <span style="color: ${priorityColor[options.priority]}; font-weight: bold;">${options.priority.toUpperCase()}</span>
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 15px 0;"/>
              <div style="color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${options.message}
              </div>
            </div>
            <div style="text-align: center; color: #6b7280; font-size: 12px;">
              <p>This is an automated alert from the Fuel Order Management System.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </div>
          <div style="background: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">Fuel Order Management System - Automated Alert</p>
            <p style="margin: 5px 0 0 0; color: #9ca3af;">© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>
      `;

      await this.transporter.sendMail({
        from: this.currentConfig?.from 
          ? `"${this.currentConfig.fromName}" <${this.currentConfig.from}>`
          : `"${this.currentConfig?.fromName || 'Fuel Order System'}" <${this.currentConfig?.auth.user}>`,
        to: recipients.join(', '),
        subject: `${priorityEmoji[options.priority]} [${options.priority.toUpperCase()}] ${options.subject}`,
        html: emailContent,
        priority: options.priority === 'critical' ? 'high' : 'normal',
      });

      logger.info(`Critical email sent: ${options.subject} to ${recipients.length} recipients`);
    } catch (error) {
      logger.error('Failed to send critical email:', error);
      // Don't throw - email failure shouldn't break the main operation
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(options: PasswordResetEmailOptions): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - cannot send password reset email');
      throw new Error('Email service is not configured');
    }

    // Honour the admin-configured emailNotifications toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      if (sysConfig?.systemSettings?.notifications?.emailNotifications === false) {
        logger.info('Email notifications disabled by system settings — skipping password reset email');
        return;
      }
    } catch { /* DB unavailable — send anyway */ }

    try {
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🔐 Password Reset Request</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">
                Hello <strong>${options.name}</strong>,
              </p>
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                We received a request to reset your password for your Fuel Order Management System account. 
                Click the button below to reset your password:
              </p>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${options.resetUrl}" 
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; 
                          font-weight: bold; font-size: 16px;">
                  Reset Password
                </a>
              </div>
              <p style="margin: 15px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 5px 0 15px 0; color: #4f46e5; font-size: 13px; word-break: break-all;">
                ${options.resetUrl}
              </p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;"/>
              <p style="margin: 0 0 10px 0; color: #dc2626; font-size: 14px; font-weight: bold;">
                ⚠️ Important Security Information:
              </p>
              <ul style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                <li>This link will expire in <strong>30 minutes</strong></li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password won't change until you create a new one</li>
                <li>Never share this link with anyone</li>
              </ul>
            </div>
            <div style="text-align: center; color: #6b7280; font-size: 12px;">
              <p style="margin: 5px 0;">This is an automated email from the Fuel Order Management System.</p>
              <p style="margin: 5px 0;">Please do not reply to this email.</p>
              <p style="margin: 5px 0; color: #9ca3af;">Requested at: ${new Date().toLocaleString()}</p>
            </div>
          </div>
          <div style="background: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">Fuel Order Management System</p>
            <p style="margin: 5px 0 0 0; color: #9ca3af;">© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>
      `;

      await this.transporter.sendMail({
        from: this.currentConfig?.from 
          ? `"${this.currentConfig.fromName} - No Reply" <${this.currentConfig.from}>`
          : `"Fuel Order System - No Reply" <${this.currentConfig?.auth.user}>`,
        to: options.email,
        subject: '🔐 Password Reset Request - Fuel Order System',
        html: emailContent,
        priority: 'high',
      });

      logger.info(`Password reset email sent to: ${options.email}`);
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Send password changed confirmation email
   */
  async sendPasswordChangedEmail(email: string, name: string): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - cannot send password changed email');
      return; // Don't throw - this is just a confirmation
    }

    // Honour the admin-configured emailNotifications toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      if (sysConfig?.systemSettings?.notifications?.emailNotifications === false) {
        logger.info('Email notifications disabled by system settings — skipping password changed email');
        return;
      }
    } catch { /* DB unavailable — send anyway */ }

    try {
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">✅ Password Changed Successfully</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                This email confirms that your password for the Fuel Order Management System has been changed successfully.
              </p>
              <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #065f46; font-size: 14px;">
                  <strong>✓ Changed at:</strong> ${new Date().toLocaleString()}
                </p>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;"/>
              <p style="margin: 0 0 10px 0; color: #dc2626; font-size: 14px; font-weight: bold;">
                ⚠️ Didn't make this change?
              </p>
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you did not change your password, please contact your system administrator immediately 
                as your account may have been compromised.
              </p>
            </div>
            <div style="text-align: center; color: #6b7280; font-size: 12px;">
              <p style="margin: 5px 0;">This is an automated security notification.</p>
              <p style="margin: 5px 0;">Please do not reply to this email.</p>
            </div>
          </div>
          <div style="background: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">Fuel Order Management System - Security Team</p>
            <p style="margin: 5px 0 0 0; color: #9ca3af;">© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>
      `;

      await this.transporter.sendMail({
        from: this.currentConfig?.from 
          ? `"${this.currentConfig.fromName} - Security" <${this.currentConfig.from}>`
          : `"Fuel Order System - Security" <${this.currentConfig?.auth.user}>`,
        to: email,
        subject: '✅ Password Changed Successfully - Fuel Order System',
        html: emailContent,
        priority: 'high',
      });

      logger.info(`Password changed confirmation email sent to: ${email}`);
    } catch (error) {
      logger.error('Failed to send password changed confirmation email:', error);
      // Don't throw - this is just a confirmation email
    }
  }

  /**
   * Send daily summary email
   */
  async sendDailySummary(): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      return;
    }

    // Honour admin dailySummary toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      if (sysConfig?.systemSettings?.notifications?.dailySummary === false) {
        logger.info('Daily summary emails disabled by system settings — skipping');
        return;
      }
    } catch { /* DB unavailable — send anyway */ }

    try {
      // Get statistics for the day
      const stats = await this.collectDailyStats();

      const superAdmins = await User.find({
        role: { $in: ['super_admin', 'admin'] },
        isActive: true,
        isDeleted: false,
      }).select('email firstName');

      const emailContent = this.generateDailySummaryEmail(stats);

      await this.transporter.sendMail({
        from: this.currentConfig?.from 
          ? `"${this.currentConfig.fromName}" <${this.currentConfig.from}>`
          : `"Fuel Order System" <${this.currentConfig?.auth.user}>`,
        to: superAdmins.map((admin) => admin.email).join(', '),
        subject: `📊 Daily Summary - ${new Date().toLocaleDateString()}`,
        html: emailContent,
      });

      logger.info('Daily summary email sent successfully');
    } catch (error) {
      logger.error('Failed to send daily summary email:', error);
    }
  }

  /**
   * Send weekly report email
   */
  async sendWeeklySummary(): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      return;
    }

    // Honour admin weeklyReport toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      if (sysConfig?.systemSettings?.notifications?.weeklyReport === false) {
        logger.info('Weekly report emails disabled by system settings — skipping');
        return;
      }
    } catch { /* DB unavailable — send anyway */ }

    try {
      const stats = await this.collectWeeklyStats();

      const superAdmins = await User.find({
        role: 'super_admin',
        isActive: true,
        isDeleted: false,
      }).select('email firstName');

      const emailContent = this.generateWeeklySummaryEmail(stats);

      await this.transporter.sendMail({
        from: this.currentConfig?.from 
          ? `"${this.currentConfig.fromName}" <${this.currentConfig.from}>`
          : `"Fuel Order System" <${this.currentConfig?.auth.user}>`,
        to: superAdmins.map((admin) => admin.email).join(', '),
        subject: `📈 Weekly Report - Week of ${new Date().toLocaleDateString()}`,
        html: emailContent,
      });

      logger.info('Weekly summary email sent successfully');
    } catch (error) {
      logger.error('Failed to send weekly summary email:', error);
    }
  }

  /**
   * Send custom email notification
   */
  async sendNotification(
    to: string | string[],
    subject: string,
    message: string
  ): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - skipping notification');
      return;
    }

    try {
      const recipients = Array.isArray(to) ? to : [to];

      await this.transporter.sendMail({
        from: this.currentConfig?.from 
          ? `"${this.currentConfig.fromName}" <${this.currentConfig.from}>`
          : `"Fuel Order System" <${this.currentConfig?.auth.user}>`,
        to: recipients.join(', '),
        subject,
        html: this.wrapInTemplate(subject, message),
      });

      logger.info(`Notification email sent: ${subject}`);
    } catch (error) {
      logger.error('Failed to send notification email:', error);
    }
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info('Email service connection test successful');
      return true;
    } catch (error) {
      logger.error('Email service connection test failed:', error);
      return false;
    }
  }

  // Private helper methods

  private async collectDailyStats(): Promise<any> {
    // This would collect actual stats from the database
    // Placeholder for now
    return {
      date: new Date().toLocaleDateString(),
      deliveryOrders: { total: 24, created: 12, completed: 10 },
      lpos: { total: 45, created: 20, forwarded: 5 },
      fuelRecords: { total: 12, liters: 25000 },
      activeUsers: 45,
    };
  }

  private async collectWeeklyStats(): Promise<any> {
    // This would collect actual weekly stats from the database
    // Placeholder for now
    return {
      weekStart: new Date(),
      deliveryOrders: { total: 168, avgPerDay: 24 },
      lpos: { total: 315, avgPerDay: 45 },
      fuelRecords: { total: 84, totalLiters: 175000 },
      topUsers: [],
    };
  }

  private generateDailySummaryEmail(stats: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
          <h1>📊 Daily Summary</h1>
          <p>${stats.date}</p>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2>Today's Activity</h2>
          <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
            <h3>Delivery Orders</h3>
            <p>Total: ${stats.deliveryOrders.total} | Created: ${stats.deliveryOrders.created} | Completed: ${stats.deliveryOrders.completed}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
            <h3>LPOs</h3>
            <p>Total: ${stats.lpos.total} | Created: ${stats.lpos.created} | Forwarded: ${stats.lpos.forwarded}</p>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
            <h3>Fuel Records</h3>
            <p>Total: ${stats.fuelRecords.total} | Liters: ${stats.fuelRecords.liters.toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;
  }

  private generateWeeklySummaryEmail(stats: any): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
          <h1>📈 Weekly Report</h1>
          <p>Week of ${stats.weekStart.toLocaleDateString()}</p>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <h2>This Week's Performance</h2>
          <p>Detailed weekly statistics would go here...</p>
        </div>
      </div>
    `;
  }

  /**
   * Send password reset by admin email
   */
  async sendPasswordResetByAdminEmail(email: string, name: string, username: string, temporaryPassword: string): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - cannot send password reset email');
      throw new Error('Email service is not configured');
    }

    // Honour the admin-configured emailNotifications toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      if (sysConfig?.systemSettings?.notifications?.emailNotifications === false) {
        logger.info('Email notifications disabled by system settings — skipping admin-reset email');
        return;
      }
    } catch { /* DB unavailable — send anyway */ }

    try {
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🔑 Password Reset</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                Your password has been reset by a system administrator. You can now log in using the temporary password below.
              </p>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-weight: bold; font-size: 14px;">📋 Your Login Credentials:</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #78350f; font-size: 14px;">Username:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: bold; font-size: 14px;">${username}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #78350f; font-size: 14px;">Temporary Password:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: bold; font-size: 14px; font-family: monospace; background: #fef3c7; padding: 8px; border-radius: 4px;">${temporaryPassword}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #991b1b; font-weight: bold; font-size: 14px;">⚠️ Important Security Notice:</p>
                <ul style="color: #991b1b; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                  <li>This is a <strong>temporary password</strong></li>
                  <li>You <strong>must change it</strong> immediately after logging in</li>
                  <li>Your previous password is no longer valid</li>
                  <li>Keep your credentials <strong>confidential</strong></li>
                  <li>If you didn't request this reset, contact your administrator immediately</li>
                </ul>
              </div>

              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you have any questions or concerns, please contact your system administrator.
              </p>
            </div>

            <div style="text-align: center; padding: 20px 0;">
              <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                This email was sent automatically. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      const from = this.currentConfig?.from || this.currentConfig?.auth.user;
      const fromName = this.currentConfig?.fromName || 'Fuel Order System';

      await this.transporter.sendMail({
        from: `"${fromName}" <${from}>`,
        to: email,
        subject: 'Your Password Has Been Reset - Action Required',
        html: emailContent,
      });

      logger.info(`Password reset email sent to: ${email}`);
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Send welcome email with login credentials to new user
   */
  async sendWelcomeEmail(email: string, name: string, username: string, temporaryPassword: string): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - cannot send welcome email');
      throw new Error('Email service is not configured');
    }

    // Honour the admin-configured emailNotifications toggle
    try {
      const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
      if (sysConfig?.systemSettings?.notifications?.emailNotifications === false) {
        logger.info('Email notifications disabled by system settings — skipping welcome email');
        return;
      }
    } catch { /* DB unavailable — send anyway */ }

    try {
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Welcome to Fuel Order System</h1>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <div style="background: white; padding: 25px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 16px;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 15px 0; color: #6b7280; font-size: 15px; line-height: 1.6;">
                Your account has been created successfully! You can now access the Fuel Order Management System.
              </p>
              
              <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: bold; font-size: 14px;">📋 Your Login Credentials:</p>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Username:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: bold; font-size: 14px;">${username}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Temporary Password:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: bold; font-size: 14px; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">${temporaryPassword}</td>
                  </tr>
                </table>
              </div>

              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-weight: bold; font-size: 14px;">⚠️ Important Security Notice:</p>
                <ul style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                  <li>This is a <strong>temporary password</strong></li>
                  <li>You will be required to <strong>change it</strong> on your first login</li>
                  <li>Keep your credentials <strong>confidential</strong></li>
                  <li>Never share your password with anyone</li>
                </ul>
              </div>

              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you have any questions or need assistance, please contact your system administrator.
              </p>
            </div>

            <div style="text-align: center; padding: 20px 0;">
              <p style="margin: 0; color: #9ca3af; font-size: 13px;">
                This email was sent automatically. Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `;

      const from = this.currentConfig?.from || this.currentConfig?.auth.user;
      const fromName = this.currentConfig?.fromName || 'Fuel Order System';

      await this.transporter.sendMail({
        from: `"${fromName}" <${from}>`,
        to: email,
        subject: 'Welcome to Fuel Order Management System - Your Login Credentials',
        html: emailContent,
      });

      logger.info(`Welcome email sent to: ${email}`);
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  private wrapInTemplate(subject: string, message: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4f46e5; color: white; padding: 20px;">
          <h1>${subject}</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          ${message}
        </div>
        <div style="background: #1f2937; color: white; padding: 15px; text-align: center; font-size: 12px;">
          <p>Fuel Order Management System</p>
        </div>
      </div>
    `;
  }
}

// Export singleton instance
export const emailService = new EmailService();

// Export convenience function
export const sendCriticalEmail = (options: CriticalEmailOptions) =>
  emailService.sendCriticalEmail(options);

export default emailService;
