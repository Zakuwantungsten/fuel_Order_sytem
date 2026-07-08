/**
 * Security Digest Scheduler
 *
 * Aggregates routine auto-block activity (blocked IPs, reasons, top offenders)
 * plus any security alerts over a rolling window and emails a single digest to
 * super admins — instead of paging on every individual auto-block.
 *
 * This mirrors how large SOCs handle "the defense worked" signals: suppress the
 * per-event noise, surface a periodic summary, and reserve real-time alerts for
 * genuine attacks (brute force, account compromise, coordinated spikes).
 *
 * Runs daily at 07:00 by default (SECURITY_DIGEST_CRON).
 */

import * as cron from 'node-cron';
import { config } from '../config';
import { securityAlertService } from '../services/securityAlertService';
import { emailService } from '../services/emailService';
import { jobRegistry } from './jobRegistry';
import logger from '../utils/logger';

function periodLabel(windowMs: number): string {
  const hours = Math.round(windowMs / 3_600_000);
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'last 24 hours' : `last ${days} days`;
  }
  return `last ${hours} hours`;
}

export async function runSecurityDigest(): Promise<void> {
  if (!config.securityDigestEnabled) {
    logger.info('[SecurityDigest] Disabled by config — skipping');
    return;
  }

  const windowMs = config.securityDigestWindowMs;
  const digest = await securityAlertService.buildDigest(windowMs, periodLabel(windowMs));

  if (!digest.hasActivity) {
    logger.info('[SecurityDigest] No block/alert activity in period — skipping digest email');
    return;
  }

  await emailService.sendSecurityDigest(digest);
  logger.info(
    `[SecurityDigest] Sent: ${digest.totalBlocks} block(s), ${digest.uniqueIPs} unique IP(s), ` +
      `${digest.criticalAlerts} critical / ${digest.highAlerts} high alert(s)`,
  );
}

// Register with job registry for central management (Cron Job Manager Dashboard)
jobRegistry.register({
  id: 'security-digest',
  name: 'Security Digest',
  description:
    `Emails a summary of auto-blocked IPs and security alerts (${periodLabel(config.securityDigestWindowMs)}) ` +
    `to super admins. Cron: ${config.securityDigestCron}.`,
  cronExpression: config.securityDigestCron,
  isEnabled: config.securityDigestEnabled,
  handler: runSecurityDigest,
});

let digestTask: cron.ScheduledTask | null = null;

export function startSecurityDigest(): void {
  if (!config.securityDigestEnabled) return;
  digestTask = cron.schedule(config.securityDigestCron, async () => {
    try {
      await runSecurityDigest();
    } catch (err: any) {
      logger.error(`[SecurityDigest] Failed: ${err?.message ?? err}`);
    }
  });
  logger.info(`[SecurityDigest] Scheduler started — cron ${config.securityDigestCron}`);
}

export function stopSecurityDigest(): void {
  if (digestTask) {
    digestTask.stop();
    digestTask = null;
    logger.info('[SecurityDigest] Scheduler stopped');
  }
}
