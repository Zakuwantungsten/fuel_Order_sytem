/**
 * Security Event Retention Scheduler
 *
 * Periodically purges SecurityEvent documents older than the configured
 * retention period (SECURITY_EVENT_RETENTION_DAYS, default 90).
 *
 * MongoDB TTL indexes provide a safety-net, but the cron job gives us
 * observable, auditable cleanup with logging and dashboard visibility.
 */

import cron from 'node-cron';
import { config } from '../config';
import { securityLogService } from '../services/securityLogService';
import { jobRegistry } from './jobRegistry';
import logger from '../utils/logger';

async function runRetention(): Promise<void> {
  const days = config.securityEventRetentionDays;
  logger.info(`[SecurityEventRetention] Purging events older than ${days} days…`);

  const deleted = await securityLogService.purgeOlderThan(days);
  logger.info(`[SecurityEventRetention] Purged ${deleted} security events`);
}

// Register with job registry for central management
jobRegistry.register({
  id: 'security-event-retention',
  name: 'Security Event Retention',
  description: `Purges SecurityEvent documents older than ${config.securityEventRetentionDays} days. Runs daily at 3:15 AM.`,
  cronExpression: '15 3 * * *',
  isEnabled: true,
  handler: runRetention,
});

let retentionTask: cron.ScheduledTask | null = null;

export function startSecurityEventRetention(): void {
  retentionTask = cron.schedule('15 3 * * *', async () => {
    await runRetention();
  });
  logger.info('[SecurityEventRetention] Scheduler started — runs daily at 3:15 AM');
}

export function stopSecurityEventRetention(): void {
  if (retentionTask) {
    retentionTask.stop();
    retentionTask = null;
    logger.info('[SecurityEventRetention] Scheduler stopped');
  }
}
