import cron from 'node-cron';
import archivalService from '../services/archivalService';
import logger from '../utils/logger';

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

export function startArchivalScheduler() {
  // Run on 1st day of month at 2:00 AM (when system is least used)
  // Cron format: minute hour day month dayOfWeek
  // '0 2 1 * *' = At 02:00 on day-of-month 1
  
  archivalJob = cron.schedule('0 2 1 * *', async () => {
    logger.info('=== SCHEDULED ARCHIVAL PROCESS STARTED ===');
    
    try {
      const result = await archivalService.archiveOldData(
        {
          monthsToKeep: 6, // Keep last 6 months
          auditLogMonthsToKeep: 12, // Keep audit logs for 12 months
          dryRun: false,
          batchSize: 1000,
        },
        'scheduled-job'
      );

      if (result.success) {
        logger.info(`Scheduled archival completed successfully`);
        logger.info(`Total records archived: ${result.totalRecordsArchived}`);
        logger.info(`Duration: ${result.totalDuration}ms`);
        
        // Log detailed results
        for (const [collectionName, stats] of Object.entries(result.collectionsArchived)) {
          logger.info(
            `  - ${collectionName}: ${stats.recordsArchived} records archived (${stats.duration}ms)`
          );
        }
      } else {
        logger.error('Scheduled archival failed:', result.errors);
      }
    } catch (error: any) {
      logger.error('Scheduled archival process error:', error);
    }
    
    logger.info('=== SCHEDULED ARCHIVAL PROCESS COMPLETED ===');
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
    const result = await archivalService.archiveOldData(
      {
        monthsToKeep: 6,
        auditLogMonthsToKeep: 12,
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
