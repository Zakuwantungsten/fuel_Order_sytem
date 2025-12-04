import nodemailer from 'nodemailer';
import { User } from '../models';
import logger from '../utils/logger';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
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

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const config: EmailConfig = {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    };

    // Only initialize if credentials are provided
    if (config.auth.user && config.auth.pass) {
      try {
        this.transporter = nodemailer.createTransport(config);
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
   * Send critical alert email to super admins
   */
  async sendCriticalEmail(options: CriticalEmailOptions): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn('Email service not configured - skipping email notification');
      return;
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
        from: `"Fuel Order System" <${process.env.SMTP_USER}>`,
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
   * Send daily summary email
   */
  async sendDailySummary(): Promise<void> {
    if (!this.isConfigured || !this.transporter) {
      return;
    }

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
        from: `"Fuel Order System" <${process.env.SMTP_USER}>`,
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

    try {
      const stats = await this.collectWeeklyStats();

      const superAdmins = await User.find({
        role: 'super_admin',
        isActive: true,
        isDeleted: false,
      }).select('email firstName');

      const emailContent = this.generateWeeklySummaryEmail(stats);

      await this.transporter.sendMail({
        from: `"Fuel Order System" <${process.env.SMTP_USER}>`,
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
        from: `"Fuel Order System" <${process.env.SMTP_USER}>`,
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
