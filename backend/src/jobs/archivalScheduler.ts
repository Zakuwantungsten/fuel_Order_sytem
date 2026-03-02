import cron from 'node-cron';
import archivalService from '../services/archivalService';
import { SystemConfig } from '../models';
import logger from '../utils/logger';
import { jobRegistry } from './jobRegistry';

/**
 * Scheduled Archival Job
 * 
 * Runs on the 1st day of every month at 2:00 AM
 * Archives data older than 6 months
 * 
 * For your use case (15 users, 4-5 months active data):
 * - Runs automatically every month
 * - Moves data older than 6 months to archive collections
 * - Keeps your active database lean and fast
 * - DeliveryOrders are NEVER archived (per your requirement)
 */

let archivalJob: cron.ScheduledTask | null = null;

async function runArchivalHandler() {
  logger.info('=== SCHEDULED ARCHIVAL PROCESS STARTED ===');
  try {
    const sysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const adminArchivalMonths = sysConfig?.systemSettings?.data?.archivalMonths ?? 6;
    const adminAuditLogMonths = sysConfig?.systemSettings?.data?.auditLogRetention ?? 12;

    const result = await archivalService.archiveOldData(
      {
        monthsToKeep: adminArchivalMonths,
        auditLogMonthsToKeep: adminAuditLogMonths,
        dryRun: false,
        batchSize: 1000,
      },
      'scheduled-job'
    );

    if (result.success) {
      logger.info(`Scheduled archival completed. Records archived: ${result.totalRecordsArchived}. Duration: ${result.totalDuration}ms`);
    } else {
      logger.error('Scheduled archival failed:', result.errors);
      throw new Error(result.errors?.join(', ') ?? 'Archival failed');
    }
  } catch (error: any) {
    logger.error('Scheduled archival process error:', error);
    throw error;
  }
  logger.info('=== SCHEDULED ARCHIVAL PROCESS COMPLETED ===');
}

// Register with job registry for central management
jobRegistry.register({
  id: 'archival',
  name: 'Data Archival',
  description: 'Archives records older than the configured retention period. Runs on 1st of every month at 2:00 AM.',
  cronExpression: '0 2 1 * *',
  isEnabled: true,
  handler: runArchivalHandler,
});

export function startArchivalScheduler() {
  // Run on 1st day of month at 2:00 AM (when system is least used)
  archivalJob = cron.schedule('0 2 1 * *', async () => {
    await runArchivalHandler();
  });
  logger.info('Archival scheduler started - will run on 1st day of each month at 2:00 AM');
}

export function stopArchivalScheduler() {
  if (archivalJob) {
    archivalJob.stop();
    archivalJob = null;
    logger.info('Archival scheduler stopped');
  }
}

/**
 * Run archival immediately (for manual testing or one-time execution)
 */
export async function runArchivalNow(dryRun: boolean = false) {
  logger.info(`=== MANUAL ARCHIVAL PROCESS STARTED (DRY RUN: ${dryRun}) ===`);
  
  try {
    // Read admin-configured retention settings from DB (falls back to safe defaults)
    const manualSysConfig = await SystemConfig.findOne({ configType: 'system_settings' });
    const manualArchivalMonths = manualSysConfig?.systemSettings?.data?.archivalMonths ?? 6;
    const manualAuditLogMonths = manualSysConfig?.systemSettings?.data?.auditLogRetention ?? 12;

    const result = await archivalService.archiveOldData(
      {
        monthsToKeep: manualArchivalMonths,
        auditLogMonthsToKeep: manualAuditLogMonths,
        dryRun,
        batchSize: 1000,
      },
      'manual-execution'
    );

    if (result.success) {
      logger.info(`Manual archival completed successfully`);
      logger.info(`Total records ${dryRun ? 'would be' : 'were'} archived: ${result.totalRecordsArchived}`);
      logger.info(`Duration: ${result.totalDuration}ms`);
      
      for (const [collectionName, stats] of Object.entries(result.collectionsArchived)) {
        logger.info(
          `  - ${collectionName}: ${stats.recordsArchived} records (${stats.duration}ms)`
        );
      }
    } else {
      logger.error('Manual archival failed:', result.errors);
    }

    return result;
  } catch (error: any) {
    logger.error('Manual archival process error:', error);
    throw error;
  }
}
