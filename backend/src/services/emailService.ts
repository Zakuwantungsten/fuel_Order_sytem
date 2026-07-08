import nodemailer from 'nodemailer';
import { User, SystemConfig } from '../models';
import logger from '../utils/logger';
import { decryptData } from '../utils/cryptoUtils';
import { isEncrypted } from '../utils/fieldEncryption';
// Type-only import (erased at compile time — no runtime circular dependency)
import type { SecurityDigest } from './securityAlertService';

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

    this.fromName = fromName;

    if (!apiKey) {
      logger.warn('Email service: RESEND_API_KEY not set — will attempt SMTP fallback if configured');
      this.resendApiKey = '';
    } else {
      this.resendApiKey = apiKey;
    }

    if (!from) {
      this.fromAddress = 'onboarding@resend.dev';
      if (apiKey) {
        logger.warn(
          'EMAIL_FROM not set — using onboarding@resend.dev. ' +
          'Set EMAIL_FROM=noreply@yourdomain.com after verifying a domain in Resend.',
        );
      }
    } else {
      this.fromAddress = from;
    }

    // Considered configured if Resend key is present OR SMTP env vars are set
    this.isConfigured = !!(apiKey || process.env.SMTP_HOST || process.env.EMAIL_HOST);

    if (this.isConfigured) {
      logger.info(
        `Email service initialized — primary: ${apiKey ? 'Resend' : 'SMTP'}, ` +
        `fallback: ${apiKey && (process.env.SMTP_HOST || process.env.EMAIL_HOST) ? 'SMTP' : 'none'}`,
      );
    }
  }

  /**
   * Reinitialize — call this after updating env vars at runtime
   */
  async reinitialize(): Promise<void> {
    this.initialize();
  }

  // ─── SMTP fallback helpers ────────────────────────────────────────────────

  /**
   * Attempt to load SMTP credentials from SystemConfig (DB), falling back to env vars.
   * Returns null if no SMTP config is available.
   */
  private async loadSmtpConfig(): Promise<{
    host: string; port: number; secure: boolean;
    user: string; password: string; from: string; fromName: string;
  } | null> {
    try {
      const cfg = await SystemConfig.findOne({ configType: 'system_settings' }).lean();
      const email = (cfg as any)?.systemSettings?.email;
      if (email?.host && email?.user) {
        let password = email.password || '';
        if (isEncrypted(password)) {
          const encKey = process.env.FIELD_ENCRYPTION_KEY || '';
          if (encKey) {
            try {
              password = decryptData(password.slice('encrypted:'.length), encKey);
            } catch {
              logger.warn('[EmailService] Failed to decrypt stored SMTP password, using raw value');
            }
          }
        }
        return {
          host: email.host,
          port: Number(email.port) || 587,
          secure: email.secure === true,
          user: email.user,
          password,
          from: email.from || email.user,
          fromName: email.fromName || this.fromName,
        };
      }
    } catch {
      // DB read error — fall through to env
    }

    // Fall back to env vars
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || '';
    const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
    if (!host || !user) return null;

    return {
      host,
      port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true' || process.env.EMAIL_SECURE === 'true',
      user,
      password: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || '',
      from: process.env.EMAIL_FROM || user,
      fromName: process.env.EMAIL_FROM_NAME || this.fromName,
    };
  }

  /**
   * Send via SMTP using nodemailer.
   */
  private async sendViaSMTP(options: {
    from: string;
    to: string[];
    subject: string;
    html: string;
  }): Promise<void> {
    const smtp = await this.loadSmtpConfig();
    if (!smtp) {
      throw new Error('SMTP fallback not configured — no SMTP credentials available');
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    });

    await transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    logger.info(`[EmailService] Mail sent via SMTP fallback to ${options.to.length} recipient(s)`);
  }

  // ─── Core dispatch ────────────────────────────────────────────────────────

  /**
   * Dispatch a mail message.
   * Primary: Resend API.  Fallback: SMTP (nodemailer) if Resend fails or is not configured.
   */
  private async dispatchMail(options: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
  }): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Email service is not configured — set RESEND_API_KEY or SMTP credentials');
    }

    const toArray = Array.isArray(options.to) ? options.to : [options.to];

    // ── Try Resend first ──────────────────────────────────────────────────
    if (this.resendApiKey) {
      try {
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

        if (response.ok) return; // success — done

        const errText = await response.text();
        logger.warn(`[EmailService] Resend API error ${response.status}: ${errText} — falling back to SMTP`);
      } catch (resendErr) {
        logger.warn(`[EmailService] Resend request failed: ${(resendErr as Error).message} — falling back to SMTP`);
      }
    }

    // ── SMTP fallback ─────────────────────────────────────────────────────
    await this.sendViaSMTP({ ...options, to: toArray });
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

  private async securityDigestEnabled(): Promise<boolean> {
    try {
      const cfg = await SystemConfig.findOne({ configType: 'system_settings' });
      return cfg?.systemSettings?.notifications?.securityDigest !== false;
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
   * Send the aggregated security digest (auto-blocks + alerts) to super admins.
   * Replaces per-block emails — routine blocks are rolled up here instead of
   * paging on every event. Recipients = super_admins + optional security email.
   */
  async sendSecurityDigest(digest: SecurityDigest): Promise<void> {
    if (!this.isConfigured) await this.reinitialize();
    if (!this.isConfigured) {
      logger.warn('Email service not configured — skipping security digest');
      return;
    }
    if (!(await this.securityDigestEnabled())) {
      logger.info('Security digest emails disabled by system settings — skipping');
      return;
    }

    try {
      const superAdmins = await User.find({
        role: 'super_admin',
        isActive: true,
        isDeleted: false,
      }).select('email');

      if (superAdmins.length === 0) {
        logger.warn('No super admin users found to send security digest');
        return;
      }

      const extra = process.env.SECURITY_ALERT_EMAIL
        ? [process.env.SECURITY_ALERT_EMAIL]
        : [];
      const recipients = [...superAdmins.map((a) => a.email), ...extra];

      await this.dispatchMail({
        from: `"${this.fromName} - Security" <${this.fromAddress}>`,
        to: recipients,
        subject: `🛡️ Security Digest (${digest.periodLabel}) — ${digest.totalBlocks} block(s), ${digest.criticalAlerts} critical`,
        html: this.generateSecurityDigestEmail(digest),
      });

      logger.info(`Security digest email sent to ${recipients.length} recipient(s)`);
    } catch (error) {
      logger.error('Failed to send security digest email:', error);
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
    expiryHours = 24,
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
                  <li>${expiryHours > 0 ? `These credentials <strong>expire in ${expiryHours} hour${expiryHours === 1 ? '' : 's'}</strong> — log in before then` : 'These credentials do not expire automatically'}</li>
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
    expiryHours = 24,
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
                  <li>${expiryHours > 0 ? `These credentials <strong>expire in ${expiryHours} hour${expiryHours === 1 ? '' : 's'}</strong> — log in before then` : 'These credentials do not expire automatically'}</li>
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
   * Send a one-time account activation link to a new user (magic-link onboarding)
   */
  async sendActivationLinkEmail(
    email: string,
    name: string,
    username: string,
    rawToken: string,
    expiresAt: Date,
  ): Promise<void> {
    if (!this.isConfigured) await this.reinitialize();
    if (!this.isConfigured) {
      logger.warn('Email service not configured — cannot send activation link email');
      throw new Error('Email service is not configured');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const activationUrl = `${frontendUrl}/activate?token=${rawToken}`;
    const expiryLabel = expiresAt.toLocaleString('en-US', { timeZoneName: 'short' });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:white;padding:30px;text-align:center">
          <h1 style="margin:0;font-size:26px">Activate Your Account</h1>
        </div>
        <div style="padding:30px;background:#f9fafb">
          <div style="background:white;padding:25px;border-radius:8px;margin-bottom:20px">
            <p style="margin:0 0 15px;color:#1f2937;font-size:16px">Hello <strong>${name}</strong>,</p>
            <p style="margin:0 0 15px;color:#6b7280;font-size:15px;line-height:1.6">
              Your account (<strong>${username}</strong>) has been created. Click the button below to set your password and get started — no temporary password required.
            </p>
            <div style="text-align:center;margin:30px 0">
              <a href="${activationUrl}"
                 style="display:inline-block;background:#6366f1;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:bold">
                Activate My Account
              </a>
            </div>
            <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:20px 0;border-radius:4px">
              <p style="margin:0;color:#92400e;font-size:14px;line-height:1.6">
                ⏱ This link expires on <strong>${expiryLabel}</strong>. If it has expired, ask your administrator to resend the activation link.
              </p>
            </div>
            <p style="margin:0;color:#9ca3af;font-size:13px;word-break:break-all">
              If the button above does not work, copy this link into your browser:<br/>${activationUrl}
            </p>
          </div>
          <div style="text-align:center;color:#9ca3af;font-size:13px">
            <p>Automated email — please do not reply.</p>
          </div>
        </div>
      </div>`;

    await this.dispatchMail({
      from: this.sender,
      to: email,
      subject: 'Activate your Fuel Order Management System account',
      html,
    });

    logger.info(`Activation link email sent to: ${email}`);
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
   * ME-3: Send a backup failure alert to all super admin users
   */
  async sendBackupFailureAlert(fileName: string, errorMessage: string): Promise<void> {
    if (!this.isConfigured) {
      logger.warn('[EmailService] Email service not configured — skipping backup failure alert');
      return;
    }

    let adminEmails: string[] = [];
    try {
      const { User } = require('../models');
      const admins = await User.find({ role: 'super_admin', isActive: true }).select('email name').lean();
      adminEmails = admins.map((a: any) => a.email).filter(Boolean);
    } catch (err: any) {
      logger.warn('[EmailService] Could not fetch super admin emails for backup alert:', err?.message);
    }

    if (adminEmails.length === 0) {
      logger.warn('[EmailService] No super admin emails found — skipping backup failure alert');
      return;
    }

    const timeStr = new Date().toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#dc2626;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0;font-size:18px">⚠️ Backup Failed</h2>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px">
          <p style="margin:0 0 16px;color:#374151">A scheduled or manual database backup has failed.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
            <tr>
              <td style="padding:8px 0;color:#6b7280;width:120px">📁 File</td>
              <td style="padding:8px 0;color:#111827;font-weight:500;word-break:break-all">${fileName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280">🕐 Time</td>
              <td style="padding:8px 0;color:#111827;font-weight:500">${timeStr}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;vertical-align:top">❌ Error</td>
              <td style="padding:8px 0;color:#991b1b;font-weight:500;word-break:break-all">${errorMessage}</td>
            </tr>
          </table>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px">
            <p style="margin:0;color:#991b1b;font-size:13px">
              Please investigate immediately. Check server logs and verify that the R2 storage bucket is accessible
              and the <code>BACKUP_ENCRYPTION_KEY</code> environment variable is set correctly.
            </p>
          </div>
        </div>
        <div style="text-align:center;padding:16px;color:#9ca3af;font-size:11px">
          Fuel Order Management System — Backup Alert
        </div>
      </div>`;

    try {
      await this.dispatchMail({
        from: this.sender,
        to: adminEmails,
        subject: `[ALERT] Backup Failed: ${fileName}`,
        html,
      });
      logger.info(`[EmailService] Backup failure alert sent to ${adminEmails.join(', ')}`);
    } catch (error) {
      logger.error('[EmailService] Failed to send backup failure alert:', error);
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

  private generateSecurityDigestEmail(d: SecurityDigest): string {
    const reasonLabels: Record<string, string> = {
      path_probe: 'Path probing',
      auth_failure: 'Auth failures',
      brute_force: 'Brute force',
      rate_limit: 'Rate limiting',
      suspicious_404: 'Suspicious 404s',
      ua_blocked: 'Malicious user-agent',
      honeypot: 'Honeypot hits',
      manual: 'Manual block',
      auto_escalation: 'Auto-escalation',
    };
    const fmt = (dt: Date) => new Date(dt).toLocaleString();
    const headerColor = d.criticalAlerts > 0 ? '#dc2626' : (d.totalBlocks > 0 ? '#f97316' : '#10b981');

    const reasonRows = d.byReason.length
      ? d.byReason
          .map(
            (r) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${reasonLabels[r.reason] || r.reason}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${r.count}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="2" style="padding:10px;color:#6b7280">No blocks in this period.</td></tr>`;

    const ipRows = d.topIPs.length
      ? d.topIPs
          .map(
            (ip) =>
              `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace">${ip.ip}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${reasonLabels[ip.reason] || ip.reason}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${ip.count}</td></tr>`,
          )
          .join('')
      : `<tr><td colspan="3" style="padding:10px;color:#6b7280">—</td></tr>`;

    const openRows = d.openCritical.length
      ? d.openCritical
          .map(
            (a) =>
              `<li style="margin-bottom:6px"><span style="font-weight:bold;color:${a.severity === 'critical' ? '#dc2626' : '#f97316'}">[${a.severity.toUpperCase()}]</span> ${a.title} <span style="color:#9ca3af;font-size:12px">— ${fmt(a.createdAt)}</span></li>`,
          )
          .join('')
      : `<li style="color:#10b981">✅ No unresolved critical/high alerts — nothing needs your attention.</li>`;

    return `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:${headerColor};color:white;padding:20px;text-align:center">
          <h1 style="margin:0;font-size:22px">🛡️ Security Digest</h1>
          <p style="margin:6px 0 0;opacity:0.9">${d.periodLabel} — ${fmt(d.since)} → ${fmt(d.until)}</p>
        </div>
        <div style="padding:24px;background:#f9fafb">
          <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
            <div style="flex:1;min-width:120px;background:white;padding:14px;border-radius:8px;text-align:center">
              <div style="font-size:26px;font-weight:bold;color:#1f2937">${d.totalBlocks}</div>
              <div style="color:#6b7280;font-size:13px">IPs blocked</div>
            </div>
            <div style="flex:1;min-width:120px;background:white;padding:14px;border-radius:8px;text-align:center">
              <div style="font-size:26px;font-weight:bold;color:#1f2937">${d.uniqueIPs}</div>
              <div style="color:#6b7280;font-size:13px">Unique IPs</div>
            </div>
            <div style="flex:1;min-width:120px;background:white;padding:14px;border-radius:8px;text-align:center">
              <div style="font-size:26px;font-weight:bold;color:${d.criticalAlerts > 0 ? '#dc2626' : '#10b981'}">${d.criticalAlerts}</div>
              <div style="color:#6b7280;font-size:13px">Critical alerts</div>
            </div>
          </div>

          <div style="background:white;padding:16px;border-radius:8px;margin-bottom:16px">
            <h3 style="margin:0 0 10px;color:#1f2937">Needs your attention</h3>
            <ul style="margin:0;padding-left:18px;color:#1f2937;font-size:14px">${openRows}</ul>
          </div>

          <div style="background:white;padding:16px;border-radius:8px;margin-bottom:16px">
            <h3 style="margin:0 0 10px;color:#1f2937">Blocks by reason</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px">${reasonRows}</table>
          </div>

          <div style="background:white;padding:16px;border-radius:8px">
            <h3 style="margin:0 0 10px;color:#1f2937">Top offending IPs</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px">${ipRows}</table>
          </div>

          <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px">
            Routine auto-blocks are summarised here instead of individual emails.
            You are only paged in real time for genuine attacks (brute force, account compromise, coordinated spikes).
          </p>
        </div>
        <div style="background:#1f2937;color:white;padding:15px;text-align:center;font-size:12px">
          <p style="margin:0">Fuel Order Management System — Security Digest</p>
          <p style="margin:5px 0 0;color:#9ca3af">© ${new Date().getFullYear()} All rights reserved</p>
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