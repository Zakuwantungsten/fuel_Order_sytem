/**
 * Disaster Recovery Drill  (Chaos Engineering)
 *
 * Weekly automated proof that backups are actually restorable. Restores the
 * latest backup into an ISOLATED scratch database on the same cluster, verifies
 * the document counts match, then drops the scratch database. Never touches
 * live data. Fires a critical Slack + email alert if the restore fails.
 *
 * This is the "Chaos Monkey for backups" — it surfaces a broken backup pipeline
 * BEFORE a real disaster, instead of discovering it during one.
 */

import backupService from '../services/backupService';
import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

async function runDrillHandler(): Promise<void> {
  logger.info('[DR DRILL] Starting scheduled disaster-recovery drill…');
  const report = await backupService.runDisasterRecoveryDrill('system-chaos-drill');
  if (!report.passed) {
    // Throwing marks the job as failed in the Cron dashboard run-history.
    throw new Error(report.details || 'DR drill failed');
  }
  logger.info(`[DR DRILL] ${report.details}`);
}

// Register with the central job registry — runs weekly on Sundays at 04:00 UTC
jobRegistry.register({
  id: 'dr-drill',
  name: 'Disaster Recovery Drill',
  description: 'Chaos test: restores the latest backup into an isolated scratch database and verifies document counts. Alerts via Slack + email on failure.',
  cronExpression: '0 4 * * 0',
  isEnabled: true,
  handler: runDrillHandler,
});
