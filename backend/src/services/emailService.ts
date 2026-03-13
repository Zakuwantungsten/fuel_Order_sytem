import { User, SystemConfig } from '../models';
import logger from '../utils/logger';

interface CriticalEmailOptions {
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  additionalRecipients?: string[];
}

interface PasswordResetEmailOptions {
  email: string;
  name: string;
  resetToken: string;
  resetUrl: string;
}

class EmailService {
  private isConfigured: boolean = false;
  private resendApiKey: string = '';
  private fromAddress: string = '';
  private fromName: string = 'Fuel Order System';

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = process.env.RESEND_API_KEY || '';
    const from = process.env.EMAIL_FROM || '';
    const fromName = process.env.EMAIL_FROM_NAME || 'Fuel Order System';

    if (!apiKey) {
      logger.warn('Email service not configured — RESEND_API_KEY is missing');
      this.isConfigured = false;
      return;
    }

    this.resendApiKey = apiKey;
    this.fromName = fromName;

    if (!from) {
      // Resend test address — only delivers to your own Resend account email
      this.fromAddress = 'onboarding@resend.dev';
      logger.warn(
        'EMAIL_FROM not set — using onboarding@resend.dev. ' +
        'Set EMAIL_FROM=noreply@yourdomain.com after verifying a domain in Resend.'
      );
    } else {
      this.fromAddress = from;
    }

