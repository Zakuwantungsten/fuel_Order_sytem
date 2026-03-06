/**
 * Security Alert Service
 *
 * Centralised dispatcher for security alerts.
 * Delivers via four channels:
 *   1. Database – SecurityAlert model (persistent, queryable alert queue)
 *   2. Email    – sendCriticalEmail (to all super_admins + optional extra recipient)
 *   3. Slack    – slackNotificationService.sendNotification (webhook)
 *   4. WebSocket – real-time push to super_admin sockets ('security_alert' event)
 *
 * Rate-limited per (ip + eventType) to prevent alert storms.
 * Respects config toggle `securityEventLogging` and cooldown `securityAlertCooldownMs`.
 */

import { config } from '../config';
import { sendCriticalEmail } from './emailService';
import slackService from './slackNotificationService';
import { emitNotification } from './websocket';
import logger from '../utils/logger';
import {
  SecurityAlert,
  AlertSeverity as ModelAlertSeverity,
  AlertType,
  AlertStatus,
  ISecurityAlertDocument,
} from '../models/SecurityAlert';
import { SecurityIncident } from '../models/SecurityIncident';

/* ───────── Types ───────── */

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SecurityAlertInput {
  eventType: string;       // e.g. 'ip_blocked', 'path_blocked'
  severity: AlertSeverity;
  ip: string;
  title: string;           // short human-readable title
  description: string;     // longer explanation
  details?: Record<string, string | number | boolean>;
  url?: string;            // the requested path
  method?: string;
}

/* ───────── Cooldown state ───────── */

// key = `${ip}::${eventType}`, value = last alert timestamp (ms)
const _cooldowns = new Map<string, number>();

function isCoolingDown(ip: string, eventType: string): boolean {
  const key = `${ip}::${eventType}`;
  const last = _cooldowns.get(key);
  if (!last) return false;
  return Date.now() - last < config.securityAlertCooldownMs;
}

function markSent(ip: string, eventType: string): void {
  _cooldowns.set(`${ip}::${eventType}`, Date.now());
}

/** Exposed for testing */
export function _clearCooldowns(): void {
  _cooldowns.clear();
}

/* ───────── Severity → email priority mapping ───────── */

const SEVERITY_TO_PRIORITY: Record<AlertSeverity, 'critical' | 'high' | 'medium' | 'low'> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '⚡',
  low: 'ℹ️',
};

/* ───────── Core dispatch ───────── */

