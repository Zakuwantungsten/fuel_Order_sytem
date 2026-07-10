/**
 * Disaster Recovery Drill  (Chaos Engineering)
 *
 * Weekly automated proof that backups are actually restorable. Enqueues to
 * BullMQ so any free worker runs it under the backup-mutex (never overlaps
 * create/restore).
 */

import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

async function runDrillHandler(): Promise<void> {
  logger.info('[DR DRILL] Enqueueing scheduled disaster-recovery drill…');
  const { enqueueBackgroundJob } = await import('../services/backgroundJobQueue');
  const result = await enqueueBackgroundJob({
    name: 'backup-dr-drill',
    triggeredBy: 'system-chaos-drill',
  });
  // When queued, success means "accepted"; the worker throws if the drill fails.
  // When inline, runJob already threw on failure.
  if (result.queued) {
    logger.info(`[DR DRILL] Queued (jobId=${result.jobId})`);
  } else {
    logger.info('[DR DRILL] Completed inline');
  }
}

jobRegistry.register({
  id: 'dr-drill',
  name: 'Disaster Recovery Drill',
  description: 'Chaos test: restores the latest backup into an isolated scratch database and verifies document counts. Alerts via Slack + email on failure.',
  cronExpression: '0 4 * * 0',
  isEnabled: true,
  handler: runDrillHandler,
});