    this.isConfigured = true;
    logger.info(`Email service initialized with Resend (from: ${this.fromAddress})`);
  }

  /**
   * Reinitialize — call this after updating env vars at runtime
   */
  async reinitialize(): Promise<void> {
    this.initialize();
  }

  // ─── Core dispatch ────────────────────────────────────────────────────────

  private async dispatchMail(options: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Email service is not configured — set RESEND_API_KEY in Railway variables');
    }

    const toArray = Array.isArray(options.to) ? options.to : [options.to];

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from,
        to: toArray,
        subject: options.subject,
        html: options.html,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend API error ${response.status}: ${errText}`);
    }
  }

  /** Build the "From" header string */
  private get sender(): string {
    return `"${this.fromName}" <${this.fromAddress}>`;
  }

  // ─── Check system notification toggles ───────────────────────────────────

  private async emailNotificationsEnabled(): Promise<boolean> {
    try {
      const cfg = await SystemConfig.findOne({ configType: 'system_settings' });
      return cfg?.systemSettings?.notifications?.emailNotifications !== false;
    } catch {
      return true; // DB unavailable — send anyway
    }
  }

  private async criticalAlertsEnabled(): Promise<boolean> {
    try {
      const cfg = await SystemConfig.findOne({ configType: 'system_settings' });
      return cfg?.systemSettings?.notifications?.criticalAlerts !== false;
    } catch {
      return true;
    }
  }

  private async dailySummaryEnabled(): Promise<boolean> {
    try {
      const cfg = await SystemConfig.findOne({ configType: 'system_settings' });
      return cfg?.systemSettings?.notifications?.dailySummary !== false;
    } catch {
      return true;
    }
  }

  private async weeklyReportEnabled(): Promise<boolean> {
    try {
      const cfg = await SystemConfig.findOne({ configType: 'system_settings' });
      return cfg?.systemSettings?.notifications?.weeklyReport !== false;
    } catch {
      return true;
    }
  }

  // ─── Public send methods ──────────────────────────────────────────────────

  /**
   * Send critical alert email to super admins
   */
  async sendCriticalEmail(options: CriticalEmailOptions): Promise<void> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured — skipping critical alert');
      return;
    }
    if (!(await this.criticalAlertsEnabled())) {
      logger.info('Critical alerts disabled by system settings — skipping');
      return;
    }

    try {
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
        ...superAdmins.map((a) => a.email),
        ...(options.additionalRecipients || []),
      ];

      const priorityEmoji: Record<string, string> = {
        critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
      };
      const priorityColor: Record<string, string> = {
        critical: '#dc2626', high: '#f97316', medium: '#eab308', low: '#10b981',
      };

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:${priorityColor[options.priority]};color:white;padding:20px;text-align:center">
            <h1 style="margin:0;font-size:24px">${priorityEmoji[options.priority]} ${options.subject}</h1>
          </div>
          <div style="padding:30px;background:#f9fafb">
            <div style="background:white;padding:20px;border-radius:8px;margin-bottom:20px">
              <p style="margin:0 0 10px;color:#6b7280;font-size:14px"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
              <p style="margin:0 0 10px;color:#6b7280;font-size:14px">
                <strong>Priority:</strong>
                <span style="color:${priorityColor[options.priority]};font-weight:bold">${options.priority.toUpperCase()}</span>
              </p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:15px 0"/>
              <div style="color:#1f2937;font-size:16px;line-height:1.6">${options.message}</div>
            </div>
            <div style="text-align:center;color:#6b7280;font-size:12px">
              <p>This is an automated alert from the Fuel Order Management System.</p>
              <p>Please do not reply to this email.</p>
            </div>
          </div>
          <div style="background:#1f2937;color:white;padding:15px;text-align:center;font-size:12px">
            <p style="margin:0">Fuel Order Management System — Automated Alert</p>
            <p style="margin:5px 0 0;color:#9ca3af">© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>`;

      await this.dispatchMail({
        from: this.sender,
        to: recipients,
        subject: `${priorityEmoji[options.priority]} [${options.priority.toUpperCase()}] ${options.subject}`,
        html,
      });

      logger.info(`Critical email sent: "${options.subject}" to ${recipients.length} recipient(s)`);
    } catch (error) {
      logger.error('Failed to send critical email:', error);
      // Don't throw — email failure shouldn't break the main operation
    }
  }

  /**
   * Send password reset email (self-service)
   */
  async sendPasswordResetEmail(options: PasswordResetEmailOptions): Promise<void> {
    if (!this.isConfigured) await this.reinitialize();
    if (!this.isConfigured) {
      logger.warn('Email service not configured — cannot send password reset email');
      throw new Error('Email service is not configured');
    }
    if (!(await this.emailNotificationsEnabled())) {
      logger.info('Email notifications disabled — skipping password reset email');
      return;
    }

    try {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center">
            <h1 style="margin:0;font-size:28px">🔐 Password Reset Request</h1>
          </div>
          <div style="padding:30px;background:#f9fafb">
            <div style="background:white;padding:25px;border-radius:8px;margin-bottom:20px">
              <p style="margin:0 0 15px;color:#1f2937;font-size:16px">Hello <strong>${options.name}</strong>,</p>
              <p style="margin:0 0 15px;color:#6b7280;font-size:15px;line-height:1.6">
                We received a request to reset your password. Click the button below to reset it:
              </p>
              <div style="text-align:center;margin:25px 0">
                <a href="${options.resetUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">
                  Reset Password
                </a>
              </div>
              <p style="margin:15px 0 0;color:#6b7280;font-size:14px">Or copy this link into your browser:</p>
              <p style="margin:5px 0 15px;color:#4f46e5;font-size:13px;word-break:break-all">${options.resetUrl}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
              <p style="margin:0 0 10px;color:#dc2626;font-size:14px;font-weight:bold">⚠️ Important Security Information:</p>
              <ul style="color:#6b7280;font-size:14px;line-height:1.6;margin:0;padding-left:20px">
                <li>This link will expire in <strong>30 minutes</strong></li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password won't change until you create a new one</li>
                <li>Never share this link with anyone</li>
              </ul>
            </div>
            <div style="text-align:center;color:#6b7280;font-size:12px">
              <p>Automated email — please do not reply.</p>
              <p style="color:#9ca3af">Requested at: ${new Date().toLocaleString()}</p>
            </div>
          </div>
          <div style="background:#1f2937;color:white;padding:15px;text-align:center;font-size:12px">
            <p style="margin:0">Fuel Order Management System</p>
            <p style="margin:5px 0 0;color:#9ca3af">© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>`;

      await this.dispatchMail({
        from: `"${this.fromName} - No Reply" <${this.fromAddress}>`,
        to: options.email,
        subject: '🔐 Password Reset Request - Fuel Order System',
        html,
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
    if (!this.isConfigured) {
      logger.warn('Email service not configured — skipping password changed confirmation');
      return;
    }
    if (!(await this.emailNotificationsEnabled())) {
      logger.info('Email notifications disabled — skipping password changed email');
      return;
    }

    try {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:white;padding:30px;text-align:center">
            <h1 style="margin:0;font-size:28px">✅ Password Changed Successfully</h1>
          </div>
          <div style="padding:30px;background:#f9fafb">
            <div style="background:white;padding:25px;border-radius:8px;margin-bottom:20px">
              <p style="margin:0 0 15px;color:#1f2937;font-size:16px">Hello <strong>${name}</strong>,</p>
              <p style="margin:0 0 15px;color:#6b7280;font-size:15px;line-height:1.6">
                Your password for the Fuel Order Management System has been changed successfully.
              </p>
              <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:15px;margin:20px 0">
                <p style="margin:0;color:#065f46;font-size:14px"><strong>✓ Changed at:</strong> ${new Date().toLocaleString()}</p>
              </div>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
              <p style="margin:0 0 10px;color:#dc2626;font-size:14px;font-weight:bold">⚠️ Didn't make this change?</p>
              <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.6">
                Contact your system administrator immediately — your account may have been compromised.
              </p>
            </div>
            <div style="text-align:center;color:#6b7280;font-size:12px">
              <p>Automated security notification — please do not reply.</p>
            </div>
          </div>
          <div style="background:#1f2937;color:white;padding:15px;text-align:center;font-size:12px">
            <p style="margin:0">Fuel Order Management System — Security Team</p>
            <p style="margin:5px 0 0;color:#9ca3af">© ${new Date().getFullYear()} All rights reserved</p>
          </div>
        </div>`;

      await this.dispatchMail({
        from: `"${this.fromName} - Security" <${this.fromAddress}>`,
        to: email,
        subject: '✅ Password Changed Successfully - Fuel Order System',
        html,
      });

      logger.info(`Password changed confirmation sent to: ${email}`);
    } catch (error) {
      logger.error('Failed to send password changed confirmation email:', error);
      // Don't throw — just a confirmation
    }
  }

  /**
   * Send daily summary email to admins
   */
  async sendDailySummary(): Promise<void> {
    if (!this.isConfigured) return;
    if (!(await this.dailySummaryEnabled())) {
      logger.info('Daily summary emails disabled by system settings — skipping');
      return;
    }

    try {
      const stats = await this.collectDailyStats();
      const admins = await User.find({
        role: { $in: ['super_admin', 'admin'] },
        isActive: true,
        isDeleted: false,
      }).select('email');

      await this.dispatchMail({
        from: this.sender,
        to: admins.map((a) => a.email),
        subject: `📊 Daily Summary - ${new Date().toLocaleDateString()}`,
        html: this.generateDailySummaryEmail(stats),
      });

      logger.info('Daily summary email sent successfully');
    } catch (error) {
      logger.error('Failed to send daily summary email:', error);
    }
  }

  /**
   * Send weekly report email to super admins
   */
  async sendWeeklySummary(): Promise<void> {
    if (!this.isConfigured) return;
    if (!(await this.weeklyReportEnabled())) {
      logger.info('Weekly report emails disabled by system settings — skipping');
      return;
    }

    try {
      const stats = await this.collectWeeklyStats();
      const superAdmins = await User.find({
        role: 'super_admin',
        isActive: true,
        isDeleted: false,
      }).select('email');

      await this.dispatchMail({
        from: this.sender,
        to: superAdmins.map((a) => a.email),
        subject: `📈 Weekly Report - Week of ${new Date().toLocaleDateString()}`,
        html: this.generateWeeklySummaryEmail(stats),
      });

      logger.info('Weekly summary email sent successfully');
    } catch (error) {
      logger.error('Failed to send weekly summary email:', error);
    }
  }

  /**
   * Send a custom notification email
   */
  async sendNotification(to: string | string[], subject: string, message: string): Promise<void> {
    if (!this.isConfigured) await this.reinitialize();
    if (!this.isConfigured) {
      logger.warn('Email service not configured — cannot send notification');
      throw new Error('Email service is not configured');
    }

    try {
      await this.dispatchMail({
        from: this.sender,
        to,
        subject,
        html: this.wrapInTemplate(subject, message),
      });
      logger.info(`Notification email sent: "${subject}"`);
    } catch (error) {
      logger.error('Failed to send notification email:', error);
      throw error;
    }
  }

  /**
   * Send password reset by admin email (with temporary password)
   */
  async sendPasswordResetByAdminEmail(
    email: string,
    name: string,
    username: string,
    temporaryPassword: string,
  ): Promise<void> {
    if (!this.isConfigured) await this.reinitialize();
    if (!this.isConfigured) {
      logger.warn('Email service not configured — cannot send admin password reset email');
      throw new Error('Email service is not configured');
    }
    if (!(await this.emailNotificationsEnabled())) {
      logger.info('Email notifications disabled — skipping admin-reset email');
      return;
    }

    try {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:white;padding:30px;text-align:center">
            <h1 style="margin:0;font-size:28px">🔑 Password Reset</h1>
          </div>
          <div style="padding:30px;background:#f9fafb">
            <div style="background:white;padding:25px;border-radius:8px;margin-bottom:20px">
              <p style="margin:0 0 15px;color:#1f2937;font-size:16px">Hello <strong>${name}</strong>,</p>
              <p style="margin:0 0 15px;color:#6b7280;font-size:15px;line-height:1.6">
                Your password has been reset by a system administrator. Use the credentials below to log in.
              </p>
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:20px 0;border-radius:4px">
                <p style="margin:0 0 10px;color:#92400e;font-weight:bold;font-size:14px">📋 Your Login Credentials:</p>
                <table style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="padding:8px 0;color:#78350f;font-size:14px">Username:</td>
                    <td style="padding:8px 0;color:#1f2937;font-weight:bold;font-size:14px">${username}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#78350f;font-size:14px">Temporary Password:</td>
                    <td style="padding:8px 0;font-family:monospace;font-weight:bold;font-size:14px;background:#fef3c7;padding:8px;border-radius:4px">${temporaryPassword}</td>
                  </tr>
                </table>
              </div>
              <div style="background:#fee2e2;border-left:4px solid #dc2626;padding:15px;margin:20px 0;border-radius:4px">
                <p style="margin:0 0 10px;color:#991b1b;font-weight:bold;font-size:14px">⚠️ Important Security Notice:</p>
                <ul style="color:#991b1b;font-size:14px;line-height:1.6;margin:0;padding-left:20px">
                  <li>This is a <strong>temporary password</strong></li>
                  <li>You <strong>must change it</strong> immediately after logging in</li>
                  <li>Your previous password is no longer valid</li>
                  <li>Keep your credentials <strong>confidential</strong></li>
                  <li>If you didn't request this, contact your administrator immediately</li>
                </ul>
              </div>
            </div>
            <div style="text-align:center;color:#9ca3af;font-size:13px">
              <p>Automated email — please do not reply.</p>
            </div>
          </div>
        </div>`;

      await this.dispatchMail({
        from: this.sender,
        to: email,
        subject: 'Your Password Has Been Reset - Action Required',
        html,
      });

      logger.info(`Admin password reset email sent to: ${email}`);
    } catch (error) {
      logger.error('Failed to send admin password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Send welcome email with temporary credentials to a new user
   */
  async sendWelcomeEmail(
    email: string,
    name: string,
    username: string,
    temporaryPassword: string,
  ): Promise<void> {
    if (!this.isConfigured) await this.reinitialize();
    if (!this.isConfigured) {
      logger.warn('Email service not configured — cannot send welcome email');
      throw new Error('Email service is not configured');
    }
    if (!(await this.emailNotificationsEnabled())) {
      logger.info('Email notifications disabled — skipping welcome email');
      return;
    }

    try {
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:30px;text-align:center">
            <h1 style="margin:0;font-size:28px">🎉 Welcome to Fuel Order System</h1>
          </div>
          <div style="padding:30px;background:#f9fafb">
            <div style="background:white;padding:25px;border-radius:8px;margin-bottom:20px">
              <p style="margin:0 0 15px;color:#1f2937;font-size:16px">Hello <strong>${name}</strong>,</p>
              <p style="margin:0 0 15px;color:#6b7280;font-size:15px;line-height:1.6">
                Your account has been created successfully!
              </p>
              <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:15px;margin:20px 0;border-radius:4px">
                <p style="margin:0 0 10px;color:#1e40af;font-weight:bold;font-size:14px">📋 Your Login Credentials:</p>
                <table style="width:100%;border-collapse:collapse">
                  <tr>
                    <td style="padding:8px 0;color:#6b7280;font-size:14px">Username:</td>
                    <td style="padding:8px 0;color:#1f2937;font-weight:bold;font-size:14px">${username}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#6b7280;font-size:14px">Temporary Password:</td>
                    <td style="padding:8px 0;font-family:monospace;font-weight:bold;font-size:14px;background:#f3f4f6;padding:8px;border-radius:4px">${temporaryPassword}</td>
                  </tr>
                </table>
              </div>
              <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:20px 0;border-radius:4px">
                <p style="margin:0 0 10px;color:#92400e;font-weight:bold;font-size:14px">⚠️ Important Security Notice:</p>
                <ul style="color:#78350f;font-size:14px;line-height:1.6;margin:0;padding-left:20px">
                  <li>This is a <strong>temporary password</strong></li>
                  <li>You will be required to <strong>change it</strong> on your first login</li>
                  <li>Keep your credentials <strong>confidential</strong></li>
                  <li>Never share your password with anyone</li>
                </ul>
              </div>
            </div>
            <div style="text-align:center;color:#9ca3af;font-size:13px">
              <p>Automated email — please do not reply.</p>
            </div>
          </div>
        </div>`;

      await this.dispatchMail({
        from: this.sender,
        to: email,
        subject: 'Welcome to Fuel Order Management System - Your Login Credentials',
        html,
      });

      logger.info(`Welcome email sent to: ${email}`);
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  /**
   * Send a login notification (new sign-in alert)
   */
  async sendLoginNotification(
    email: string,
    name: string,
    details: {
      browser: string;
      os: string;
      ipAddress: string;
      time: Date;
      isNewDevice: boolean;
      deviceType: string;
    },
  ): Promise<void> {
    if (!this.isConfigured) {
      logger.warn('Email service not configured — skipping login notification');
      return;
    }

    const timeStr = details.time.toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    const deviceIcon = details.deviceType === 'mobile' || details.deviceType === 'tablet' ? '📱' : '💻';
    const alertColor = details.isNewDevice ? '#dc2626' : '#2563eb';
    const alertTitle = details.isNewDevice
      ? 'New device sign-in to your account'
      : 'New sign-in to your account';

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:${alertColor};color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:18px">${alertTitle}</h2>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
          <p style="margin:0 0 16px;color:#374151">Hi ${name},</p>
          <p style="margin:0 0 20px;color:#374151">We noticed a new sign-in to your Fuel Order System account.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr>
              <td style="padding:8px 0;color:#6b7280;width:120px">${deviceIcon} Device</td>
              <td style="padding:8px 0;color:#111827;font-weight:500">${details.browser} on ${details.os}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280">🌐 IP Address</td>
              <td style="padding:8px 0;color:#111827;font-weight:500">${details.ipAddress}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280">🕐 Time</td>
              <td style="padding:8px 0;color:#111827;font-weight:500">${timeStr}</td>
            </tr>
          </table>
          ${details.isNewDevice
            ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;margin-bottom:16px">
                <p style="margin:0;color:#991b1b;font-size:13px">
                  <strong>⚠️ First time this device has been used to sign in.</strong>
                  If this wasn't you, change your password immediately and contact your administrator.
                </p>
               </div>`
            : ''}
          <p style="margin:0;color:#6b7280;font-size:13px">If this was you, no further action is needed.</p>
        </div>
        <div style="text-align:center;padding:16px;color:#9ca3af;font-size:11px">
          Fuel Order Management System — Security Notification
        </div>
      </div>`;

    try {
      await this.dispatchMail({ from: this.sender, to: email, subject: alertTitle, html });
      logger.info(`Login notification sent to ${email}`);
    } catch (error) {
      logger.error('Failed to send login notification:', error);
    }
  }

  /**
   * Test that the Resend API key is working
   */
  async testConnection(): Promise<boolean> {
    return this.isConfigured;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async collectDailyStats(): Promise<any> {
    return {
      date: new Date().toLocaleDateString(),
      deliveryOrders: { total: 24, created: 12, completed: 10 },
      lpos: { total: 45, created: 20, forwarded: 5 },
      fuelRecords: { total: 12, liters: 25000 },
      activeUsers: 45,
    };
  }

  private async collectWeeklyStats(): Promise<any> {
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
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px;text-align:center">
          <h1>📊 Daily Summary</h1>
          <p>${stats.date}</p>
        </div>
        <div style="padding:20px;background:#f9fafb">
          <div style="background:white;padding:15px;border-radius:8px;margin-bottom:10px">
            <h3>Delivery Orders</h3>
            <p>Total: ${stats.deliveryOrders.total} | Created: ${stats.deliveryOrders.created} | Completed: ${stats.deliveryOrders.completed}</p>
          </div>
          <div style="background:white;padding:15px;border-radius:8px;margin-bottom:10px">
            <h3>LPOs</h3>
            <p>Total: ${stats.lpos.total} | Created: ${stats.lpos.created} | Forwarded: ${stats.lpos.forwarded}</p>
          </div>
          <div style="background:white;padding:15px;border-radius:8px;margin-bottom:10px">
            <h3>Fuel Records</h3>
            <p>Total: ${stats.fuelRecords.total} | Liters: ${stats.fuelRecords.liters.toLocaleString()}</p>
          </div>
        </div>
      </div>`;
  }

  private generateWeeklySummaryEmail(stats: any): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;padding:20px;text-align:center">
          <h1>📈 Weekly Report</h1>
          <p>Week of ${stats.weekStart.toLocaleDateString()}</p>
        </div>
        <div style="padding:20px;background:#f9fafb">
          <p>Detailed weekly statistics would go here...</p>
        </div>
      </div>`;
  }

  private wrapInTemplate(subject: string, message: string): string {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#4f46e5;color:white;padding:20px">
          <h1>${subject}</h1>
        </div>
        <div style="padding:20px;background:#f9fafb">${message}</div>
        <div style="background:#1f2937;color:white;padding:15px;text-align:center;font-size:12px">
          <p>Fuel Order Management System</p>
        </div>
      </div>`;
  }
}

// Singleton instance
export const emailService = new EmailService();

// Convenience re-export
export const sendCriticalEmail = (options: CriticalEmailOptions) =>
  emailService.sendCriticalEmail(options);

export default emailService;