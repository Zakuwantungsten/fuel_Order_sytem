import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

/**
 * Scheduled Archival Job
 *
 * Runs on the 1st day of every month at 2:00 AM via jobRegistry only
 * (do NOT also call startArchivalScheduler — that previously double-fired).
 * Work is enqueued to BullMQ so any free worker can run it.
 */

async function runArchivalHandler() {
  logger.info('=== SCHEDULED ARCHIVAL PROCESS STARTED ===');
  try {
    const { enqueueBackgroundJob } = await import('../services/backgroundJobQueue');
    const result = await enqueueBackgroundJob({
      name: 'archival-run',
      triggeredBy: 'scheduled-job',
    });
    logger.info(
      `Scheduled archival ${result.queued ? 'queued' : 'ran inline'} (jobId=${result.jobId ?? 'n/a'})`,
    );
  } catch (error: any) {
    logger.error('Scheduled archival process error:', error);
    throw error;
  }
  logger.info('=== SCHEDULED ARCHIVAL PROCESS ENQUEUED/COMPLETED ===');
}

// Register with job registry for central management (single schedule source)
jobRegistry.register({
  id: 'archival',
  name: 'Data Archival',
  description: 'Archives records older than the configured retention period. Runs on 1st of every month at 2:00 AM.',
  cronExpression: '0 2 1 * *',
  isEnabled: true,
  handler: runArchivalHandler,
});

/**
 * @deprecated No-op — archival is started only via jobRegistry.startAll().
 * Kept so existing server.ts imports don't break.
 */
export function startArchivalScheduler() {
  logger.info('Archival scheduler: using jobRegistry only (duplicate cron disabled)');
}

export function stopArchivalScheduler() {
  // jobRegistry handles stop via disable/stopAll
}

/**
 * Run archival immediately (for manual testing or one-time execution)
 */
export async function runArchivalNow(dryRun: boolean = false) {
  const { enqueueBackgroundJob } = await import('../services/backgroundJobQueue');
  return enqueueBackgroundJob({
    name: 'archival-run',
    triggeredBy: 'manual-execution',
    dryRun,
  });
}
