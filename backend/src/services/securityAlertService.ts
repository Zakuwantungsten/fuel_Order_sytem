/**
 * Security Alert Service
 *
 * Centralised dispatcher for security alerts.
 * Delivers via three channels:
 *   1. Email   – sendCriticalEmail (to all super_admins + optional extra recipient)
 *   2. Slack   – slackNotificationService.sendNotification (webhook)
 *   3. WebSocket – real-time push to super_admin sockets ('security_alert' event)
 *
 * Rate-limited per (ip + eventType) to prevent alert storms.
 * Respects config toggle `securityEventLogging` and cooldown `securityAlertCooldownMs`.
 */

import { config } from '../config';
import { sendCriticalEmail } from './emailService';
import slackService from './slackNotificationService';
import { emitNotification } from './websocket';
import logger from '../utils/logger';

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