class SecurityAlertService {
  /**
   * Dispatch a security alert across all configured channels.
   * Fail-open: channel failures are logged but never re-thrown.
   */
  async send(input: SecurityAlertInput): Promise<void> {
    // Check cooldown — avoid alert storms for the same IP + event
    if (isCoolingDown(input.ip, input.eventType)) {
      logger.debug(`[SecurityAlert] Cooldown active for ${input.ip}::${input.eventType}, skipping`);
      return;
    }
    markSent(input.ip, input.eventType);

    const emoji = SEVERITY_EMOJI[input.severity];

    // 0.  Database → persist to SecurityAlert collection for the admin alert queue
    try {
      await this.persistAlert(input);
    } catch (err) {
      logger.error('[SecurityAlert] Database persist failed:', err);
    }

    // 1.  WebSocket → real-time push to super_admin clients
    try {
      emitNotification(['super_admin'], {
        type: 'security_alert',
        title: `${emoji} ${input.title}`,
        message: input.description,
        severity: input.severity,
        ip: input.ip,
        eventType: input.eventType,
        details: input.details,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('[SecurityAlert] WebSocket dispatch failed:', err);
    }

    // 2.  Email → all super_admins (+ optional extra recipient from config)
    try {
      const additionalRecipients = config.securityAlertEmail
        ? [config.securityAlertEmail]
        : undefined;

      await sendCriticalEmail({
        subject: `${emoji} Security Alert: ${input.title}`,
        message: this.buildEmailBody(input),
        priority: SEVERITY_TO_PRIORITY[input.severity],
        additionalRecipients,
      });
    } catch (err) {
      logger.error('[SecurityAlert] Email dispatch failed:', err);
    }

    // 3.  Slack → webhook notification
    try {
      await slackService.sendNotification({
        severity: input.severity === 'low' ? 'info' : input.severity,
        title: input.title,
        description: input.description,
        details: input.details as any,
        ipAddress: input.ip,
        timestamp: new Date(),
      });
    } catch (err) {
      logger.error('[SecurityAlert] Slack dispatch failed:', err);
    }
  }

  /* ───────── Convenience methods ───────── */

  /** Alert when an IP is auto-blocked by the blocklist service */
  async alertIPBlocked(ip: string, reason: string, details: string, durationMs: number | null): Promise<void> {
    const durationLabel = durationMs && durationMs > 0
      ? `${Math.round(durationMs / 60_000)} minutes`
      : 'permanently';

    await this.send({
      eventType: 'ip_blocked',
      severity: 'high',
      ip,
      title: `IP Auto-Blocked: ${ip}`,
      description: `IP address ${ip} has been blocked ${durationLabel}. Reason: ${reason}. ${details}`,
      details: {
        reason,
        duration: durationLabel,
        blockedBy: 'system',
      },
    });
  }

  /** Alert on persistent path probing from the same IP */
  async alertPathProbe(ip: string, path: string, hitCount: number): Promise<void> {
    await this.send({
      eventType: 'path_probe',
      severity: hitCount >= 10 ? 'high' : 'medium',
      ip,
      title: `Path Probe Detected: ${ip}`,
      description: `IP ${ip} has probed ${hitCount} blocked path(s). Latest: ${path}`,
      details: {
        latestPath: path,
        totalProbes: hitCount,
      },
      url: path,
    });
  }

  /** Alert when rate-limiting kicks in */
  async alertRateLimited(ip: string, endpoint: string): Promise<void> {
    await this.send({
      eventType: 'rate_limited',
      severity: 'medium',
      ip,
      title: `Rate Limit Exceeded: ${ip}`,
      description: `IP ${ip} has been rate-limited on ${endpoint}.`,
      details: { endpoint },
      url: endpoint,
    });
  }

  /** Generic alert for custom scenarios */
  async alertCustom(input: SecurityAlertInput): Promise<void> {
    await this.send(input);
  }

  /* ───────── Database persistence & query ───────── */

  /**
   * Map eventType to AlertType enum value.
   */
  private mapAlertType(eventType: string): AlertType {
    const mapping: Record<string, AlertType> = {
      ip_blocked: 'autoblock_trigger',
      path_blocked: 'security_event',
      path_probe: 'security_event',
      ua_blocked: 'security_event',
      suspicious_404: 'security_event',
      honeypot_hit: 'security_event',
      rate_limited: 'security_event',
      csrf_failure: 'security_event',
      jwt_failure: 'auth_failure',
      auth_failure: 'auth_failure',
      brute_force: 'brute_force',
      impossible_travel: 'ueba_anomaly',
      off_hours: 'ueba_anomaly',
      bulk_export: 'ueba_anomaly',
      break_glass: 'break_glass_used',
      score_regression: 'score_regression',
      policy_change: 'policy_change',
      mfa_bypass: 'mfa_bypass',
    };
    return mapping[eventType] || 'security_event';
  }

  /**
   * Persist an alert to the SecurityAlert collection with deduplication.
   */
  private async persistAlert(input: SecurityAlertInput): Promise<ISecurityAlertDocument | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Dedup: skip if identical new alert exists in last hour
    const existing = await SecurityAlert.findOne({
      title: input.title,
      relatedIP: input.ip || undefined,
      status: 'new',
      createdAt: { $gte: oneHourAgo },
    }).lean();

    if (existing) {
      await SecurityAlert.updateOne(
        { _id: existing._id },
        { $set: { 'metadata.duplicateCount': ((existing.metadata as any)?.duplicateCount || 1) + 1 } },
      );
      return null;
    }

    const alert = await SecurityAlert.create({
      severity: input.severity,
      type: this.mapAlertType(input.eventType),
      title: input.title,
      message: input.description,
      metadata: input.details || {},
      relatedIP: input.ip,
    });

    // Auto-create incident for critical alerts or break-glass usage
    if (alert && (input.severity === 'critical' || input.eventType === 'break_glass')) {
      await this.autoCreateIncident(alert);
    }

    return alert;
  }

  /**
   * Automatically create a SecurityIncident from a critical / break-glass alert.
   */
  private async autoCreateIncident(alert: ISecurityAlertDocument): Promise<void> {
    try {
      const year = new Date().getFullYear();
      const prefix = `INC-${year}-`;
      const last = await SecurityIncident.findOne({ incidentId: { $regex: `^${prefix}` } })
        .sort({ incidentId: -1 })
        .select('incidentId')
        .lean();
      const seq = last ? parseInt(last.incidentId.replace(prefix, ''), 10) + 1 : 1;
      const incidentId = `${prefix}${String(seq).padStart(4, '0')}`;

      await SecurityIncident.create({
        incidentId,
        severity: alert.severity,
        status: 'new',
        title: `[AUTO] ${alert.title}`,
        description: alert.message || 'Auto-created from critical security alert.',
        linkedAlerts: [alert._id.toString()],
        createdBy: 'system',
      });

      logger.info(`[SecurityAlert] Auto-created incident ${incidentId} from alert ${alert._id}`);
    } catch (err) {
      logger.error('[SecurityAlert] Auto-incident creation failed:', err);
    }
  }

  /**
   * Raise a direct alert (without email/slack/ws dispatch).
   * Used for break-glass, score regression, policy changes, etc.
   */
  async raiseAlert(params: {
    severity: ModelAlertSeverity;
    type: AlertType;
    title: string;
    message: string;
    metadata?: Record<string, any>;
    relatedIP?: string;
    relatedUserId?: string;
    relatedUsername?: string;
    relatedEventId?: string;
  }): Promise<ISecurityAlertDocument | null> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const existing = await SecurityAlert.findOne({
        title: params.title,
        relatedIP: params.relatedIP || undefined,
        status: 'new',
        createdAt: { $gte: oneHourAgo },
      }).lean();

      if (existing) {
        await SecurityAlert.updateOne(
          { _id: existing._id },
          { $set: { 'metadata.duplicateCount': ((existing.metadata as any)?.duplicateCount || 1) + 1 } },
        );
        return null;
      }

      return await SecurityAlert.create({
        severity: params.severity,
        type: params.type,
        title: params.title,
        message: params.message,
        metadata: params.metadata || {},
        relatedIP: params.relatedIP,
        relatedUserId: params.relatedUserId,
        relatedUsername: params.relatedUsername,
        relatedEventId: params.relatedEventId,
      });
    } catch (err) {
      logger.error('[SecurityAlertService] Failed to raise alert:', err);
      return null;
    }
  }

  /**
   * Get paginated, filtered alerts.
   */
  async getAlerts(
    filters: { status?: AlertStatus | AlertStatus[]; severity?: string | string[]; type?: string; from?: Date; to?: Date } = {},
    pagination: { page?: number; limit?: number } = {},
  ) {
    const { page = 1, limit = 50 } = pagination;
    const query: Record<string, any> = {};

    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.severity) {
      query.severity = Array.isArray(filters.severity) ? { $in: filters.severity } : filters.severity;
    }
    if (filters.type) query.type = filters.type;
    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = filters.from;
      if (filters.to) query.createdAt.$lte = filters.to;
    }

    const [alerts, total] = await Promise.all([
      SecurityAlert.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SecurityAlert.countDocuments(query),
    ]);

    return { alerts, total, page, limit, pages: Math.ceil(total / limit) };
  }

  /**
   * Count unresolved alerts (for badge display).
   */
  async getUnresolvedCount(): Promise<{ total: number; critical: number; high: number }> {
    const unresolvedStatuses = ['new', 'acknowledged', 'investigating'];
    const [total, critical, high] = await Promise.all([
      SecurityAlert.countDocuments({ status: { $in: unresolvedStatuses } }),
      SecurityAlert.countDocuments({ status: { $in: unresolvedStatuses }, severity: 'critical' }),
      SecurityAlert.countDocuments({ status: { $in: unresolvedStatuses }, severity: 'high' }),
    ]);
    return { total, critical, high };
  }

  /**
   * Acknowledge an alert.
   */
  async acknowledge(alertId: string, username: string): Promise<ISecurityAlertDocument | null> {
    return SecurityAlert.findByIdAndUpdate(
      alertId,
      { status: 'acknowledged', acknowledgedBy: username, acknowledgedAt: new Date() },
      { new: true },
    );
  }

  /**
   * Start investigating an alert.
   */
  async investigate(alertId: string, username: string): Promise<ISecurityAlertDocument | null> {
    return SecurityAlert.findByIdAndUpdate(
      alertId,
      { status: 'investigating', acknowledgedBy: username, acknowledgedAt: new Date() },
      { new: true },
    );
  }

  /**
   * Resolve an alert.
   */
  async resolve(alertId: string, username: string): Promise<ISecurityAlertDocument | null> {
    return SecurityAlert.findByIdAndUpdate(
      alertId,
      { status: 'resolved', resolvedBy: username, resolvedAt: new Date() },
      { new: true },
    );
  }

  /**
   * Mark alert as false positive.
   */
  async markFalsePositive(alertId: string, username: string): Promise<ISecurityAlertDocument | null> {
    return SecurityAlert.findByIdAndUpdate(
      alertId,
      { status: 'false_positive', resolvedBy: username, resolvedAt: new Date() },
      { new: true },
    );
  }

  /**
   * Add investigation note.
   */
  async addNote(alertId: string, authorId: string, author: string, text: string): Promise<ISecurityAlertDocument | null> {
    return SecurityAlert.findByIdAndUpdate(
      alertId,
      { $push: { notes: { author, authorId, text, createdAt: new Date() } } },
      { new: true },
    );
  }

  /* ───────── Internal helpers ───────── */

  private buildEmailBody(input: SecurityAlertInput): string {
    const lines: string[] = [
      `<strong>Event:</strong> ${input.eventType}`,
      `<strong>Severity:</strong> ${input.severity.toUpperCase()}`,
      `<strong>IP:</strong> ${input.ip}`,
    ];

    if (input.url) lines.push(`<strong>URL:</strong> ${input.url}`);
    if (input.method) lines.push(`<strong>Method:</strong> ${input.method}`);

    lines.push('', input.description);

    if (input.details && Object.keys(input.details).length > 0) {
      lines.push('', '<strong>Details:</strong>');
      for (const [k, v] of Object.entries(input.details)) {
        lines.push(`&nbsp;&nbsp;• ${k}: ${v}`);
      }
    }

    return lines.join('<br/>');
  }
}

export const securityAlertService = new SecurityAlertService();
